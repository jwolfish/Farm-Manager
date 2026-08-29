# PRD — Farm Manager Remediation

**Product:** Farm Manager (Crop Tracker)
**Repository:** `jwolfish/Farm-Manager` @ `main` (`75d7e4a`)
**Author:** Code review, 29 Aug 2026
**Status:** Ready for implementation
**Companion document:** `Farm-Manager-Code-Review-Summary.md`

---

## 1. Background

Farm Manager is a React 18 / TypeScript / Vite single-page app on Supabase (Postgres + RLS + Auth + Realtime) with one Deno edge function that propagates cost changes across programs, templates, and fields. Farms are shared with collaborators through `team_members`, and a farm-scoped inventory ledger tracks chemical and seed stock.

A full review found five authorization and injection defects, four defects that silently corrupt financial or inventory figures, five performance issues, and no automated verification of any kind (103 TypeScript errors, 136 lint errors, zero tests, no CI).

## 2. Goals

- **G1.** Close every authorization gap so a user can only read and write data for farms they own or have been explicitly invited to, at the granted role.
- **G2.** Make every cost and inventory figure either correct or loudly wrong — never silently wrong.
- **G3.** Make state-changing operations atomic and idempotent.
- **G4.** Establish a verification floor: green typecheck, green lint, tests over financial logic, all enforced in CI.
- **G5.** Reduce initial JS payload and remove unbounded queries.

## 3. Non-goals

New features; visual redesign; migrating off Supabase; adopting a router (recommended, but sequenced after this work); multi-currency or metric-unit support beyond adding missing conversion factors.

## 4. Definitions

| Term | Meaning |
|------|---------|
| Owner | `farms.owner_user_id` — the user who created the farm |
| Collaborator | Row in `team_members` with `status = 'accepted'` |
| Editor | Collaborator with `role = 'editor'` (see WI-5 for `'admin'`) |
| Canonical unit | `master_products.unit_type` for the product in question |
| Cascade | Edge-function propagation of a price change to programs → templates → field costs |

## 5. Workstreams

| # | Workstream | Items | Priority |
|---|-----------|-------|----------|
| A | Authorization & injection | WI-1 … WI-8 | P0 |
| B | Data integrity | WI-9 … WI-14 | P0 / P1 |
| C | Reliability | WI-15 … WI-18 | P1 |
| D | Verification floor | WI-19 … WI-21 | P1 |
| E | Performance | WI-22 … WI-26 | P2 |
| F | Maintainability | WI-27 … WI-30 | P2 / P3 |

---

# Workstream A — Authorization & injection (P0)

## WI-1 — Restrict `team_members` updates to the invitation status

**Priority:** P0 · **Estimate:** M · **Type:** Migration + client

**Problem.** The `Team members can update invitation status` policy (`20260305192931_...sql:816`) allows a full-row update on any row where `invited_user_id = auth.uid()`. An invitee can set `role = 'editor'`, `status = 'accepted'`, and re-point `user_id`/`farm_id` at another owner's farm. The `WITH CHECK` still passes because `invited_user_id` is unchanged.

**Required behaviour.**
1. Owners (`user_id = auth.uid()`) retain full UPDATE rights on their own invitations.
2. Invitees may change **only** `status` (`pending → accepted | declined`) and `accepted_at`, only on rows where `invited_user_id = auth.uid()` **and** the current `status = 'pending'`.
3. Any attempt to change `role`, `user_id`, `farm_id`, `email`, or `invited_user_id` as a non-owner is rejected at the database.

**Implementation.**
- New migration. Drop the combined policy; create `Owners can update their invitations` (`USING`/`WITH CHECK` on `user_id = (SELECT auth.uid())`).
- Create `respond_to_invitation(p_invitation_id uuid, p_accept boolean) RETURNS team_members` as `SECURITY DEFINER SET search_path = public, pg_catalog`. It asserts `invited_user_id = auth.uid()` and `status = 'pending'`, then writes only `status` and `accepted_at`. `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated;`
- Do **not** grant invitees a direct UPDATE policy.
- Update `acceptInvitation()` / `declineInvitation()` in `src/lib/teamMembers.ts:175-215` to call `supabase.rpc('respond_to_invitation', …)`.

