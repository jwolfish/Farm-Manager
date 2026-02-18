/*
  # Add farm_name to user_profiles

  ## Summary
  Adds a farm_name column to the user_profiles table so users can identify 
  their operation by name. This name will appear in the sidebar, on reports, 
  and on any exported documents.

  ## Changes
  - `user_profiles` table: Added `farm_name` (text, nullable) column

  ## Notes
  - Nullable so existing users are not broken
  - No default value - users set it in the new Settings page
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'farm_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN farm_name text;
  END IF;
END $$;
