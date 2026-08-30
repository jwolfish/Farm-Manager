/*
  # WI-5 batch 1 — farm-scope the inventory, shopping and work-order tables

  ## Problem (SEC-5)
  `is_team_member_of(owner_id)` and `is_editor_of(owner_id)` take only an OWNER
  id. `team_members` carries `farm_id` and the UI invites per farm, but the
  predicate ignores it, so one invitation to one farm grants access to every
  farm that owner has. Proved against the live schema by
  `supabase/tests/sec5_farm_scoping_matrix.sql`: an editor invited to Farm One
  could read Farm Two's data, insert a field into Farm Two, and update Farm
  Two's inventory.

  ## Approach
  Round 4 already introduced `can_edit_farm(farm_id)`, which is farm-scoped and
  folds the owner check in, so it needs no owner argument. This adds the reading
  sibling `can_view_farm(farm_id)` and converts the first batch of tables to the
  pair. The PRD proposed two-argument helpers
  (`is_editor_of_farm(owner, farm)`); the one-argument form is used instead
  because the owner is derivable from the farm and passing it separately invites
  the two to disagree.

  Batch 1 is the seven tables that resolve to a farm directly or through one
  parent hop. Seasons, fields and the season-scoped product tables follow in
  later batches, so this migration alone does not turn the matrix green.

  Policy names are unchanged on purpose — the diff is the predicate only.

  ## Ordering note
  `CREATE POLICY` has no `IF NOT EXISTS`, so each is dropped with `IF EXISTS`
  first. That makes this migration safe to re-run and safe in a from-scratch
  rebuild.
*/

