/*
  # save_field_fertilizer_rates — V-4 of Field-Level-Fertilizer-Rates-Design.md

  Writes one field's custom rates for ONE program, and the program-shaped
  `field_cost_overrides` entry that carries the resulting cost, in a single transaction.

  ## What it deliberately does NOT do — §5.2a

  **It does not compute the cost.** Turning rates into a $/ac needs a unit conversion,
  including the density bridge for a liquid, and putting that here would be the third copy
  of the unit table, in a third language, computing the number that drives every field
  cost. That is exactly what F-3 refused when it dropped `fertilizer_contracts.unit_type`.
  The client computes it with `costResolvedItems` and passes it in; this function
  validates the figure and writes it atomically, but never derives it.

  **It does not write `total_cost_per_acre` either**, for the same reason one step removed:
  the total is a flat sum, but it is already implemented twice (client and edge function)
  and a SQL copy would be a third language for it too. The client calls the existing
  `recalculateFieldTotal` after this returns, which is precisely what
  `createOrUpdateOverride` has always done for a numeric override.

  The honest cost of that choice: if the client dies between the RPC and the recalculation,
  the field's total is stale until the next override edit or cascade. It is self-healing
  and it is not the 31 Aug defect, which was systematic — every cascade reverted the total,
  every time. This is a crash window. Atomicity is spent where a half-write would leave
  data that is *inconsistent* (rates without their override), not merely *stale*.

  ## Reset semantics

  An empty `rates` array deletes the field's custom rows for that program, and the caller
  supplies the PROGRAM's own cost so the override entry reverts to it. The override row is
  deliberately NOT deleted: its value then equals what the template would give, so the
  total resolves identically, and per guardrail 9 the skipped column write is harmless.
  Clearing a field's customisation entirely is a V-5 concern with a UI behind it.
*/