**Acceptance criteria.**
- [ ] As user B (invited, `role = 'viewer'`), `UPDATE team_members SET role='editor' WHERE invited_user_id = auth.uid()` affects 0 rows.
- [ ] As user B, `UPDATE team_members SET user_id='<owner A uuid>' …` affects 0 rows.
- [ ] `respond_to_invitation(id, true)` sets `status='accepted'` and `accepted_at`; the row's `role` is unchanged.
- [ ] `respond_to_invitation` on someone else's invitation raises and writes nothing.
- [ ] Calling it twice on the same invitation raises on the second call.
- [ ] Existing accept/decline UI in `Team.tsx` works unchanged.

**Test plan.** pgTAP or a Deno integration test with two seeded users; assert row counts and `role` after each hostile statement. Include the exact attack statements above as regression tests.

---

## WI-2 — Escape all user data in generated HTML reports

**Priority:** P0 · **Estimate:** M · **Type:** Client

**Problem.** `pdfFormatters.ts:85-90` and six sibling modules interpolate `farmName`, `fieldName`, `seasonName`, buyer names, and titles into HTML strings with no escaping. `openPDF()` (`pdfFormatters.ts:96`) opens the result as a `blob:` URL, which is same-origin, so injected script runs with access to the Supabase session in storage.

**Required behaviour.** No user-supplied string reaches an HTML or SVG context unescaped.

**Implementation.**
1. Add to `src/lib/pdfReports/pdfFormatters.ts`:
   ```ts
   export function esc(v: unknown): string {
     return String(v ?? '')
       .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
   }
   ```
2. Wrap **every** dynamic interpolation in: `pdfFormatters.ts` (85, 86, 90), `yoyReport.ts` (32, 50, 84), `costBreakdownReport.ts` (127, 132, 138, 142, 154, 172, 173), `efficiencyReports.ts` (49, 84, 168, 292), `fieldPerformanceReports.ts` (48, 71, 80, 150, 176, 185, 256), `salesReports.ts` (174, 300+), `pdfCharts.ts` (40, 63, 64, 66, 80, 100, 142, 173 — SVG `<text>`), `exports/printExporter.ts` (20).
3. Add an ESLint `no-restricted-syntax` rule, or a unit test that scans these modules for un-`esc`'d `${` inside template literals, to prevent regression.
4. Open the print view in a sandboxed iframe (`sandbox="allow-modals allow-same-origin"` is *not* acceptable — use a null-origin iframe with `srcdoc` and `sandbox="allow-modals"`) rather than a same-origin blob tab. If that breaks `window.print()`, keep the blob but treat escaping as the sole control and document it.

**Acceptance criteria.**
- [ ] A farm named `<img src=x onerror=alert(1)>` renders as literal text in every PDF/print export; no dialog, no network request.
- [ ] The same payload in a field name, season name, and buyer name renders as text.
- [ ] Numeric formatting and existing report layouts are unchanged (snapshot comparison).

**Test plan.** Vitest snapshot tests over each report builder with a fixture set containing `<`, `>`, `&`, `"`, `'`, and a full XSS payload. Manual check in Chrome and Safari that print still works.

---

## WI-3 — Validate cascade task ownership server-side

**Priority:** P0 · **Estimate:** M · **Type:** Edge function + migration

**Problem.** `process-cascade-task/index.ts:437-460` verifies the JWT and that `cascade_tasks.user_id = user.id`, then performs all writes with the **service-role** client using `task.season_id` and `task.entity_id` verbatim. RLS on `cascade_tasks` never checks that the season belongs to a farm the user can reach, and the user may update their own task row after insert. Result: cross-tenant writes to `cost_templates` and `field_costs`.

**Required behaviour.** A cascade may only touch data in a farm where the caller is the owner or an accepted editor.

