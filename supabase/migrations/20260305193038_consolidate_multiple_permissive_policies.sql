/*
  # Consolidate Multiple Permissive RLS Policies

  ## Problem
  Many tables have multiple permissive policies for the same command (e.g., SELECT).
  PostgreSQL ORs all permissive policies together, but evaluating multiple policies per row
  adds overhead. Merging them into a single policy per command reduces plan complexity.

  ## Changes
  For each table with duplicate permissive policies on the same command, drop the
  separate "owner" and "team member" / "editor" policies and replace with one unified policy.

  ### Tables and Commands Consolidated:
  - chemical_program_items: SELECT, INSERT, UPDATE
  - chemical_programs: SELECT, INSERT, UPDATE
  - commodity_sales: SELECT, INSERT, UPDATE
  - cost_templates: SELECT, INSERT, UPDATE
  - equipment_rates: SELECT, INSERT, UPDATE
  - farms: SELECT
  - fertilizer_products: SELECT, INSERT, UPDATE
  - fertilizer_program_items: SELECT, INSERT, UPDATE
  - fertilizer_programs: SELECT, INSERT, UPDATE
  - field_chemical_applications: SELECT
  - field_cost_overrides: SELECT, INSERT, UPDATE
  - field_costs: SELECT, INSERT, UPDATE
  - field_fertilizer_applications: SELECT
  - field_yields: SELECT, INSERT, UPDATE
  - fields: SELECT, INSERT, UPDATE
  - individual_chemicals: SELECT, INSERT, UPDATE
  - seed_varieties: SELECT, INSERT, UPDATE
  - user_profiles: SELECT
  - yield_and_price: SELECT, INSERT, UPDATE

  ## Security Notes
  - No access changes — same users can still access the same data
  - Owner access: `user_id = (SELECT auth.uid())`
  - Team access: `is_team_member_of(user_id)` (for SELECT)
  - Editor access: `is_editor_of(user_id)` (for INSERT/UPDATE)
*/

-- ============================================================
-- chemical_programs
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Users can view own chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Editors can insert chemical programs for owner" ON chemical_programs;
DROP POLICY IF EXISTS "Users can insert own chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Editors can update shared chemical programs" ON chemical_programs;
DROP POLICY IF EXISTS "Users can update own chemical programs" ON chemical_programs;

CREATE POLICY "Users and team members can view chemical programs"
  ON chemical_programs FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert chemical programs"
  ON chemical_programs FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update chemical programs"
  ON chemical_programs FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- chemical_program_items
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared chemical program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Users can view own program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Editors can insert chemical program items for owner" ON chemical_program_items;
DROP POLICY IF EXISTS "Users can insert own program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Editors can update shared chemical program items" ON chemical_program_items;
DROP POLICY IF EXISTS "Users can update own program items" ON chemical_program_items;

CREATE POLICY "Users and team members can view chemical program items"
  ON chemical_program_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chemical_programs cp
    WHERE cp.id = chemical_program_items.program_id
    AND (
      cp.user_id = (SELECT auth.uid())
      OR is_team_member_of(cp.user_id)
    )
  ));

CREATE POLICY "Users and editors can insert chemical program items"
  ON chemical_program_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM chemical_programs cp
    WHERE cp.id = chemical_program_items.program_id
    AND (
      cp.user_id = (SELECT auth.uid())
      OR is_editor_of(cp.user_id)
    )
  ));

CREATE POLICY "Users and editors can update chemical program items"
  ON chemical_program_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chemical_programs cp
    WHERE cp.id = chemical_program_items.program_id
    AND (
      cp.user_id = (SELECT auth.uid())
      OR is_editor_of(cp.user_id)
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM chemical_programs cp
    WHERE cp.id = chemical_program_items.program_id
    AND (
      cp.user_id = (SELECT auth.uid())
      OR is_editor_of(cp.user_id)
    )
  ));

