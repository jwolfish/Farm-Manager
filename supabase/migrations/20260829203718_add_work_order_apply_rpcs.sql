/*
  # Transactional work-order apply / unapply (WI-9)

  ## Problem
  `applyWorkOrder()` wrote ledger entries and then set the status in a second,
  separate request, with no guard on the current status and no lock. A
  double-click, a failed status update, or two collaborators acting at once each
  double-deducted inventory. `unapplyWorkOrder()` mirrored the flaw.

  ## What this adds
  1. `can_edit_farm(uuid)` — a FARM-SCOPED edit check. Note this is deliberately
     stricter than the existing `is_editor_of(owner_id)`, which ignores
     `team_members.farm_id` and therefore grants access to every farm an owner
     has (SEC-5 / WI-5). These new RPCs do not inherit that hole. WI-5 will bring
     the rest of the policies up to this standard.
  2. `apply_work_order(uuid, jsonb)` and `unapply_work_order(uuid, jsonb)` —
     each takes a row lock on the work order, asserts the expected status,
     writes every ledger row and updates the status, all in one transaction.

  ## On the status guard versus a unique index
  The PRD proposed
    CREATE UNIQUE INDEX work_order_ledger_once
      ON inventory_ledger_entries (source_id, master_product_id, entry_type)
      WHERE source_type = 'work_order';
  That index is NOT created here, because it contradicts another of WI-9's own
  acceptance criteria: "Apply -> Unapply -> Apply returns on-hand to the correct
  value and is available in the UI at each step." Applying a second time writes a
  second 'consumption' row for the same (work order, product) pair, which the
  index would reject. The alternative — deleting ledger rows on unapply instead
  of writing reversals — would keep the index valid but destroy the audit trail
  for a real inventory ledger, which is worse.

  The actual protection against double-posting is `SELECT ... FOR UPDATE` plus
  the status assertion inside a single transaction: a concurrent second call
  blocks on the row lock, then re-reads the status and aborts. A companion
  migration closes the direct-INSERT path so these RPCs are the only way to
  write work-order ledger rows.

  ## On the quantities argument
  Quantities arrive already converted into each product's stock unit, computed by
  `src/lib/inventoryMath.ts`, which refuses the whole operation when a unit
  cannot be converted (WI-11). They are not recomputed here: a third copy of the
  conversion table in PL/pgSQL is exactly what guardrail 7 warns against, and
  WI-27 will consolidate the two that already exist. This is not a privilege
  boundary — a caller who can reach these RPCs is an editor who could already
  write ledger rows directly before this migration.
*/

