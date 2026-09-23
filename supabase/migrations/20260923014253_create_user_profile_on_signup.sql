/*
  # A profile is created by the database when an account is created (WI-6)

  ## APPLIED 23 Sep 2026 (version 20260923014253), after the client change was live.

  It had to wait because the previous client did a PLAIN insert into `user_profiles` right after sign-up.
  With this trigger in place that insert would collide with the trigger's row, throw, and
  report a successful sign-up as a failure. The client in this PR does insert-if-missing,
  which is correct with or without the trigger — so the order is: merge, let the deploy
  finish, then apply this. (Rename the file to the version the database records.)

  ## Why

  The profile row was only ever created by the browser, after `auth.signUp` returned. With
  email confirmation ON there is no session at that point, RLS refuses the insert, and the
  account is left with no profile. Confirmation is OFF on this project today (all four
  accounts confirmed at creation, measured 22 Sep 2026) and every account has a profile,
  so this is not repairing anything. It is what makes turning confirmation ON safe — and
  that is the setting that actually stops the sign-up form revealing which addresses have
  accounts.

  ## Decisions

  - `ON CONFLICT (id) DO NOTHING` is defensive only. A profile cannot exist before its
    account — `user_profiles.id` references `auth.users` — so nothing can have written the
    row first; but a statement inside account creation should not be able to fail on a
    duplicate if that ever changes.
  - The full name comes from `raw_user_meta_data.full_name`, which the client now sends
    with `auth.signUp`. Missing or blank reads as NULL, as the column allows.
  - A failure here RAISES A WARNING AND RETURNS, rather than aborting. This runs inside
    account creation; a profile problem must not stop someone signing up, and the client's
    insert-if-missing is still there as the fallback.
  - Named `create_user_profile` so it fires BEFORE `resolve_pending_invitations` — AFTER
    triggers run in name order. That one reads only the INVITER's profile today, so the
    order does not currently matter; this keeps it from mattering later.
  - SECURITY DEFINER with search_path pinned, executable by neither `anon` nor
    `authenticated` (guardrails 3 and 4). It is a trigger function, not an API.
*/

CREATE OR REPLACE FUNCTION public.create_user_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'create_user_profile_for_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_profile_for_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_user_profile_for_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.create_user_profile_for_new_user() FROM authenticated;

DROP TRIGGER IF EXISTS create_user_profile ON auth.users;
CREATE TRIGGER create_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile_for_new_user();
