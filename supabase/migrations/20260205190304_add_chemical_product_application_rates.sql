/*
  # Add Application Rates to Chemical Products

  1. Changes
    - Add `default_application_rate` column to `individual_chemicals` table
    - Add `default_application_rate_unit` column to `individual_chemicals` table
    - Update unit_type to support more chemical unit types (gallons, liquid ounces, dry ounces, pounds)
  
  2. New Unit Types
    - Gallons (gal)
    - Liquid Ounces (fl oz)
    - Dry Ounces (oz)
    - Pounds (lbs)
    - Pints (pt)
    - Quarts (qt)
  
  3. Notes
    - Default application rate helps pre-fill common usage amounts
    - Application rate units include all liquid and dry measures for flexibility
    - Maintains backwards compatibility with existing data
*/

-- Add default application rate columns to individual_chemicals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'individual_chemicals' AND column_name = 'default_application_rate'
  ) THEN
    ALTER TABLE individual_chemicals ADD COLUMN default_application_rate numeric(10,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'individual_chemicals' AND column_name = 'default_application_rate_unit'
  ) THEN
    ALTER TABLE individual_chemicals ADD COLUMN default_application_rate_unit text;
  END IF;
END $$;