-- ============================================================
-- commodity_sales
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared commodity sales" ON commodity_sales;
DROP POLICY IF EXISTS "Users can view own sales" ON commodity_sales;
DROP POLICY IF EXISTS "Editors can insert commodity sales for owner" ON commodity_sales;
DROP POLICY IF EXISTS "Users can insert own sales" ON commodity_sales;
DROP POLICY IF EXISTS "Editors can update shared commodity sales" ON commodity_sales;
DROP POLICY IF EXISTS "Users can update own sales" ON commodity_sales;

CREATE POLICY "Users and team members can view commodity sales"
  ON commodity_sales FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert commodity sales"
  ON commodity_sales FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update commodity sales"
  ON commodity_sales FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- cost_templates
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared cost templates" ON cost_templates;
DROP POLICY IF EXISTS "Users can view own templates" ON cost_templates;
DROP POLICY IF EXISTS "Editors can insert cost templates for owner" ON cost_templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON cost_templates;
DROP POLICY IF EXISTS "Editors can update shared cost templates" ON cost_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON cost_templates;

CREATE POLICY "Users and team members can view cost templates"
  ON cost_templates FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert cost templates"
  ON cost_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update cost templates"
  ON cost_templates FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- equipment_rates
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Users can view own equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Editors can insert equipment rates for owner" ON equipment_rates;
DROP POLICY IF EXISTS "Users can insert own equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Editors can update shared equipment rates" ON equipment_rates;
DROP POLICY IF EXISTS "Users can update own equipment rates" ON equipment_rates;

CREATE POLICY "Users and team members can view equipment rates"
  ON equipment_rates FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert equipment rates"
  ON equipment_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update equipment rates"
  ON equipment_rates FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- farms
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared farms" ON farms;
DROP POLICY IF EXISTS "Owners can view their farms" ON farms;

CREATE POLICY "Owners and team members can view farms"
  ON farms FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = owner_user_id
    OR is_team_member_of(owner_user_id)
  );

-- ============================================================
-- fertilizer_products
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Users can view own fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Editors can insert fertilizer products for owner" ON fertilizer_products;
DROP POLICY IF EXISTS "Users can insert own fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Editors can update shared fertilizer products" ON fertilizer_products;
DROP POLICY IF EXISTS "Users can update own fertilizer products" ON fertilizer_products;

CREATE POLICY "Users and team members can view fertilizer products"
  ON fertilizer_products FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert fertilizer products"
  ON fertilizer_products FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update fertilizer products"
  ON fertilizer_products FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- fertilizer_programs
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Users can view own fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Editors can insert fertilizer programs for owner" ON fertilizer_programs;
DROP POLICY IF EXISTS "Users can insert own fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Editors can update shared fertilizer programs" ON fertilizer_programs;
DROP POLICY IF EXISTS "Users can update own fertilizer programs" ON fertilizer_programs;

CREATE POLICY "Users and team members can view fertilizer programs"
  ON fertilizer_programs FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert fertilizer programs"
  ON fertilizer_programs FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update fertilizer programs"
  ON fertilizer_programs FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- fertilizer_program_items
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Users can view own fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Editors can insert shared fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Users can insert own fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Editors can update shared fertilizer program items" ON fertilizer_program_items;
DROP POLICY IF EXISTS "Users can update own fertilizer program items" ON fertilizer_program_items;

CREATE POLICY "Users and team members can view fertilizer program items"
  ON fertilizer_program_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fertilizer_programs fp
    WHERE fp.id = fertilizer_program_items.program_id
    AND (
      fp.user_id = (SELECT auth.uid())
      OR is_team_member_of(fp.user_id)
    )
  ));

CREATE POLICY "Users and editors can insert fertilizer program items"
  ON fertilizer_program_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fertilizer_programs fp
    WHERE fp.id = fertilizer_program_items.program_id
    AND (
      fp.user_id = (SELECT auth.uid())
      OR is_editor_of(fp.user_id)
    )
  ));