CREATE OR REPLACE FUNCTION public.save_field_fertilizer_rates(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_field_id   uuid;
  v_program_id uuid;
  v_cost       numeric;
  v_season     uuid;
  v_farm       uuid;
  v_caller     uuid := auth.uid();
  v_rate       jsonb;
  v_written    int := 0;
  v_existing   jsonb;
  v_template   uuid;
  v_array      jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  v_field_id   := (p_payload->>'field_id')::uuid;
  v_program_id := (p_payload->>'program_id')::uuid;

  IF v_field_id IS NULL OR v_program_id IS NULL THEN
    RAISE EXCEPTION 'field_id and program_id are required' USING ERRCODE = '22023';
  END IF;

  -- The cost is supplied, not derived (§5.2a) -- but a client-supplied figure that lands
  -- in money is still checked rather than trusted.
  IF jsonb_typeof(p_payload->'program_cost_per_acre') <> 'number' THEN
    RAISE EXCEPTION 'program_cost_per_acre must be a number' USING ERRCODE = '22023';
  END IF;
  -- jsonb_typeof = 'number' already guarantees a finite JSON number -- JSON has no NaN and
  -- no Infinity -- so the sign is the only thing left worth checking.
  v_cost := (p_payload->>'program_cost_per_acre')::numeric;
  IF v_cost < 0 THEN
    RAISE EXCEPTION 'program_cost_per_acre must be zero or greater' USING ERRCODE = '22023';
  END IF;

  SELECT f.season_id, s.farm_id INTO v_season, v_farm
    FROM fields f JOIN seasons s ON s.id = f.season_id
   WHERE f.id = v_field_id;

  IF v_season IS NULL THEN
    RAISE EXCEPTION 'field % not found', v_field_id USING ERRCODE = '22023';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so authorization is re-checked here explicitly.
  IF NOT can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'not authorized to edit this farm' USING ERRCODE = '42501';
  END IF;

  -- The row trigger enforces this too; failing here names the problem clearly instead of
  -- surfacing a trigger message from the middle of a loop.
  IF NOT EXISTS (
    SELECT 1 FROM fertilizer_programs p
     WHERE p.id = v_program_id AND p.season_id = v_season
  ) THEN
    RAISE EXCEPTION 'fertilizer program % does not belong to the field''s season',
      v_program_id USING ERRCODE = '22023';
  END IF;

  ------------------------------------------------------------------ rates
  DELETE FROM field_fertilizer_rates
   WHERE field_id = v_field_id AND program_id = v_program_id;

  FOR v_rate IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'rates', '[]'::jsonb))
  LOOP
    IF (v_rate->>'product_id') IS NULL THEN
      RAISE EXCEPTION 'every rate needs a product_id' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_rate->'rate') <> 'number' THEN
      RAISE EXCEPTION 'rate for product % must be a number', v_rate->>'product_id'
        USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_rate->>'unit', '') = '' THEN
      RAISE EXCEPTION 'rate for product % needs a unit', v_rate->>'product_id'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO field_fertilizer_rates
      (field_id, program_id, fertilizer_product_id, application_rate,
       application_rate_unit, sort_order, user_id)
    VALUES
      (v_field_id, v_program_id, (v_rate->>'product_id')::uuid,
       (v_rate->>'rate')::numeric, v_rate->>'unit',
       nullif(v_rate->>'sort_order','')::int, v_caller);

    v_written := v_written + 1;
  END LOOP;

  ------------------------------------------------------------------ override
  /*
   * The override array is the field's WHOLE fertilizer program list, so saving one
   * program must update that program's entry and leave its siblings alone. When the field
   * has no override yet it is seeded from the template, which is what the field was
   * inheriting a moment ago -- seeding from empty would silently drop every other pass.
   */
  SELECT o.override_value INTO v_existing
    FROM field_cost_overrides o
   WHERE o.field_id = v_field_id AND o.cost_item_name = 'fertilizer_programs';

  IF v_existing IS NULL OR jsonb_typeof(v_existing) <> 'array' THEN
    SELECT fc.template_id INTO v_template FROM field_costs fc WHERE fc.field_id = v_field_id;
    IF v_template IS NOT NULL THEN
      SELECT coalesce(ct.fertilizer_programs, '[]'::jsonb) INTO v_existing
        FROM cost_templates ct WHERE ct.id = v_template;
    END IF;
    v_existing := coalesce(v_existing, '[]'::jsonb);
    IF jsonb_typeof(v_existing) <> 'array' THEN v_existing := '[]'::jsonb; END IF;
  END IF;

  -- Replace in place, preserving the template's ordering.
  SELECT coalesce(jsonb_agg(
           CASE WHEN e->>'program_id' = v_program_id::text
                THEN jsonb_set(e, '{cost_per_acre}', to_jsonb(v_cost))
                ELSE e END
           ORDER BY ord), '[]'::jsonb)
    INTO v_array
    FROM jsonb_array_elements(v_existing) WITH ORDINALITY AS t(e, ord);

  IF NOT (v_array @> jsonb_build_array(jsonb_build_object('program_id', v_program_id::text))) THEN
    v_array := v_array || jsonb_build_array(
      jsonb_build_object('program_id', v_program_id::text, 'cost_per_acre', v_cost));
  END IF;

  INSERT INTO field_cost_overrides (field_id, cost_item_name, override_value)
  VALUES (v_field_id, 'fertilizer_programs', v_array)
  ON CONFLICT (field_id, cost_item_name)
  DO UPDATE SET override_value = EXCLUDED.override_value;

  RETURN jsonb_build_object(
    'field_id', v_field_id,
    'program_id', v_program_id,
    'rates_written', v_written,
    'fertilizer_programs', v_array
  );
END;
$fn$;

-- Guardrail 3: REVOKE FROM PUBLIC is not enough on Supabase, which grants EXECUTE to
-- anon and authenticated by default privileges.
REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_field_fertilizer_rates(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_field_fertilizer_rates(jsonb) TO authenticated;
