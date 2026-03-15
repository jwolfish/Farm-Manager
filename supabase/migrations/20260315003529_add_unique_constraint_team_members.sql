/*
  # Add unique constraint on team_members to prevent duplicate invitations

  ## Summary
  Adds a partial unique index on team_members(user_id, farm_id, email) that is
  active only when status is not 'declined'. This prevents the same email from
  being invited to the same farm more than once while still allowing re-invitation
  after a previous invitation was declined.

  ## Changes
  - New partial unique index: `team_members_unique_active_invite`
    - Columns: (user_id, farm_id, email)
    - Condition: status <> 'declined'

  ## Notes
  - Uses a partial index so that declined records do not block future invitations
    for the same email address.
  - Revoked invitations are hard-deleted from the table (via revokeAccess), so
    they naturally do not conflict.
  - The application layer in teamMembers.ts already checks for existing pending/
    accepted records before inserting. This index is the database-level safety net.
  - Postgres error code 23505 (unique_violation) is caught in sendInvitation() and
    surfaced as a clear user-facing error message.
*/

CREATE UNIQUE INDEX IF NOT EXISTS team_members_unique_active_invite
  ON team_members (user_id, farm_id, email)
  WHERE status <> 'declined';
