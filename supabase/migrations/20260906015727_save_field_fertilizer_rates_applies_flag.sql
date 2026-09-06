/*
  # `applies: false` removes a pass from a field's program list — V-5

  §7.2's third case — "this field gets none of this pass this year" — cannot be expressed by
  an empty rate set. Under replace-wholly, no rows means INHERIT, which is indistinguishable
  from never having touched the field. It is expressed by taking the program out of the
  field's program list, and that list is the `field_cost_overrides('fertilizer_programs')`
  array this function already owns.

  The branch lives here rather than in the client so the override keeps exactly ONE writer.
  Letting the editor compute and write the array itself would put a second writer on the row
  that carries every custom-rated field's fertilizer money.

  `applies` defaults to true, so every V-4 caller behaves identically — asserted by the
  rehearsal's first assertion before anything else was checked.

  A removal carries no cost, so `program_cost_per_acre` is not demanded on that path.
  Removing an already-absent pass is a no-op rather than an error, because the editor saves
  every program on the screen and most of them will not have changed.
*/

CREATE OR REPLACE FUNCTION public.save_field_fertilizer_rates(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_field_id uuid; v_program_id uuid; v_cost numeric; v_season uuid; v_farm uuid;
  v_caller uuid := auth.uid(); v_rate jsonb; v_written int := 0;
  v_existing jsonb; v_template uuid; v_array jsonb; v_applies boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  v_field_id := (p_payload->>'field_id')::uuid;
  v_program_id := (p_payload->>'program_id')::uuid;
  IF v_field_id IS NULL OR v_program_id IS NULL THEN
    RAISE EXCEPTION 'field_id and program_id are required' USING ERRCODE = '22023'; END IF;

  v_applies := coalesce((p_payload->>'applies')::boolean, true);

  -- A pass being removed carries no cost, so do not demand one.
  IF v_applies THEN
    IF jsonb_typeof(p_payload->'program_cost_per_acre') <> 'number' THEN
      RAISE EXCEPTION 'program_cost_per_acre must be a number' USING ERRCODE = '22023'; END IF;
    v_cost := (p_payload->>'program_cost_per_acre')::numeric;
    IF v_cost < 0 THEN
      RAISE EXCEPTION 'program_cost_per_acre must be zero or greater' USING ERRCODE = '22023'; END IF;
  END IF;

  SELECT f.season_id, s.farm_id INTO v_season, v_farm
    FROM fields f JOIN seasons s ON s.id = f.season_id WHERE f.id = v_field_id;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'field % not found', v_field_id USING ERRCODE = '22023'; END IF;

  -- SECURITY DEFINER bypasses RLS, so authorization is re-checked here explicitly.
  IF NOT can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'not authorized to edit this farm' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fertilizer_programs p
                  WHERE p.id = v_program_id AND p.season_id = v_season) THEN
    RAISE EXCEPTION 'fertilizer program % does not belong to the field''s season',
      v_program_id USING ERRCODE = '22023'; END IF;

  DELETE FROM field_fertilizer_rates
   WHERE field_id = v_field_id AND program_id = v_program_id;

  IF v_applies THEN
    FOR v_rate IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'rates','[]'::jsonb))
    LOOP
      IF (v_rate->>'product_id') IS NULL THEN
        RAISE EXCEPTION 'every rate needs a product_id' USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(v_rate->'rate') <> 'number' THEN
        RAISE EXCEPTION 'rate for product % must be a number', v_rate->>'product_id'
          USING ERRCODE = '22023'; END IF;
      IF coalesce(v_rate->>'unit','') = '' THEN
        RAISE EXCEPTION 'rate for product % needs a unit', v_rate->>'product_id'
          USING ERRCODE = '22023'; END IF;
      INSERT INTO field_fertilizer_rates
        (field_id, program_id, fertilizer_product_id, application_rate,
         application_rate_unit, sort_order, user_id)
      VALUES (v_field_id, v_program_id, (v_rate->>'product_id')::uuid,
         (v_rate->>'rate')::numeric, v_rate->>'unit',
         nullif(v_rate->>'sort_order','')::int, v_caller);
      v_written := v_written + 1;
    END LOOP;
  END IF;

  -- Seeded from the template when the field has no override yet -- what it was inheriting a
  -- moment ago. Seeding from empty would silently drop every other pass.
  SELECT o.override_value INTO v_existing FROM field_cost_overrides o
   WHERE o.field_id = v_field_id AND o.cost_item_name = 'fertilizer_programs';
  IF v_existing IS NULL OR jsonb_typeof(v_existing) <> 'array' THEN
    SELECT fc.template_id INTO v_template FROM field_costs fc WHERE fc.field_id = v_field_id;
    IF v_template IS NOT NULL THEN
      SELECT coalesce(ct.fertilizer_programs,'[]'::jsonb) INTO v_existing
        FROM cost_templates ct WHERE ct.id = v_template; END IF;
    v_existing := coalesce(v_existing,'[]'::jsonb);
    IF jsonb_typeof(v_existing) <> 'array' THEN v_existing := '[]'::jsonb; END IF;
  END IF;

  IF v_applies THEN
    -- Replace in place, preserving the template's ordering.
    SELECT coalesce(jsonb_agg(
             CASE WHEN e->>'program_id' = v_program_id::text
                  THEN jsonb_set(e,'{cost_per_acre}', to_jsonb(v_cost)) ELSE e END
             ORDER BY ord),'[]'::jsonb)
      INTO v_array
      FROM jsonb_array_elements(v_existing) WITH ORDINALITY AS t(e, ord);
    IF NOT (v_array @> jsonb_build_array(jsonb_build_object('program_id', v_program_id::text))) THEN
      v_array := v_array || jsonb_build_array(
        jsonb_build_object('program_id', v_program_id::text, 'cost_per_acre', v_cost)); END IF;
  ELSE
    SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]'::jsonb) INTO v_array
      FROM jsonb_array_elements(v_existing) WITH ORDINALITY AS t(e, ord)
     WHERE e->>'program_id' IS DISTINCT FROM v_program_id::text;
  END IF;

  INSERT INTO field_cost_overrides (field_id, cost_item_name, override_value)
  VALUES (v_field_id, 'fertilizer_programs', v_array)
  ON CONFLICT (field_id, cost_item_name) DO UPDATE SET override_value = EXCLUDED.override_value;

  RETURN jsonb_build_object('field_id', v_field_id, 'program_id', v_program_id,
    'applies', v_applies, 'rates_written', v_written, 'fertilizer_programs', v_array);
END; $fn$;

REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_field_fertilizer_rates(jsonb) TO authenticated;
