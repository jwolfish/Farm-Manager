/*
# Inventory Foundation: Master Products, Ledger, and Cross-Season Linking

## Summary
Introduces a farm-scoped inventory system foundation with persistent product identity
across seasons and a transaction ledger for chemical and seed products. This is Phase 1
of the inventory feature — no visible UI changes, just the data layer.

## New Tables

### master_products
The permanent identity anchor for products across seasons. Each season-scoped product
row (individual_chemicals, fertilizer_products, seed_varieties) links to one master
product via master_product_id. This means inventory doesn't reset when a new season
is created — the same physical product on the shelf keeps the same master_products row.

- id (uuid, PK)
- farm_id (uuid, FK → farms) — scoping key
- product_category (text) — 'chemical', 'fertilizer', or 'seed'
- canonical_name (text) — display name independent of any one season's naming
- unit_type (text) — the unit on-hand quantity and ledger entries are expressed in
- on_hand_quantity (numeric, nullable) — denormalized cache of ledger sum; null for fertilizer
- created_at, updated_at (timestamptz)

Unique constraint on (farm_id, product_category, canonical_name) ensures one master
product per name per farm per category.

### inventory_ledger_entries
Full transaction log of every inventory movement. Applies to chemical and seed categories
in this release; fertilizer rows are not written but the category discriminator is included
for forward compatibility (§8 of the PRD).

- id (uuid, PK)
- farm_id (uuid) — denormalized for simple RLS checks without a join
- master_product_id (uuid, FK → master_products)
- product_category (text) — 'chemical', 'fertilizer', or 'seed'
- entry_type (text) — 'purchase', 'consumption', 'manual_adjustment', or 'reversal'
- quantity_delta (numeric) — positive for purchase/manual increase, negative for consumption/decrease
- source_type (text, nullable) — 'shopping_list_line', 'work_order', or 'manual'
- source_id (uuid, nullable) — FK to the originating shopping_list_lines.id or work_orders.id
- note (text, nullable) — free text reason for manual adjustments
- created_by (uuid) — user who made the entry
- created_at (timestamptz)

## Modified Tables
- individual_chemicals: adds nullable master_product_id (uuid, FK → master_products)
- fertilizer_products: adds nullable master_product_id (uuid, FK → master_products)
- seed_varieties: adds nullable master_product_id (uuid, FK → master_products)

All three columns are nullable so existing rows survive the backfill; new rows going
forward will populate the column.

## Backfill
One-time backfill that, for each farm, groups existing products by exact name across
all seasons and creates one master_products row per distinct name, linking all matching
rows. on_hand_quantity is set to 0 for all backfilled products (no historical ledger
exists). Products with slightly different name spellings become separate master products
(known limitation per PRD §4.1).

## Triggers
A trigger on inventory_ledger_entries recomputes master_products.on_hand_quantity
from the sum of all ledger deltas whenever a row is inserted, updated, or deleted.
This keeps the cache correct regardless of which client writes the data.

## Security
- RLS enabled on both new tables.
- Farm-scoped policies modeled on the existing seasons pattern (§4.3 of the PRD):
  - SELECT: farm owner OR accepted team member
  - INSERT/UPDATE/DELETE: farm owner OR accepted editor
- Uses (SELECT auth.uid()) optimization established across the codebase.
- Existing RLS policies on the three modified product tables are unchanged.
*/

-- ============================================================
-- 1. master_products table
-- ============================================================

CREATE TABLE IF NOT EXISTS master_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  product_category text NOT NULL CHECK (product_category IN ('chemical', 'fertilizer', 'seed')),
  canonical_name text NOT NULL,
  unit_type text NOT NULL,
  on_hand_quantity numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one master product per name per farm per category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'master_products_farm_category_name_key'
  ) THEN
    ALTER TABLE master_products
    ADD CONSTRAINT master_products_farm_category_name_key
    UNIQUE (farm_id, product_category, canonical_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_master_products_farm_id ON master_products(farm_id);
CREATE INDEX IF NOT EXISTS idx_master_products_category ON master_products(product_category);

ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;

-- RLS: farm owner OR team member can view; farm owner OR editor can write
DROP POLICY IF EXISTS "Owners and team members can view master products" ON master_products;
CREATE POLICY "Owners and team members can view master products"
  ON master_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = master_products.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert master products" ON master_products;
CREATE POLICY "Owners and editors can insert master products"
  ON master_products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = master_products.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update master products" ON master_products;
CREATE POLICY "Owners and editors can update master products"
  ON master_products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = master_products.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = master_products.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete master products" ON master_products;
CREATE POLICY "Owners and editors can delete master products"
  ON master_products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = master_products.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

-- ============================================================
-- 2. inventory_ledger_entries table
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  master_product_id uuid NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  product_category text NOT NULL CHECK (product_category IN ('chemical', 'fertilizer', 'seed')),
  entry_type text NOT NULL CHECK (entry_type IN ('purchase', 'consumption', 'manual_adjustment', 'reversal')),
  quantity_delta numeric NOT NULL DEFAULT 0,
  source_type text CHECK (source_type IS NULL OR source_type IN ('shopping_list_line', 'work_order', 'manual')),
  source_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_farm_id ON inventory_ledger_entries(farm_id);
CREATE INDEX IF NOT EXISTS idx_ledger_master_product_id ON inventory_ledger_entries(master_product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON inventory_ledger_entries(created_at DESC);

ALTER TABLE inventory_ledger_entries ENABLE ROW LEVEL SECURITY;

-- RLS: same farm-scoped pattern as master_products
DROP POLICY IF EXISTS "Owners and team members can view ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and team members can view ledger entries"
  ON inventory_ledger_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = inventory_ledger_entries.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_team_member_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can insert ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can insert ledger entries"
  ON inventory_ledger_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = inventory_ledger_entries.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can update ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can update ledger entries"
  ON inventory_ledger_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = inventory_ledger_entries.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = inventory_ledger_entries.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Owners and editors can delete ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can delete ledger entries"
  ON inventory_ledger_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farms
      WHERE farms.id = inventory_ledger_entries.farm_id
      AND (
        farms.owner_user_id = (SELECT auth.uid())
        OR is_editor_of(farms.owner_user_id)
      )
    )
  );