**Implementation.**
1. In the edge function, after loading the task, resolve `season_id → farm_id → owner_user_id` **using the user-scoped client** (`supabaseUser`) so RLS applies. If the season is not visible to the caller, return `403` and mark the task `failed`.
2. Then assert the caller is owner or accepted editor for that farm; otherwise `403`.
3. Verify `entity_id` belongs to the same `season_id` before cascading (templates already do this at `:172`; add the equivalent for program and product task types).
4. Add a `BEFORE INSERT OR UPDATE` trigger on `cascade_tasks` rejecting rows whose `season_id` the inserting user cannot access, as defence in depth.
5. Keep `supabaseAdmin` only for the writes that genuinely need to cross RLS; prefer the user client for all reads.

**Acceptance criteria.**
- [ ] User B inserts a `cascade_tasks` row with user A's `season_id`: the insert is rejected by the trigger, or the function returns 403 and writes nothing.
- [ ] User B updates their own task's `season_id` to user A's and re-invokes: 403; `cost_templates` and `field_costs` for farm A are byte-identical before and after.
- [ ] An accepted editor on a shared farm can still run a cascade successfully.
- [ ] `result_data.warnings` never contains an ID from a farm the caller cannot access.

**Test plan.** Integration test with two seeded farms; snapshot `field_costs` for farm A, run the hostile cascade, assert no diff.

---

## WI-4 — Enforce farm consistency on inventory-linked rows

**Priority:** P0 · **Estimate:** S · **Type:** Migration

**Problem.** RLS on `inventory_ledger_entries` checks the denormalized `farm_id` only (`20260827025711_...sql:182-231`). Nothing requires `master_product_id` to belong to that farm, so an editor on farm A can drive farm B's `on_hand_quantity` through the `SECURITY DEFINER` trigger. Same gap on `work_order_lines` and `shopping_list_lines`.

**Required behaviour.** A row referencing a `master_product_id` must belong to the same farm as that product.

**Implementation.** Add a `BEFORE INSERT OR UPDATE` trigger on `inventory_ledger_entries`:
```sql
IF NEW.master_product_id IS NOT NULL AND
   NEW.farm_id <> (SELECT farm_id FROM master_products WHERE id = NEW.master_product_id)
THEN RAISE EXCEPTION 'farm_id does not match master product farm'; END IF;
```
For `work_order_lines` and `shopping_list_lines`, resolve the parent's `farm_id` and apply the same assertion.
Alternative (preferred long-term): drop the denormalized `farm_id` and express the policy through the `master_products` join.

**Acceptance criteria.**
- [ ] Inserting a ledger entry with `farm_id = A` and a farm-B product raises.
- [ ] All legitimate inserts from `applyWorkOrder`, `MarkPurchasedModal`, and `InventoryAdjustModal` still succeed.
- [ ] Backfill audit query returns zero mismatched existing rows (or a documented remediation).

---

## WI-5 — Scope team membership to a farm

**Priority:** P0 · **Estimate:** L · **Type:** Migration (wide blast radius)

**Problem.** `is_team_member_of(owner_id)` and `is_editor_of(owner_id)` (`20260503033930_...sql:58-84`) ignore `team_members.farm_id`. One invitation to one farm grants access to every farm and season that owner has. `is_editor_of` also accepts only `role = 'editor'` while the `user_role` enum includes `'admin'` and migration comments claim admin is accepted.

**Required behaviour.** Access is granted per farm, at the granted role.

**Implementation.**
1. Add `is_team_member_of_farm(p_owner uuid, p_farm uuid)` and `is_editor_of_farm(p_owner uuid, p_farm uuid)` — same body plus `AND farm_id = p_farm`, and `AND role IN ('editor','admin')` for the editor variant.
2. Rewrite every policy that calls the old helpers to pass the farm. For tables with `farm_id`, pass it directly; for season-scoped tables, join `seasons.farm_id`; for field-scoped tables, join `fields → seasons.farm_id`.
3. Keep the old helpers as thin wrappers for one release, marked deprecated, then drop them.
4. Decide `'admin'`: either support it end-to-end (add to `TeamRole` in `src/lib/teamMembers.ts:4` and the invite UI) or remove it from the enum. Do not leave it half-wired.

