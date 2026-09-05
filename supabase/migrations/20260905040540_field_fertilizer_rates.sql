/*
  # Per-field fertilizer rates — V-1 of Field-Level-Fertilizer-Rates-Design.md

  ## What this adds

  One sparse table. A field that gets the flat template rate stores NOTHING here; the
  template path is untouched. A field whose rate differs stores one row per product for
  that program, and that set IS the field's item list for that pass (replace-wholly, §4
  Option E and §7 decision 1).

  ## Deliberate choices, each with a reason recorded elsewhere

  - `application_rate` is an UNCONSTRAINED numeric, matching
    `fertilizer_program_items.application_rate`. §7.1 turns on this: entry is by total
    tons and the rate is derived as `total ÷ acreage`, so 8.2 ton on 43 ac stores
    381.3953… lb/ac and must read back as 8.2 ton. A numeric(10,2) — the type used for
    money and acreage — would not round-trip.

  - `CHECK (>= 0)`, not `> 0`. A product can be zeroed on a field while staying visible
    in the editor rather than vanishing. Note this is NOT how "none this year" is stored:
    per §7.2 that is an ABSENT row, or the program removed from the field's list.

  - No denormalized `farm_id`. RLS resolves it `field_id → fields → seasons.farm_id`,
    the shape WI-5 batch 2 settled on, which sidesteps the SEC-4 class of defect where a
    denormalized column disagrees with the row it points at.

  - The consistency trigger is SECURITY INVOKER, like F-2's. It reads `fields`,
    `fertilizer_programs` and `fertilizer_products`, all RLS-protected, so naming a row
    the caller cannot see fails the lookup and raises — it fails closed. (Note the F-4a
    correction: inside a SECURITY DEFINER RPC the invoker is the function's owner, so the
    real protection is that it compares season ids, not that it tests visibility.)

  ## Deliberately NOT in this migration

  Dropping the dead `field_fertilizer_applications` and `field_chemical_applications`
  tables, which §6 of the design doc recommends. They are empty and referenced by nothing,
  but dropping a table is irreversible and they are not in this feature's way. Left for an
  explicit decision.
*/

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.field_fertilizer_rates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id              uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  program_id            uuid NOT NULL REFERENCES public.fertilizer_programs(id) ON DELETE CASCADE,
  fertilizer_product_id uuid NOT NULL REFERENCES public.fertilizer_products(id) ON DELETE CASCADE,
  -- Unconstrained numeric on purpose — see the header note on §7.1.
  application_rate      numeric NOT NULL CHECK (application_rate >= 0),
  application_rate_unit text NOT NULL,
  sort_order            integer,
  user_id               uuid NOT NULL REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (field_id, program_id, fertilizer_product_id)
);

-- ---------------------------------------------------------------------------
-- Consistency trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.field_fertilizer_rate_consistency_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_field_season uuid;
BEGIN
  SELECT f.season_id INTO v_field_season FROM fields f WHERE f.id = NEW.field_id;
  IF v_field_season IS NULL THEN
    RAISE EXCEPTION 'field % not found', NEW.field_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fertilizer_programs p
    WHERE p.id = NEW.program_id AND p.season_id = v_field_season
  ) THEN
    RAISE EXCEPTION 'fertilizer program % does not belong to the field''s season %',
      NEW.program_id, v_field_season;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fertilizer_products fp
    WHERE fp.id = NEW.fertilizer_product_id AND fp.season_id = v_field_season
  ) THEN
    RAISE EXCEPTION 'fertilizer product % does not belong to the field''s season %',
      NEW.fertilizer_product_id, v_field_season;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS field_fertilizer_rate_consistency_check ON public.field_fertilizer_rates;
CREATE TRIGGER field_fertilizer_rate_consistency_check
  BEFORE INSERT OR UPDATE ON public.field_fertilizer_rates
  FOR EACH ROW EXECUTE FUNCTION public.field_fertilizer_rate_consistency_check();

DROP TRIGGER IF EXISTS field_fertilizer_rates_updated_at ON public.field_fertilizer_rates;
CREATE TRIGGER field_fertilizer_rates_updated_at
  BEFORE UPDATE ON public.field_fertilizer_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
--
-- No separate index on field_id: the UNIQUE constraint's index leads with it, so a
-- per-field lookup already uses it. The other two are the cascade's access paths —
-- "which fields carry a rate for this program / this product".
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS field_fertilizer_rates_program_idx
  ON public.field_fertilizer_rates (program_id);
CREATE INDEX IF NOT EXISTS field_fertilizer_rates_product_idx
  ON public.field_fertilizer_rates (fertilizer_product_id);

-- ---------------------------------------------------------------------------
-- RLS — the WI-5 batch 2 shape, resolved through fields → seasons.farm_id.
--
-- The `auth.uid() = user_id` half of SELECT is kept for the same reason batch 2 kept it:
-- seasons.farm_id is NULLABLE, and a season with no farm would otherwise make its own
-- author's rows invisible.
--
-- DELETE uses can_edit_farm rather than owner-only. This is a new table, so there is no
-- existing behaviour to widen, and an editor on the farm is meant to manage its rates.
-- ---------------------------------------------------------------------------

ALTER TABLE public.field_fertilizer_rates ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS, so drop first to stay replay-safe (guardrail 5).
DROP POLICY IF EXISTS "field_fertilizer_rates_select" ON public.field_fertilizer_rates;
DROP POLICY IF EXISTS "field_fertilizer_rates_insert" ON public.field_fertilizer_rates;
DROP POLICY IF EXISTS "field_fertilizer_rates_update" ON public.field_fertilizer_rates;
DROP POLICY IF EXISTS "field_fertilizer_rates_delete" ON public.field_fertilizer_rates;

CREATE POLICY "field_fertilizer_rates_select" ON public.field_fertilizer_rates
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id
     OR can_view_farm((SELECT s.farm_id FROM fields f JOIN seasons s ON s.id = f.season_id
                        WHERE f.id = field_fertilizer_rates.field_id)));

CREATE POLICY "field_fertilizer_rates_insert" ON public.field_fertilizer_rates
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM fields f JOIN seasons s ON s.id = f.season_id
                              WHERE f.id = field_fertilizer_rates.field_id)));

CREATE POLICY "field_fertilizer_rates_update" ON public.field_fertilizer_rates
  FOR UPDATE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM fields f JOIN seasons s ON s.id = f.season_id
                         WHERE f.id = field_fertilizer_rates.field_id)))
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM fields f JOIN seasons s ON s.id = f.season_id
                              WHERE f.id = field_fertilizer_rates.field_id)));

CREATE POLICY "field_fertilizer_rates_delete" ON public.field_fertilizer_rates
  FOR DELETE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM fields f JOIN seasons s ON s.id = f.season_id
                         WHERE f.id = field_fertilizer_rates.field_id)));
