# Farm Manager — Inventory, Shopping Lists & Persisted Work Orders

## PRD for Bolt implementation

---

## 1. Summary

Add a farm-scoped inventory system that ties into Products, Cost Templates, and Spray Planner. Chemical products get real on-hand tracking with a transaction ledger, driven by purchases (via a supplier shopping list) and consumption (via saved/applied Spray Planner work orders). Seed gets on-hand tracking too, but with no automatic consumption trigger — purchases and manual edits only. Fertilizer gets a shopping list and pricing workflow but explicitly **no** on-hand/ledger tracking this release (see §8).

Spray Planner work orders become persistable records for the first time — currently they exist only in memory for the duration of a browser session. This PRD also defines their lifecycle (draft/applied/unapplied), their effect on inventory, and a new Field History view.

This is a big build. §11 suggests a phased build order.

---

## 2. Goals

- Track current on-hand quantity for chemical (and, more lightly, seed) products.
- Persist products across season rollovers as the *same* product, so inventory doesn't reset every time a new season is created.
- Generate per-product-type shopping lists from the current crop plan (cost templates → fields), editable, that a supplier can be asked to quote.
- Record supplier quotes/prices against a shopping list and have the chosen price flow back into the product's `price_per_unit` (and, for chemical/seed, into inventory).
- Surface inventory in Spray Planner while building a work order, with a low-stock warning that never blocks work order creation.
- Persist Spray Planner work orders (currently ephemeral) with a draft/applied/unapplied lifecycle, correctly adjusting inventory as status changes.
- Keep the app's current identity: this is a planning/tracking tool for one farm's own use, not a billing or ERP system.

## 3. Explicit non-goals for this release

- **Fertilizer inventory, on-hand tracking, or a ledger of any kind.** Fertilizer keeps its shopping list and pricing workflow only.
- **Fertilizer contract/usage tracking.** Deliberately deferred to a follow-on project once this release is live. See §8 for the forward-compatible groundwork already included so that project is additive, not a rework.
- **A Seed Planner or any planting-event UI.** Seed inventory only moves via purchases and manual adjustment.
- **Reorder-point thresholds.** The low-stock alert is a simple sufficiency check (on-hand vs. what this work order needs), not a configurable minimum.
- **A Suppliers master table / CRM.** Supplier is a free-text field on shopping list lines.
- **Cross-farm inventory pooling.** Inventory is strictly scoped to one farm.
- **Negative-inventory prevention.** Negative on-hand is allowed and simply displayed as a signal something needs reconciling.

---

## 4. Key architectural decisions

### 4.1 Persistent product identity across seasons

Today, `individual_chemicals`, `fertilizer_products`, and `seed_varieties` are recreated with brand-new row IDs every time a season is copied (`src/lib/seasonImport.ts`), matched only by exact `product_name` string during the copy. This is fine for cost calculation but breaks any concept of physical inventory, since inventory is a real-world quantity that doesn't reset on January 1st.

**Decision:** introduce a new `master_products` table as the persistent identity anchor. Each season-scoped row (`individual_chemicals`, `fertilizer_products`, `seed_varieties`) gains a `master_product_id` foreign key. The season-scoped tables, programs, cost templates, and all existing price/crop-type/season-specific behavior are otherwise unchanged — this is additive, not a replacement.

`seasonImport.ts` already builds a `productIdMap` by matching old→new rows on exact name. Extend this same matching step to also copy `master_product_id` forward onto the newly inserted row, so season rollover requires no new manual linking step from the user.

Products created directly in the Products page mid-season (not via import) always create a brand-new `master_products` row — there is no "link to an existing master product" flow needed for that path, since a brand-new product has nothing to link to.

**Migration note:** existing historical data has no `master_product_id`. A one-time backfill should, per farm, group existing `individual_chemicals` / `fertilizer_products` / `seed_varieties` rows by exact `product_name` across all seasons and create one `master_products` row per distinct name, linking all matching rows to it. Name variants that don't match exactly (e.g. "Roundup PowerMax" vs. "Round-Up PowerMax") will **not** auto-merge and will become separate master products — flag this as a known limitation; a manual "merge master products" utility is out of scope for this release but may be worth a follow-up if it proves painful.

