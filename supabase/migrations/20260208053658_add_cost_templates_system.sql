/*
  # Cost Templates System with Field Overrides

  ## Overview
  This migration implements a template-based cost management system that allows users to:
  - Create reusable cost templates
  - Apply templates to multiple fields
  - Override specific costs at the field level
  - Automatically cascade template updates to linked fields (except overridden items)

  ## New Tables

  ### 1. cost_templates
  Reusable cost configurations that can be applied to multiple fields
  - Contains fertilizer/chemical programs (as JSONB arrays)
  - Contains all operational cost items
  - Does NOT contain seed varieties (always field-specific)
  - Living references that fields link to

  ### 2. field_cost_overrides
  Tracks field-specific cost overrides that supersede template values
  - Stores custom values for individual cost items
  - Prevents template cascade updates for overridden items
  - Enables field-level customization while maintaining template linkage

  ## Modified Tables

  ### field_costs
  - Adds template_id column to link fields to templates
  - Maintains denormalized cost values for performance

  ## Data Flow
  1. Template values stored in cost_templates
  2. When applied to field: field_costs.template_id set, values copied
  3. When field cost edited: override created in field_cost_overrides
  4. When template edited: cascade to linked fields except overridden items

  ## Security
  - RLS enabled on all new tables
  - Users can only access their own templates and overrides
  - Policies follow existing patterns from other tables
*/

-- ============================================================================
-- 1. Create cost_templates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,

  -- Fertilizer & Chemical Programs (stored as JSONB arrays)
  -- Format: [{"program_id": "uuid", "cost_per_acre": 123.45}, ...]
  fertilizer_programs jsonb DEFAULT '[]'::jsonb,
  chemical_programs jsonb DEFAULT '[]'::jsonb,

  -- Per-Acre Operational Costs
  tillage_cost_per_acre numeric(10,2) DEFAULT 0,
  planting_cost_per_acre numeric(10,2) DEFAULT 0,
  harvest_cost_per_acre numeric(10,2) DEFAULT 0,
  equipment_cost_per_acre numeric(10,2) DEFAULT 0,
  custom_services_cost_per_acre numeric(10,2) DEFAULT 0,
  labor_cost_per_acre numeric(10,2) DEFAULT 0,
  crop_insurance_cost_per_acre numeric(10,2) DEFAULT 0,
  other_expenses_per_acre numeric(10,2) DEFAULT 0,

  -- Storage & Hauling Costs
  drying_storage_cost_per_acre numeric(10,2) DEFAULT 0,
  hauling_cost_per_acre numeric(10,2) DEFAULT 0,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT cost_templates_name_unique UNIQUE(user_id, season_id, name)
);

-- ============================================================================
-- 2. Create field_cost_overrides table
-- ============================================================================

CREATE TABLE IF NOT EXISTS field_cost_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  cost_item_name text NOT NULL,
  override_value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- One override per cost item per field
  UNIQUE(field_id, cost_item_name)
);

-- ============================================================================
-- 3. Add template_id to field_costs table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_costs' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE field_costs
    ADD COLUMN template_id uuid REFERENCES cost_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cost_templates_user_id ON cost_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_templates_season_id ON cost_templates(season_id);
CREATE INDEX IF NOT EXISTS idx_field_cost_overrides_field_id ON field_cost_overrides(field_id);
CREATE INDEX IF NOT EXISTS idx_field_cost_overrides_field_cost_item
  ON field_cost_overrides(field_id, cost_item_name);
CREATE INDEX IF NOT EXISTS idx_field_costs_template_id ON field_costs(template_id);

-- ============================================================================
-- 5. Enable Row Level Security
-- ============================================================================

ALTER TABLE cost_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_cost_overrides ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS Policies for cost_templates
-- ============================================================================

CREATE POLICY "Users can view own templates"
  ON cost_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON cost_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON cost_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON cost_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. RLS Policies for field_cost_overrides
-- ============================================================================

CREATE POLICY "Users can view own field overrides"
  ON field_cost_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND fields.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own field overrides"
  ON field_cost_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND fields.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own field overrides"
  ON field_cost_overrides FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND fields.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND fields.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own field overrides"
  ON field_cost_overrides FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND fields.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. Create triggers for updated_at columns
-- ============================================================================

CREATE TRIGGER update_cost_templates_updated_at
  BEFORE UPDATE ON cost_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_field_cost_overrides_updated_at
  BEFORE UPDATE ON field_cost_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 9. Add helpful comments
-- ============================================================================

COMMENT ON TABLE cost_templates IS 'Reusable cost configurations that can be applied to multiple fields';
COMMENT ON TABLE field_cost_overrides IS 'Field-specific cost overrides that supersede template values';
COMMENT ON COLUMN field_costs.template_id IS 'Links field to a cost template for automatic updates';
COMMENT ON COLUMN field_cost_overrides.cost_item_name IS 'Standardized name of cost item being overridden (e.g., "tillage_cost_per_acre", "fertilizer_programs")';
COMMENT ON COLUMN field_cost_overrides.override_value IS 'JSONB value storing the override. Format varies by cost type: simple costs use {"value": 123.45}, programs use {"programs": [{...}]}';