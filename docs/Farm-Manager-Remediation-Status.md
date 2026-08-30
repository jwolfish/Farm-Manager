# Farm Manager Remediation — Status

**Last updated:** 29 Aug 2026 — Round 3 and the CSV fix are **merged to `main`** (PR #1, `b1e3233`)
**Repo:** `jwolfish/Farm-Manager` @ `main`
**Supabase project:** `wvccxjakqwqfmyewclue` (bolt-native-database-63401892)
**Companion docs:** `Farm-Manager-Code-Review-Summary.md`, `Farm-Manager-Remediation-PRD.md`

## How this work is being run

Bolt does the coding, one work item per prompt. Claude writes the prompts, then verifies
each round against GitHub (diff review) and against the live Supabase database (hostile
queries run inside rolled-back transactions). Bolt cannot verify authorization changes
itself — it has no second user account and no way to attempt an attack — so the verify
step is not optional.

Prompts are ordered by Bolt's likelihood of success, not strictly by risk. Every prompt
carries explicit guardrails ("do not refactor outside these files", "pin search_path on
every SECURITY DEFINER function", "regenerate database.types.ts") because Bolt's failure
mode is confident, plausible, incomplete work.

## Completed

### Round 1 — commits `4cdc6de`, `4132982`, `0b5a0e4`

**SEC-2, stored XSS in generated reports — CLOSED.** Added `src/lib/htmlEscape.ts` and
routed every dynamic interpolation through `esc()` across 8 files (pdfFormatters,
yoyReport, costBreakdownReport, efficiencyReports, fieldPerformanceReports, salesReports,
pdfCharts, printExporter). 49 `esc()` call sites. Verified: no unescaped name-like
interpolation remains; `${styles}` and `${el.outerHTML}` correctly left alone; hardcoded
`&amp;` literals not double-encoded. Owner confirmed visually that tags render as literal
text in exported PDFs.

**SEC-1, team_members privilege escalation — CLOSED.** Dropped the policy that allowed an
invitee to rewrite any column on their own row. Replaced with owner-only UPDATE plus
`respond_to_invitation(uuid, boolean)` — SECURITY DEFINER, `search_path` pinned, writes
only `status`, `accepted_at`, `invited_user_id`.

Verified against the live database (all inside rolled-back transactions):

| Attack | Result |
|---|---|
| Self-promote to editor | 0 rows |
| Re-point `user_id` at another owner | 0 rows |
| Direct status update bypassing the RPC | 0 rows |
| Outsider answers another's invitation | Blocked |
| Double accept | Blocked |
| Anonymous caller | Blocked |
| Legitimate accept (invited_user_id set) | Works; role preserved |
| Legitimate accept (invited_user_id NULL, email fallback, mixed case) | Works |

**Defects Bolt introduced, all caught and fixed:** 8 currency `$` symbols deleted from
efficiencyReports/salesReports (Bolt misread `$${` as template syntax); a duplicate
migration file that would break a from-scratch rebuild; `anon` retaining EXECUTE via
Supabase default privileges (a `REVOKE ... FROM PUBLIC` is not sufficient — needs an
explicit `REVOKE ... FROM anon`).

### Round 2 — commits `afc81e2`, `ed5d8e4`, `abb3050`

**LOG-10, cross-farm product links (new finding, not in the original review).**
`seasonImport.ts` copied `master_product_id` verbatim at lines 211/230/262, so a season
imported across a farm boundary kept pointing at the source farm's master products.
Found live: Test Farm's 2026 season had 19 linked chemicals, 18 pointing at T & L
Doolittle's products; 21 rows total were inconsistent across ledger, work-order lines and
shopping-list lines. Fixed by resolving the destination farm from `newSeasonId` inside
`importSeasonData()` and upserting a destination-farm master product per canonical name.

**SEC-4, farm consistency — CLOSED.** Test Farm was disposable, so it was deleted
(cascade removed 1 season, 7 fields, 19 chemicals, 2 work orders, 1 shopping list,
13 ledger rows, 1 master product) rather than repaired. Three T & L products dropped to
0 on-hand — those balances were phantom, created entirely by Test Farm purchases.
Then added triggers `ledger_product_farm_check`, `shopping_list_line_farm_check`,
`work_order_line_farm_check`.

Verified live: 1 farm remains; 0 mismatches across all three tables; cross-farm inserts
blocked on all three; same-farm inserts and ad-hoc lines (null `master_product_id`) still
succeed; PUBLIC can no longer execute `update_master_product_on_hand`.

**SEC-7, CSV formula injection — partially closed.** Guard added, but see Open Items.

Also fixed: double-encoded `&amp;` in two report headings.

### Two missing migration files — reconstructed 29 Aug 2026

Comparing `supabase/migrations/` against the database's own migration history found two
versions applied with no `.sql` file in the repo. Both have been reconstructed from the
live schema and committed. **They must not be re-applied** — the database already records
them as applied; the files exist so the directory can rebuild the schema.

| Version | Name | What it does |
|---|---|---|
| `20260206023520` | `remove_crop_type_from_individual_chemicals` | `ALTER TABLE individual_chemicals DROP COLUMN IF EXISTS crop_type` |
| `20260218020323` | `add_team_sharing_and_notifications` | Creates `app_notifications` + RLS + two indexes |

**A correction to an earlier note in this document.** The first pass at this claimed a
rebuild would produce a database with no `team_members` table. That was wrong:
`team_members` and the `user_role` / `invitation_status` enums are created by
`20260205170031`, the initial schema migration. The check that produced that claim looked
for a table called `notifications`; the table is actually named `app_notifications`.

The real breakage was narrower but still fatal to a rebuild: **`app_notifications` was
created by no local migration, and `20260305192457` runs
`CREATE INDEX ... ON public.app_notifications`.** `CREATE INDEX IF NOT EXISTS` still errors
when the *table* does not exist, so a from-scratch rebuild died there. Two later migrations
(`20260305192931`, `20260305193055`) also reference it.

Reconstruction fidelity was checked rather than assumed: the DDL was executed into a
scratch schema inside a rolled-back transaction and compared against the live table —
7 columns with zero differences in either direction, no missing constraints, 3 policies,
RLS enabled. The scratch schema and the live table were both confirmed untouched
afterwards. The policies are written in the pre-optimisation `auth.uid() = ...` form on
purpose, because `20260305192931` is the migration that rewrites them into
`(SELECT auth.uid()) = ...`, and it would be misleading for this file to arrive already
fixed.

### Round 3 — commits `3e408fd`, `f0077d5` (merged to `main` via PR #1)

Written by Claude directly rather than by Bolt. WI-11 changes the return type of
`convertUnits` and has to be threaded through every call site; a partially-threaded
signature change is exactly Bolt's failure mode, and this round has no database or
deployment step to make Bolt's environment necessary.

**WI-11, unit conversion is now total — CLOSED.**
`convertUnits` returns a discriminated `ConversionResult` and has no path that returns
an unconverted amount. Rewritten around a base unit per class rather than an N×N factor
matrix, with an alias table for spelling. Added the units the PRD listed as missing:
`L`, `mL`, `kg`, `g`, `mg`, `bag`, `seed`, `unit`, `ac-in`.

Two design decisions worth recording:

- **Base units are chosen so every US customary factor is an exact integer below 2^53** —
  mass in nanograms (1 oz = 28,349,523,125 ng), volume in femtolitres
  (1 fl oz = 29,573,529,562,500 fL). IEEE-754 division is correctly rounded, so
  lb→oz is *exactly* 16 and gal→fl oz is *exactly* 128. This is what makes the
  rewrite byte-identical to the old table rather than merely close to it.
- **Counting units do not interconvert.** `bag`, `seed` and `unit` each get their own
  class, because bag↔seed needs a per-product `units_per_bag` this module does not have.
  `bag`→`seed` now fails loudly instead of quietly returning 1:1.
- **Identity always succeeds, even for unrecognised units.** `convertUnits('jug','jug',4)`
  returns 4. No conversion is being performed, so there is nothing to get wrong, and
  making it fail would break products priced in their own free-text unit.

`calculateCostWithConversion` returns the same result type. All 13 call sites handle
failure: cost calculators skip the item and mark it unpriced (`RecalculateProgramResult.
unpricedItems`, plus a cascade warning), the Chemical and Fertilizer Programs pages show
"not costed: cannot convert *x* to *y*" in red on the item row, low-stock comparisons
decline to claim a stock level they cannot compute, and **`applyWorkOrder` /
`unapplyWorkOrder` now refuse the whole operation** and return a message naming the line
and both units. Apply is all-or-nothing by design: posting some lines and skipping others
would leave a plausible, wrong on-hand figure.

`applyWorkOrder`/`unapplyWorkOrder` changed from `Promise<boolean>` to a typed
`WorkOrderApplyResult`; `useSprayPlanner` now surfaces the message in a dismissible
banner via a new `actionError` (kept separate from `error`, which gates the whole page).
That closes part of WI-30's "every failed write gets a user-visible outcome" for this
path, though the in-flight button disable is still WI-9.

**WI-12, canonical accumulation — CLOSED.**
`generateChemicalLines` and `generateFertilizerLines` no longer sum raw quantities and
convert once at the end using the first-seen unit. Contributions are collected per
product, the canonical unit is resolved up front (linked `master_products.unit_type`,
else the first non-blank rate unit), and each contribution is converted on the way in.
Pure logic extracted to `src/lib/shoppingListMath.ts` so it is directly testable.
Unconvertible contributions are excluded and recorded in `issues`; `createShoppingList`
returns `flaggedLines` and `ShoppingListsTab` renders a red banner naming each product
and reason. **The flag is not persisted** — `shopping_list_lines` has no notes column and
Round 3 takes no migrations, so the warning lives only in the generation response.

**WI-20, test suite — PARTIAL (3.5 of 6 planned areas).**
Added Vitest (`npm test`), `vitest.config.ts`, and 4 test files. Tests are excluded from
`tsconfig.app.json` so the 103-error baseline stays comparable.

| PRD area | State |
|---|---|
| 1. `unitConversions` | Done — golden table of all 102 legacy pairs at exact float equality, aliases, unknown units, cross-class, round-trips, invalid amounts |
| 2. `templateCalculations` | Done — zero, null, missing, string-numeric, non-array program columns |
| 3. `shoppingListGeneration` | Done for the accumulation math via `shoppingListMath` |
| 4. Ledger arithmetic | Partial — `inventoryMath` conversion and refusal covered; apply/unapply/re-apply sequencing needs WI-9's RPC |
| 5. `useReportData` aggregation | Not started |
| 6. Report HTML escaping snapshots | Not started |

The ≥80 % coverage target on `src/lib/**` is **not** met and should not be claimed.

**Live-data audit — the risk in PRD §7 is retired for this round.** Every from→to pair
present in the production database was enumerated before the hard failure was switched
on: chemical and inventory paths use `fl oz→gal`, `pt→gal`, `pt→gallon`, `qt→gal`,
`gal→gal`, `lbs→lbs`; fertilizer uses `pound→ton`, `quart→gallon`, `gallon→gallon`.
All are within-class and were already supported. **Zero rows are currently silently
wrong and zero rows would newly fail**, so WI-11 needs no data remediation.

**Edge function updated but NOT deployed.** `process-cascade-task/index.ts` carries the
mirrored conversion module per guardrail 7. Round 3 deploys nothing, so the *deployed*
function still has the old silent-fallback behaviour. Deploy it with Round 5, which
rewrites that function for SEC-3 anyway. Until then the two differ — this is deliberate.

**Dropped deliberately:** the `noopener` recommendation from SEC-8. All three
`window.open` call sites do `if (newWin) newWin.addEventListener('load', () =>
newWin.print())`; `noopener` makes `window.open` return null and would silently break
auto-print. The pages are same-origin blobs, so there is no tabnabbing risk to mitigate.

**Deferred:** edge-function CORS (SEC-8) moved to Round 5, when SEC-3 rewrites and
redeploys that function anyway.

### Round 4 — branch `round-4-transactional-rpcs` — WI-9, WI-10, WI-13

Three migrations, all applied to the live database and verified there. Every RPC is
`SECURITY DEFINER` with `search_path = public, pg_catalog`, revoked from PUBLIC and from
`anon`, granted to `authenticated` only — confirmed via `has_function_privilege`, not by
reading the grant statements.

**New farm-scoped helper.** `can_edit_farm(uuid)` checks `farms.owner_user_id` or an
accepted `team_members` row **for that specific farm** with role `editor`/`admin`. This is
deliberately stricter than the existing `is_editor_of(owner_id)`, which ignores
`team_members.farm_id` and therefore grants access to every farm an owner has (SEC-5).
The new RPCs do not inherit that hole; WI-5 brings the rest of the policies up to it.

**WI-9, apply/unapply — CLOSED.** `apply_work_order(uuid, jsonb)` and
`unapply_work_order(uuid, jsonb)` take a row lock on the work order, assert the expected
status, write every ledger row and update the status in one transaction. Apply now runs
from `draft` **or** `unapplied`, and the UI renders the button for both. The button
disables while a mutation is in flight and shows a spinner.

**Deliberate deviation from the PRD.** The proposed
`CREATE UNIQUE INDEX work_order_ledger_once ON inventory_ledger_entries (source_id,
master_product_id, entry_type) WHERE source_type='work_order'` was **not** created,
because it contradicts WI-9's own acceptance criterion that apply → unapply → apply must
work: the second apply writes a second `consumption` row for the same pair and the index
would reject it. Deleting ledger rows on unapply would satisfy the index but destroy the
audit trail. The real protection is `SELECT ... FOR UPDATE` plus the status assertion in
one transaction, which was tested directly.

That leaves the PRD's *database-level* backstop formally unmet: double-posting is
impossible through the RPCs, but an editor hand-crafting REST calls could still insert
ledger rows directly. **Deferred to Round 5 by decision on 29 Aug 2026**, so that all RLS
policy changes land together — see Next up for the plan.

**Security advisor after these migrations:** seven WARNs, six of them
`authenticated_security_definer_function_executable`. That lint fires on every RPC by
definition, including `respond_to_invitation` from Round 1 and the pre-existing
`set_active_season`; being callable by signed-in users is the point. No new class of
finding. The one genuine item is `auth_leaked_password_protection`, which is WI-6.

**WI-10, purchases — CLOSED.** `record_purchase(uuid, numeric, numeric, numeric)` does the
reversal, the new purchase, the line update and the season price update in one
transaction, and returns the new on-hand plus the cascade target. The client queues the
cascade only after the write commits. Rather than reconstructing the previous amount from
`purchased_quantity`, it sums the ledger rows already attached to the line and reverses
that exact total, so an edit always nets to the new quantity from any prior state.

**Bug found while writing it.** The modal updated `seed_varieties.price_per_bag`. That
column does not exist — it is `price_per_unit`. The update failed every time and the error
was discarded, so **seed purchases have never updated the season price or produced a
correct cascade**. This was visible in the TypeScript baseline as a TS2353 on
`MarkPurchasedModal.tsx:124` and had been mis-read as ordinary type drift. Now fixed.

**WI-13, save — CLOSED.** `save_work_order(jsonb)` inserts header, fields and lines in one
transaction and returns the id. `created_by` is taken from `auth.uid()`, not the payload.
The season is checked against the farm. The client surfaces failure instead of returning a
valid-looking id.

**Verified against the live database**, all inside transactions that were rolled back by
raising at the end:

| Attack / case | Result |
|---|---|
| Apply as owner | 1 consumption row, on-hand −5 |
| Second apply (double-click) | Blocked `55000`, still exactly 1 consumption row |
| Unapply | Status `unapplied`, on-hand back to 0 |
| Second unapply | Blocked `55000` |
| **Apply → unapply → re-apply** | Works; 3 ledger rows, net −5 (the case the PRD index would have broken) |
| Zero / negative quantity | Rejected `22023` |
| Stranger applies | Blocked `42501`, status unchanged |
| Anonymous applies | Blocked `42501` |
| Purchase 100, then edit to 60 | Net **+60**, never +160 |
| Edit again to 25 | Net +25 |
| Purchase of 4 qt against a product held in gal | +1 gal |
| Stranger / anonymous purchase | Blocked `42501`, on-hand unchanged |
| Save work order | 2 fields + 1 line, `created_by` = caller |
| Spoofed `created_by` in payload | Ignored; caller recorded |
| Save with a malformed line | Failed `22P02`, **0 orphan work orders** |
| Save with no lines | Rejected `22023` |
| Stranger / anonymous save | Blocked `42501` |

Nothing persisted: leftover fixtures, work-order ledger rows and on-hand were all
re-checked at zero afterwards.

### Round 5 — IN PROGRESS

**Step 1 done: the policy matrix exists and is RED.** The PRD asks for the pgTAP matrix to
be written *before* WI-5 touches anything, so that the fix can be proved rather than
asserted. `supabase/tests/sec5_farm_scoping_matrix.sql` builds its own fixtures — four auth
users, two farms under the same owner, seasons, fields and inventory — runs
{owner, editor, viewer, stranger} × {own farm, other farm} × {select, insert, update}, then
raises so the whole transaction rolls back. pgTAP is not installed on this project, so the
harness is plain PL/pgSQL; it needs no extension and can be pasted into the SQL editor.

**Baseline before WI-5: 20 passed, 8 FAILED.** Every failure is a real hole, confirmed
against the live schema:

| Actor (invited to Farm One only) | Hole |
|---|---|
| editor | reads Farm Two's fields, products and season |
| editor | **inserts a field into Farm Two** |
| editor | **updates Farm Two's inventory** |
| viewer | reads Farm Two's fields, products and season |

What already passes and must keep passing: a viewer cannot write anywhere, and a stranger
sees nothing at all. So the `role` check works; it is only the *farm* dimension that is
missing, exactly as SEC-5 describes.

An early version of the harness reported 10 failures. Two were artifacts of the harness
itself — each actor's successful probe INSERT inflated the next actor's row count. Reads
now exclude probe rows. The 8 above are real.

**Scope of the rewrite: 28 tables, ~80 policies** all calling `is_team_member_of(owner)` or
`is_editor_of(owner)`. Round 4's `can_edit_farm(farm_id)` is already the correct shape and
needs only a `can_view_farm(farm_id)` sibling; the work is threading the resolved farm
through every policy — direct for farm-scoped tables, via `seasons.farm_id` for
season-scoped ones, via `fields → seasons.farm_id` for field-scoped ones.

The PRD proposed two-argument helpers (`is_editor_of_farm(owner, farm)`). The
one-argument form is used instead: the owner is derivable from the farm, and passing both
invites the two to disagree.

**Step 2 done: batch 1 applied — `20260830024657`.** Seven tables, 28 policies, plus
`can_view_farm(farm_id)` and a partial index on `team_members (invited_user_id, farm_id)
WHERE status='accepted'`, since both helpers are now on the hot path for every row check.

| Batch 1 table | Farm resolved by |
|---|---|
| `master_products`, `inventory_ledger_entries`, `shopping_lists`, `shopping_list_lines`, `work_orders` | `farm_id` on the row |
| `work_order_fields`, `work_order_lines` | parent `work_orders.farm_id` |

Policy names are unchanged, so the diff is the predicate only.

**Rehearsed before it was applied.** The whole migration plus the full matrix ran inside a
single transaction that was rolled back by raising at the end: **24 passed, 0 failed**,
with the owner retaining full access to both farms. Only then was it applied for real. The
rollback was confirmed afterwards — no helper, no stray policies, originals intact.

**Matrix after batch 1: 8 failures → 5.** The three that went green are exactly the ones
this batch covered — editor and viewer reading Farm Two's products, and editor updating
Farm Two's inventory. The remaining five are all `fields` and `seasons`, which batch 2
covers. No regressions: owner still reaches both farms, viewer still cannot write.

Verified after applying: `can_view_farm` is SECURITY DEFINER with `search_path` pinned,
`anon` cannot execute it, and **zero policies on the seven tables still reference the old
helpers**. Security advisor shows no new class of finding — no "RLS disabled" or "policy
missing" warnings, which are what a botched policy rewrite would produce.

**Step 3 done: batch 2 applied — `20260830025438`. THE MATRIX IS GREEN.**
47 policies across 17 tables: `farms`, `seasons`, `fields`, the season-scoped product and
program tables, the field-scoped cost and yield tables, and the two program-item tables.
**28 passed, 0 failed** — SEC-5 is closed for every table the matrix exercises.

Three decisions worth recording:

1. **The `auth.uid() = user_id` half of each predicate was kept.** It was already there and
   it was never the hole — the hole was `is_editor_of(user_id)` ignoring
   `team_members.farm_id`. Keeping it means a row whose season has a NULL `farm_id` cannot
   silently become invisible to the person who created it. `seasons.farm_id` is nullable,
   so that is a live possibility even though there are no NULLs today.
2. **DELETE policies were deliberately left alone.** On these tables they are
   `auth.uid() = user_id` and never referenced the helpers. Converting them to
   `can_edit_farm` would *widen* them to let any editor delete — a product decision, not a
   security fix.
3. **The migration is written as a loop over a table → farm-expression mapping**, not 47
   spelled-out policies. The first draft was generated as explicit SQL and emitted a stray
   semicolon before every `WITH CHECK`, which would have failed on all 17 UPDATE policies.
   The mapping is the only interesting content; generating the boilerplate removes the
   transcription risk. It is replay-safe: a second run matches nothing and reports that,
   and any count other than 0 or 47 aborts.

Rehearsed the same way as batch 1 — migration plus matrix in one rolled-back transaction,
**47 rewritten, 40 assertions passed, 0 failed** — then applied. Post-apply checks: 75
policies now farm-scoped, and **no table anywhere in `public` has RLS disabled or zero
policies**, which is what a rewrite that orphaned a table would look like.

**Four policies still use the old helpers**, all SELECT, all deferred to batch 3 because
they need their own semantics rather than a farm lookup:

| Policy | Why it is different |
|---|---|
| `user_profiles.SELECT` | A profile is not farm-scoped; the rule is "someone who invited me" |
| `cascade_tasks.SELECT` | Tasks are per-user and season-scoped; ties into SEC-3 |
| `field_chemical_applications.SELECT` | Reached via `field_cost_id → field_costs → fields` |
| `field_fertilizer_applications.SELECT` | Same shape |

While mapping those, a separate pre-existing bug surfaced: the INSERT/UPDATE/DELETE
policies on both `field_*_applications` tables check `field_costs.user_id = auth.uid()`
only, with no collaborator path at all — **an editor on a shared farm cannot write them**.
That is a collaboration bug rather than a security hole, and belongs with batch 3.

**Also worth knowing: `team_members` currently has zero rows.** No collaboration is live in
production, so this whole area has been changing behaviour that nothing exercises yet. It
lowers the risk of these batches considerably, and it means the matrix — not production
usage — is the only thing actually testing collaboration.

**Step 4 done: batch 3 applied — `20260830030406`. SEC-5 / WI-5 IS CLOSED.**

| Change | Detail |
|---|---|
| `user_profiles.SELECT` | You, or someone who owns a farm you can view. Tighter than before: the farm must still exist and the membership still be accepted |
| `cascade_tasks.SELECT` | The task's owner, or anyone who can view the farm its season belongs to. Previously any collaborator of the owner saw every task on every farm |
| `field_chemical_applications` ×4 | Farm-scoped through `field_cost_id → field_costs → fields → seasons` |
| `field_fertilizer_applications` ×4 | Same |
| `is_team_member_of(uuid)`, `is_editor_of(uuid)` | **Dropped** |

**The `field_*_applications` write bug is fixed.** Their INSERT/UPDATE/DELETE policies
checked `field_costs.user_id = auth.uid()` and nothing else, so an accepted editor on a
shared farm could not write them at all. That contradicted WI-5's own acceptance criterion,
so fixing it completes WI-5 rather than widening scope. It does widen those three commands
— an editor on the farm can now write them, which is the intended behaviour.

**The helpers were dropped rather than deprecated.** The PRD suggested keeping them as
thin wrappers for one release. They are gone instead: a wrapper that silently ignores the
farm is precisely the trap that caused SEC-5, and leaving it callable invites its reuse.
The migration refuses to drop them if any policy still references them.

**Final state, measured:** 0 policies reference the old helpers · 0 helpers remain ·
**85 farm-scoped policies** · no table in `public` has RLS disabled or zero policies.

**Final matrix: 56 assertions, 0 failures — MATRIX GREEN.** The committed harness in
`supabase/tests/` is the exact version that produced that result, now covering all four
actors against farm-scoped, season-scoped, field-scoped, profile, cascade-task and
field-application tables.

The matrix's own history: 8 failures before WI-5 → 5 after batch 1 → 0 after batch 2 →
still 0 after batch 3 with 28 more assertions added.

**Step 5 done: the WI-9 ledger backstop — `20260830030908`.** A client may now write only
`source_type = 'manual'` ledger rows. `work_order` and `shopping_list_line` entries are
written exclusively by the SECURITY DEFINER RPCs, which run as the function owner and are
not subject to these policies. UPDATE and DELETE are restricted the same way, and UPDATE's
`WITH CHECK` also requires `manual`, so a caller cannot insert a manual row and relabel it.

This is the intent of the PRD's proposed unique index without the conflict that made it
unusable (it would have blocked apply → unapply → re-apply). Rehearsed and verified:

| Case | Result |
|---|---|
| Manual adjustment | allowed |
| Hand-crafted `work_order` row | refused |
| Hand-crafted `shopping_list_line` row | refused |
| Relabel a manual row as `work_order` | refused |
| Delete an RPC-created row | refused |
| **`apply_work_order` RPC** | **still works** |
| **`record_purchase` RPC** | **still works** |

It deliberately does not stop a large manual adjustment — someone has to be able to correct
a miscount, and manual rows are attributable via `created_by` and show in the ledger
history as manual rather than masquerading as a work order.

**Step 6 done: SEC-3 / WI-3 — CLOSED. `20260830031123` plus edge function version 8.**

The hole: the function verified the JWT and that the task belonged to the caller, then did
every write with the **service-role** client using `task.season_id` and `task.entity_id`
verbatim. Nothing checked that the season belonged to a farm the caller could reach, and
the caller could update their own task row after inserting it.

Two halves, both applied:

1. **Database trigger** on `cascade_tasks`. Rejects inserting a task for a season you
   cannot edit, and rejects re-pointing an existing task at one. Verified: task for own
   season allowed; task for a foreign season refused; re-pointing refused; ordinary status
   updates still allowed; **service-role writes still allowed** — that last one matters,
   because the function writes status and results that way and a naive trigger would have
   broken every cascade.
2. **Edge function.** Resolves the season with the **user-scoped** client so RLS decides
   visibility, then calls `can_edit_farm` to decide authority, then confirms `entity_id`
   lives in that season. Any failure marks the task failed and returns 403 instead of
   letting the service-role client loose on another farm's costs.

**The redeploy outstanding since Round 3 is done.** Version 8 also carries the WI-11
conversion rewrite, so the deployed function no longer silently returns unconverted
amounts. The deployed source was fetched back and compared against the repository copy
rather than assumed.

**SEC-8, partially.** `Access-Control-Allow-Origin` now reads an `ALLOWED_ORIGIN` secret
and falls back to `*` when unset, so the mechanism is in place but **the wildcard is still
live until that secret is set** on the function. It is left permissive by default because
an incorrect origin breaks every cascade with an opaque CORS error, and the value is
deployment-specific. Setting it is the remaining step to close SEC-8.

## Open items

**Migration filenames must match the recorded version.** Applying through the Supabase MCP
stamps its own timestamp, which will not be the one in the filename you wrote. Round 4's
three files were renamed after the fact to match (`203718`, `204336`, `204458`). Check
`list_migrations` against the directory after applying, or a `db push` will try to replay
work that is already in the database.

**Pre-existing, unrelated:** `database.types.ts` declares `set_active_season` with two
arguments; the database function takes one. Evidence that the hand-maintained types have
drifted (WI-30).

### CSV negative-number regression — commit `7c87e07` (merged to `main` via PR #1) — CLOSED

The Round 2 guard `'=+-@\t\r'.includes(s[0])` prefixed any value starting with `-`,
including legitimate negative numbers, so negative net profit exported as text that Excel
would not sort or sum.

**The fix originally sketched in this document was itself incomplete.** It proposed
`!/^-?\d+(\.\d+)?$/.test(s)` as the "is a number" test, which does not match
`CostBreakdownComparison`'s `Change %` column — that exports `r.pct.toFixed(1) + '%'`,
i.e. values like `-12.3%`. Those would have stayed broken. The shipped test is:

```js
const FORMULA_LEAD  = /^[=+\-@\t\r]/;
const PLAIN_NUMBER  = /^[+-]?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?%?$/;
```

so signs, thousands separators, decimals and a trailing percent are all recognised as
numbers, while anything containing an operator (`-1+1`, `-2*3`, `=SUM(A1)`) or a cell
reference (`-$A$1`) is still prefixed. A value passed as a JavaScript `number` skips the
guard entirely, since a number cannot be a formula.

Two small changes came with it: `\r` was added to the quoting condition (it was only
checking `\n`), and the pure parts were split out as `escapeCsvValue` and
`buildCsvContent` so they could be tested without a DOM.

Verified: 28 new tests covering the exact output shapes of all four affected reports, the
WI-7 injection payload, operator-bearing lookalikes such as `-1234.56+SUM(A1)`, header
escaping, and CRLF endings. Full suite 206 passing; typecheck 103; lint 134/28; build
succeeds at 1,754.57 kB (467.64 kB gz), 0.14 kB above Round 3.

This closes the last open item from WI-7.

## Round 3 verification — actually run

Node.js 24.19.0 LTS was installed on the owner's machine (winget, `OpenJS.NodeJS.LTS`),
so the full floor was executed against this branch rather than predicted.

| Check | Result |
|---|---|
| `npm test` | **178 tests in 4 files, all passing**, 3.96 s |
| `npm run typecheck` | **103 errors** — identical to `main` |
| `npm run lint` | **134 errors, 28 warnings** (was 136/28) |
| `npx vite build` | **succeeds**, 7.95 s |

The typecheck result was compared against `main` file-by-file with line positions
stripped, not just by count: **the same 103 errors, in the same files, with the same
codes.** Only line numbers shifted, because Round 3 adds lines. No pre-existing error
was silently fixed and no new one introduced.

The two-error lint drop is the two `prefer-const` fixes in `shoppingListGeneration.ts`,
made in passing while rewriting the accumulators.

Also verified independently:

- **The conversion arithmetic**, by executing the module's logic in a JavaScript engine
  before Node was available: 355 assertions, 0 failures. All 102 pairs from the old
  lookup table reproduce at *exact* float equality (`Object.is`, not `toBeCloseTo`);
  worst round-trip error across every within-class pair was 8.9e-16 against a 1e-9
  requirement; the WI-12 worked example (2 qt/ac × 100 ac + 16 fl oz/ac × 50 ac, held in
  gallons) came out at exactly 56.25 gal. The Vitest suite then reproduced all of this.
- **The live-data audit** described in the Round 3 section, run against the production
  database as read-only queries.

Still not verified: browser behaviour of the changed React components. The new error
banners in `SprayPlanner` and `ShoppingListsTab`, and the "not costed" item rows in the
programs pages, have never been rendered — they are only reachable with data that does
not currently exist in the database (no unconvertible unit pair is present). Worth a
manual look if a product is ever given a unit outside its class.

## Next up — Round 5

Round 5 is the authorization round, and it now has three things to do rather than two.
They all touch RLS, so doing them together means one coordinated set of policy changes and
one verification pass instead of touching policies twice.

1. **SEC-5 / WI-5 — farm-scoped membership.** Large blast radius; best written by hand
   rather than generated. `can_edit_farm(uuid)` from Round 4 is the shape the rest of the
   policies should converge on — it already does the right thing, so WI-5 is largely a
   matter of threading `farm_id` through every policy that currently calls
   `is_editor_of(owner_id)` / `is_team_member_of(owner_id)` and then retiring those two.
2. **SEC-3 — edge function authorization.** **Redeploy `process-cascade-task` in this
   round**: its source carries Round 3's conversion rewrite but the deployed copy still has
   the old silent-fallback behaviour.
3. **The WI-9 ledger backstop, deferred here by decision on 29 Aug 2026.** Round 4 closed
   the double-posting hole inside the RPCs (row lock + status assertion, tested), but the
   PRD also wanted a database-level guarantee that holds outside them. The plan: tighten
   the INSERT policy on `inventory_ledger_entries` so a client can write only
   `source_type = 'manual'` directly, forcing work-order and shopping-list entries through
   `apply_work_order` / `unapply_work_order` / `record_purchase`, which bypass RLS as
   SECURITY DEFINER. Every write path was already surveyed: `InventoryAdjustModal` is the
   only remaining direct writer and it writes `'manual'`. Verify that manual adjustments
   still succeed and that a direct work-order insert is refused.

Round 6 — PERF-1 through PERF-5 and remaining debt.

## Baseline metrics

All figures below are measured, not estimated.

| Metric | Review baseline | After Round 3 | After Round 4 |
|---|---|---|---|
| TypeScript errors | 103 | 103 (identical set) | **99** |
| ESLint | 136 errors, 28 warnings | 134 / 28 | **134 / 28** |
| Tests | 0 | 178 passing, 4 files | **206 passing, 5 files** |
| CI | none | none | none — still WI-21 |
| Main JS chunk | 1,747 kB (465 kB gz) | 1,754.43 kB (467.56 kB gz) | **1,751.97 kB (467.39 kB gz)** |

**The TypeScript baseline dropped 103 → 99.** All four were in `MarkPurchasedModal.tsx`
and all four were eliminated by replacing its hand-rolled write sequence with the
`record_purchase` RPC: the `price_per_bag` TS2353 described above, an associated TS2769
overload failure, and two TS2345s where `string | null` was passed where `string` was
required. No error was suppressed and none was introduced — the remaining 99 are a strict
subset of the previous 103, compared file-by-file with line positions stripped.

The bundle shrank 2.46 kB because the modal's inline ledger logic moved into the database.

**The bundle grew by 5.45 kB raw / 1.86 kB gzipped**, measured against `main` built on the
same machine with the same dependency tree. That is the new code: the unit registry and
alias table, `describeConversionFailure`, `shoppingListMath`, `inventoryMath`, and the two
new warning banners. It is a real regression against PERF-1 and it is accepted — WI-22
targets ≤ 300 kB gzipped and will restructure this chunk entirely.

Note the review's recorded 1,747 kB / 465 kB was slightly optimistic: `main` measures
1,748.98 kB / 465.70 kB today. Use the middle column as the reference point from here on.

Toolchain used for these measurements: Node 24.19.0, npm 11.17.0, Vitest 2.1.9, Vite 5.4.8.
Note that npm 11 blocks package install scripts by default (`core-js` and `esbuild`
postinstalls were skipped); nothing in this project needed them, and both test and build
succeed regardless.