CREATE POLICY "Users and editors can update fertilizer program items"
  ON fertilizer_program_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fertilizer_programs fp
    WHERE fp.id = fertilizer_program_items.program_id
    AND (
      fp.user_id = (SELECT auth.uid())
      OR is_editor_of(fp.user_id)
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fertilizer_programs fp
    WHERE fp.id = fertilizer_program_items.program_id
    AND (
      fp.user_id = (SELECT auth.uid())
      OR is_editor_of(fp.user_id)
    )
  ));

-- ============================================================
-- field_chemical_applications
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared chemical applications" ON field_chemical_applications;
DROP POLICY IF EXISTS "Users can view own chemical applications" ON field_chemical_applications;

CREATE POLICY "Users and team members can view chemical applications"
  ON field_chemical_applications FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
    JOIN fields f ON f.id = fc.field_id
    WHERE fc.id = field_chemical_applications.field_cost_id
    AND (
      fc.user_id = (SELECT auth.uid())
      OR is_team_member_of(f.user_id)
    )
  ));

-- ============================================================
-- field_cost_overrides
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Users can view own field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Editors can insert shared field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Users can insert own field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Editors can update shared field overrides" ON field_cost_overrides;
DROP POLICY IF EXISTS "Users can update own field overrides" ON field_cost_overrides;

CREATE POLICY "Users and team members can view field overrides"
  ON field_cost_overrides FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_team_member_of(fields.user_id)
    )
  ));

CREATE POLICY "Users and editors can insert field overrides"
  ON field_cost_overrides FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_editor_of(fields.user_id)
    )
  ));

CREATE POLICY "Users and editors can update field overrides"
  ON field_cost_overrides FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_editor_of(fields.user_id)
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_cost_overrides.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_editor_of(fields.user_id)
    )
  ));

-- ============================================================
-- field_costs
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared field costs" ON field_costs;
DROP POLICY IF EXISTS "Users can view own field costs" ON field_costs;
DROP POLICY IF EXISTS "Editors can insert field costs for owner" ON field_costs;
DROP POLICY IF EXISTS "Users can insert own field costs" ON field_costs;
DROP POLICY IF EXISTS "Editors can update shared field costs" ON field_costs;
DROP POLICY IF EXISTS "Users can update own field costs" ON field_costs;

CREATE POLICY "Users and team members can view field costs"
  ON field_costs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields f
    WHERE f.id = field_costs.field_id
    AND (
      f.user_id = (SELECT auth.uid())
      OR is_team_member_of(f.user_id)
    )
  ));

CREATE POLICY "Users and editors can insert field costs"
  ON field_costs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields f
    WHERE f.id = field_costs.field_id
    AND (
      f.user_id = (SELECT auth.uid())
      OR is_editor_of(f.user_id)
    )
  ));

CREATE POLICY "Users and editors can update field costs"
  ON field_costs FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields f
    WHERE f.id = field_costs.field_id
    AND (
      f.user_id = (SELECT auth.uid())
      OR is_editor_of(f.user_id)
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields f
    WHERE f.id = field_costs.field_id
    AND (
      f.user_id = (SELECT auth.uid())
      OR is_editor_of(f.user_id)
    )
  ));

-- ============================================================
-- field_fertilizer_applications
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared fertilizer applications" ON field_fertilizer_applications;
DROP POLICY IF EXISTS "Users can view own fertilizer applications" ON field_fertilizer_applications;

CREATE POLICY "Users and team members can view fertilizer applications"
  ON field_fertilizer_applications FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM field_costs fc
    JOIN fields f ON f.id = fc.field_id
    WHERE fc.id = field_fertilizer_applications.field_cost_id
    AND (
      fc.user_id = (SELECT auth.uid())
      OR is_team_member_of(f.user_id)
    )
  ));

