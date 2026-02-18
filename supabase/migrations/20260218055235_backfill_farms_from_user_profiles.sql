/*
  # Data Migration: Create Default Farms from Existing User Profiles

  ## Summary
  For every existing user who has seasons, creates one "default" farm record
  using their farm_name from user_profiles. Links all their existing seasons
  and team_member records to that farm. No data is deleted.

  ## Changes
  1. For each user_id that appears in seasons:
     - Creates a farm record with farm_name from user_profiles (or 'My Farm' as fallback)
     - Sets farm_id on all their seasons
  2. For each team_members record (using user_id = the farm owner):
     - Looks up the farm owned by that user
     - Sets farm_id on the team_members record

  ## Notes
  1. farm_name is NOT removed from user_profiles in this migration
  2. All existing data is preserved - purely additive
  3. team_members.user_id is the owner who sent the invitation
*/

DO $$
DECLARE
  r RECORD;
  new_farm_id uuid;
  existing_farm_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT s.user_id,
           COALESCE(up.farm_name, 'My Farm') AS fname
    FROM seasons s
    LEFT JOIN user_profiles up ON up.id = s.user_id
    WHERE s.farm_id IS NULL
  LOOP
    SELECT id INTO existing_farm_id
    FROM farms
    WHERE owner_user_id = r.user_id
    LIMIT 1;

    IF existing_farm_id IS NULL THEN
      INSERT INTO farms (owner_user_id, farm_name)
      VALUES (r.user_id, r.fname)
      RETURNING id INTO new_farm_id;
    ELSE
      new_farm_id := existing_farm_id;
    END IF;

    UPDATE seasons
    SET farm_id = new_farm_id
    WHERE user_id = r.user_id AND farm_id IS NULL;
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
  owner_farm_id uuid;
BEGIN
  FOR r IN
    SELECT tm.id, tm.user_id AS owner_user_id
    FROM team_members tm
    WHERE tm.farm_id IS NULL AND tm.user_id IS NOT NULL
  LOOP
    SELECT id INTO owner_farm_id
    FROM farms
    WHERE owner_user_id = r.owner_user_id
    LIMIT 1;

    IF owner_farm_id IS NOT NULL THEN
      UPDATE team_members
      SET farm_id = owner_farm_id
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
