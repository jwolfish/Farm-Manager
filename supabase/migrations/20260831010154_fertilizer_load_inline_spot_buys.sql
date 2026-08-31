/*
  save_fertilizer_load — inline spot buys (F-4a)

  WHY THIS IS A MIGRATION AT ALL.

  The F-4a notes in the design doc say the three load-ticket faults are "all in
  the UI, none needing a migration". That is true of the defaulting and the
  split arithmetic. It is not true of the spot buy itself.

  Creating the spot buy from the ticket means writing a PRICED CONTRACT and a
  LOAD in one user action. Done as two client calls, a failure on the second
  leaves a spot buy that has already moved `fertilizer_products.price_per_unit`
  through the F-3 trigger and already fired a cascade, with no delivery attached
  and nothing to tell a retry that the booking exists — so the retry books it
  twice. That is the WI-13 shape, which is exactly why `save_fertilizer_load`
  was written as one RPC in the first place.

  So the contract insert moves inside this function. One RPC, one transaction.

  THE PAYLOAD.

  A line may now carry an optional `new_contract` object:

    { "fertilizer_product_id": "…", "quantity": 3.65, "unit_type": "ton",
      "new_contract": { "label": "June spot", "price_per_unit": 640,
                        "contracted_quantity": 3.65 } }

  It is honoured only when `contract_id` is absent — an explicit booking always
  wins, so a stale field cannot silently create a duplicate spot buy.

  `contracted_quantity` is in the PRODUCT's unit, not the line's. A contract is
  denominated in its product's own unit (F-3), a load line need not be, and the
  conversion between them stays in TypeScript. Putting it here would be the
  third copy of the unit table that F-3 went out of its way to avoid.

  CASCADES. Loads still carry no price of their own, but a spot buy created here
  does, so the blended average can move. The price of every product gaining a
  spot buy is snapshotted before the writes and compared after the F-3 trigger
  has run, and the function returns one cascade target per product that actually
  changed. `cascades` is an array where the contract RPCs return a single
  `cascade`, because one ticket can spill onto several products.

  Editing a ticket still replaces its lines wholesale. A spot buy created by an
  earlier save is NOT removed when its line is edited away: it is a booking in
  its own right, the blended price already reflects it, and deleting money
  behind the user's back is worse than leaving a booking to be deleted on the
  card where every other booking is deleted.

  Rehearsed in a rolled-back transaction before applying: 20 assertions passed,
  0 failed — including that a bad line leaves neither an orphan header nor an
  orphan spot buy, and that the worked example blends to exactly $565.00/ton.
*/

