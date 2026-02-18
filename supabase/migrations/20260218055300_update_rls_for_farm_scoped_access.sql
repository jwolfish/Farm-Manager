/*
  # Update RLS Policies for Farm-Scoped Access

  ## Summary
  Updates Row Level Security policies on seasons and team_members so that
  access is scoped through farm ownership (farms table) rather than direct
  user_id checks. Also adds a policy allowing farm collaborators (accepted
  team_members) to read seasons belonging to shared farms.

  ## Changes to seasons table
  - Drops old user_id-based policies
  - Adds new policies checking ownership via farms.owner_user_id
  - Adds SELECT policy for accepted team_members (collaborators)

  ## Changes to team_members table
  - Drops old policies
  - Adds new farm-scoped policies (owner manages their farm's team_members)
  - Invited user can read their own invitations

  ## Notes
  1. Seasons not yet linked to a farm (farm_id IS NULL) fall back to user_id check
     to avoid breaking any edge cases during transition
  2. All policies require authentication
*/

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can insert their own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can update their own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can delete their own seasons" ON seasons;
DROP POLICY IF EXISTS "Collaborators can view shared seasons" ON seasons;

CREATE POLICY "Farm owners can view their seasons"
  ON seasons FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      farm_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM farms
        WHERE farms.id = seasons.farm_id
        AND farms.owner_user_id = auth.uid()
      )
    )
    OR (
      farm_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.farm_id = seasons.farm_id
        AND tm.invited_user_id = auth.uid()
        AND tm.status = 'accepted'
      )
    )
  );

CREATE POLICY "Farm owners can insert seasons"
  ON seasons FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Farm owners can update their seasons"
  ON seasons FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Farm owners can delete their seasons"
  ON seasons FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their own team members" ON team_members;
DROP POLICY IF EXISTS "Users can insert team members" ON team_members;
DROP POLICY IF EXISTS "Users can update team members" ON team_members;
DROP POLICY IF EXISTS "Users can delete team members" ON team_members;
DROP POLICY IF EXISTS "Invited users can view their invitations" ON team_members;
DROP POLICY IF EXISTS "Invited users can update their invitations" ON team_members;

CREATE POLICY "Farm owners can view their farm team members"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR invited_user_id = auth.uid()
  );

CREATE POLICY "Farm owners can insert team members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Team members can update invitation status"
  ON team_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR invited_user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR invited_user_id = auth.uid());

CREATE POLICY "Farm owners can delete team members"
  ON team_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
