/*
  # Drop Unused Indexes

  ## Problem
  Supabase's security advisor identified 12 indexes that are never used by the query planner.
  Unused indexes waste storage and slow down write operations (INSERT/UPDATE/DELETE must
  maintain every index on the table).

  ## Indexes Dropped
  1. idx_cost_templates_user_id - on cost_templates(user_id)
  2. idx_field_cost_overrides_field_id - on field_cost_overrides(field_id)
  3. idx_cascade_tasks_user_season - on cascade_tasks(user_id, season_id)
  4. idx_equipment_rates_season_id - on equipment_rates(season_id)
  5. idx_fields_crop_type - on fields(crop_type)
  6. idx_seasons_user_id - on seasons(user_id)
  7. idx_seasons_year - on seasons(year)
  8. idx_yield_and_price_field_id - on yield_and_price(field_id)
  9. idx_team_members_user_id - on team_members(user_id)
  10. idx_team_members_invited_user_id - on team_members(invited_user_id)
  11. idx_team_members_farm_id - on team_members(farm_id)
  12. idx_app_notifications_recipient - on app_notifications(recipient_user_id)

  ## Safety
  - All are non-unique indexes; dropping them cannot affect data integrity
  - Uses DROP INDEX IF EXISTS to prevent errors if any were already removed
*/

DROP INDEX IF EXISTS public.idx_cost_templates_user_id;
DROP INDEX IF EXISTS public.idx_field_cost_overrides_field_id;
DROP INDEX IF EXISTS public.idx_cascade_tasks_user_season;
DROP INDEX IF EXISTS public.idx_equipment_rates_season_id;
DROP INDEX IF EXISTS public.idx_fields_crop_type;
DROP INDEX IF EXISTS public.idx_seasons_user_id;
DROP INDEX IF EXISTS public.idx_seasons_year;
DROP INDEX IF EXISTS public.idx_yield_and_price_field_id;
DROP INDEX IF EXISTS public.idx_team_members_user_id;
DROP INDEX IF EXISTS public.idx_team_members_invited_user_id;
DROP INDEX IF EXISTS public.idx_team_members_farm_id;
DROP INDEX IF EXISTS public.idx_app_notifications_recipient;
