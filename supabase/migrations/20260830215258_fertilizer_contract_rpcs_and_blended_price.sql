/*
  Fertilizer contract RPCs and the blended-price sync (F-3)

  Three things:

  1. `fertilizer_contracts.unit_type` is DROPPED. A contract is denominated in
     its product's own unit, full stop.

     This follows from the owner's decision on how contract units work, and it
     removes a real hazard rather than merely tidying. Converting a contract's
     quantity AND its price into the product's unit inside Postgres would have
     meant a THIRD copy of the unit conversion table — client, edge function, and
     SQL — in a third language, computing the number that drives every field
     cost. Guardrail 7 records that the existing two copies have needed
     hand-syncing three times already.

     Keeping the column but constraining it equal to the product's unit was the
     other option. That is denormalization that can drift — precisely the SEC-4
     shape avoided in F-2 by not carrying a farm_id. So the column goes.

     `fertilizer_load_lines.unit_type` STAYS. A load genuinely can arrive in
     another unit — 500 lb picked up in the spreader against a per-ton contract —
     and that rollup is computed in TypeScript for display, not here.

  2. A trigger maintains `fertilizer_products.price_per_unit` as the weighted
     average of that product's contracts. Same pattern as
     `update_master_product_on_hand`, which maintains on-hand from the ledger.

     Putting the recompute in the trigger rather than only in the RPC means the
     price cannot desync no matter how a contract row arrives — the RPC, a
     hand-crafted REST call, or a future admin fix. The RPC's remaining job is to
     validate, write, and hand the client a cascade target.

  3. `save_fertilizer_contract` / `delete_fertilizer_contract`, following the
     `record_purchase` precedent: SECURITY DEFINER, search_path pinned, revoked
     from PUBLIC and anon, granted to authenticated, re-checking `can_edit_farm`
     internally, and returning the cascade target so the client queues the
     cascade only after the write has committed.
*/

ALTER TABLE public.fertilizer_contracts DROP COLUMN IF EXISTS unit_type;

