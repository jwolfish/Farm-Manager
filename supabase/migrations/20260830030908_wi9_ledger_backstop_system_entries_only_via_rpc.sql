/*
  # WI-9 ledger backstop — system ledger entries belong to the RPCs

  Deferred from Round 4 by decision on 29 Aug 2026, to land with Round 5's other
  policy changes rather than touching RLS twice.

  ## What this closes
  Round 4 made double-posting impossible *through* `apply_work_order` /
  `unapply_work_order` / `record_purchase`: each takes a row lock, asserts the
  expected status, and writes in one transaction. But an editor could still
  reach `/rest/v1/inventory_ledger_entries` directly and hand-craft a
  `source_type = 'work_order'` row — fabricating consumption, or inflating
  on-hand — because the INSERT policy only checked the farm.

  The PRD originally proposed a unique index on
  `(source_id, master_product_id, entry_type) WHERE source_type = 'work_order'`.
  That was rejected in Round 4 because it makes apply → unapply → re-apply
  impossible, which is another of WI-9's acceptance criteria. This achieves the
  same intent without that conflict.

  ## The rule
  A client may write only `source_type = 'manual'` rows. Everything else —
  `work_order`, `shopping_list_line` — is written exclusively by the
  SECURITY DEFINER RPCs, which run as the function owner and are not subject to
  these policies.

  UPDATE and DELETE are restricted the same way, and UPDATE's `WITH CHECK` also
  requires `manual`, so a caller cannot insert a manual row and then relabel it
  as a work-order entry. The client never issued UPDATE or DELETE on this table
  anyway — `InventoryAdjustModal` inserts, `LedgerHistoryModal` reads, and
  nothing else touches it.

  All three ledger rows in the database today are `source_type = 'manual'`, so
  nothing existing is affected.

  ## What this deliberately does NOT do
  It does not stop an editor making a manual adjustment of any size. That is a
  legitimate feature — someone has to be able to correct a miscount — and it is
  attributable: manual rows carry `created_by` and a note, and show up in the
  ledger history as a manual adjustment rather than masquerading as a work order.
*/

DROP POLICY IF EXISTS "Owners and editors can insert ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can insert ledger entries"
  ON inventory_ledger_entries FOR INSERT TO authenticated
  WITH CHECK (can_edit_farm(farm_id) AND source_type = 'manual');

DROP POLICY IF EXISTS "Owners and editors can update ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can update ledger entries"
  ON inventory_ledger_entries FOR UPDATE TO authenticated
  USING (can_edit_farm(farm_id) AND source_type = 'manual')
  WITH CHECK (can_edit_farm(farm_id) AND source_type = 'manual');

DROP POLICY IF EXISTS "Owners and editors can delete ledger entries" ON inventory_ledger_entries;
CREATE POLICY "Owners and editors can delete ledger entries"
  ON inventory_ledger_entries FOR DELETE TO authenticated
  USING (can_edit_farm(farm_id) AND source_type = 'manual');
