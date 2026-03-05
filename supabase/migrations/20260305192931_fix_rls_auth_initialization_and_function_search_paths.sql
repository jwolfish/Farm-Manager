/*
  # Fix RLS Auth Initialization Plan and Function Search Paths

  ## Problem
  RLS policies using bare `auth.uid()` re-evaluate the function on every row checked,
  which causes significant performance degradation on large tables. Wrapping in
  `(SELECT auth.uid())` evaluates it once per query plan.

  ## Changes

  ### 1. Function Search Path Fix
  Recreate `is_team_member_of` and `is_editor_of` with `SET search_path = public`
  to prevent search_path injection attacks.

  ### 2. RLS Policy Updates
  Drop and recreate all policies that use bare `auth.uid()` with the optimized
  `(SELECT auth.uid())` form. Tables covered:

  - app_notifications (sender_user_id, recipient_user_id)
  - cascade_tasks (user_id)
  - chemical_program_items (via chemical_programs.user_id join)
  - chemical_programs (user_id)
  - commodity_sales (user_id)
  - cost_templates (user_id)
  - equipment_rates (user_id)
  - farms (owner_user_id)
  - fertilizer_products (user_id)
  - fertilizer_program_items (via fertilizer_programs.user_id join)
  - fertilizer_programs (user_id)
  - field_chemical_applications (via field_costs.user_id join)
  - field_cost_overrides (via fields.user_id join)
  - field_costs (user_id)
  - field_fertilizer_applications (via field_costs.user_id join)
  - field_yields (user_id)
  - fields (user_id)
  - individual_chemicals (user_id)
  - seasons (user_id)
  - seed_varieties (user_id)
  - team_members (user_id, invited_user_id)
  - user_profiles (id)
  - yield_and_price (user_id)

  ### Security Notes
  - No access changes — only performance optimization of auth function evaluation
  - All policy logic remains identical, just `auth.uid()` → `(SELECT auth.uid())`
*/

-- ============================================================
-- 1. Fix function search paths
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_team_member_of(owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = owner_id
    AND invited_user_id = (SELECT auth.uid())
    AND status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_editor_of(owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = owner_id
    AND invited_user_id = (SELECT auth.uid())
    AND status = 'accepted'
    AND role = 'editor'
  );
$$;

-- ============================================================
-- 2. app_notifications
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON app_notifications;
DROP POLICY IF EXISTS "Recipients can read own notifications" ON app_notifications;
DROP POLICY IF EXISTS "Recipients can update own notifications" ON app_notifications;

CREATE POLICY "Authenticated users can insert notifications"
  ON app_notifications FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = sender_user_id);

CREATE POLICY "Recipients can read own notifications"
  ON app_notifications FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = recipient_user_id);

CREATE POLICY "Recipients can update own notifications"
  ON app_notifications FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = recipient_user_id)
  WITH CHECK ((SELECT auth.uid()) = recipient_user_id);

-- ============================================================
-- 3. cascade_tasks
-- ============================================================

DROP POLICY IF EXISTS "Users can create own cascade tasks" ON cascade_tasks;
DROP POLICY IF EXISTS "Users can read own cascade tasks" ON cascade_tasks;
DROP POLICY IF EXISTS "Users can update own cascade tasks" ON cascade_tasks;

CREATE POLICY "Users can create own cascade tasks"
  ON cascade_tasks FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can read own cascade tasks"
  ON cascade_tasks FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own cascade tasks"
  ON cascade_tasks FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 4. chemical_program_items
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Users can insert own program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Users can update own program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Users can view own program items" ON chemical_program_items;

CREATE POLICY "Users can view own program items"
  ON chemical_program_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chemical_programs
    WHERE chemical_programs.id = chemical_program_items.program_id
    AND chemical_programs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can insert own program items"
  ON chemical_program_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM chemical_programs
    WHERE chemical_programs.id = chemical_program_items.program_id
    AND chemical_programs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update own program items"
  ON chemical_program_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chemical_programs
    WHERE chemical_programs.id = chemical_program_items.program_id
    AND chemical_programs.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM chemical_programs
    WHERE chemical_programs.id = chemical_program_items.program_id
    AND chemical_programs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete own program items"
  ON chemical_program_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chemical_programs
    WHERE chemical_programs.id = chemical_program_items.program_id
    AND chemical_programs.user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 5. chemical_programs
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Users can insert own chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Users can update own chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Users can view own chemical programs" ON chemical_programs;

CREATE POLICY "Users can view own chemical programs"
  ON chemical_programs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own chemical programs"
  ON chemical_programs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own chemical programs"
  ON chemical_programs FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own chemical programs"
  ON chemical_programs FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 6. commodity_sales
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own sales" ON commodity_sales;
DROP POLICY IF EXISTS "Users can insert own sales" ON commodity_sales;
DROP POLICY IF EXISTS "Users can update own sales" ON commodity_sales;
DROP POLICY IF EXISTS "Users can view own sales" ON commodity_sales;

