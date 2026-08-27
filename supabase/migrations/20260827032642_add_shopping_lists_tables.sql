/*
# Shopping Lists and Shopping List Lines

## Summary
Adds two farm-scoped tables for Phase 3 of the inventory feature: shopping lists
and their line items. A shopping list captures the quantities of product needed for
a season (computed from the crop plan minus on-hand inventory), and line items track
supplier quoting and purchase status with tie-back to the inventory ledger.

## New Tables

### shopping_lists
One row per generated shopping list (one per category per generation event).
- id (uuid, PK)
- farm_id (uuid, FK → farms) — scoping key
- season_id (uuid, FK → seasons) — which season the list was generated from
- product_category (text) — 'chemical', 'fertilizer', or 'seed'
- label (text) — user-facing label e.g. "Chemical Shopping List – Aug 2026"
- created_at (timestamptz)

### shopping_list_lines
One row per product on a shopping list.
- id (uuid, PK)
- shopping_list_id (uuid, FK → shopping_lists)
- farm_id (uuid) — denormalized for simple RLS without join
- master_product_id (uuid, FK → master_products, nullable) — link to inventory identity
- product_name (text) — snapshotted name at generation time
- product_category (text) — 'chemical', 'fertilizer', or 'seed'
- needed_quantity (numeric) — auto-computed total needed from crop plan
- on_hand_at_generation (numeric) — snapshot of on-hand at list generation time
- adjusted_quantity (numeric, nullable) — user-adjusted order quantity
- supplier (text, nullable) — user-entered supplier name
- quoted_price_per_unit (numeric, nullable) — quote from supplier
- purchased_quantity (numeric, nullable) — final quantity bought
- purchased_price_per_unit (numeric, nullable) — final price paid
- unit_type (text) — unit of measure for all quantity fields
- status (text) — 'needed', 'quoted', or 'purchased'
- purchased_at (timestamptz, nullable) — when marked purchased
- created_at (timestamptz)

## Security
- RLS enabled on both new tables.
- Farm-scoped policies modeled on master_products:
  SELECT: farm owner OR accepted team member
  INSERT/UPDATE/DELETE: farm owner OR accepted editor
- Uses (SELECT auth.uid()) optimization.

## Indexes
- shopping_lists: farm_id, (farm_id, season_id, product_category)
- shopping_list_lines: shopping_list_id, farm_id, master_product_id
*/

-- ============================================================
-- 1. shopping_lists table
-- ============================================================

CREATE TABLE IF NOT EXISTS shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  product_category text NOT NULL CHECK (product_category IN ('chemical', 'fertilizer', 'seed')),
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_farm_id ON shopping_lists(farm_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_farm_season_cat ON shopping_lists(farm_id, season_id, product_category);

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and team members can view shopping lists" ON shopping_lists;
CREATE POLICY "Owners and team members can view shopping lists"
  ON shopping_lists FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_lists.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert shopping lists" ON shopping_lists;
CREATE POLICY "Owners and editors can insert shopping lists"
  ON shopping_lists FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_lists.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update shopping lists" ON shopping_lists;
CREATE POLICY "Owners and editors can update shopping lists"
  ON shopping_lists FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_lists.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_lists.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete shopping lists" ON shopping_lists;
CREATE POLICY "Owners and editors can delete shopping lists"
  ON shopping_lists FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_lists.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

-- ============================================================
-- 2. shopping_list_lines table
-- ============================================================

CREATE TABLE IF NOT EXISTS shopping_list_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_category text NOT NULL CHECK (product_category IN ('chemical', 'fertilizer', 'seed')),
  needed_quantity numeric NOT NULL DEFAULT 0,
  on_hand_at_generation numeric NOT NULL DEFAULT 0,
  adjusted_quantity numeric,
  supplier text,
  quoted_price_per_unit numeric,
  purchased_quantity numeric,
  purchased_price_per_unit numeric,
  unit_type text NOT NULL,
  status text NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'quoted', 'purchased')),
  purchased_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_lines_list_id ON shopping_list_lines(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_lines_farm_id ON shopping_list_lines(farm_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_lines_master_product ON shopping_list_lines(master_product_id);

ALTER TABLE shopping_list_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and team members can view shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and team members can view shopping list lines"
  ON shopping_list_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_list_lines.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and editors can insert shopping list lines"
  ON shopping_list_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_list_lines.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and editors can update shopping list lines"
  ON shopping_list_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_list_lines.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_list_lines.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and editors can delete shopping list lines"
  ON shopping_list_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = shopping_list_lines.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );
