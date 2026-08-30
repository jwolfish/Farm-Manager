/*
  # SEC-3 / WI-3 — defence in depth on cascade_tasks

  ## The hole
  `process-cascade-task` verifies the caller's JWT and that the task row belongs
  to them, then performs **every** write with the service-role client using
  `task.season_id` and `task.entity_id` verbatim. RLS on `cascade_tasks` only
  ever checked `auth.uid() = user_id` — nothing verified that the season belongs
  to a farm the caller can reach, and the user may update their own task row
  after inserting it. Any authenticated user who learns another farm's season and
  template ids could force a recalculation that rewrites that farm's
  `cost_templates` and `field_costs`.

  The primary fix is in the edge function, which now resolves the season through
  the user-scoped client and refuses if the caller cannot edit that farm. This
  trigger is the database half: it stops the bad row existing in the first place,
  so the attack fails even if the function is bypassed or a future edit drops the
  check.

  ## Two subtleties
  1. **The service role must not be blocked.** The edge function updates
     `status`, `result_data` and `error_message` with the service-role client,
     which has no `auth.uid()`. That is a trusted context, so the check is
     skipped when there is no authenticated user. RLS already prevents `anon`
     from reaching this table — every policy on it is `TO authenticated`.
  2. **On UPDATE the check only fires when the season actually moves.** That is
     the attack the PRD describes: insert a task for a season you own, then
     re-point it at someone else's. Re-checking on every status update would
     cost a farm lookup per write for no benefit.
*/

CREATE OR REPLACE FUNCTION public.assert_cascade_task_season_access()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_farm uuid;
BEGIN
  -- Service-role / no-JWT context: trusted, nothing to check. See note 1.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only re-check when the season moves. See note 2.
  IF TG_OP = 'UPDATE' AND NEW.season_id IS NOT DISTINCT FROM OLD.season_id THEN
    RETURN NEW;
  END IF;

  IF NEW.season_id IS NULL THEN
    RAISE EXCEPTION 'A cascade task must name a season' USING ERRCODE = '22023';
  END IF;

  SELECT s.farm_id INTO v_farm FROM seasons s WHERE s.id = NEW.season_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Season not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_edit_farm(v_farm) THEN
    RAISE EXCEPTION 'You do not have permission to queue a cascade for that season'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cascade_task_season_access_check ON cascade_tasks;
CREATE TRIGGER cascade_task_season_access_check
  BEFORE INSERT OR UPDATE ON cascade_tasks
  FOR EACH ROW EXECUTE FUNCTION public.assert_cascade_task_season_access();
