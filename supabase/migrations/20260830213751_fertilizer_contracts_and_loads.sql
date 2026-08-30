/*
  Fertilizer contract and load tracking — schema (F-2)

  Three tables. See docs/Fertilizer-Contract-Tracking-Design.md for the reasoning;
  the parts that look arbitrary without it:

  1. A SPOT BUY IS A CONTRACT FILLED THE SAME DAY, not its own concept. Modelling
     it separately would put prices in two tables and create two paths into the
     weighted average. Hence `kind IN ('contract','spot')` on one table.

  2. LOAD LINES CARRY NO PRICE. Every dollar figure lives in fertilizer_contracts
     and nowhere else. A line says only "3 t of urea against the January booking".

  3. NO DENORMALIZED farm_id. RLS resolves the farm through seasons.farm_id. This
     avoids the entire SEC-4 class of defect, where a denormalized farm column
     disagrees with the row it points at and the policy trusts the column.

  4. DATES ARE UNCONSTRAINED. Fertilizer delivered in October 2026 for the 2027
     crop belongs to the 2027 season with its real 2026 date. Nothing here may
     reject a date for falling outside the season's year.

  Rehearsed with the full SEC-5 matrix in one rolled-back transaction before
  being applied: 101 assertions passed, 0 failed.
*/

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fertilizer_contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id             uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  fertilizer_product_id uuid NOT NULL REFERENCES public.fertilizer_products(id) ON DELETE CASCADE,
  kind                  text NOT NULL DEFAULT 'contract' CHECK (kind IN ('contract', 'spot')),
  label                 text,
  contracted_quantity   numeric NOT NULL CHECK (contracted_quantity > 0),
  unit_type             text NOT NULL,
  -- Nullable: a booking can exist before the price is settled. Such a row counts
  -- toward contracted tonnage but is excluded from the weighted average, so an
  -- unpriced booking cannot drag the blended cost toward zero.
  price_per_unit        numeric CHECK (price_per_unit IS NULL OR price_per_unit > 0),
  supplier              text,
  booked_on             date,
  notes                 text,
  user_id               uuid NOT NULL REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fertilizer_loads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  delivered_on  date NOT NULL,
  ticket_number text,
  load_type     text CHECK (load_type IS NULL OR load_type IN
                  ('semi', 'tender', 'truck', 'spreader', 'pickup', 'other')),
  supplier      text,
  -- Charged per truck, not per product, so it lives on the ticket. Totalled per
  -- season and deliberately NOT folded into field costs.
  delivery_fee  numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  notes         text,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fertilizer_load_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id               uuid NOT NULL REFERENCES public.fertilizer_loads(id) ON DELETE CASCADE,
  fertilizer_product_id uuid NOT NULL REFERENCES public.fertilizer_products(id),
  -- ON DELETE RESTRICT is deliberate. Deleting a booking that has loads against
  -- it must fail with a clear message rather than silently orphaning delivered
  -- tonnage. Reassign or delete the loads first.
  contract_id           uuid REFERENCES public.fertilizer_contracts(id) ON DELETE RESTRICT,
  quantity              numeric NOT NULL CHECK (quantity > 0),
  -- What the plan calculator said, when it was used (F-6). Never edited by hand.
  -- Kept beside the real quantity so plan-versus-actual drift is visible.
  computed_quantity     numeric CHECK (computed_quantity IS NULL OR computed_quantity > 0),
  unit_type             text NOT NULL,
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Consistency triggers
--
-- SECURITY INVOKER on purpose. These read fertilizer_products and
-- fertilizer_contracts, both RLS-protected. Running as the caller means a
-- reference to a row the caller cannot see fails the EXISTS and raises — it
-- fails closed. A SECURITY DEFINER version would happily confirm a row the
-- caller has no business naming.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fertilizer_contract_season_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fertilizer_products p
    WHERE p.id = NEW.fertilizer_product_id AND p.season_id = NEW.season_id
  ) THEN
    RAISE EXCEPTION 'fertilizer product % does not belong to season %',
      NEW.fertilizer_product_id, NEW.season_id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fertilizer_load_line_consistency_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_season    uuid;
  v_c_season  uuid;
  v_c_product uuid;