-- ---------------------------------------------------------------------------
-- Reading sibling to can_edit_farm: any accepted member, any role, plus owner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_farm(p_farm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM farms f
    WHERE f.id = p_farm_id
      AND f.owner_user_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.farm_id = p_farm_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'accepted'
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_view_farm(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_farm(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_farm(uuid) TO authenticated;

-- Both helpers are now on the hot path for every row check. This is the exact
-- lookup they perform.
CREATE INDEX IF NOT EXISTS idx_team_members_accepted_lookup
  ON team_members (invited_user_id, farm_id)
  WHERE status = 'accepted';

-- ---------------------------------------------------------------------------
-- master_products — farm_id directly on the row
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view master products" ON master_products;
CREATE POLICY "Owners and team members can view master products"
  ON master_products FOR SELECT TO authenticated
  USING (can_view_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can insert master products" ON master_products;
CREATE POLICY "Owners and editors can insert master products"
  ON master_products FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can update master products" ON master_products;
CREATE POLICY "Owners and editors can update master products"
  ON master_products FOR UPDATE TO authenticated
  USING (can_edit_farm(farm_id))
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can delete master products" ON master_products;
CREATE POLICY "Owners and editors can delete master products"
  ON master_products FOR DELETE TO authenticated
  USING (can_edit_farm(farm_id));

-- ---------------------------------------------------------------------------
-- inventory_ledger_entries — farm_id directly on the row
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and team members can view ledger entries"
  ON inventory_ledger_entries FOR SELECT TO authenticated
  USING (can_view_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can insert ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can insert ledger entries"
  ON inventory_ledger_entries FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can update ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can update ledger entries"
  ON inventory_ledger_entries FOR UPDATE TO authenticated
  USING (can_edit_farm(farm_id))
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can delete ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can delete ledger entries"
  ON inventory_ledger_entries FOR DELETE TO authenticated
  USING (can_edit_farm(farm_id));

-- ---------------------------------------------------------------------------
-- shopping_lists — farm_id directly on the row
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view shopping lists" ON shopping_lists;
CREATE POLICY "Owners and team members can view shopping lists"
  ON shopping_lists FOR SELECT TO authenticated
  USING (can_view_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can insert shopping lists" ON shopping_lists;
CREATE POLICY "Owners and editors can insert shopping lists"
  ON shopping_lists FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can update shopping lists" ON shopping_lists;
CREATE POLICY "Owners and editors can update shopping lists"
  ON shopping_lists FOR UPDATE TO authenticated
  USING (can_edit_farm(farm_id))
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can delete shopping lists" ON shopping_lists;
CREATE POLICY "Owners and editors can delete shopping lists"
  ON shopping_lists FOR DELETE TO authenticated
  USING (can_edit_farm(farm_id));

-- ---------------------------------------------------------------------------
-- shopping_list_lines — farm_id directly on the row
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and team members can view shopping list lines"
  ON shopping_list_lines FOR SELECT TO authenticated
  USING (can_view_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can insert shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and editors can insert shopping list lines"
  ON shopping_list_lines FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can update shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and editors can update shopping list lines"
  ON shopping_list_lines FOR UPDATE TO authenticated
  USING (can_edit_farm(farm_id))
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can delete shopping list lines" ON shopping_list_lines;
CREATE POLICY "Owners and editors can delete shopping list lines"
  ON shopping_list_lines FOR DELETE TO authenticated
  USING (can_edit_farm(farm_id));

-- ---------------------------------------------------------------------------
-- work_orders — farm_id directly on the row
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view work orders" ON work_orders;
CREATE POLICY "Owners and team members can view work orders"
  ON work_orders FOR SELECT TO authenticated
  USING (can_view_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can insert work orders" ON work_orders;
CREATE POLICY "Owners and editors can insert work orders"
  ON work_orders FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can update work orders" ON work_orders;
CREATE POLICY "Owners and editors can update work orders"
  ON work_orders FOR UPDATE TO authenticated
  USING (can_edit_farm(farm_id))
  WITH CHECK (can_edit_farm(farm_id));

DROP POLICY IF EXISTS "Owners and editors can delete work orders" ON work_orders;
CREATE POLICY "Owners and editors can delete work orders"
  ON work_orders FOR DELETE TO authenticated
  USING (can_edit_farm(farm_id));

-- ---------------------------------------------------------------------------
-- work_order_fields — farm resolved through the parent work order
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view work order fields" ON work_order_fields;
CREATE POLICY "Owners and team members can view work order fields"
  ON work_order_fields FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM work_orders wo
                 WHERE wo.id = work_order_fields.work_order_id
                   AND can_view_farm(wo.farm_id)));

DROP POLICY IF EXISTS "Owners and editors can insert work order fields" ON work_order_fields;
CREATE POLICY "Owners and editors can insert work order fields"
  ON work_order_fields FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM work_orders wo
                      WHERE wo.id = work_order_fields.work_order_id
                        AND can_edit_farm(wo.farm_id)));

DROP POLICY IF EXISTS "Owners and editors can update work order fields" ON work_order_fields;
CREATE POLICY "Owners and editors can update work order fields"
  ON work_order_fields FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM work_orders wo
                 WHERE wo.id = work_order_fields.work_order_id
                   AND can_edit_farm(wo.farm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM work_orders wo
                      WHERE wo.id = work_order_fields.work_order_id
                        AND can_edit_farm(wo.farm_id)));

DROP POLICY IF EXISTS "Owners and editors can delete work order fields" ON work_order_fields;
CREATE POLICY "Owners and editors can delete work order fields"
  ON work_order_fields FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM work_orders wo
                 WHERE wo.id = work_order_fields.work_order_id
                   AND can_edit_farm(wo.farm_id)));

-- ---------------------------------------------------------------------------
-- work_order_lines — farm resolved through the parent work order
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners and team members can view work order lines" ON work_order_lines;
CREATE POLICY "Owners and team members can view work order lines"
  ON work_order_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM work_orders wo
                 WHERE wo.id = work_order_lines.work_order_id
                   AND can_view_farm(wo.farm_id)));

DROP POLICY IF EXISTS "Owners and editors can insert work order lines" ON work_order_lines;
CREATE POLICY "Owners and editors can insert work order lines"
  ON work_order_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM work_orders wo
                      WHERE wo.id = work_order_lines.work_order_id
                        AND can_edit_farm(wo.farm_id)));

DROP POLICY IF EXISTS "Owners and editors can update work order lines" ON work_order_lines;
CREATE POLICY "Owners and editors can update work order lines"
  ON work_order_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM work_orders wo
                 WHERE wo.id = work_order_lines.work_order_id
                   AND can_edit_farm(wo.farm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM work_orders wo
                      WHERE wo.id = work_order_lines.work_order_id
                        AND can_edit_farm(wo.farm_id)));

DROP POLICY IF EXISTS "Owners and editors can delete work order lines" ON work_order_lines;
CREATE POLICY "Owners and editors can delete work order lines"
  ON work_order_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM work_orders wo
                 WHERE wo.id = work_order_lines.work_order_id
                   AND can_edit_farm(wo.farm_id)));