### 4.2 Programs and crop-type stay season-scoped

`chemical_programs`, `fertilizer_programs`, and their `_items` junction tables are **not** changed to persist across seasons — they continue to be recomposed or copied per season exactly as today (via `SeasonImportWizard` / `seasonImport.ts`). Only the underlying product identity persists.

### 4.3 Farm scoping is new plumbing, not a reused pattern

Today, `individual_chemicals`, `fertilizer_products`, and `seed_varieties` have no `farm_id` column at all — they're scoped by `season_id`, and their RLS policies check `user_id = auth.uid() OR is_team_member_of(user_id)` (see `20260305193038_consolidate_multiple_permissive_policies.sql`), i.e. scoped to the *owning user*, not the farm. A user who owns two farms currently has all products pooled under one RLS check; only `season_id` happens to separate them.

The `seasons` table has a real farm-scoped pattern already (`20260218055206_add_farms_table_and_farm_id_to_seasons.sql` / `20260305192931_...sql`): a nullable `farm_id` column plus policies checking `farms.owner_user_id` and accepted `team_members.farm_id`.

**Decision:** every new table introduced by this feature (`master_products`, `inventory_ledger_entries`, `work_orders` and its children, `shopping_lists` and its children) gets its own `farm_id` column and RLS policies modeled on the `seasons` pattern — not on the older per-user product pattern. This is genuinely new work, not a copy-paste of an existing product-table policy.

### 4.4 Generic ledger, generic across product categories

The inventory ledger is built with a `product_category` discriminator (`'chemical' | 'fertilizer' | 'seed'`) even though fertilizer will not write any rows to it in this release. This is a zero-cost design choice now that avoids a schema migration when the deferred fertilizer usage-tracker project (§8) gets built.

---

## 5. Data model (new / modified tables)

Field lists below are intent-level for Bolt to implement; exact SQL types, indexes, and RLS SQL are an implementation detail, but the RLS *pattern* in §4.3 is a hard requirement, not a suggestion.

### 5.1 `master_products` (new)

| Column | Notes |
|---|---|
| `id` | PK |
| `farm_id` | FK → `farms`. Scoping key. |
| `product_category` | enum: `chemical`, `fertilizer`, `seed` |
| `canonical_name` | Display name, independent of any one season's naming |
| `unit_type` | The unit on-hand quantity and ledger entries are expressed in — matches the unit family already used by that product's `price_per_unit` (e.g. `gal`, `lbs`, `bag`) |
| `on_hand_quantity` | Denormalized cache, sum of ledger entries. **Null/unused for `fertilizer`.** Updated transactionally whenever a ledger entry is written, same pattern as `field_costs.total_cost_per_acre` being denormalized from template/override data. |
| `created_at` / `updated_at` | |

### 5.2 `inventory_ledger_entries` (new)

Applies to `chemical` and `seed` categories only in this release; not written for `fertilizer`.

| Column | Notes |
|---|---|
| `id` | PK |
| `farm_id` | Denormalized for simple RLS checks (avoids a join on every row) |
| `master_product_id` | FK → `master_products` |
| `entry_type` | enum: `purchase`, `consumption`, `manual_adjustment`, `reversal` |
| `quantity_delta` | Positive for purchase/manual increase, negative for consumption/manual decrease |
| `source_type` | enum, nullable: `shopping_list_line`, `work_order`, `manual` |
| `source_id` | Nullable FK to the originating `shopping_list_lines.id` or `work_orders.id` |
| `note` | Nullable free text (e.g. reason for a manual adjustment) |
| `created_by` | User who made the entry |
| `created_at` | |

Manual adjustment is always available regardless of any other state (per explicit requirement) — a simple form on the Products page: pick a product, enter a signed quantity and an optional note, writes one `manual_adjustment` row and updates the cache.

### 5.3 Season-scoped product tables (modified)

`individual_chemicals`, `fertilizer_products`, `seed_varieties` each gain:

| Column | Notes |
|---|---|
| `master_product_id` | FK → `master_products`. Nullable during backfill migration, required for all new rows going forward. |

### 5.4 `work_orders` (new)