-- ============================================================
-- field_yields
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared field yields" ON field_yields;
DROP POLICY IF EXISTS "Users can view own field yields" ON field_yields;
DROP POLICY IF EXISTS "Editors can insert shared field yields" ON field_yields;
DROP POLICY IF EXISTS "Users can insert own field yields" ON field_yields;
DROP POLICY IF EXISTS "Editors can update shared field yields" ON field_yields;
DROP POLICY IF EXISTS "Users can update own field yields" ON field_yields;

CREATE POLICY "Users and team members can view field yields"
  ON field_yields FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_yields.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_team_member_of(fields.user_id)
    )
  ));

CREATE POLICY "Users and editors can insert field yields"
  ON field_yields FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_yields.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_editor_of(fields.user_id)
    )
  ));

CREATE POLICY "Users and editors can update field yields"
  ON field_yields FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_yields.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_editor_of(fields.user_id)
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fields
    WHERE fields.id = field_yields.field_id
    AND (
      fields.user_id = (SELECT auth.uid())
      OR is_editor_of(fields.user_id)
    )
  ));

-- ============================================================
-- fields
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared fields" ON fields;
DROP POLICY IF EXISTS "Users can view own fields" ON fields;
DROP POLICY IF EXISTS "Editors can insert fields for owner" ON fields;
DROP POLICY IF EXISTS "Users can insert own fields" ON fields;
DROP POLICY IF EXISTS "Editors can update shared fields" ON fields;
DROP POLICY IF EXISTS "Users can update own fields" ON fields;

CREATE POLICY "Users and team members can view fields"
  ON fields FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert fields"
  ON fields FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update fields"
  ON fields FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- individual_chemicals
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Users can view own chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Editors can insert chemicals for owner" ON individual_chemicals;
DROP POLICY IF EXISTS "Users can insert own chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Editors can update shared chemicals" ON individual_chemicals;
DROP POLICY IF EXISTS "Users can update own chemicals" ON individual_chemicals;

CREATE POLICY "Users and team members can view chemicals"
  ON individual_chemicals FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert chemicals"
  ON individual_chemicals FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update chemicals"
  ON individual_chemicals FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- seed_varieties
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Users can view own seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Editors can insert seed varieties for owner" ON seed_varieties;
DROP POLICY IF EXISTS "Users can insert own seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Editors can update shared seed varieties" ON seed_varieties;
DROP POLICY IF EXISTS "Users can update own seed varieties" ON seed_varieties;

CREATE POLICY "Users and team members can view seed varieties"
  ON seed_varieties FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert seed varieties"
  ON seed_varieties FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update seed varieties"
  ON seed_varieties FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- user_profiles
-- ============================================================

DROP POLICY IF EXISTS "Team members can view owner profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

CREATE POLICY "Users and team members can view profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR is_team_member_of(id)
  );

-- ============================================================
-- yield_and_price
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared yield and price" ON yield_and_price;
DROP POLICY IF EXISTS "Users can view own yield data" ON yield_and_price;
DROP POLICY IF EXISTS "Editors can insert yield and price for owner" ON yield_and_price;
DROP POLICY IF EXISTS "Users can insert own yield data" ON yield_and_price;
DROP POLICY IF EXISTS "Editors can update shared yield and price" ON yield_and_price;
DROP POLICY IF EXISTS "Users can update own yield data" ON yield_and_price;

CREATE POLICY "Users and team members can view yield and price"
  ON yield_and_price FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );

CREATE POLICY "Users and editors can insert yield and price"
  ON yield_and_price FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

CREATE POLICY "Users and editors can update yield and price"
  ON yield_and_price FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR is_editor_of(user_id)
  );

-- ============================================================
-- cascade_tasks (team member view)
-- ============================================================

DROP POLICY IF EXISTS "Team members can view shared cascade tasks" ON cascade_tasks;
DROP POLICY IF EXISTS "Users can read own cascade tasks" ON cascade_tasks;

CREATE POLICY "Users and team members can view cascade tasks"
  ON cascade_tasks FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_team_member_of(user_id)
  );
