/*
  # Update fertilizer_products table

  ## Changes
  - Removes `crop_type` column from `fertilizer_products` (fertilizers are universal, not crop-specific)
  - Adds `application_rate_unit` column to track units for application rate (gallons or pounds)
  
  ## Purpose
  Simplifies fertilizer management by removing unnecessary crop type restriction.
  Fertilizers can be used across different crops, so crop_type filtering is not needed.
*/

DO $$
BEGIN
  -- Remove crop_type column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fertilizer_products' AND column_name = 'crop_type'
  ) THEN
    ALTER TABLE fertilizer_products DROP COLUMN crop_type;
  END IF;
  
  -- Add application_rate_unit if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fertilizer_products' AND column_name = 'application_rate_unit'
  ) THEN
    ALTER TABLE fertilizer_products ADD COLUMN application_rate_unit text;
  END IF;
END $$;