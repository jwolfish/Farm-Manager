/*
  # Add set_active_season RPC

  1. New Functions
    - `set_active_season(p_season_id uuid)`: atomically deactivate all seasons for the
      calling user and activate the target season in a single transaction.

  2. Security
    - SECURITY DEFINER with fixed search_path.
    - Explicit `auth.uid()` check ensures callers can only toggle their own seasons.
    - Verifies the target season belongs to the caller before activating.
*/

CREATE OR REPLACE FUNCTION public.set_active_season(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id INTO v_owner FROM seasons WHERE id = p_season_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Season not found';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to activate this season';
  END IF;

  UPDATE seasons SET is_active = false WHERE user_id = v_uid AND is_active = true;
  UPDATE seasons SET is_active = true  WHERE id = p_season_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_season(uuid) TO authenticated;
