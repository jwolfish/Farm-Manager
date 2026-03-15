/*
  # Fix seasons unique constraint for farm-scoped seasons

  ## Problem
  The seasons table has a unique constraint on (user_id, year), which prevents a user
  from creating a season for a year they already have a season for — even on a different farm.
  Since seasons are now farm-scoped (tied to a specific farm via farm_id), the uniqueness
  should be per farm per year, not per user per year.

  ## Changes
  - Drop the old unique constraint: seasons_user_id_year_key (user_id, year)
  - Add a new unique constraint: seasons_farm_id_year_key (farm_id, year)
    - Only applies when farm_id IS NOT NULL (partial unique index)
  - Keep a fallback unique constraint for legacy seasons without a farm_id: (user_id, year)
    - Only applies when farm_id IS NULL

  ## Impact
  - Users can now create seasons for the same year across multiple farms
  - Uniqueness is still enforced within a single farm (one season per year per farm)
  - Legacy seasons (no farm_id) retain their per-user uniqueness
*/

ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_user_id_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS seasons_farm_id_year_key 
  ON seasons (farm_id, year) 
  WHERE farm_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS seasons_user_id_year_no_farm_key 
  ON seasons (user_id, year) 
  WHERE farm_id IS NULL;
