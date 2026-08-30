/*
  save_fertilizer_load — F-4

  A delivery ticket is a header plus lines, which is exactly the shape that
  produced the WI-13 defect: `saveWorkOrder` inserted the header, then the
  fields, then the lines in three separate requests, logged the failures, and
  returned a valid-looking id — leaving work orders with no lines in the list.

  One RPC, one transaction, same precedent as `save_work_order`. Editing a
  ticket replaces its lines wholesale, because that is what correcting a
  transcribed ticket means.

  No cascade target is returned: load lines carry no price, so a delivery cannot
  move a cost. Only contracts do that (F-3).

  Rehearsed in a rolled-back transaction before applying: 9 assertions passed,
  0 failed — including that a bad line leaves no orphan header.
*/

CREATE OR REPLACE FUNCTION public.save_fertilizer_load(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_id     uuid := nullif(p_payload->>'id','')::uuid;
  v_season uuid;
  v_farm   uuid;
  v_lines  jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_line   jsonb;
  v_count  int := 0;
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

    -- fertilizer_load_line_consistency_check enforces that the product belongs
    -- to this load's season and that any contract is for the same product and
    -- season. It runs as the caller, so it fails closed.
    INSERT INTO fertilizer_load_lines (
      load_id, fertilizer_product_id, contract_id, quantity,
      computed_quantity, unit_type, notes
    ) VALUES (
      v_id,
      (v_line->>'fertilizer_product_id')::uuid,
      nullif(v_line->>'contract_id','')::uuid,
      (v_line->>'quantity')::numeric,
      nullif(v_line->>'computed_quantity','')::numeric,
      v_line->>'unit_type',
      nullif(v_line->>'notes','')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('load_id', v_id, 'line_count', v_count);
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_fertilizer_load(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fertilizer_load(jsonb) TO authenticated;
