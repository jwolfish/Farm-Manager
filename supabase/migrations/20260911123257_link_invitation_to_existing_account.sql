/*
  # Linking an invitation works in BOTH orders

  ## The defect

  `sendInvitation()` inserted the `team_members` row and then looked the invitee up in
  `user_profiles` to set `invited_user_id` and create the in-app notification:

      const { data: invitedProfile } = await supabase
        .from('user_profiles').select('id').eq('email', trimmedEmail).maybeSingle();
      if (invitedProfile?.id) { ...link and notify... }

  That query returns ZERO ROWS whenever the invitee is not already a collaborator, because
  the RLS policy on `user_profiles` is "you, or someone who owns a farm you can view". A
  brand-new account owns only its own default farm, which the inviter cannot view. So the
  profile is invisible, the branch is skipped, and — because the error is discarded — it is
  silent.

  It is a chicken-and-egg: profile visibility is granted THROUGH membership, but the code
  needed profile visibility TO CREATE the membership link.

  ## Why nothing caught it

  Invite-then-signup works, because `resolve_pending_invitations_for_new_user` (20260830033819)
  links pending invitations when the account appears. That is the path tested on 30 Aug and
  the path the one working collaborator took. Signup-THEN-invite — the natural order when
  setting up a test account — has no second chance: the trigger already ran, and nothing
  re-runs.

  The consequence is total rather than cosmetic. `team_members` SELECT is
  `user_id = auth.uid() OR invited_user_id = auth.uid()`, so with `invited_user_id` NULL the
  invitee cannot see the row AT ALL. It never reaches their Team page and can never be
  accepted. It looks exactly like "no invitation was sent".

  Same shape as `fetchSharedFarms`: a query silently returning nothing because of RLS, with
  the empty result read as a fact rather than as "I cannot see".

  ## The fix

  ONE body, two callers — the V-6 `apply_field_fertilizer_rates` pattern, so the two paths
  cannot drift into meaning different things:

    link_pending_invitations_for_user(uuid)  internal, executable by NEITHER role
      ├── resolve_pending_invitations_for_new_user()  the signup trigger (rewritten to call it)
      └── link_invitation_to_account(uuid)            the new RPC, called by sendInvitation()

  The RPC is SECURITY DEFINER so it can resolve the email against `auth.users` without
  exposing profiles to the caller, and it re-checks that the caller OWNS the invitation, so
  it cannot be used to probe whether an arbitrary address has an account.
*/

-- ---------------------------------------------------------------------------------
-- The shared body. Links every pending invitation addressed to this user's email and
-- creates the notification each one should have. Idempotent: the NOT EXISTS guard means
-- running it twice cannot produce a duplicate notification.
--
-- Executable by NEITHER role — it takes a user id and must never be callable with someone
-- else's. The two wrappers below decide who may reach it. Same rule as F-3's internals and
-- V-6's `apply_field_fertilizer_rates`.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_pending_invitations_for_user(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email   text;
  v_linked  integer := 0;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  UPDATE team_members tm
     SET invited_user_id = p_user_id
   WHERE tm.invited_user_id IS NULL
     AND tm.status = 'pending'
     AND lower(tm.email) = v_email;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  INSERT INTO app_notifications (recipient_user_id, sender_user_id, type, payload, is_read)
  SELECT p_user_id,
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
   WHERE tm.invited_user_id = p_user_id
     AND tm.status = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM app_notifications an
        WHERE an.recipient_user_id = p_user_id
          AND an.type = 'team_invite'
          AND an.payload ->> 'invitation_id' = tm.id::text
     );

  RETURN v_linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_pending_invitations_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_pending_invitations_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.link_pending_invitations_for_user(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------------
-- Caller 1 — the signup trigger, rewritten to delegate. Its previous body IS the body
-- above; leaving a second copy is the shape guardrail 7 exists to prevent.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_pending_invitations_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  PERFORM public.link_pending_invitations_for_user(NEW.id);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------
-- Caller 2 — the new RPC, for the signup-THEN-invite order.
--
-- Authorization is the interesting part. It re-checks that the CALLER owns the invitation
-- before doing anything, so it cannot be turned into an oracle for "does this email have an
-- account?" — an unauthorized caller gets the same `false` as an unregistered address.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_invitation_to_account(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_row     team_members;
  v_target  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM team_members WHERE id = p_invitation_id;

  -- Not found and not-yours are deliberately the same answer.
  IF NOT FOUND OR v_row.user_id <> v_uid THEN
    RETURN false;
  END IF;

  IF v_row.invited_user_id IS NOT NULL OR v_row.status <> 'pending' THEN
    RETURN false;
  END IF;

  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(v_row.email);

  IF v_target IS NULL THEN
    -- No account yet. Correct and expected: the signup trigger will link it later.
    RETURN false;
  END IF;

  PERFORM public.link_pending_invitations_for_user(v_target);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_invitation_to_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_invitation_to_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_invitation_to_account(uuid) TO authenticated;