-- ---------------------------------------------------------------------------
-- Farm-scoped authorization helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_edit_farm(p_farm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM farms f
    WHERE f.id = p_farm_id
      AND f.owner_user_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.farm_id = p_farm_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'accepted'
      AND tm.role IN ('editor', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.can_edit_farm(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_farm(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_edit_farm(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- apply_work_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_work_order(
  p_work_order_id uuid,
  p_quantities jsonb
)
RETURNS work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_wo  work_orders;
  v_row record;
  v_category text;
  v_product_farm uuid;
  v_inserted int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_quantities IS NULL OR jsonb_typeof(p_quantities) <> 'array'
     OR jsonb_array_length(p_quantities) = 0 THEN
    RAISE EXCEPTION 'No inventory quantities were supplied' USING ERRCODE = '22023';
  END IF;

  -- Serialise concurrent callers on this work order.
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_edit_farm(v_wo.farm_id) THEN
    RAISE EXCEPTION 'You do not have permission to change this work order'
      USING ERRCODE = '42501';
  END IF;

  IF v_wo.status NOT IN ('draft', 'unapplied') THEN
    RAISE EXCEPTION 'This work order cannot be applied because its status is %', v_wo.status
      USING ERRCODE = '55000';
  END IF;

  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(p_quantities)
      AS x(master_product_id uuid, quantity numeric, chemical_name text)
  LOOP
    IF v_row.master_product_id IS NULL THEN
      RAISE EXCEPTION 'A line is missing its inventory product' USING ERRCODE = '22023';
    END IF;

    IF v_row.quantity IS NULL OR NOT (v_row.quantity > 0) THEN
      RAISE EXCEPTION 'Quantity for % must be greater than zero',
        coalesce(v_row.chemical_name, v_row.master_product_id::text)
        USING ERRCODE = '22023';
    END IF;

    SELECT mp.farm_id, mp.product_category
      INTO v_product_farm, v_category
      FROM master_products mp
     WHERE mp.id = v_row.master_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory product % no longer exists', v_row.master_product_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Defence in depth; ledger_product_farm_check also enforces this.
    IF v_product_farm <> v_wo.farm_id THEN
      RAISE EXCEPTION 'Inventory product % belongs to a different farm', v_row.master_product_id
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO inventory_ledger_entries (
      farm_id, master_product_id, product_category, entry_type,
      quantity_delta, source_type, source_id, note, created_by
    ) VALUES (
      v_wo.farm_id, v_row.master_product_id, v_category, 'consumption',
      -abs(v_row.quantity), 'work_order', p_work_order_id,
      'Applied from work order: ' || coalesce(v_row.chemical_name, ''), v_uid
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'No inventory quantities were supplied' USING ERRCODE = '22023';
  END IF;

  UPDATE work_orders
     SET status = 'applied',
         applied_at = now(),
         updated_at = now()
   WHERE id = p_work_order_id
  RETURNING * INTO v_wo;

  RETURN v_wo;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_work_order(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_work_order(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_work_order(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- unapply_work_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unapply_work_order(
  p_work_order_id uuid,
  p_quantities jsonb
)
RETURNS work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_wo  work_orders;
  v_row record;
  v_category text;
  v_product_farm uuid;
  v_inserted int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_quantities IS NULL OR jsonb_typeof(p_quantities) <> 'array'
     OR jsonb_array_length(p_quantities) = 0 THEN
    RAISE EXCEPTION 'No inventory quantities were supplied' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_edit_farm(v_wo.farm_id) THEN
    RAISE EXCEPTION 'You do not have permission to change this work order'
      USING ERRCODE = '42501';
  END IF;

  IF v_wo.status <> 'applied' THEN
    RAISE EXCEPTION 'This work order cannot be unapplied because its status is %', v_wo.status
      USING ERRCODE = '55000';
  END IF;

  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(p_quantities)
      AS x(master_product_id uuid, quantity numeric, chemical_name text)
  LOOP
    IF v_row.master_product_id IS NULL THEN
      RAISE EXCEPTION 'A line is missing its inventory product' USING ERRCODE = '22023';
    END IF;

    IF v_row.quantity IS NULL OR NOT (v_row.quantity > 0) THEN
      RAISE EXCEPTION 'Quantity for % must be greater than zero',
        coalesce(v_row.chemical_name, v_row.master_product_id::text)
        USING ERRCODE = '22023';
    END IF;

    SELECT mp.farm_id, mp.product_category
      INTO v_product_farm, v_category
      FROM master_products mp
     WHERE mp.id = v_row.master_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory product % no longer exists', v_row.master_product_id
        USING ERRCODE = 'P0002';
    END IF;

    IF v_product_farm <> v_wo.farm_id THEN
      RAISE EXCEPTION 'Inventory product % belongs to a different farm', v_row.master_product_id
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO inventory_ledger_entries (
      farm_id, master_product_id, product_category, entry_type,
      quantity_delta, source_type, source_id, note, created_by
    ) VALUES (
      v_wo.farm_id, v_row.master_product_id, v_category, 'reversal',
      abs(v_row.quantity), 'work_order', p_work_order_id,
      'Reversed from work order: ' || coalesce(v_row.chemical_name, ''), v_uid
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'No inventory quantities were supplied' USING ERRCODE = '22023';
  END IF;

  UPDATE work_orders
     SET status = 'unapplied',
         unapplied_at = now(),
         updated_at = now()
   WHERE id = p_work_order_id
  RETURNING * INTO v_wo;

  RETURN v_wo;
END;
$$;

REVOKE ALL ON FUNCTION public.unapply_work_order(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unapply_work_order(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.unapply_work_order(uuid, jsonb) TO authenticated;
