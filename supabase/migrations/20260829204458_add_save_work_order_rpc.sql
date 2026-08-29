/*
  # Atomic work-order save (WI-13)

  ## Problem
  `saveWorkOrder()` performed three sequential inserts — header, fields, lines.
  Failures on the second and third were logged only, and the function still
  returned the new id, leaving a work order with no fields or no chemicals and
  a UI that reported success.

  ## Behaviour
  One transaction. Either the header, all its fields and all its lines exist, or
  none of them do. `created_by` is taken from the authenticated caller rather
  than the payload, so it cannot be spoofed.

  The season is checked against the farm: a caller cannot file a work order for
  farm A against a season belonging to farm B.
*/

CREATE OR REPLACE FUNCTION public.save_work_order(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_farm    uuid := (p_payload->>'farm_id')::uuid;
  v_season  uuid := (p_payload->>'season_id')::uuid;
  v_season_farm uuid;
  v_wo      uuid;
  v_fields  jsonb := coalesce(p_payload->'fields', '[]'::jsonb);
  v_lines   jsonb := coalesce(p_payload->'lines',  '[]'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_farm IS NULL OR v_season IS NULL THEN
    RAISE EXCEPTION 'A work order needs both a farm and a season' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'You do not have permission to save work orders for this farm'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.farm_id INTO v_season_farm FROM seasons s WHERE s.id = v_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Season not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_season_farm IS DISTINCT FROM v_farm THEN
    RAISE EXCEPTION 'That season belongs to a different farm' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'A work order needs at least one chemical line' USING ERRCODE = '22023';
  END IF;

  INSERT INTO work_orders (
    farm_id, season_id, program_id, program_name, crop_type,
    status, total_acreage, spray_volume_gal_per_acre, created_by
  ) VALUES (
    v_farm,
    v_season,
    nullif(p_payload->>'program_id', '')::uuid,
    coalesce(p_payload->>'program_name', 'Work order'),
    p_payload->>'crop_type',
    'draft',
    coalesce((p_payload->>'total_acreage')::numeric, 0),
    nullif(p_payload->>'spray_volume_gal_per_acre', '')::numeric,
    v_uid
  )
  RETURNING id INTO v_wo;

  INSERT INTO work_order_fields (work_order_id, field_id, field_name, acreage)
  SELECT v_wo, nullif(x.field_id, '')::uuid, x.field_name, coalesce(x.acreage, 0)
    FROM jsonb_to_recordset(v_fields)
      AS x(field_id text, field_name text, acreage numeric);

  INSERT INTO work_order_lines (
    work_order_id, master_product_id, chemical_name, rate_per_acre,
    rate_unit, total_needed, price_per_unit, price_unit, sort_order
  )
  SELECT v_wo, nullif(x.master_product_id, '')::uuid, x.chemical_name,
         coalesce(x.rate_per_acre, 0), coalesce(x.rate_unit, ''),
         coalesce(x.total_needed, 0), x.price_per_unit, x.price_unit,
         coalesce(x.sort_order, 0)
    FROM jsonb_to_recordset(v_lines)
      AS x(master_product_id text, chemical_name text, rate_per_acre numeric,
           rate_unit text, total_needed numeric, price_per_unit numeric,
           price_unit text, sort_order int);

  RETURN v_wo;
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_work_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_work_order(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_work_order(jsonb) TO authenticated;