**Acceptance criteria.**
- [ ] Owner A has farms F1 and F2. User B accepted on F1 only. B can read F1's fields, costs, yields, sales, hedges, products, and inventory; B reads **zero** rows from F2.
- [ ] B with `role = 'viewer'` cannot write to F1.
- [ ] B with `role = 'editor'` can write to F1 and not F2.
- [ ] Every existing collaboration flow in `Team.tsx` and `CrossFarmCopyModal.tsx` still works.

**Test plan.** pgTAP matrix over {owner, editor, viewer, stranger} × {own farm, shared farm, other farm} × {select, insert, update, delete} for each protected table. This matrix is the durable artefact — keep it in CI.

---

## WI-6 — Signup and auth hygiene

**Priority:** P1 · **Estimate:** S · **Type:** Client + migration + dashboard

- Map Supabase auth errors to neutral copy in `src/pages/Auth.tsx:70` — signup and login must not distinguish "already registered" from other failures.
- Enforce a password policy on signup (minimum 10 characters; currently only the reset path checks, at 6 — `Auth.tsx:63`).
- Enable Leaked Password Protection in the Supabase dashboard (noted as outstanding in `20260503033930_...sql`).
- Replace the client-side `user_profiles` insert (`AuthContext.tsx:99-112`) with an `AFTER INSERT ON auth.users` trigger, so a profile always exists and confirmation flows do not orphan accounts.

**AC:** identical UI copy for existing vs. new email on signup; a 6-character password is rejected; a user created with email confirmation on has a `user_profiles` row before first login.

---

## WI-7 — CSV formula-injection guard

**Priority:** P1 · **Estimate:** XS · **Type:** Client

In `src/lib/exports/csvExporter.ts:5`, prefix any value whose first character is `=`, `+`, `-`, `@`, `\t`, or `\r` with a single quote before the existing quoting. Emit `\r\n` line endings.

**AC:** a field named `=cmd|'/c calc'!A1` exports as inert text and opens as text in Excel and Google Sheets; round-tripping a normal export is unchanged.

---

## WI-8 — Edge-function and client hardening

**Priority:** P2 · **Estimate:** S

- Replace `Access-Control-Allow-Origin: "*"` (`index.ts:5`) with the deployed origin(s) from an env var.
- Stop rendering raw `error_message` in toasts (`useCascadeTaskNotifications.ts:53`); show a generic message and log the detail.
- Add `noopener,noreferrer` to `window.open` in `printExporter.ts:34`, `pdfFormatters.ts:98`, `yoyReport.ts:161`.
- Strip or gate the 99 `console.*` calls behind `import.meta.env.DEV`.

---

# Workstream B — Data integrity (P0/P1)

## WI-9 — Make work-order apply/unapply atomic and idempotent

**Priority:** P0 · **Estimate:** L · **Type:** Migration + client + UI

**Problem.** `applyWorkOrder()` (`workOrderCrud.ts:200-256`) writes ledger entries and then updates status in a separate request, with no guard on the current status, no uniqueness constraint, and no in-flight disable on the button (`SavedWorkOrdersList.tsx:210-218`). Double-click, a failed status update, or two concurrent collaborators each double-deduct inventory. `unapplyWorkOrder()` mirrors the flaw. An `unapplied` order can never be re-applied because the Apply button renders only for `draft`.

**Required behaviour.**
1. Apply and unapply are single transactions.
2. Apply succeeds only from `draft` or `unapplied`; unapply only from `applied`. Any other current status returns a typed conflict.
3. Re-issuing the same operation is a no-op that reports the current state.
4. The UI disables the control while the mutation is pending and surfaces failures.

