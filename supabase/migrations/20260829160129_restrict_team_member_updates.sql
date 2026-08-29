/*
  # Restrict team_members updates to invitation response

  The previous "Team members can update invitation status" policy allowed an
  invited user to rewrite ANY column on their own team_members row, including
  role, user_id and farm_id. This replaces it with owner-only UPDATE plus a
  narrow SECURITY DEFINER RPC that can only ever write status, accepted_at
  and invited_user_id.
*/

DROP POLICY IF EXISTS "Team members can update invitation status" ON team_members;

CREATE POLICY "Farm owners can update their team members"
  ON team_members FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.respond_to_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
RETURNS team_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row   team_members;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM team_members WHERE id = p_invitation_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF NOT (
    v_row.invited_user_id = v_uid
    OR (v_row.invited_user_id IS NULL AND v_email <> '' AND lower(v_row.email) = v_email)
  ) THEN
    RAISE EXCEPTION 'This invitation does not belong to you';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation has already been answered';
  END IF;

  UPDATE team_members
  SET status = (CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END)::invitation_status,
      accepted_at = (CASE WHEN p_accept THEN now() ELSE NULL END),
      invited_user_id = v_uid
  WHERE id = p_invitation_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_invitation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_invitation(uuid, boolean) TO authenticated;
