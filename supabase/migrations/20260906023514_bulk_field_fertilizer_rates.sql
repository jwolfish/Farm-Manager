/*
  # One transaction for a whole grid of fields — V-6

  V-4's `save_field_fertilizer_rates` writes one (field, program) pair. The V-5 editor is
  scoped to one field, so a loop over programs was right there. The V-6 grid is scoped to
  one PROGRAM across every field in the season, and looping over 17 separate RPC calls
  would mean a save that can stop half way: eight fields updated, nine not, no error the
  user can act on beyond "try again".

  That matters more than it looks, because §10.7 of the design doc requires the CSV import
  (V-7) to be all-or-nothing, and the import commits through this same path. Building the
  grid's save on a loop would have meant rebuilding it for V-7.

  ## The refactor is the point, not the new entry point

  The body moves into `apply_field_fertilizer_rates`, and BOTH the single and the bulk RPC
  call it. There is exactly one implementation of what it means to save a field's rates for
  a pass — seeding the override array from the template, replace-wholly on the rate rows,
  the `applies:false` removal branch. A second copy that drifted would put two different
  meanings on the row carrying every custom-rated field's fertilizer money, which is the
  shape guardrail 7 exists to warn about.

  The internal is SECURITY DEFINER with `search_path` pinned and executable by NEITHER role,
  the pattern F-3 used for `sync_fertilizer_blended_price`. It is not an API.

  ## What the bulk wrapper adds beyond the loop

  - **A duplicate (field, program) pair raises.** The same cell named twice in one payload
    is a client bug, and silently letting the last one win is the quiet kind of wrong this
    remediation keeps deleting.
  - **An empty payload raises.** Nothing calls this with no work to do; a save button that
    is enabled with nothing to save is a bug worth hearing about.

  Authorization is re-checked per entry inside the internal function rather than once for
  the batch, so a payload mixing two farms is refused on the first foreign field rather than
  waved through by the first legitimate one.

  ## What it deliberately does NOT do

  It does not compute the cost and it does not write `total_cost_per_acre` — §5.2a. The cost
  needs the unit table and the density bridge, and putting those in SQL is the third copy in
  a third language that F-3 refused when it dropped `fertilizer_contracts.unit_type`. The
  client re-totals each saved field afterwards, exactly as V-4 established.

  So the crash window V-4 documented widens from one field to the batch: rates and overrides
  land atomically, then the totals are recomputed one at a time and could be interrupted.
  That leaves a total STALE, not inconsistent, and it self-heals on the next edit or
  cascade. Atomicity is still spent where a half-write would leave data wrong.
*/

-- The whole of V-4/V-5's body, unchanged in behaviour, now callable from both wrappers.
CREATE OR REPLACE FUNCTION public.apply_field_fertilizer_rates(p_payload jsonb)
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

  -- SECURITY DEFINER bypasses RLS, so authorization is re-checked here explicitly. Per
  -- ENTRY, not per batch: a payload mixing two farms must be refused on the foreign field.
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

-- Not an API. Neither role may reach it; it exists so the two wrappers share one body.
REVOKE ALL ON FUNCTION public.apply_field_fertilizer_rates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_field_fertilizer_rates(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.apply_field_fertilizer_rates(jsonb) FROM authenticated;

-- The V-4/V-5 entry point, now a one-line delegate. Its signature, its grants and every
-- caller are unchanged; the rehearsal asserts that before it checks anything new.
CREATE OR REPLACE FUNCTION public.save_field_fertilizer_rates(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
BEGIN
  RETURN public.apply_field_fertilizer_rates(p_payload);
END; $fn$;

REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_field_fertilizer_rates(jsonb) TO authenticated;

-- The grid's save, and the import's commit. `{"saves": [ <the single payload shape>, ... ]}`
CREATE OR REPLACE FUNCTION public.save_field_fertilizer_rates_bulk(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_saves jsonb; v_entry jsonb; v_results jsonb := '[]'::jsonb; v_seen text[] := '{}';
  v_key text; v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;

  v_saves := p_payload->'saves';
  IF jsonb_typeof(v_saves) <> 'array' THEN
    RAISE EXCEPTION 'saves must be an array' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(v_saves) = 0 THEN
    RAISE EXCEPTION 'saves is empty -- nothing to write' USING ERRCODE = '22023'; END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_saves)
  LOOP
    -- The same cell twice in one payload is a client bug. Letting the last one win would
    -- silently discard the other, which is exactly the quiet failure this codebase removes.
    v_key := coalesce(v_entry->>'field_id','') || '|' || coalesce(v_entry->>'program_id','');
    IF v_key = ANY(v_seen) THEN
      RAISE EXCEPTION 'field/program pair named twice in one save: %', v_key
        USING ERRCODE = '22023'; END IF;
    v_seen := v_seen || v_key;

    v_results := v_results || jsonb_build_array(public.apply_field_fertilizer_rates(v_entry));
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count, 'results', v_results);
END; $fn$;

REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates_bulk(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates_bulk(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_field_fertilizer_rates_bulk(jsonb) TO authenticated;