-- ---------------------------------------------------------------------------
-- Blended price sync
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fertilizer_contract_price_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_product uuid;
  v_old     uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product := OLD.fertilizer_product_id;
  ELSE
    v_product := NEW.fertilizer_product_id;
    IF TG_OP = 'UPDATE' AND OLD.fertilizer_product_id IS DISTINCT FROM NEW.fertilizer_product_id THEN
      v_old := OLD.fertilizer_product_id;
    END IF;
  END IF;

  PERFORM public.sync_fertilizer_blended_price(v_product);
  IF v_old IS NOT NULL THEN
    PERFORM public.sync_fertilizer_blended_price(v_old);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sync_fertilizer_blended_price(p_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_blended numeric;
BEGIN
  IF p_product_id IS NULL THEN RETURN NULL; END IF;

  /*
    Contracts with no price yet are EXCLUDED from the average but still count as
    contracted tonnage everywhere else. A booking made before the price is
    settled must not drag the blended cost toward zero.

    No conversion appears here, and that is the point: a contract is denominated
    in its product's own unit, so this is exact arithmetic rather than a third
    copy of the unit table.
  */
  SELECT round(
           SUM(c.contracted_quantity * c.price_per_unit)
           / NULLIF(SUM(c.contracted_quantity), 0), 2)
    INTO v_blended
    FROM fertilizer_contracts c
   WHERE c.fertilizer_product_id = p_product_id
     AND c.price_per_unit IS NOT NULL;

  /*
    No priced contracts left — after deleting the last one, say. Leave the
    product price exactly as it is. An undefined average must never zero out a
    price someone entered by hand.
  */
  IF v_blended IS NULL THEN RETURN NULL; END IF;

  -- Rounded to 2dp before comparison so float noise cannot trigger a cascade.
  UPDATE fertilizer_products
     SET price_per_unit = v_blended
   WHERE id = p_product_id
     AND price_per_unit IS DISTINCT FROM v_blended;

  RETURN v_blended;
END;
$fn$;

DROP TRIGGER IF EXISTS fertilizer_contract_price_sync ON public.fertilizer_contracts;
CREATE TRIGGER fertilizer_contract_price_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.fertilizer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fertilizer_contract_price_sync();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_fertilizer_contract(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_id         uuid := nullif(p_payload->>'id','')::uuid;
  v_product    uuid;
  v_season     uuid;
  v_farm       uuid;
  v_qty        numeric := (p_payload->>'contracted_quantity')::numeric;
  v_price      numeric := nullif(p_payload->>'price_per_unit','')::numeric;
  v_kind       text    := coalesce(nullif(p_payload->>'kind',''), 'contract');
  v_before     numeric;
  v_after      numeric;
  v_cascade    jsonb := 'null'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL THEN
    -- Insert. Product and season come from the payload and must agree.
    v_product := nullif(p_payload->>'fertilizer_product_id','')::uuid;
    v_season  := nullif(p_payload->>'season_id','')::uuid;
    IF v_product IS NULL OR v_season IS NULL THEN
      RAISE EXCEPTION 'fertilizer_product_id and season_id are required'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Update. The product a booking is for is not changeable; re-pointing a
    -- contract at another product would silently move money between them.
    SELECT c.fertilizer_product_id, c.season_id INTO v_product, v_season
      FROM fertilizer_contracts c WHERE c.id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fertilizer contract not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fertilizer_products p
                  WHERE p.id = v_product AND p.season_id = v_season) THEN
    RAISE EXCEPTION 'Fertilizer product does not belong to that season'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.farm_id INTO v_farm FROM seasons s WHERE s.id = v_season;
  IF v_farm IS NULL OR NOT public.can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'You do not have permission to change this farm''s contracts'
      USING ERRCODE = '42501';
  END IF;

  IF v_qty IS NULL OR NOT (v_qty > 0) THEN
    RAISE EXCEPTION 'Contracted quantity must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_price IS NOT NULL AND NOT (v_price > 0) THEN
    RAISE EXCEPTION 'Price per unit must be greater than zero when given' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('contract','spot') THEN
    RAISE EXCEPTION 'kind must be contract or spot' USING ERRCODE = '22023';
  END IF;

  SELECT p.price_per_unit INTO v_before FROM fertilizer_products p WHERE p.id = v_product;

  IF v_id IS NULL THEN
    INSERT INTO fertilizer_contracts (
      season_id, fertilizer_product_id, kind, label, contracted_quantity,
      price_per_unit, supplier, booked_on, notes, user_id
    ) VALUES (
      v_season, v_product, v_kind,
      nullif(p_payload->>'label',''), v_qty, v_price,
      nullif(p_payload->>'supplier',''),
      nullif(p_payload->>'booked_on','')::date,
      nullif(p_payload->>'notes',''),
      v_uid                       -- the real author, never taken from the payload
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE fertilizer_contracts SET
      kind                = v_kind,
      label               = nullif(p_payload->>'label',''),
      contracted_quantity = v_qty,
      price_per_unit      = v_price,
      supplier            = nullif(p_payload->>'supplier',''),
      booked_on           = nullif(p_payload->>'booked_on','')::date,
      notes               = nullif(p_payload->>'notes','')
    WHERE id = v_id;
  END IF;

  -- The trigger has already resynced the product price by this point.
  SELECT p.price_per_unit INTO v_after FROM fertilizer_products p WHERE p.id = v_product;

  IF v_after IS DISTINCT FROM v_before THEN
    v_cascade := jsonb_build_object(
      'task_type',   'cascade_product_update',
      'entity_id',   v_product,
      'entity_type', 'product',
      'season_id',   v_season);
  END IF;

  RETURN jsonb_build_object(
    'contract_id',   v_id,
    'blended_price', v_after,
    'price_changed', (v_after IS DISTINCT FROM v_before),
    'cascade',       v_cascade);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_fertilizer_contract(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_product uuid;
  v_season  uuid;
  v_farm    uuid;
  v_before  numeric;
  v_after   numeric;
  v_cascade jsonb := 'null'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT c.fertilizer_product_id, c.season_id INTO v_product, v_season
    FROM fertilizer_contracts c WHERE c.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fertilizer contract not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.farm_id INTO v_farm FROM seasons s WHERE s.id = v_season;
  IF v_farm IS NULL OR NOT public.can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'You do not have permission to change this farm''s contracts'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.price_per_unit INTO v_before FROM fertilizer_products p WHERE p.id = v_product;

  -- fertilizer_load_lines.contract_id is ON DELETE RESTRICT, so this raises
  -- rather than orphaning delivered tonnage. That error is meant to reach the
  -- user: reassign or delete the loads first.
  DELETE FROM fertilizer_contracts WHERE id = p_id;

  SELECT p.price_per_unit INTO v_after FROM fertilizer_products p WHERE p.id = v_product;

  IF v_after IS DISTINCT FROM v_before THEN
    v_cascade := jsonb_build_object(
      'task_type',   'cascade_product_update',
      'entity_id',   v_product,
      'entity_type', 'product',
      'season_id',   v_season);
  END IF;

  RETURN jsonb_build_object(
    'blended_price', v_after,
    'price_changed', (v_after IS DISTINCT FROM v_before),
    'cascade',       v_cascade);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants. Guardrail 3: revoking from PUBLIC is not enough on Supabase, because
-- default privileges grant EXECUTE to anon and authenticated on creation.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.save_fertilizer_contract(jsonb)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_fertilizer_contract(uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_fertilizer_blended_price(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fertilizer_contract_price_sync()       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_fertilizer_contract(jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_fertilizer_contract(uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_fertilizer_blended_price(uuid) IS
  'Recomputes fertilizer_products.price_per_unit as the contracted-quantity-weighted average of that product''s contracts. Unpriced contracts are excluded; when none are priced the existing price is left alone rather than zeroed.';