One row per **program card**, matching how `useSprayPlanner.ts` already builds one `WorkOrderResult` per selected program (even when multiple programs are generated together in one planner session — confirmed each gets its own independent record; see §7.3).

| Column | Notes |
|---|---|
| `id` | PK |
| `farm_id` | |
| `season_id` | |
| `chemical_program_id` | FK → `chemical_programs` |
| `program_name_snapshot` | Captured at save time, so history stays legible even if the program is later renamed or deleted |
| `status` | enum: `draft`, `applied` |
| `applied_date` | Nullable date; required when `status = applied` |
| `effective_acres` | Snapshot at save time (post any acre override) |
| `spray_volume_gal_per_acre` | Nullable, snapshot |
| `created_by`, `created_at`, `updated_at` | |

### 5.5 `work_order_fields` (new, junction)

| Column | Notes |
|---|---|
| `id` | PK |
| `work_order_id` | FK |
| `field_id` | FK → `fields` |
| `acreage` | Snapshot at save time |

### 5.6 `work_order_lines` (new)

| Column | Notes |
|---|---|
| `id` | PK |
| `work_order_id` | FK |
| `master_product_id` | FK → `master_products`. See §7.4 on ad hoc line handling — after graduation, this should always be populated. |
| `chemical_name_snapshot` | |
| `rate_per_acre`, `rate_unit` | |
| `total_quantity` | Computed at save time (`effective_acres × rate_per_acre`, unit-converted to the master product's `unit_type` using `unitConversions.ts`) |
| `price_per_unit_snapshot`, `price_unit_snapshot` | Cost captured at save time so historical cost doesn't drift if the product's price changes later |
| `is_ad_hoc` | Boolean — true if this line was manually added rather than sourced from the program's stored composition, kept for display/history purposes |
| `notes` | |

### 5.7 `shopping_lists` (new)

One per product category per generation — i.e. a separate list for chemicals, fertilizer, and seed, matching the requirement that different suppliers shouldn't see each other's lines.

| Column | Notes |
|---|---|
| `id` | PK |
| `farm_id`, `season_id` | |
| `product_category` | enum: `chemical`, `fertilizer`, `seed` |
| `label` | e.g. "2027 Chemical Order" |
| `created_at` | |

### 5.8 `shopping_list_lines` (new)

| Column | Notes |
|---|---|
| `id` | PK |
| `shopping_list_id` | FK |
| `master_product_id` | FK |
| `needed_quantity` | Computed at generation time: total required across all fields (via cost templates, see §7.1) minus current on-hand for `chemical`/`seed`; equal to the full required amount for `fertilizer` (no on-hand offset exists) |
| `adjusted_quantity` | Nullable — user's rounded/edited figure; falls back to `needed_quantity` when null |
| `supplier` | Free text, nullable |
| `quoted_price_per_unit` | Nullable |
| `purchased_quantity`, `purchased_price_per_unit` | Nullable — the final numbers once a purchase is confirmed; may differ from `adjusted_quantity` (e.g. rounding up to a full drum) |
| `status` | enum: `needed`, `quoted`, `purchased` |
| `purchased_at` | Nullable timestamp |

---

## 6. Feature specs

### 6.1 Products page — Inventory

- Add an on-hand quantity column directly to the existing `SeedsTab` and `ChemicalsTab` (per §5.1/5.2 scope — not `FertilizersTab`).
- Add a manual adjustment control (small "+/-" or modal) next to on-hand quantity, always available, writing a `manual_adjustment` ledger row.
- Add a per-product ledger history view (drill-down from the product row) showing purchase / consumption / adjustment / reversal entries chronologically, so the ledger requirement ("a record of what has been done") is visible, not just a backend mechanic.
- New "Shopping Lists" tab alongside the existing Seeds / Fertilizers / Chemicals / Programs tabs in `src/pages/Products.tsx`, covering all three product categories' list-generation and quote-entry workflow (§6.2).

### 6.2 Shopping lists

- **Generation.** For chemicals, reuse/refactor the resolution logic already in `src/pages/reports/chemicals/ChemicalWorkOrders.tsx` (field → `field_costs.template_id` → `cost_templates.chemical_programs` jsonb, with `field_cost_overrides` taking precedence) to compute total quantity needed per product across all fields in the active season. Build the equivalent aggregation fresh for fertilizer (no existing report does this). For seed, reuse the bags-needed logic already in `src/pages/reports/seeds/SeedBagRequirements.tsx`.
- One list per product category per generation, so a chemical supplier's list never shows fertilizer or seed lines and vice versa.
- Each line shows needed quantity (auto-computed) with an editable "adjusted quantity" field for rounding up/down.
- Entering a `quoted_price_per_unit` and supplier is non-committal — just a quote on file, not yet a purchase.
- **Marking Purchased** is an explicit, separate action from entering a price (no stealth inventory additions). It requires (and lets the user edit) a final `purchased_quantity` and `purchased_price_per_unit`, which may differ from the adjusted/quoted figures. On confirm:
  - For `chemical` / `seed`: write a `purchase` ledger entry for `purchased_quantity`, updating `master_products.on_hand_quantity`.
  - For all categories: update the corresponding season-scoped product row's `price_per_unit` to `purchased_price_per_unit` (this is the existing "this is what I'm buying it at for the year" behavior, reusing whatever price-update/cascade mechanism the Products tabs already trigger, e.g. `queueCascadeTask`).
  - Set `status = 'purchased'`, `purchased_at = now()`.
- **Editing a purchased line** is allowed in place (no unmark-then-remark step required). Editing `purchased_quantity` or `purchased_price_per_unit` after the fact adjusts the ledger entry by the delta (for chemical/seed) and re-applies the price update — mirroring how editing an Applied work order behaves (§6.3).

### 6.3 Spray Planner — inventory visibility & persisted work orders

- **Inventory visibility.** While building a work order (before or after clicking Generate), show current on-hand quantity for each chemical involved. This is read-only context, not a new selection mechanism.
- **Low-stock alert.** A simple sufficiency check — if this work order's computed total for a product exceeds current on-hand, show a warning banner (matching the existing amber `AlertTriangle` pattern already used elsewhere, e.g. `SprayPlanner.tsx`'s "select a program" warning). This never blocks Generate or Save.
- **Generate** behaves exactly as it does today — ephemeral, in-memory, freely re-editable via `WorkOrderEditModal`, no persistence.
- **Save** is new. Because `useSprayPlanner.ts` already produces one `WorkOrderResult` per selected program even when multiple programs are generated together in a single session, **Save persists each program card as its own independent `work_orders` record**, each with its own status and (once applied) its own `applied_date` — even though the user will typically save them together right after generating. This was explicitly chosen to avoid an edge case where two programs generated together but sprayed on different actual days would otherwise be forced to share one status/date.
- **Draft vs. Applied.** A saved work order starts as `draft`. Marking it Applied requires entering an application date. Applied work orders remain fully editable (not locked) — editing quantities on an Applied order recalculates and reverses/reapplies the affected `consumption` ledger entries by the delta, while the order stays `Applied`. Separately, an explicit "mark unapplied" action reverts `status` back to `draft` and fully reverses the original consumption ledger entries. These are two distinct actions in the UI, not one.
- **Delete.** Deleting a work order reverses any ledger entries it created (consumption, if it was ever applied) before removing the record.
- **Ad hoc chemical additions.** `WorkOrderEditModal`'s current "Add chemical" flow creates a blank freeform-name row with a synthetic ID (`custom-${uuid}`) — no product picker exists there today (only the Program builder has one). Replace this with a searchable picker against existing `master_products` (category = chemical), auto-filling unit and price, while keeping a "type a new name" fallback for genuinely new products. On save, any line that doesn't match an existing master product **automatically creates a new `individual_chemicals` row (current season) and its backing `master_products` row**, so it becomes a first-class product usable in future programs and cost templates — not an orphaned line item that only exists inside this one work order.
- **Applied consumption.** For this release, marking a work order Applied always consumes the full planned quantity (no partial-application tracking, e.g. "sprayed 80 of 100 acres").

