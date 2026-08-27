/*
# Spray Planner Work Orders — Persistent Storage

## Summary
Adds three farm-scoped tables for Phase 4 of the inventory feature: persisted work
orders, their field assignments, and their chemical line items. This enables the Spray
Planner to save, recall, and track the lifecycle (draft → applied → unapplied) of
generated work orders, with tie-back to the inventory ledger for consumption tracking.

## New Tables

### work_orders
One row per saved work order (one per program per generation event).
- id (uuid, PK)
- farm_id (uuid, FK → farms) — scoping key
- season_id (uuid, FK → seasons) — which season this work order belongs to
- program_id (uuid, nullable) — reference to the chemical_programs row that generated it
- program_name (text) — snapshotted name at save time (survives program deletion)
- crop_type (text) — crop type of the program at save time
- status (text) — 'draft', 'applied', or 'unapplied'
- total_acreage (numeric) — effective acreage at save time (may include override)
- spray_volume_gal_per_acre (numeric, nullable) — spray volume override if set
- applied_at (timestamptz, nullable) — when the work order was marked applied
- unapplied_at (timestamptz, nullable) — when the work order was unapplied
- created_by (uuid) — user who saved it
- created_at (timestamptz)
- updated_at (timestamptz)

### work_order_fields
Junction table linking each work order to the fields it covers.
- id (uuid, PK)
- work_order_id (uuid, FK → work_orders)
- field_id (uuid, FK → fields, nullable) — nullable so row survives field deletion
- field_name (text) — snapshotted name at save time
- acreage (numeric) — snapshotted acreage at save time
- created_at (timestamptz)

### work_order_lines
Chemical line items on a work order.
- id (uuid, PK)
- work_order_id (uuid, FK → work_orders)
- master_product_id (uuid, FK → master_products, nullable) — link to inventory identity
- chemical_name (text) — snapshotted name
- rate_per_acre (numeric) — application rate per acre
- rate_unit (text) — unit for the rate
- total_needed (numeric) — computed total based on effective acreage
- price_per_unit (numeric, nullable) — snapshotted price
- price_unit (text, nullable) — unit for price
- sort_order (integer) — preserves the chemical ordering
- created_at (timestamptz)

## Security
- RLS enabled on all three new tables.
- Farm-scoped policies modeled on master_products / shopping_lists:
  SELECT: farm owner OR accepted team member
  INSERT/UPDATE/DELETE: farm owner OR accepted editor
- Uses (SELECT auth.uid()) optimization.
- work_order_fields and work_order_lines use the parent work_order's farm_id through a join.

## Indexes
- work_orders: farm_id, (farm_id, season_id), program_id
- work_order_fields: work_order_id, field_id
- work_order_lines: work_order_id, master_product_id
*/

-- ============================================================
-- 1. work_orders table
-- ============================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  program_id uuid REFERENCES chemical_programs(id) ON DELETE SET NULL,
  program_name text NOT NULL,
  crop_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'unapplied')),
  total_acreage numeric NOT NULL DEFAULT 0,
  spray_volume_gal_per_acre numeric,
  applied_at timestamptz,
  unapplied_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_farm_id ON work_orders(farm_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_farm_season ON work_orders(farm_id, season_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_program_id ON work_orders(program_id);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and team members can view work orders" ON work_orders;
CREATE POLICY "Owners and team members can view work orders"
  ON work_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = work_orders.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert work orders" ON work_orders;
CREATE POLICY "Owners and editors can insert work orders"
  ON work_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = work_orders.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update work orders" ON work_orders;
CREATE POLICY "Owners and editors can update work orders"
  ON work_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = work_orders.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = work_orders.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete work orders" ON work_orders;
CREATE POLICY "Owners and editors can delete work orders"
  ON work_orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = work_orders.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

-- ============================================================
-- 2. work_order_fields table
-- ============================================================

CREATE TABLE IF NOT EXISTS work_order_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  acreage numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_order_fields_wo_id ON work_order_fields(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_fields_field_id ON work_order_fields(field_id);

ALTER TABLE work_order_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and team members can view work order fields" ON work_order_fields;
CREATE POLICY "Owners and team members can view work order fields"
  ON work_order_fields FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_fields.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert work order fields" ON work_order_fields;
CREATE POLICY "Owners and editors can insert work order fields"
  ON work_order_fields FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_fields.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update work order fields" ON work_order_fields;
CREATE POLICY "Owners and editors can update work order fields"
  ON work_order_fields FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_fields.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_fields.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete work order fields" ON work_order_fields;
CREATE POLICY "Owners and editors can delete work order fields"
  ON work_order_fields FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_fields.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

-- ============================================================
-- 3. work_order_lines table
-- ============================================================

CREATE TABLE IF NOT EXISTS work_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL,
  chemical_name text NOT NULL,
  rate_per_acre numeric NOT NULL DEFAULT 0,
  rate_unit text NOT NULL DEFAULT '',
  total_needed numeric NOT NULL DEFAULT 0,
  price_per_unit numeric,
  price_unit text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_order_lines_wo_id ON work_order_lines(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_lines_master_product ON work_order_lines(master_product_id);

ALTER TABLE work_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and team members can view work order lines" ON work_order_lines;
CREATE POLICY "Owners and team members can view work order lines"
  ON work_order_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_lines.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert work order lines" ON work_order_lines;
CREATE POLICY "Owners and editors can insert work order lines"
  ON work_order_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_lines.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update work order lines" ON work_order_lines;
CREATE POLICY "Owners and editors can update work order lines"
  ON work_order_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_lines.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_lines.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete work order lines" ON work_order_lines;
CREATE POLICY "Owners and editors can delete work order lines"
  ON work_order_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      JOIN farms ON farms.id = work_orders.farm_id
      WHERE work_orders.id = work_order_lines.work_order_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );
