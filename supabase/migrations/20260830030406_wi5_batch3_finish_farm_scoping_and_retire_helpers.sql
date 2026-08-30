/*
  # WI-5 batch 3 — the four remaining policies, the applications write bug, and
  # retiring the old helpers

  Batches 1 and 2 converted 75 policies to `can_view_farm` / `can_edit_farm`.
  Four SELECT policies were left because they do not resolve to a farm the same
  mechanical way. This finishes them, fixes a collaboration bug found while
  mapping them, and drops `is_team_member_of` / `is_editor_of` for good.

  ## 1. user_profiles
  A profile is not farm-scoped. The old rule was "someone who invited me may see
  my profile". Expressed against farms: you may see a profile if you are that
  person, or if they own a farm you can view. Tighter than the original, because
  it also requires the farm to still exist and the membership to still be
  accepted.

  ## 2. cascade_tasks
  Tasks are per-user but carry a season, so the farm is reachable. The old rule
  let any collaborator of the task's owner read every task that owner had, on
  any farm. Now a task is visible to its owner, or to someone who can view the
  farm the task's season belongs to.

  ## 3. field_chemical_applications / field_fertilizer_applications
  Their SELECT policies used the old helper. Their INSERT, UPDATE and DELETE
  policies check `field_costs.user_id = auth.uid()` and nothing else — **there is
  no collaborator path at all**, so an accepted editor on a shared farm cannot
  write them. That is a pre-existing bug, not something batches 1-2 introduced,
  and it directly contradicts WI-5's acceptance criterion that an editor can
  write to a farm they have been invited to. Fixing it here completes WI-5
  rather than widening scope.

  Note this does widen those three commands: an editor on the farm can now write
  them, which is the intended collaboration behaviour. The `fc.user_id =
  auth.uid()` disjunct is kept so nobody loses access to their own rows.

  ## 4. Retiring the helpers
  `is_team_member_of(uuid)` and `is_editor_of(uuid)` are the SEC-5 defect itself:
  both take only an owner id and ignore `team_members.farm_id`. After this
  migration nothing references them — verified against every policy, every other
  function in `public`, the client and the edge function. The PRD suggested
  keeping them as deprecated wrappers for one release; they are dropped instead,
  because a wrapper that silently ignores the farm is exactly the trap that
  caused this, and leaving it callable invites its reuse.
*/

-- ---------------------------------------------------------------------------
-- 1. user_profiles
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users and team members can view profiles" ON user_profiles;
CREATE POLICY "Users and team members can view profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR EXISTS (SELECT 1 FROM farms f
               WHERE f.owner_user_id = user_profiles.id
                 AND can_view_farm(f.id))
  );

-- ---------------------------------------------------------------------------
-- 2. cascade_tasks
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users and team members can view cascade tasks" ON cascade_tasks;
CREATE POLICY "Users and team members can view cascade tasks"
  ON cascade_tasks FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM seasons s
               WHERE s.id = cascade_tasks.season_id
                 AND can_view_farm(s.farm_id))
  );

-- ---------------------------------------------------------------------------
-- 3a. field_chemical_applications
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users and team members can view chemical applications" ON field_chemical_applications;
CREATE POLICY "Users and team members can view chemical applications"
  ON field_chemical_applications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_chemical_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_view_farm(s.farm_id))));

DROP POLICY IF EXISTS "Users can insert own chemical applications" ON field_chemical_applications;
CREATE POLICY "Users can insert own chemical applications"
  ON field_chemical_applications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_chemical_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))));

DROP POLICY IF EXISTS "Users can update own chemical applications" ON field_chemical_applications;
CREATE POLICY "Users can update own chemical applications"
  ON field_chemical_applications FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_chemical_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_chemical_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))));

DROP POLICY IF EXISTS "Users can delete own chemical applications" ON field_chemical_applications;
CREATE POLICY "Users can delete own chemical applications"
  ON field_chemical_applications FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_chemical_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))));

-- ---------------------------------------------------------------------------
-- 3b. field_fertilizer_applications
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users and team members can view fertilizer applications" ON field_fertilizer_applications;
CREATE POLICY "Users and team members can view fertilizer applications"
  ON field_fertilizer_applications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_fertilizer_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_view_farm(s.farm_id))));

DROP POLICY IF EXISTS "Users can insert own fertilizer applications" ON field_fertilizer_applications;
CREATE POLICY "Users can insert own fertilizer applications"
  ON field_fertilizer_applications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_fertilizer_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))));

DROP POLICY IF EXISTS "Users can update own fertilizer applications" ON field_fertilizer_applications;
CREATE POLICY "Users can update own fertilizer applications"
  ON field_fertilizer_applications FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_fertilizer_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_fertilizer_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))));

DROP POLICY IF EXISTS "Users can delete own fertilizer applications" ON field_fertilizer_applications;
CREATE POLICY "Users can delete own fertilizer applications"
  ON field_fertilizer_applications FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
      JOIN fields f  ON f.id = fc.field_id
      JOIN seasons s ON s.id = f.season_id
    WHERE fc.id = field_fertilizer_applications.field_cost_id
      AND (fc.user_id = (SELECT auth.uid()) OR can_edit_farm(s.farm_id))));

-- ---------------------------------------------------------------------------
-- 4. Retire the owner-only helpers
-- ---------------------------------------------------------------------------

DO $guard$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM pg_policies
   WHERE schemaname = 'public'
     AND (qual       LIKE '%is_editor_of%'      OR with_check LIKE '%is_editor_of%'
       OR qual       LIKE '%is_team_member_of%' OR with_check LIKE '%is_team_member_of%');

  IF v_left > 0 THEN
    RAISE EXCEPTION 'Refusing to drop the old helpers: % policies still reference them', v_left;
  END IF;
END;
$guard$;

DROP FUNCTION IF EXISTS public.is_team_member_of(uuid);
DROP FUNCTION IF EXISTS public.is_editor_of(uuid);