CREATE OR REPLACE FUNCTION public.save_fertilizer_load(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_id         uuid := nullif(p_payload->>'id','')::uuid;
  v_season     uuid;
  v_farm       uuid;
  v_lines      jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_line       jsonb;
  v_count      int := 0;
  v_product    uuid;
  v_spot       jsonb;
  v_spot_qty   numeric;
  v_spot_price numeric;
  v_contract   uuid;
  v_touched    uuid[] := '{}';
  v_before     jsonb := '{}'::jsonb;      -- product id (text) -> price before
  v_prev       numeric;
  v_after      numeric;
  v_cascades   jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL THEN
    v_season := nullif(p_payload->>'season_id','')::uuid;
    IF v_season IS NULL THEN
      RAISE EXCEPTION 'season_id is required' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT l.season_id INTO v_season FROM fertilizer_loads l WHERE l.id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fertilizer load not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT s.farm_id INTO v_farm FROM seasons s WHERE s.id = v_season;
  IF v_farm IS NULL OR NOT public.can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'You do not have permission to change this farm''s loads'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'A load needs at least one product line' USING ERRCODE = '22023';
  END IF;

  IF (p_payload->>'delivered_on') IS NULL OR p_payload->>'delivered_on' = '' THEN
    RAISE EXCEPTION 'A delivery date is required' USING ERRCODE = '22023';
  END IF;

  -- Pass one: which products are about to gain a spot buy, and what does each
  -- cost right now? Snapshotting before any write is what makes the after
  -- comparison mean "this ticket moved the price".
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    IF jsonb_typeof(v_line->'new_contract') = 'object'
       AND nullif(v_line->>'contract_id','') IS NULL THEN
      v_product := nullif(v_line->>'fertilizer_product_id','')::uuid;
      IF v_product IS NOT NULL AND NOT (v_product = ANY(v_touched)) THEN
        v_touched := array_append(v_touched, v_product);
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_touched, 1) > 0 THEN
    SELECT coalesce(jsonb_object_agg(p.id::text, p.price_per_unit), '{}'::jsonb)
      INTO v_before
      FROM fertilizer_products p
     WHERE p.id = ANY(v_touched);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO fertilizer_loads (
      season_id, delivered_on, ticket_number, load_type, supplier,
      delivery_fee, notes, user_id
    ) VALUES (
      v_season,
      (p_payload->>'delivered_on')::date,   -- unconstrained: a 2026 date on a 2027 season is normal
      nullif(p_payload->>'ticket_number',''),
      nullif(p_payload->>'load_type',''),
      nullif(p_payload->>'supplier',''),
      coalesce(nullif(p_payload->>'delivery_fee','')::numeric, 0),
      nullif(p_payload->>'notes',''),
      v_uid                                  -- the real author, never from the payload
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE fertilizer_loads SET
      delivered_on  = (p_payload->>'delivered_on')::date,
      ticket_number = nullif(p_payload->>'ticket_number',''),
      load_type     = nullif(p_payload->>'load_type',''),
      supplier      = nullif(p_payload->>'supplier',''),
      delivery_fee  = coalesce(nullif(p_payload->>'delivery_fee','')::numeric, 0),
      notes         = nullif(p_payload->>'notes','')
    WHERE id = v_id;

    -- Replacing the lines wholesale is what correcting a transcribed ticket
    -- means. Doing it inside this transaction is what stops a half-edited one.
    DELETE FROM fertilizer_load_lines WHERE load_id = v_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    IF (v_line->>'quantity')::numeric IS NULL OR NOT ((v_line->>'quantity')::numeric > 0) THEN
      RAISE EXCEPTION 'Every line needs a quantity greater than zero' USING ERRCODE = '22023';
    END IF;
    IF nullif(v_line->>'unit_type','') IS NULL THEN
      RAISE EXCEPTION 'Every line needs a unit' USING ERRCODE = '22023';
    END IF;

    v_product  := nullif(v_line->>'fertilizer_product_id','')::uuid;
    v_contract := nullif(v_line->>'contract_id','')::uuid;
    v_spot     := v_line->'new_contract';

    -- An explicit booking always wins, so a leftover new_contract on an edited
    -- line cannot quietly book the same tons a second time.
    IF v_contract IS NULL AND jsonb_typeof(v_spot) = 'object' THEN
      v_spot_qty   := nullif(v_spot->>'contracted_quantity','')::numeric;
      v_spot_price := nullif(v_spot->>'price_per_unit','')::numeric;

      IF v_spot_qty IS NULL OR NOT (v_spot_qty > 0) THEN
        RAISE EXCEPTION 'A spot buy needs a quantity greater than zero' USING ERRCODE = '22023';
      END IF;
      IF v_spot_price IS NOT NULL AND NOT (v_spot_price > 0) THEN
        RAISE EXCEPTION 'A spot buy price must be greater than zero when given'
          USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM fertilizer_products p
                      WHERE p.id = v_product AND p.season_id = v_season) THEN
        RAISE EXCEPTION 'Fertilizer product does not belong to that season'
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO fertilizer_contracts (
        season_id, fertilizer_product_id, kind, label, contracted_quantity,
        price_per_unit, supplier, booked_on, notes, user_id
      ) VALUES (
        v_season, v_product, 'spot',
        coalesce(nullif(v_spot->>'label',''), 'Spot buy'),
        v_spot_qty,                            -- in the PRODUCT's unit; see header
        v_spot_price,
        coalesce(nullif(v_spot->>'supplier',''), nullif(p_payload->>'supplier','')),
        coalesce(nullif(v_spot->>'booked_on','')::date, (p_payload->>'delivered_on')::date),
        nullif(v_spot->>'notes',''),
        v_uid                                  -- the real author, never from the payload
      ) RETURNING id INTO v_contract;
    END IF;

    -- fertilizer_load_line_consistency_check enforces that the product belongs
    -- to this load's season and that any contract is for the same product and
    -- season.
    --
    -- The F-4 copy of this comment said the trigger "runs as the caller, so it
    -- fails closed". That reasoning is wrong inside a SECURITY DEFINER function:
    -- the trigger is SECURITY INVOKER, and the invoker here is this function's
    -- owner, not the signed-in user. It still holds, because its checks compare
    -- season ids rather than testing what the caller can see. Verified by
    -- probe, not assumed: a foreign-season product and a foreign-season
    -- contract are both refused through this RPC, leaving no orphan header.
    INSERT INTO fertilizer_load_lines (
      load_id, fertilizer_product_id, contract_id, quantity,
      computed_quantity, unit_type, notes
    ) VALUES (
      v_id,
      v_product,
      v_contract,
      (v_line->>'quantity')::numeric,
      nullif(v_line->>'computed_quantity','')::numeric,
      v_line->>'unit_type',
      nullif(v_line->>'notes','')
    );
    v_count := v_count + 1;
  END LOOP;

  -- The F-3 trigger has resynced every affected product price by this point.
  IF array_length(v_touched, 1) > 0 THEN
    FOREACH v_product IN ARRAY v_touched
    LOOP
      SELECT p.price_per_unit INTO v_after FROM fertilizer_products p WHERE p.id = v_product;
      v_prev := nullif(v_before->>v_product::text, '')::numeric;
      IF v_after IS DISTINCT FROM v_prev THEN
        v_cascades := v_cascades || jsonb_build_array(jsonb_build_object(
          'task_type',   'cascade_product_update',
          'entity_id',   v_product,
          'entity_type', 'product',
          'season_id',   v_season));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('load_id', v_id, 'line_count', v_count, 'cascades', v_cascades);
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_fertilizer_load(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fertilizer_load(jsonb) TO authenticated;
