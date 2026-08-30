/*
  # WI-5 batch 2 — farm-scope seasons, fields and everything hanging off them

  ## What this covers
  The 47 policies on 17 tables that still call `is_team_member_of(owner)` or
  `is_editor_of(owner)` and can be resolved to a farm. Batch 1 did the seven
  tables that carry `farm_id` directly.

  ## The transformation
  Each affected policy's predicate becomes

      (SELECT auth.uid()) = <owner column>  OR  can_view_farm(<farm>)     -- SELECT
      (SELECT auth.uid()) = <owner column>  OR  can_edit_farm(<farm>)     -- INSERT/UPDATE

  The `auth.uid() = user_id` half is KEPT deliberately. It was already there,
  it is not the hole — the hole was `is_editor_of(user_id)` ignoring
  `team_members.farm_id` — and keeping it means a row whose season has a NULL
  `farm_id` cannot silently become invisible to the person who created it.
  `seasons.farm_id` is nullable, so that is a live possibility.

  ## Why this is written as a loop rather than 47 spelled-out policies
  The mapping below is the only interesting content; the rest is boilerplate
  repeated 47 times. Generating it removes the transcription errors that come
  with hand-copying near-identical SQL — the first draft of this migration was
  produced that way and emitted a stray semicolon before every `WITH CHECK`,
  which would have failed on the UPDATE policies.

  Only policies that currently reference the old helpers are touched. DELETE
  policies on these tables are `auth.uid() = user_id` and are deliberately left
  alone: converting them to `can_edit_farm` would *widen* them to let any editor
  delete, which is a product decision, not a security fix.

  ## Not in this batch
  `cascade_tasks`, `user_profiles`, `field_chemical_applications` and
  `field_fertilizer_applications` need their own semantics and are batch 3,
  along with retiring `is_team_member_of` / `is_editor_of` entirely.
*/

DO $migrate$
DECLARE
  r record;
  v_pred_view text;
  v_pred_edit text;
  v_pred text;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.tablename, p.cmd, p.policyname, m.farm_expr, m.owner_col
    FROM pg_policies p
    JOIN (VALUES
      -- table,                    farm expression,                                                                                                            owner column
      ('farms',                    'id',                                                                                                                       'owner_user_id'),
      ('seasons',                  'farm_id',                                                                                                                  'user_id'),
      ('fields',                   '(SELECT s.farm_id FROM seasons s WHERE s.id = fields.season_id)',                                                           'user_id'),
      ('chemical_programs',        '(SELECT s.farm_id FROM seasons s WHERE s.id = chemical_programs.season_id)',                                                'user_id'),
      ('fertilizer_programs',      '(SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_programs.season_id)',                                              'user_id'),
      ('individual_chemicals',     '(SELECT s.farm_id FROM seasons s WHERE s.id = individual_chemicals.season_id)',                                             'user_id'),
      ('fertilizer_products',      '(SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_products.season_id)',                                              'user_id'),
      ('seed_varieties',           '(SELECT s.farm_id FROM seasons s WHERE s.id = seed_varieties.season_id)',                                                   'user_id'),
      ('cost_templates',           '(SELECT s.farm_id FROM seasons s WHERE s.id = cost_templates.season_id)',                                                   'user_id'),
      ('equipment_rates',          '(SELECT s.farm_id FROM seasons s WHERE s.id = equipment_rates.season_id)',                                                  'user_id'),
      ('commodity_sales',          '(SELECT s.farm_id FROM seasons s WHERE s.id = commodity_sales.season_id)',                                                  'user_id'),
      ('field_costs',              '(SELECT s.farm_id FROM seasons s JOIN fields f ON f.season_id = s.id WHERE f.id = field_costs.field_id)',                   'user_id'),
      ('field_yields',             '(SELECT s.farm_id FROM seasons s JOIN fields f ON f.season_id = s.id WHERE f.id = field_yields.field_id)',                  'user_id'),
      ('yield_and_price',          '(SELECT s.farm_id FROM seasons s JOIN fields f ON f.season_id = s.id WHERE f.id = yield_and_price.field_id)',               'user_id'),
      ('field_cost_overrides',     '(SELECT s.farm_id FROM seasons s JOIN fields f ON f.season_id = s.id WHERE f.id = field_cost_overrides.field_id)',          NULL),
      ('chemical_program_items',   '(SELECT s.farm_id FROM seasons s JOIN chemical_programs p ON p.season_id = s.id WHERE p.id = chemical_program_items.program_id)',     NULL),
      ('fertilizer_program_items', '(SELECT s.farm_id FROM seasons s JOIN fertilizer_programs p ON p.season_id = s.id WHERE p.id = fertilizer_program_items.program_id)', NULL)
    ) AS m(tbl, farm_expr, owner_col) ON m.tbl = p.tablename
    WHERE p.schemaname = 'public'
      AND (p.qual       LIKE '%is_editor_of%'      OR p.with_check LIKE '%is_editor_of%'
        OR p.qual       LIKE '%is_team_member_of%' OR p.with_check LIKE '%is_team_member_of%')
  LOOP
    v_pred_view := format('can_view_farm(%s)', r.farm_expr);
    v_pred_edit := format('can_edit_farm(%s)', r.farm_expr);

    IF r.owner_col IS NOT NULL THEN
      v_pred_view := format('(SELECT auth.uid()) = %I OR %s', r.owner_col, v_pred_view);
      v_pred_edit := format('(SELECT auth.uid()) = %I OR %s', r.owner_col, v_pred_edit);
    END IF;

    v_pred := CASE WHEN r.cmd = 'SELECT' THEN v_pred_view ELSE v_pred_edit END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);

    IF r.cmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)',
                     r.policyname, r.tablename, v_pred);
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                     r.policyname, r.tablename, v_pred, v_pred);
    ELSE
      EXECUTE format('CREATE POLICY %I ON %I FOR %s TO authenticated USING (%s)',
                     r.policyname, r.tablename, r.cmd, v_pred);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Replay-safe: on a second run nothing still references the old helpers, so
  -- the loop matches nothing and there is simply no work to do. Any count in
  -- between means the schema is not in a state this migration understands.
  IF v_count = 0 THEN
    RAISE NOTICE 'WI-5 batch 2: no policies reference the old helpers; already applied';
  ELSIF v_count <> 47 THEN
    RAISE EXCEPTION 'WI-5 batch 2 expected 47 policies but matched %; schema is not in the expected state', v_count;
  ELSE
    RAISE NOTICE 'WI-5 batch 2 rewrote % policies', v_count;
  END IF;
END;
$migrate$;
