/*
  # Make invitations reach people who do not have an account yet

  ## The gap
  `sendInvitation()` inserts a `team_members` row, and then — **only if the
  invited email already has a `user_profiles` row** — sets `invited_user_id` and
  creates the in-app notification the Team page reads. Invite someone who has
  never signed up and none of that happens: the row exists, nothing surfaces it,
  and the UI reports "Invitation sent to ...".

  It does not heal either. `fetchSharedFarms()` and the notification list both
  key off `invited_user_id`, which stays NULL forever, and the RLS policy on
  `team_members` is `user_id = auth.uid() OR invited_user_id = auth.uid()` — so
  the invitee cannot even see the row addressed to their own email. Registering
  with that exact address later changes nothing.

  There is no email anywhere in this project, so "resend the invitation" is not
  a workaround. The only reliable moment to connect an invite to its person is
  when that person's account is created.

  ## What this does
  An AFTER INSERT trigger on `auth.users`: any pending invitation addressed to
  the new account's email gets `invited_user_id` filled in and the same
  notification `sendInvitation()` would have created. The invitee signs up, logs
  in, and the invitation is waiting — no new UI, because the existing screens
  already read exactly these two things.

  Matching is on `lower(email)`; `sendInvitation()` already lowercases before
  insert, but old rows may not have.

  ## Why SECURITY DEFINER
  It writes `team_members` and `app_notifications` for a user who is mid-signup
  and has no session yet, so RLS would block it. `search_path` is pinned per the
  usual rule.

  ## Note on the payload
  The shape is copied from `sendInvitation()` so both producers agree; the Team
  page reads `payload.farm_name`, `payload.owner_name` and `payload.role`. If
  that shape changes, change it in both places.
*/

CREATE OR REPLACE FUNCTION public.resolve_pending_invitations_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  UPDATE team_members tm
     SET invited_user_id = NEW.id
   WHERE tm.invited_user_id IS NULL
     AND tm.status = 'pending'
     AND lower(tm.email) = lower(NEW.email);

  INSERT INTO app_notifications (recipient_user_id, sender_user_id, type, payload, is_read)
  SELECT NEW.id,
         tm.user_id,
         'team_invite',
         jsonb_build_object(
           'invitation_id', tm.id,
           'farm_id',       tm.farm_id,
           'owner_name',    coalesce(nullif(op.full_name, ''), op.email, ''),
           'owner_email',   coalesce(op.email, ''),
           'farm_name',     f.farm_name,
           'role',          tm.role::text
         ),
         false
    FROM team_members tm
    LEFT JOIN user_profiles op ON op.id = tm.user_id
    LEFT JOIN farms f          ON f.id  = tm.farm_id
   WHERE tm.invited_user_id = NEW.id
     AND tm.status = 'pending'
     -- Do not duplicate a notification sendInvitation() already created.
     AND NOT EXISTS (
       SELECT 1 FROM app_notifications an
        WHERE an.recipient_user_id = NEW.id
          AND an.type = 'team_invite'
          AND an.payload ->> 'invitation_id' = tm.id::text
     );

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_pending_invitations_for_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_pending_invitations_for_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.resolve_pending_invitations_for_new_user() FROM authenticated;

DROP TRIGGER IF EXISTS resolve_pending_invitations ON auth.users;
CREATE TRIGGER resolve_pending_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.resolve_pending_invitations_for_new_user();