-- ============================================================
-- 3. Add master_product_id to existing product tables
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'individual_chemicals' AND column_name = 'master_product_id'
  ) THEN
    ALTER TABLE individual_chemicals
    ADD COLUMN master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fertilizer_products' AND column_name = 'master_product_id'
  ) THEN
    ALTER TABLE fertilizer_products
    ADD COLUMN master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seed_varieties' AND column_name = 'master_product_id'
  ) THEN
    ALTER TABLE seed_varieties
    ADD COLUMN master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chemicals_master_product_id ON individual_chemicals(master_product_id);
CREATE INDEX IF NOT EXISTS idx_fertilizers_master_product_id ON fertilizer_products(master_product_id);
CREATE INDEX IF NOT EXISTS idx_seeds_master_product_id ON seed_varieties(master_product_id);

-- ============================================================
-- 4. Backfill master_products from existing data
-- ============================================================

-- Chemicals: group by farm + exact name, pick unit_type from most recent season
INSERT INTO master_products (farm_id, product_category, canonical_name, unit_type, on_hand_quantity)
SELECT s.farm_id, 'chemical', ic.chemical_name, (array_agg(ic.unit_type ORDER BY s.year DESC))[1], 0
FROM individual_chemicals ic
JOIN seasons s ON ic.season_id = s.id
WHERE ic.master_product_id IS NULL
  AND s.farm_id IS NOT NULL
GROUP BY s.farm_id, ic.chemical_name
ON CONFLICT (farm_id, product_category, canonical_name) DO NOTHING;

-- Link chemicals to their master products
UPDATE individual_chemicals ic
SET master_product_id = mp.id
FROM master_products mp, seasons s
WHERE ic.season_id = s.id
  AND mp.farm_id = s.farm_id
  AND mp.product_category = 'chemical'
  AND mp.canonical_name = ic.chemical_name
  AND ic.master_product_id IS NULL;

-- Fertilizers: group by farm + exact name
INSERT INTO master_products (farm_id, product_category, canonical_name, unit_type, on_hand_quantity)
SELECT s.farm_id, 'fertilizer', fp.product_name, (array_agg(fp.unit_type ORDER BY s.year DESC))[1], NULL
FROM fertilizer_products fp
JOIN seasons s ON fp.season_id = s.id
WHERE fp.master_product_id IS NULL
  AND s.farm_id IS NOT NULL
GROUP BY s.farm_id, fp.product_name
ON CONFLICT (farm_id, product_category, canonical_name) DO NOTHING;

-- Link fertilizers to their master products
UPDATE fertilizer_products fp
SET master_product_id = mp.id
FROM master_products mp, seasons s
WHERE fp.season_id = s.id
  AND mp.farm_id = s.farm_id
  AND mp.product_category = 'fertilizer'
  AND mp.canonical_name = fp.product_name
  AND fp.master_product_id IS NULL;

-- Seeds: group by farm + exact name
INSERT INTO master_products (farm_id, product_category, canonical_name, unit_type, on_hand_quantity)
SELECT s.farm_id, 'seed', sv.product_name, (array_agg(sv.unit_type ORDER BY s.year DESC))[1], 0
FROM seed_varieties sv
JOIN seasons s ON sv.season_id = s.id
WHERE sv.master_product_id IS NULL
  AND s.farm_id IS NOT NULL
GROUP BY s.farm_id, sv.product_name
ON CONFLICT (farm_id, product_category, canonical_name) DO NOTHING;

-- Link seeds to their master products
UPDATE seed_varieties sv
SET master_product_id = mp.id
FROM master_products mp, seasons s
WHERE sv.season_id = s.id
  AND mp.farm_id = s.farm_id
  AND mp.product_category = 'seed'
  AND mp.canonical_name = sv.product_name
  AND sv.master_product_id IS NULL;

-- ============================================================
-- 5. On-hand quantity cache trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_master_product_on_hand()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master_product_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_master_product_id := NEW.master_product_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_master_product_id := OLD.master_product_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.master_product_id IS DISTINCT FROM NEW.master_product_id THEN
      UPDATE master_products SET on_hand_quantity = (
        SELECT COALESCE(SUM(quantity_delta), 0)
        FROM inventory_ledger_entries
        WHERE master_product_id = OLD.master_product_id
      ) WHERE id = OLD.master_product_id;
    END IF;
    v_master_product_id := NEW.master_product_id;
  END IF;

  IF v_master_product_id IS NOT NULL THEN
    UPDATE master_products SET on_hand_quantity = (
      SELECT COALESCE(SUM(quantity_delta), 0)
      FROM inventory_ledger_entries
      WHERE master_product_id = v_master_product_id
    ) WHERE id = v_master_product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS inventory_ledger_on_hand_trigger ON inventory_ledger_entries;
CREATE TRIGGER inventory_ledger_on_hand_trigger
AFTER INSERT OR UPDATE OR DELETE ON inventory_ledger_entries
FOR EACH ROW EXECUTE FUNCTION update_master_product_on_hand();
