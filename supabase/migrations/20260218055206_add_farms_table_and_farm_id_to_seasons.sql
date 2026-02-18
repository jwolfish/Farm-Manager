/*
  # Add Farms Table and Farm-Level Architecture

  ## Summary
  Introduces a `farms` table as the top-level container above seasons,
  enabling a single user to own and independently operate multiple distinct farms.

  ## New Tables
  - `farms`
    - `id` (uuid, primary key)
    - `owner_user_id` (uuid, FK to auth.users) - the farm owner
    - `farm_name` (text) - display name of the farm
    - `created_at` (timestamptz)
    - `is_active` (boolean, default true)

  ## Modified Tables
  - `seasons`: adds `farm_id` (uuid, nullable FK to farms) - will be backfilled in data migration
  - `team_members`: adds `farm_id` (uuid, nullable FK to farms) - will be backfilled in data migration

  ## Security
  - RLS enabled on `farms` table
  - Owner-only policies for farms CRUD
  - Seasons and team_members policies updated after data migration

  ## Notes
  1. farm_name on user_profiles is kept until data migration completes
  2. farm_id on seasons and team_members is nullable initially to allow safe backfill
  3. Existing data is unaffected until the data migration step
*/

CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their farms"
  ON farms FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Owners can insert farms"
  ON farms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update their farms"
  ON farms FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can delete their farms"
  ON farms FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seasons' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE seasons ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_members' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE team_members ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_farms_owner_user_id ON farms(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_seasons_farm_id ON seasons(farm_id);
CREATE INDEX IF NOT EXISTS idx_team_members_farm_id ON team_members(farm_id);
