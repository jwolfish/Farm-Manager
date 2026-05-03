/*
  # Fix Function Security Issues

  Addresses security advisories raised by the Supabase security linter:

  1. Mutable search_path on trigger functions
     - `update_updated_at`: pins search_path to `public, pg_catalog` so it
       cannot be hijacked by a caller with a different search_path.
     - `update_field_yields_updated_at`: same treatment.

  2. SECURITY DEFINER functions callable by anon / authenticated roles
     - `is_editor_of(owner_id uuid)`: switched to SECURITY INVOKER. The
       function only reads team_members rows visible to the calling role so
       SECURITY DEFINER was unnecessary and created an escalation surface
       via /rest/v1/rpc.
     - `is_team_member_of(owner_id uuid)`: same change.
     - EXECUTE is explicitly revoked from `anon` on both functions as a
       defence-in-depth measure.

  Note: Leaked Password Protection (HaveIBeenPwned) must be enabled in
  the Supabase Dashboard under Authentication > Providers > Email.
*/

-- ============================================================
-- 1. Fix mutable search_path on trigger functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_field_yields_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Switch is_team_member_of and is_editor_of to SECURITY INVOKER
--    and revoke anon execute access
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_team_member_of(owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = owner_id
    AND invited_user_id = (SELECT auth.uid())
    AND status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_editor_of(owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = owner_id
    AND invited_user_id = (SELECT auth.uid())
    AND status = 'accepted'
    AND role = 'editor'
  );
$$;

-- Revoke direct RPC access from anon
REVOKE EXECUTE ON FUNCTION public.is_team_member_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_editor_of(uuid) FROM anon;