**Implementation.**
- `apply_work_order(p_work_order_id uuid) RETURNS work_orders` and `unapply_work_order(...)`, both `SECURITY DEFINER SET search_path = public, pg_catalog`. Each: re-check caller authorization (owner or editor of the order's farm), `SELECT … FOR UPDATE` on the order, assert the expected status, insert ledger rows converted to canonical units (see WI-11), update the status — all in one transaction. Grant EXECUTE to `authenticated` only.
- Migration: `CREATE UNIQUE INDEX work_order_ledger_once ON inventory_ledger_entries (source_id, master_product_id, entry_type) WHERE source_type = 'work_order';`
- Rewrite `applyWorkOrder` / `unapplyWorkOrder` in `workOrderCrud.ts` as thin `rpc()` wrappers returning a discriminated result.
- `useSprayPlanner.ts:565-576`: track `applyingId` state; pass to `SavedWorkOrdersList` to disable the button and show a spinner; show a toast on failure (currently silent).
- Render Apply for both `draft` and `unapplied`.

**Acceptance criteria.**
- [ ] Ten rapid clicks on Apply produce exactly one set of consumption entries and one `applied` status.
- [ ] Two concurrent `apply_work_order` calls: one succeeds, one returns a conflict; on-hand moves by the correct amount once.
- [ ] Simulated failure of the status write leaves **no** ledger entries (transaction rolled back).
- [ ] Apply → Unapply → Apply returns on-hand to the correct value and is available in the UI at each step.
- [ ] A viewer on a shared farm cannot apply.

**Test plan.** Concurrency test issuing two simultaneous RPCs; a UI test clicking Apply ten times in 200 ms; an inventory arithmetic test asserting the on-hand delta.

---

## WI-10 — Make the purchase flow transactional

**Priority:** P0 · **Estimate:** M · **Type:** Migration + client

**Problem.** `MarkPurchasedModal.tsx:54-80` fires reversal and purchase inserts and **discards both error results**, then updates the shopping-list line, then updates the season product price and queues a cascade. A failure at any point leaves inventory or the line inconsistent, and the retry double-posts.

**Required behaviour.** One RPC — `record_purchase(p_line_id uuid, p_quantity numeric, p_price_per_unit numeric)` — performs, in a single transaction: reversal of any prior purchase entry for that line, the new purchase entry (in canonical units), the line update, and the product price update. It returns the new on-hand quantity. The cascade is queued by the client only after the RPC succeeds.

**Acceptance criteria.**
- [ ] Editing a purchase from 100 → 60 leaves on-hand net +60, never +160.
- [ ] Any failure inside the RPC leaves on-hand, the line status, and the product price unchanged.
- [ ] The modal shows a specific error message on failure and does not close.
- [ ] A purchase in `qt` against a product held in `gal` adds the correct converted quantity.

---

## WI-11 — Make unit conversion explicit and total

**Priority:** P0 · **Estimate:** M · **Type:** Shared library

**Problem.** `convertUnits()` returns the **unconverted** amount when no factor exists (`unitConversions.ts:152`, duplicated at `index.ts:37`). Weight↔volume pairs and common units (`L`, `kg`, `mL`, `bag`, `unit`, `seed`, `ac-in`) have no entries, so wrong numbers flow into costs, ledger deltas, and shopping quantities with no signal. The truthiness guard also drops a legitimate `0` factor, and there is no `isFinite` check on the input.

**Required behaviour.**
```ts
export type ConversionResult =
  | { ok: true;  value: number }
  | { ok: false; reason: 'unknown-unit' | 'incompatible-class'; from: string; to: string };

export function convertUnits(from: string, to: string, amount: number): ConversionResult;
```
1. Normalise via an alias table (`lbs|lb|pound` → `lb`, etc.) rather than duplicated key sets.
2. Convert through a base unit per class (mass → gram, volume → millilitre, count → each) instead of an N×N factor matrix.
3. Return `ok: false` for unknown units and for cross-class pairs. Never return an unconverted number as if it were converted.
4. Every caller handles the failure: cost calculators mark the item "unpriced" and warn; `applyWorkOrder` refuses to post and tells the user which line and which units; shopping-list generation flags the line.
5. Guard `!Number.isFinite(amount)`.

**Acceptance criteria.**
- [ ] `convertUnits('lb','gal',5)` → `{ok:false, reason:'incompatible-class'}`.
- [ ] `convertUnits('qt','fl oz',2)` → `{ok:true, value:64}`.
- [ ] Round-trip A→B→A is within 1e-9 for every supported pair.
- [ ] Applying a work order whose rate unit cannot convert to the product unit is blocked with a message naming both units.
- [ ] Existing correct conversions produce byte-identical results to today (golden-file test against the current table).

**Test plan.** Table-driven unit tests over every supported pair plus a fuzz pass on unknown strings. This is the highest-value test suite in the codebase — write it first.

---

## WI-12 — Accumulate shopping-list quantities in canonical units

**Priority:** P0 · **Estimate:** S · **Type:** Client

**Problem.** `shoppingListGeneration.ts:119` and `:279` add `total` to `existing.totalRaw` regardless of each item's `application_rate_unit`, converting only once at the end using the *first-seen* unit.

**Required behaviour.** Resolve the canonical unit (the linked `master_products.unit_type`, else the first-seen unit) up front, convert each item on the way in, and fail the line loudly if any item cannot convert (WI-11).

**AC:** a chemical at 2 qt/ac on 100 ac in program 1 and 16 fl oz/ac on 50 ac in program 2, product held in gallons, produces 56.25 gal — not a mixed-unit sum. A line with an unconvertible item is flagged rather than silently wrong.

---

## WI-13 — Make `saveWorkOrder` atomic

**Priority:** P1 · **Estimate:** M

Replace the three sequential inserts (`workOrderCrud.ts:71-127`, errors merely logged at `:106` and `:125`) with a single `save_work_order(payload jsonb)` RPC that inserts header, fields, and lines in one transaction and returns the ID. The client surfaces failure instead of returning a valid-looking ID.

**AC:** a forced failure on the lines insert leaves **no** `work_orders` row; the UI shows an error; no partial order appears in the list.

---

## WI-14 — Fix `validateSeasonContext` for collaborators

**Priority:** P1 · **Estimate:** S

`transactionUtils.ts:20-24` filters `seasons` on `.eq('user_id', userId)`. Since seasons became farm-scoped, a collaborator passing their own ID fails validation. Resolve visibility through RLS instead — select the season by ID and let the policy decide — and drop the `user_id` filter.

**AC:** an accepted editor on a shared farm passes season validation; a stranger does not.

---

# Workstream C — Reliability (P1)

## WI-15 — Cascade function: honest status and error handling

`index.ts:437-500`. Return a non-2xx status when the inner block failed (today it always returns `{success: true}`). Check `error` on **every** query (`:104, :112, :137, :145, :172, :181, :192, :269`) and fail the task rather than treating a transient error as "not found". Make `pending → running` a conditional update (`.eq('status','pending')`) and exit early when it affects zero rows, so a duplicate invocation cannot run a second concurrent cascade. Persist or remove the discarded result of `recalculate*ProgramCost` at `:322`/`:350` — `programsUpdated` currently counts work that was never written.

**AC:** a forced DB error yields task `failed`, a non-2xx response, and a client error toast; a second invocation of a `running` task is a no-op; `programsUpdated` equals the number of program rows actually changed.

## WI-16 — Fix realtime for shared farms

`useDashboardMetrics.ts:222-231` filters `field_costs` and `field_yields` on the *viewer's* `user_id`, so collaborators get no live updates. Filter by the data's owner (`effectiveUserId`) or by `season_id`. Memoize `loadAll` with `useCallback`, list it in the dependency array, and add a request-sequence guard so a slow response cannot overwrite a newer one.

**AC:** an owner's edit appears on a collaborator's dashboard within the debounce window; rapid season switching never renders the previous season's numbers.

## WI-17 — Field-level revenue allocation

`useReportData.ts:210-225` allocates crop revenue across fields by acreage share, crediting fields that produced nothing. Allocate by each field's share of *harvested bushels* where yields exist, falling back to acreage only when no field in the crop has a yield. Document the chosen rule in the report UI.

**AC:** with two 100-ac corn fields, one at 200 bu/ac and one at 0, all revenue is attributed to the producing field; totals still reconcile to recorded sales.

## WI-18 — Inventory lookup correctness

`workOrderCrud.ts:400-445`: stop keying one map by both UUID and product name; return `{ byId, byName }` and filter the by-name query with `.eq('product_category','chemical')`. `createSeasonChemical` (`:363`) must check the `error` from `.maybeSingle()` and fail loudly rather than inserting a duplicate.

**AC:** a seed and a chemical sharing a name resolve independently; a pre-existing duplicate produces a clear error, not a third row.

---

# Workstream D — Verification floor (P1)

## WI-19 — Green typecheck and lint, enforced

103 `tsc` errors and 136 ESLint errors today; `vite build` succeeds regardless because it does not type-check, so type errors ship.

1. Fix the 38 unused-symbol errors and 6 `prefer-const` (mechanical).
2. Fix the 15 TS2345 / 16 TS2322 errors — several are real nullability bugs (`SeedBagRequirements.tsx:59,75,76` pass `string | null` where `string` is required).
3. Replace the 88 `any` usages in report pages and export modules with generated Supabase row types.
4. Resolve the 24 `exhaustive-deps` warnings deliberately — each is a stale-closure or over-subscription bug (WI-16 is one).

**AC:** `npm run typecheck` and `npm run lint` both exit 0; both run in CI on every PR and block merge.

## WI-20 — Test suite over financial and inventory logic

No tests exist. Add Vitest and cover, in priority order:
1. `unitConversions` — every supported pair, aliases, unknown units, cross-class pairs, round-trips (WI-11).
2. `templateCalculations.calculateTemplateCost` / `calculateFieldTotalCost` — zero, null, and missing-column cases.
3. `shoppingListGeneration` — mixed units, overrides taking precedence over templates, on-hand subtraction, zero-need clamping.
4. Ledger arithmetic — apply/unapply/re-apply and purchase-edit sequences against a running on-hand total.
5. `useReportData` aggregation — a fixture season with known inputs and hand-computed expected outputs.
6. Report HTML escaping snapshots (WI-2).

**AC:** ≥ 80 % line coverage on `src/lib/**`; the suite runs in CI in under 60 s.

## WI-21 — CI pipeline

Add `.github/workflows/ci.yml` running, on every PR: `npm ci` → `typecheck` → `lint` → `test` → `build`. Add a scheduled job running `supabase gen types typescript` and failing if `src/lib/database.types.ts` is out of date (the guide records a past drift incident). Add a job that applies migrations to a scratch database and runs the pgTAP policy matrix from WI-5.

---

# Workstream E — Performance (P2)

## WI-22 — Code-split the bundle

Current production build: `index-*.js` **1,747 kB (465 kB gzip)**, plus `html2canvas` 201 kB and `index.es` 151 kB. `App.tsx` imports all 14 pages eagerly; Recharts, jsPDF, and html2canvas load on first paint.

Convert page imports to `React.lazy` + `Suspense`; dynamic-`import()` the PDF/report modules at the call site; add `build.rollupOptions.output.manualChunks` splitting `recharts`, `jspdf`/`jspdf-autotable`, and `html2canvas`.

**AC:** initial JS ≤ 300 kB gzipped; Dashboard first load makes no request for jsPDF or Recharts; report and export flows still work.

## WI-23 — Bound the override query

`shoppingListGeneration.ts:29-40` and `:188-199` select all visible `field_cost_overrides` for a `cost_item_name` and filter in JS. Add `.in('field_id', fieldIds)` and delete the client-side filter. **AC:** the network payload for a 5-field season contains at most 5 override rows.

## WI-24 — Push report aggregation into SQL

`useReportData.ts:255-290` loads every season, field (with nested costs and yields), and sale, then aggregates in the browser. Add a `season_summary` view or an RPC returning pre-aggregated rows; page the field-level lists. **AC:** the Reports page issues O(1) queries independent of season count and renders a 10-season / 200-field dataset in under 1 s.

## WI-25 — Incremental on-hand maintenance

`20260827025711_...sql:383-415` re-sums the whole ledger per inserted row. Apply the delta incrementally in the row trigger, or convert to a statement-level trigger over the affected products, and add a nightly reconciliation that recomputes from the ledger and reports drift. **AC:** inserting 500 ledger rows completes in linear time; a deliberate drift is detected and corrected by the reconciliation job.

## WI-26 — Bound cascade concurrency and decouple invocation

`index.ts:222` fans out `Promise.all` across every field-cost row; `:288` does a read-modify-write on a JSONB array (concurrent cascades lose writes); `backgroundTasks.ts:87` awaits the full cascade inside one HTTP request, risking the edge-function wall clock on a large season.

Batch updates in chunks of ~25 with a concurrency limiter; replace the JSON read-modify-write with a `jsonb_set` update in SQL; make invocation fire-and-forget and let the existing realtime `cascade_tasks` channel report completion.

**AC:** a 500-field season cascades without timeout; two concurrent cascades on the same template both land.

---

# Workstream F — Maintainability (P2/P3)

## WI-27 — Single source of truth for cost math

`convertUnits`, `calculateCostWithConversion`, `calculateFieldTotalCost`, `recalculateFertilizerProgramCost`, and `recalculateChemicalProgramCost` each exist twice — in `src/lib/` and in the edge function, which cannot import from `src/`. The copies have already diverged (the client version checks query errors and logs cross-season warnings; the edge version does neither).

Create `shared/` holding pure functions with no Supabase import; consume it from the client via a `tsconfig` path alias and from the edge function via a relative import. Alternatively, move the calculation into a Postgres function and call it from both. Add a CI check that fails if the duplicated symbols reappear.

**AC:** exactly one implementation of each; a change to a conversion factor demonstrably affects both client and edge behaviour; WI-11's tests cover the shared copy.

## WI-28 — Deduplicate shopping-list generation

`generateChemicalLines` and `generateFertilizerLines` are ~150 lines each and ~95 % identical. Collapse into `generateLines(category, seasonId, effectiveUserId, farmId)` parameterised by table, join, and program field.

## WI-29 — Decompose `App.tsx` and adopt a router

`App.tsx` is 763 lines holding auth gating, farm selection, season CRUD, the import wizard, delete confirmation, and page dispatch, with navigation in `sessionStorage` and a hand-rolled switch. Extract season management into a `SeasonProvider`, extract farm switching, and adopt React Router so deep links and the back button work.

## WI-30 — Housekeeping

- Rename the package from `vite-react-typescript-starter`; set a real version.
- Generate `database.types.ts` in CI rather than by hand (1,572 lines, previously drifted).
- Replace `console.*` with a small logger that is a no-op in production and routes errors to a reporting service.
- Give every failed write a user-visible outcome — `saveWorkOrder`, `MarkPurchasedModal`, and `handleApplyWorkOrder` currently fail silently.

---

## 6. Delivery plan

| Milestone | Contents | Exit criteria |
|-----------|----------|---------------|
| **M1 — Lock the doors** | WI-1, WI-2, WI-3, WI-4, WI-5 | Policy matrix green; XSS payloads inert; no cross-tenant write reachable |
| **M2 — Trust the numbers** | WI-9 … WI-14, WI-11 first | Double-apply impossible; unit conversion loud; purchase flow atomic |
| **M3 — Safety net** | WI-19, WI-20, WI-21 | CI blocks merge on typecheck, lint, tests, policy matrix |
| **M4 — Resilience** | WI-15 … WI-18, WI-6, WI-7, WI-8 | Cascade reports truthfully; realtime works on shared farms |
| **M5 — Speed** | WI-22 … WI-26 | Initial bundle ≤ 300 kB gzip; no unbounded queries |
| **M6 — Debt** | WI-27 … WI-30 | One implementation of each calculation; router in place |

WI-11 should be implemented **before** WI-9, WI-10, and WI-12, which depend on its result type. WI-5 touches the largest number of policies and should land with the pgTAP matrix from WI-21 already written.

## 7. Risks

- **WI-5 blast radius.** Rewriting every collaboration policy risks locking out legitimate collaborators. Mitigate with the pgTAP matrix written *first* and a staging rehearsal against a production data copy.
- **RPC migration (WI-9, WI-10, WI-13).** Moving writes into `SECURITY DEFINER` functions concentrates trust; each must re-check authorization internally and pin `search_path`.
- **Historical data.** WI-4 and WI-11 may reveal existing inconsistent rows — mismatched farms, quantities recorded in the wrong unit. Each needs an audit query and a documented remediation before the constraint or the hard failure is switched on.
- **No test baseline.** Until WI-20 lands, every change is unverified. Sequence WI-11's tests first so the riskiest math has coverage before it is touched.