BEGIN
  SELECT l.season_id INTO v_season FROM fertilizer_loads l WHERE l.id = NEW.load_id;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'fertilizer load % not found', NEW.load_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fertilizer_products p
    WHERE p.id = NEW.fertilizer_product_id AND p.season_id = v_season
  ) THEN
    RAISE EXCEPTION 'fertilizer product % does not belong to the load''s season %',
      NEW.fertilizer_product_id, v_season;
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT c.season_id, c.fertilizer_product_id
      INTO v_c_season, v_c_product
      FROM fertilizer_contracts c WHERE c.id = NEW.contract_id;

    IF v_c_season IS NULL THEN
      RAISE EXCEPTION 'fertilizer contract % not found', NEW.contract_id;
    END IF;
    IF v_c_season <> v_season THEN
      RAISE EXCEPTION 'contract % belongs to a different season than this load', NEW.contract_id;
    END IF;
    IF v_c_product <> NEW.fertilizer_product_id THEN
      RAISE EXCEPTION 'contract % is for a different product than this line', NEW.contract_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS fertilizer_contract_season_check ON public.fertilizer_contracts;
CREATE TRIGGER fertilizer_contract_season_check
  BEFORE INSERT OR UPDATE ON public.fertilizer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fertilizer_contract_season_check();

DROP TRIGGER IF EXISTS fertilizer_load_line_consistency_check ON public.fertilizer_load_lines;
CREATE TRIGGER fertilizer_load_line_consistency_check
  BEFORE INSERT OR UPDATE ON public.fertilizer_load_lines
  FOR EACH ROW EXECUTE FUNCTION public.fertilizer_load_line_consistency_check();

DROP TRIGGER IF EXISTS fertilizer_contracts_updated_at ON public.fertilizer_contracts;
CREATE TRIGGER fertilizer_contracts_updated_at
  BEFORE UPDATE ON public.fertilizer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS fertilizer_loads_updated_at ON public.fertilizer_loads;
CREATE TRIGGER fertilizer_loads_updated_at
  BEFORE UPDATE ON public.fertilizer_loads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS fertilizer_contracts_season_idx  ON public.fertilizer_contracts (season_id);
CREATE INDEX IF NOT EXISTS fertilizer_contracts_product_idx ON public.fertilizer_contracts (fertilizer_product_id);
CREATE INDEX IF NOT EXISTS fertilizer_loads_season_idx      ON public.fertilizer_loads (season_id);
CREATE INDEX IF NOT EXISTS fertilizer_load_lines_load_idx   ON public.fertilizer_load_lines (load_id);
CREATE INDEX IF NOT EXISTS fertilizer_load_lines_contract_idx ON public.fertilizer_load_lines (contract_id);
CREATE INDEX IF NOT EXISTS fertilizer_load_lines_product_idx  ON public.fertilizer_load_lines (fertilizer_product_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Same shape WI-5 batch 2 settled on: the creator, or anyone who can view/edit
-- the farm the season belongs to. The `auth.uid() = user_id` half matters
-- because seasons.farm_id is NULLABLE — a season with no farm would otherwise
-- make its own author's rows invisible.
--
-- fertilizer_load_lines has no user_id of its own, so it borrows its parent
-- load's. Without that, a load under a NULL-farm season would still be visible
-- while its lines vanished, which reads as a corrupt ticket rather than a
-- permissions problem.
--
-- DELETE uses can_edit_farm rather than owner-only. These are new tables, so
-- there is no existing behaviour to widen: an editor on the farm is meant to be
-- able to manage its fertilizer buying, including removing a booking they did
-- not personally enter.
-- ---------------------------------------------------------------------------

ALTER TABLE public.fertilizer_contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fertilizer_loads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fertilizer_load_lines ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS, so drop first to stay replay-safe
-- (guardrail 5).
DROP POLICY IF EXISTS "fertilizer_contracts_select" ON public.fertilizer_contracts;
DROP POLICY IF EXISTS "fertilizer_contracts_insert" ON public.fertilizer_contracts;
DROP POLICY IF EXISTS "fertilizer_contracts_update" ON public.fertilizer_contracts;
DROP POLICY IF EXISTS "fertilizer_contracts_delete" ON public.fertilizer_contracts;

CREATE POLICY "fertilizer_contracts_select" ON public.fertilizer_contracts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id
     OR can_view_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_contracts.season_id)));

