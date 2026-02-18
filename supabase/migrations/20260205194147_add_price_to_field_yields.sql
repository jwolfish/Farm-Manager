/*
  # Add Price Tracking to Field Yields

  ## Purpose
  Add price per bushel to field yields table to enable profit calculations on the dashboard.

  ## Changes
  
  ### Modified Tables
  
  - `field_yields`
    - Add `price_per_bushel` (numeric, nullable) - Sale price per bushel for profit calculations
    - Add `gross_revenue_per_acre` (numeric, nullable) - Calculated: yield × price
    - Add `profit_per_acre` (numeric, nullable) - Calculated: revenue - cost

  ## Important Notes
  
  1. Price fields are nullable since they may not be known at harvest time
  2. These fields enable full profit analysis in the Dashboard
  3. Profit per acre = (yield × price) - cost per acre
*/

-- Add price and profit columns to field_yields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_yields' AND column_name = 'price_per_bushel'
  ) THEN
    ALTER TABLE field_yields ADD COLUMN price_per_bushel numeric CHECK (price_per_bushel >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_yields' AND column_name = 'gross_revenue_per_acre'
  ) THEN
    ALTER TABLE field_yields ADD COLUMN gross_revenue_per_acre numeric CHECK (gross_revenue_per_acre >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_yields' AND column_name = 'profit_per_acre'
  ) THEN
    ALTER TABLE field_yields ADD COLUMN profit_per_acre numeric;
  END IF;
END $$;