### 6.4 Field Detail — work order history

- Add a new section to `src/pages/FieldDetail.tsx` listing this field's **Applied** work orders (via `work_order_fields`), chronologically, showing program name, date, acreage, and chemicals applied. Draft work orders are intentionally excluded from this view — they remain visible only in Spray Planner, since by definition they haven't happened yet.

---

## 7. Assumptions locked during scoping (for reference)

These were explicitly confirmed and should not be re-litigated during implementation without checking back:

- Master product identity uses a stable ID assigned once; programs and cost templates stay season-scoped.
- Inventory is tracked in the same unit as `price_per_unit`; conversions within a unit family (liquid or dry) reuse the existing `unitConversions.ts` / `toBestPracticalUnit`.
- Shopping list source of truth is cost templates resolved per field (same logic `ChemicalWorkOrders.tsx` already uses for chemicals).
- Shopping list quantity is editable, and entering a price is treated as "this is what I'm buying it at" — no separate quote-comparison UI needed beyond eyeballing entered prices across lines.
- Work orders: Generate unchanged; new Save persists; each program card saves as an independent work order; manual ad hoc chemicals should always resolve to (or create) a real inventory product; application date required to mark Applied; edits to Applied orders reverse/reapply the ledger; "mark unapplied" is a separate explicit action; Applied consumes the full planned amount.
- Ledger: full transaction log, manual adjustment always available, negative on-hand allowed.
- Low-stock alert is a simple sufficiency check at work-order build time — no configurable reorder point.
- Field history section shows Applied work orders only.
- Editor/viewer access mirrors existing patterns (editors can record purchases and mark work orders applied; viewers are read-only).
- Inventory is farm-scoped (see §4.3 for why this requires new RLS work, not reuse of the existing product-table pattern).
- Inventory lives on the Products page (new tab for Shopping Lists; inventory columns added directly to existing Seeds/Chemicals tabs).