CREATE POLICY "Users can view own sales"
  ON commodity_sales FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own sales"
  ON commodity_sales FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own sales"
  ON commodity_sales FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own sales"
  ON commodity_sales FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 7. cost_templates
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own templates" ON cost_templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON cost_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON cost_templates;
DROP POLICY IF EXISTS "Users can view own templates" ON cost_templates;

CREATE POLICY "Users can view own templates"
  ON cost_templates FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own templates"
  ON cost_templates FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own templates"
  ON cost_templates FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own templates"
  ON cost_templates FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 8. equipment_rates
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Users can insert own equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Users can update own equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Users can view own equipment rates" ON equipment_rates;

CREATE POLICY "Users can view own equipment rates"
  ON equipment_rates FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own equipment rates"
  ON equipment_rates FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own equipment rates"
  ON equipment_rates FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own equipment rates"
  ON equipment_rates FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 9. farms
-- ============================================================

DROP POLICY IF EXISTS "Owners can delete their farms" ON farms;
DROP POLICY IF EXISTS "Owners can insert farms" ON farms;
DROP POLICY IF EXISTS "Owners can update their farms" ON farms;
DROP POLICY IF EXISTS "Owners can view their farms" ON farms;

CREATE POLICY "Owners can view their farms"
  ON farms FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_user_id);

CREATE POLICY "Owners can insert farms"
  ON farms FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_user_id);

CREATE POLICY "Owners can update their farms"
  ON farms FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = owner_user_id)
  WITH CHECK ((SELECT auth.uid()) = owner_user_id);

CREATE POLICY "Owners can delete their farms"
  ON farms FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = owner_user_id);

-- ============================================================
-- 10. fertilizer_products
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Users can insert own fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Users can update own fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Users can view own fertilizer products" ON fertilizer_products;

CREATE POLICY "Users can view own fertilizer products"
  ON fertilizer_products FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own fertilizer products"
  ON fertilizer_products FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own fertilizer products"
  ON fertilizer_products FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own fertilizer products"
  ON fertilizer_products FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 11. fertilizer_program_items
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Users can insert own fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Users can update own fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Users can view own fertilizer program items" ON fertilizer_program_items;

CREATE POLICY "Users can view own fertilizer program items"
  ON fertilizer_program_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fertilizer_programs
    WHERE fertilizer_programs.id = fertilizer_program_items.program_id
    AND fertilizer_programs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can insert own fertilizer program items"
  ON fertilizer_program_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fertilizer_programs
    WHERE fertilizer_programs.id = fertilizer_program_items.program_id
    AND fertilizer_programs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update own fertilizer program items"
  ON fertilizer_program_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fertilizer_programs
    WHERE fertilizer_programs.id = fertilizer_program_items.program_id
    AND fertilizer_programs.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fertilizer_programs
    WHERE fertilizer_programs.id = fertilizer_program_items.program_id
    AND fertilizer_programs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete own fertilizer program items"
  ON fertilizer_program_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fertilizer_programs
    WHERE fertilizer_programs.id = fertilizer_program_items.program_id
    AND fertilizer_programs.user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 12. fertilizer_programs
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Users can insert own fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Users can update own fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Users can view own fertilizer programs" ON fertilizer_programs;

CREATE POLICY "Users can view own fertilizer programs"
  ON fertilizer_programs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own fertilizer programs"
  ON fertilizer_programs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own fertilizer programs"
  ON fertilizer_programs FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own fertilizer programs"
  ON fertilizer_programs FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 13. field_chemical_applications (no user_id — uses field_costs join)
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own chemical applications" ON field_chemical_applications;
DROP POLICY IF EXISTS "Users can insert own chemical applications" ON field_chemical_applications;
DROP POLICY IF EXISTS "Users can update own chemical applications" ON field_chemical_applications;
DROP POLICY IF EXISTS "Users can view own chemical applications" ON field_chemical_applications;

CREATE POLICY "Users can view own chemical applications"
  ON field_chemical_applications FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_chemical_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can insert own chemical applications"
  ON field_chemical_applications FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_chemical_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update own chemical applications"
  ON field_chemical_applications FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_chemical_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_chemical_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete own chemical applications"
  ON field_chemical_applications FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_chemical_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 14. field_cost_overrides (no user_id — uses fields join)
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Users can insert own field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Users can update own field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Users can view own field overrides" ON field_cost_overrides;

CREATE POLICY "Users can view own field overrides"
  ON field_cost_overrides FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND fields.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can insert own field overrides"
  ON field_cost_overrides FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND fields.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update own field overrides"
  ON field_cost_overrides FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND fields.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND fields.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete own field overrides"
  ON field_cost_overrides FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND fields.user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 15. field_costs
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own field costs" ON field_costs;
DROP POLICY IF EXISTS "Users can insert own field costs" ON field_costs;
DROP POLICY IF EXISTS "Users can update own field costs" ON field_costs;
DROP POLICY IF EXISTS "Users can view own field costs" ON field_costs;

