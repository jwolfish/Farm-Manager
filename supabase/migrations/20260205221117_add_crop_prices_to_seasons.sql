/*
  # Add Crop Prices to Seasons Table

  1. Changes
    - Add `corn_price_per_bushel` column to `seasons` table (nullable decimal)
    - Add `soybeans_price_per_bushel` column to `seasons` table (nullable decimal)
    - Add `wheat_price_per_bushel` column to `seasons` table (nullable decimal)
  
  2. Purpose
    - Centralize crop pricing at the season level rather than per-field
    - Simplifies price management by setting one price per crop type per season
    - All revenue/profit calculations will use these season-level prices based on field crop type
  
  3. Notes
    - All three columns are nullable to allow gradual population of prices
    - Using numeric(10,2) for currency values (up to 99,999,999.99)
    - Existing field_yields.price_per_bushel column is kept for historical data
*/

-- Add crop price columns to seasons table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seasons' AND column_name = 'corn_price_per_bushel'
  ) THEN
    ALTER TABLE seasons ADD COLUMN corn_price_per_bushel numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seasons' AND column_name = 'soybeans_price_per_bushel'
  ) THEN
    ALTER TABLE seasons ADD COLUMN soybeans_price_per_bushel numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seasons' AND column_name = 'wheat_price_per_bushel'
  ) THEN
    ALTER TABLE seasons ADD COLUMN wheat_price_per_bushel numeric(10,2);
  END IF;
END $$;