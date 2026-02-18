/*
  # Add Land Rent and Property Tax to Fields

  ## Purpose
  Add field-specific land rent and property tax costs to enable complete cost per acre calculations.

  ## Changes
  
  ### Modified Tables
  
  - `fields`
    - Add `land_rent_per_acre` (numeric, nullable, default 0) - Annual land rent cost per acre
    - Add `property_tax_per_acre` (numeric, nullable, default 0) - Annual property tax per acre

  ## Important Notes
  
  1. These costs are field-specific as different fields may have different rental agreements or tax rates
  2. Both costs default to 0 for existing fields
  3. These costs will be included in total cost per acre calculations
  4. Values must be non-negative
*/

-- Add land rent and property tax columns to fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields' AND column_name = 'land_rent_per_acre'
  ) THEN
    ALTER TABLE fields ADD COLUMN land_rent_per_acre numeric DEFAULT 0 CHECK (land_rent_per_acre >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields' AND column_name = 'property_tax_per_acre'
  ) THEN
    ALTER TABLE fields ADD COLUMN property_tax_per_acre numeric DEFAULT 0 CHECK (property_tax_per_acre >= 0);
  END IF;
END $$;