CREATE POLICY "Users can view own field costs"
  ON field_costs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own field costs"
  ON field_costs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own field costs"
  ON field_costs FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own field costs"
  ON field_costs FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 16. field_fertilizer_applications (no user_id — uses field_costs join)
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own fertilizer applications" ON field_fertilizer_applications;
DROP POLICY IF EXISTS "Users can insert own fertilizer applications" ON field_fertilizer_applications;
DROP POLICY IF EXISTS "Users can update own fertilizer applications" ON field_fertilizer_applications;
DROP POLICY IF EXISTS "Users can view own fertilizer applications" ON field_fertilizer_applications;

CREATE POLICY "Users can view own fertilizer applications"
  ON field_fertilizer_applications FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_fertilizer_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can insert own fertilizer applications"
  ON field_fertilizer_applications FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_fertilizer_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update own fertilizer applications"
  ON field_fertilizer_applications FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_fertilizer_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_fertilizer_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete own fertilizer applications"
  ON field_fertilizer_applications FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs
    WHERE field_costs.id = field_fertilizer_applications.field_cost_id
    AND field_costs.user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 17. field_yields
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own field yields" ON field_yields;
DROP POLICY IF EXISTS "Users can insert own field yields" ON field_yields;
DROP POLICY IF EXISTS "Users can update own field yields" ON field_yields;
DROP POLICY IF EXISTS "Users can view own field yields" ON field_yields;

CREATE POLICY "Users can view own field yields"
  ON field_yields FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own field yields"
  ON field_yields FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own field yields"
  ON field_yields FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own field yields"
  ON field_yields FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 18. fields
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own fields" ON fields;
DROP POLICY IF EXISTS "Users can insert own fields" ON fields;
DROP POLICY IF EXISTS "Users can update own fields" ON fields;
DROP POLICY IF EXISTS "Users can view own fields" ON fields;

CREATE POLICY "Users can view own fields"
  ON fields FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own fields"
  ON fields FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own fields"
  ON fields FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own fields"
  ON fields FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 19. individual_chemicals
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Users can insert own chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Users can update own chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Users can view own chemicals" ON individual_chemicals;

CREATE POLICY "Users can view own chemicals"
  ON individual_chemicals FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own chemicals"
  ON individual_chemicals FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own chemicals"
  ON individual_chemicals FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own chemicals"
  ON individual_chemicals FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 20. seasons
-- ============================================================

DROP POLICY IF EXISTS "Farm owners can delete their seasons" ON seasons;
DROP POLICY IF EXISTS "Farm owners can insert seasons" ON seasons;
DROP POLICY IF EXISTS "Farm owners can update their seasons" ON seasons;
DROP POLICY IF EXISTS "Farm owners can view their seasons" ON seasons;
DROP POLICY IF EXISTS "Team members can view shared seasons" ON seasons;

CREATE POLICY "Farm owners can view their seasons"
  ON seasons FOR SELECT
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR (
      farm_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM farms
        WHERE farms.id = seasons.farm_id
        AND farms.owner_user_id = (SELECT auth.uid())
      )
    )
    OR (
      farm_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.farm_id = seasons.farm_id
        AND tm.invited_user_id = (SELECT auth.uid())
        AND tm.status = 'accepted'
      )
    )
  );

CREATE POLICY "Farm owners can insert seasons"
  ON seasons FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Farm owners can update their seasons"
  ON seasons FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Farm owners can delete their seasons"
  ON seasons FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Team members can view shared seasons"
  ON seasons FOR SELECT
  TO authenticated
  USING (is_team_member_of(user_id));

-- ============================================================
-- 21. seed_varieties
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Users can insert own seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Users can update own seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Users can view own seed varieties" ON seed_varieties;

CREATE POLICY "Users can view own seed varieties"
  ON seed_varieties FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own seed varieties"
  ON seed_varieties FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own seed varieties"
  ON seed_varieties FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own seed varieties"
  ON seed_varieties FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 22. team_members
-- ============================================================

DROP POLICY IF EXISTS "Farm owners can delete team members" ON team_members;
DROP POLICY IF EXISTS "Farm owners can insert team members" ON team_members;
DROP POLICY IF EXISTS "Farm owners can view their farm team members" ON team_members;
DROP POLICY IF EXISTS "Team members can update invitation status" ON team_members;

CREATE POLICY "Farm owners can view their farm team members"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR (invited_user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Farm owners can insert team members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Team members can update invitation status"
  ON team_members FOR UPDATE
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR (invited_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (user_id = (SELECT auth.uid()))
    OR (invited_user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Farm owners can delete team members"
  ON team_members FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- 23. user_profiles
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ============================================================
-- 24. yield_and_price
-- ============================================================

DROP POLICY IF EXISTS "Users can delete own yield data" ON yield_and_price;
DROP POLICY IF EXISTS "Users can insert own yield data" ON yield_and_price;
DROP POLICY IF EXISTS "Users can update own yield data" ON yield_and_price;
DROP POLICY IF EXISTS "Users can view own yield data" ON yield_and_price;

CREATE POLICY "Users can view own yield data"
  ON yield_and_price FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own yield data"
  ON yield_and_price FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own yield data"
  ON yield_and_price FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own yield data"
  ON yield_and_price FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