CREATE POLICY "fertilizer_contracts_insert" ON public.fertilizer_contracts
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_contracts.season_id)));

CREATE POLICY "fertilizer_contracts_update" ON public.fertilizer_contracts
  FOR UPDATE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_contracts.season_id)))
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_contracts.season_id)));

CREATE POLICY "fertilizer_contracts_delete" ON public.fertilizer_contracts
  FOR DELETE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_contracts.season_id)));

DROP POLICY IF EXISTS "fertilizer_loads_select" ON public.fertilizer_loads;
DROP POLICY IF EXISTS "fertilizer_loads_insert" ON public.fertilizer_loads;
DROP POLICY IF EXISTS "fertilizer_loads_update" ON public.fertilizer_loads;
DROP POLICY IF EXISTS "fertilizer_loads_delete" ON public.fertilizer_loads;

CREATE POLICY "fertilizer_loads_select" ON public.fertilizer_loads
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id
     OR can_view_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_loads.season_id)));

CREATE POLICY "fertilizer_loads_insert" ON public.fertilizer_loads
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_loads.season_id)));

CREATE POLICY "fertilizer_loads_update" ON public.fertilizer_loads
  FOR UPDATE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_loads.season_id)))
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_loads.season_id)));

CREATE POLICY "fertilizer_loads_delete" ON public.fertilizer_loads
  FOR DELETE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM seasons s WHERE s.id = fertilizer_loads.season_id)));

DROP POLICY IF EXISTS "fertilizer_load_lines_select" ON public.fertilizer_load_lines;
DROP POLICY IF EXISTS "fertilizer_load_lines_insert" ON public.fertilizer_load_lines;
DROP POLICY IF EXISTS "fertilizer_load_lines_update" ON public.fertilizer_load_lines;
DROP POLICY IF EXISTS "fertilizer_load_lines_delete" ON public.fertilizer_load_lines;

CREATE POLICY "fertilizer_load_lines_select" ON public.fertilizer_load_lines
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = (SELECT l.user_id FROM fertilizer_loads l WHERE l.id = fertilizer_load_lines.load_id)
     OR can_view_farm((SELECT s.farm_id FROM seasons s
                        JOIN fertilizer_loads l ON l.season_id = s.id
                       WHERE l.id = fertilizer_load_lines.load_id)));

CREATE POLICY "fertilizer_load_lines_insert" ON public.fertilizer_load_lines
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM seasons s
                              JOIN fertilizer_loads l ON l.season_id = s.id
                             WHERE l.id = fertilizer_load_lines.load_id)));

CREATE POLICY "fertilizer_load_lines_update" ON public.fertilizer_load_lines
  FOR UPDATE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM seasons s
                         JOIN fertilizer_loads l ON l.season_id = s.id
                        WHERE l.id = fertilizer_load_lines.load_id)))
  WITH CHECK (can_edit_farm((SELECT s.farm_id FROM seasons s
                              JOIN fertilizer_loads l ON l.season_id = s.id
                             WHERE l.id = fertilizer_load_lines.load_id)));

CREATE POLICY "fertilizer_load_lines_delete" ON public.fertilizer_load_lines
  FOR DELETE TO authenticated
  USING (can_edit_farm((SELECT s.farm_id FROM seasons s
                         JOIN fertilizer_loads l ON l.season_id = s.id
                        WHERE l.id = fertilizer_load_lines.load_id)));

COMMENT ON TABLE public.fertilizer_contracts IS
  'Every fertilizer commitment. kind=spot is a contract filled the same day, so all prices live here and the weighted average has no special case.';
COMMENT ON TABLE public.fertilizer_loads IS
  'One delivery ticket. delivery_fee is per truck and is totalled separately, never folded into field costs.';
COMMENT ON TABLE public.fertilizer_load_lines IS
  'What was on a ticket. Blends are recorded as component products on separate lines, mirroring the plant ticket. Carries no price.';
