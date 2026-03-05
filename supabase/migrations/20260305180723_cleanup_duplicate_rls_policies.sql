/*
  # Clean Up Duplicate and Conflicting RLS Policies

  ## Summary
  The database accumulated duplicate RLS policies from multiple migrations. This migration
  removes stale policies that were replaced by newer farm-scoped versions, and removes
  redundant overlapping policies on team_members.

  ## Changes

  ### seasons table
  Removes 4 old user_id-only policies that were replaced by the farm-scoped migration:
  - "Users can view own seasons" (replaced by "Farm owners can view their seasons" which also covers collaborators)
  - "Users can insert own seasons" (replaced by "Farm owners can insert seasons")
  - "Users can update own seasons" (replaced by "Farm owners can update their seasons")
  - "Users can delete own seasons" (replaced by "Farm owners can delete their seasons")

  ### team_members table
  Removes 3 old policies that were replaced or made redundant by the farm-scoped migration:
  - "Users can view team invitations they sent" (replaced by "Farm owners can view their farm team members")
  - "Users can view team invitations they received" (covered by "Farm owners can view their farm team members")
  - "Users can update team invitations they sent" (replaced by "Team members can update invitation status")
  - "Invited users can update their invitation status" (covered by "Team members can update invitation status")
  - "Users can delete team invitations they sent" (replaced by "Farm owners can delete team members")

  ## Notes
  - All removed policies have functional replacements already in place
  - No data is affected, only access control policy definitions
*/

-- Remove duplicate/superseded seasons policies
DROP POLICY IF EXISTS "Users can view own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can insert own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can update own seasons" ON seasons;
DROP POLICY IF EXISTS "Users can delete own seasons" ON seasons;

-- Remove duplicate/superseded team_members policies
DROP POLICY IF EXISTS "Users can view team invitations they sent" ON team_members;
DROP POLICY IF EXISTS "Users can view team invitations they received" ON team_members;
DROP POLICY IF EXISTS "Users can update team invitations they sent" ON team_members;
DROP POLICY IF EXISTS "Invited users can update their invitation status" ON team_members;
DROP POLICY IF EXISTS "Users can delete team invitations they sent" ON team_members;
DROP POLICY IF EXISTS "Users can send team invitations" ON team_members;