---

## 8. Deferred: fertilizer usage/contract tracker

Explicitly out of scope for this release (see §3), but the following groundwork is already included so that project is additive rather than a rework:

- `master_products` already has a `fertilizer` category, giving the future feature a persistent product identity to attach to.
- The ledger schema (`inventory_ledger_entries`) already has a `product_category` discriminator; enabling fertilizer just means writing rows to a table that already exists, not migrating one.
- No fertilizer-specific columns (contracted quantity, contract price, etc.) have been spec'd here, deliberately — the shape of that feature (a locked-quantity contract drawn down by manual usage entries, per the scoping conversation) should be designed fresh once this release is live and its real requirements are clearer, rather than guessed at now.

---

## 9. Out of scope — summary

- Fertilizer on-hand inventory, ledger, or contract/usage tracking (deferred, see §8).
- Seed Planner / planting-event UI / automatic seed consumption.
- Configurable reorder-point thresholds.
- Suppliers master table.
- Cross-farm inventory pooling.
- Partial-application tracking on work orders (planned vs. actual quantity).
- Automatic merging of near-duplicate product names during the master-product backfill migration.

---

## 10. Risks / known gaps

- **Backfill quality depends on exact name matching.** Historical products with inconsistent naming across seasons will become separate, unlinked master products. Worth a manual review pass after migration, especially for chemicals with long purchase histories.
- **Work order save granularity is a deliberate edge-case fix**, not how the user expects to normally operate (they'll usually save program cards together) — worth a quick sanity check with real data once built, to confirm the UI doesn't feel like unnecessary extra clicking when saving several cards from one session at once (e.g. a "Save All" convenience action that still creates independent records underneath may be worth adding).
- **RLS for the new farm-scoped tables is new plumbing** (§4.3) — needs its own test pass for the editor/viewer/multi-farm-owner cases, since there's no existing product-table policy to copy directly.

---

## 11. Suggested build phasing

Given the size of this feature, a phased build is recommended:

1. **Foundation** — `master_products`, `inventory_ledger_entries`, `master_product_id` columns + backfill migration, farm-scoped RLS. No visible UI change yet.
2. **Products page inventory** — on-hand columns, manual adjustment, per-product ledger history view.
3. **Shopping lists** — generation (chemical, fertilizer, seed), quote entry, Mark Purchased flow, price/inventory update on purchase.
4. **Spray Planner persistence** — inventory visibility, low-stock alert, Save/persist work orders, draft/applied/unapplied lifecycle, ad hoc product picker with graduation into `individual_chemicals`.
5. **Field History** — Applied work order section on Field Detail.

Each phase is independently shippable and testable before moving to the next.
