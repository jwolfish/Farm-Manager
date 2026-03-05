/*
  # Add Missing Foreign Key Indexes

  ## Summary
  Creates covering indexes for all foreign key columns that lack them.
  Without these indexes, any DELETE or UPDATE on a parent table requires
  a sequential scan of the child table to enforce referential integrity,
  causing significant performance degradation at scale.

  ## Indexes Added
  - app_notifications.sender_user_id
  - cascade_tasks.season_id
  - chemical_program_items.chemical_id
  - chemical_programs.user_id
  - commodity_sales.user_id
  - equipment_rates.user_id
  - fertilizer_products.user_id
  - fertilizer_program_items.fertilizer_product_id
  - fertilizer_program_items.program_id
  - fertilizer_programs.season_id
  - fertilizer_programs.user_id
  - field_chemical_applications.chemical_program_id
  - field_chemical_applications.field_cost_id
  - field_costs.seed_variety_id
  - field_costs.user_id
  - field_fertilizer_applications.fertilizer_product_id
  - field_fertilizer_applications.field_cost_id
  - individual_chemicals.user_id
  - seed_varieties.user_id
  - team_members.season_id
  - yield_and_price.user_id
*/

CREATE INDEX IF NOT EXISTS idx_app_notifications_sender_user_id
  ON public.app_notifications (sender_user_id);

CREATE INDEX IF NOT EXISTS idx_cascade_tasks_season_id
  ON public.cascade_tasks (season_id);

CREATE INDEX IF NOT EXISTS idx_chemical_program_items_chemical_id
  ON public.chemical_program_items (chemical_id);

CREATE INDEX IF NOT EXISTS idx_chemical_programs_user_id
  ON public.chemical_programs (user_id);

CREATE INDEX IF NOT EXISTS idx_commodity_sales_user_id
  ON public.commodity_sales (user_id);

CREATE INDEX IF NOT EXISTS idx_equipment_rates_user_id
  ON public.equipment_rates (user_id);

CREATE INDEX IF NOT EXISTS idx_fertilizer_products_user_id
  ON public.fertilizer_products (user_id);

CREATE INDEX IF NOT EXISTS idx_fertilizer_program_items_fertilizer_product_id
  ON public.fertilizer_program_items (fertilizer_product_id);

CREATE INDEX IF NOT EXISTS idx_fertilizer_program_items_program_id
  ON public.fertilizer_program_items (program_id);

CREATE INDEX IF NOT EXISTS idx_fertilizer_programs_season_id
  ON public.fertilizer_programs (season_id);

CREATE INDEX IF NOT EXISTS idx_fertilizer_programs_user_id
  ON public.fertilizer_programs (user_id);

CREATE INDEX IF NOT EXISTS idx_field_chemical_applications_chemical_program_id
  ON public.field_chemical_applications (chemical_program_id);

CREATE INDEX IF NOT EXISTS idx_field_chemical_applications_field_cost_id
  ON public.field_chemical_applications (field_cost_id);

CREATE INDEX IF NOT EXISTS idx_field_costs_seed_variety_id
  ON public.field_costs (seed_variety_id);

CREATE INDEX IF NOT EXISTS idx_field_costs_user_id
  ON public.field_costs (user_id);

CREATE INDEX IF NOT EXISTS idx_field_fertilizer_applications_fertilizer_product_id
  ON public.field_fertilizer_applications (fertilizer_product_id);

CREATE INDEX IF NOT EXISTS idx_field_fertilizer_applications_field_cost_id
  ON public.field_fertilizer_applications (field_cost_id);

CREATE INDEX IF NOT EXISTS idx_individual_chemicals_user_id
  ON public.individual_chemicals (user_id);

CREATE INDEX IF NOT EXISTS idx_seed_varieties_user_id
  ON public.seed_varieties (user_id);

CREATE INDEX IF NOT EXISTS idx_team_members_season_id
  ON public.team_members (season_id);

CREATE INDEX IF NOT EXISTS idx_yield_and_price_user_id
  ON public.yield_and_price (user_id);
