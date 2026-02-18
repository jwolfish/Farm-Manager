/*
  # Add Tillage, Planting, and Harvest Costs

  1. Changes
    - Add `tillage_cost_per_acre` column (numeric, default 0)
    - Add `planting_cost_per_acre` column (numeric, default 0)
    - Add `harvest_cost_per_acre` column (numeric, default 0)
  
  2. Notes
    - These columns track field operation costs separately
    - All default to 0 for backward compatibility
    - Existing equipment_cost_per_acre remains for "Other Equipment Costs"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_costs' AND column_name = 'tillage_cost_per_acre'
  ) THEN
    ALTER TABLE field_costs ADD COLUMN tillage_cost_per_acre numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_costs' AND column_name = 'planting_cost_per_acre'
  ) THEN
    ALTER TABLE field_costs ADD COLUMN planting_cost_per_acre numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_costs' AND column_name = 'harvest_cost_per_acre'
  ) THEN
    ALTER TABLE field_costs ADD COLUMN harvest_cost_per_acre numeric DEFAULT 0;
  END IF;
END $$;