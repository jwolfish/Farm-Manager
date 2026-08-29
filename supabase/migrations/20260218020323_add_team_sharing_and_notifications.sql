/*
  # Add in-app notifications for team sharing

  ## Reconstructed 29 Aug 2026
  This migration was applied to the database (version `20260218020323`) but its
  file was missing from the repository. It is the only local migration that
  creates `app_notifications`, and three later migrations reference that table:

    - `20260305192457` — `CREATE INDEX ... ON public.app_notifications`
    - `20260305192931` — `DROP POLICY ... ON app_notifications` and recreates them
    - `20260305193055` — `DROP INDEX IF EXISTS idx_app_notifications_recipient`

  Without this file a rebuild from `supabase/migrations/` failed at
  `20260305192457`, because `CREATE INDEX` on a non-existent table is an error
  even with `IF NOT EXISTS`. Reconstructed from the live schema.

  Note `team_members` and the `user_role` / `invitation_status` enums are NOT
  created here — they already exist from `20260205170031`. Despite the migration
  name, the only object this adds is the notifications table.

  ## Faithfulness to the original
  - Policies are written in the pre-optimisation form (`auth.uid() = ...` rather
    than `(SELECT auth.uid()) = ...`). `20260305192931` is the migration that
    rewrites them into the subquery form, and it would be misleading for this
    file to arrive already fixed.
  - `idx_app_notifications_sender_user_id` is deliberately NOT created here;
    `20260305192457` adds it.
  - `idx_app_notifications_recipient` IS created here so that the drop in
    `20260305193055` has something to remove. It does not exist in the live
    schema, which is consistent with that later drop.
*/

CREATE TABLE IF NOT EXISTS app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'team_invite',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;

-- Unread-badge lookup; survives to the current schema.
CREATE INDEX IF NOT EXISTS idx_app_notifications_unread
  ON app_notifications (recipient_user_id, is_read);

-- Superseded by idx_app_notifications_unread and dropped in 20260305193055.
CREATE INDEX IF NOT EXISTS idx_app_notifications_recipient
  ON app_notifications (recipient_user_id);

-- A user may only announce themselves as the sender.
CREATE POLICY "Authenticated users can insert notifications"
  ON app_notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_user_id);

CREATE POLICY "Recipients can read own notifications"
  ON app_notifications FOR SELECT TO authenticated
  USING (auth.uid() = recipient_user_id);

-- Recipients mark their own notifications read; they cannot reassign them.
CREATE POLICY "Recipients can update own notifications"
  ON app_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);
