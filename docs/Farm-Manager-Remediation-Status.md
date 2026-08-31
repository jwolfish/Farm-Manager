# Farm Manager Remediation — Status

**Last updated:** 30 Aug 2026 — Rounds 1–6 (steps 1–3) complete, plus fertilizer F-1 … F-5
**Repo:** `jwolfish/Farm-Manager` — Rounds 1–6 and fertilizer F-1 … F-4a are merged on
`main` **and pushed to origin** (`8fffef5`).
**Branch `f-5-shopping-list-handoff` is NOT yet merged** and carries F-5; F-1 to F-4a are merged.
**Edge function:** `process-cascade-task` **version 12** — deployed 30 Aug, carries WI-15
and the F-1 density bridge. *(A note here previously said version 10; the platform was
already at 11 when F-1 was deployed. The v11 source was fetched and confirmed identical to
the repo's WI-15 copy, so nothing had been changed out of band — the number was just
stale.)*
**Supabase project:** `wvccxjakqwqfmyewclue` (bolt-native-database-63401892)
**Companion docs:** `Farm-Manager-Code-Review-Summary.md`, `Farm-Manager-Remediation-PRD.md`

---

## Start here

**Rounds 1–5 are complete.** Every migration is applied to the live database, the edge
function is deployed at version 8, and the working tree is clean and pushed. Nothing is
half-finished and nothing is waiting to be merged.

| Verified this session | |
|---|---|
| Tests | **206 passing**, 5 files |
| TypeScript | **76 errors** (103 at review, 98 before WI-19) |
| ESLint | **109 errors, 28 warnings** (from 136/28) |
| Build | succeeds — 1,751.91 kB (467.46 kB gz) |
| SEC-5 policy matrix | **56 assertions, 0 failures** |
| Migrations | 56 files, matching the database one-for-one |

**Closed:** SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, SEC-7 · WI-9, WI-10, WI-11, WI-12, WI-13,
WI-14, WI-16 · LOG-1, LOG-2, LOG-3, LOG-4, LOG-7, LOG-8, LOG-10 · plus four collaboration
defects found by testing, none of which were in the original review.

**Partial:** SEC-6 (WI-6 untouched) · SEC-8 (mechanism in place, `ALLOWED_ORIGIN` unset by
choice) · WI-20 (206 tests, but nowhere near the 80 % target).

**WI-19 is under way and has already paid for itself** — see *Round 6* below. Three
defects found by reading the type errors, including a cascade that silently overwrote
manual cost overrides. Remaining, in the order I would do them:

1. **Finish WI-19.** 76 errors left: 32 nullability, ~14 unguarded `Json` casts, 10
   recharts formatter signatures, 15 unused parameters, and the residue. The nullability
   block is the one with real value left in it — it means reconciling the app's
   hand-written interfaces against the schema.
2. **Two ten-minute tests that would close the real gaps**, both cheap and both covering
   fixes that this session's successful cascade did *not* touch:
   - **Enter a field cost override, then cascade again.** The override must survive. This
     is the only way to exercise the most valuable fix of Round 6 step 3, and
     `field_cost_overrides` has 0 rows so it has never run in anger.
   - **Have the collaborator account create a field or a chemical**, then check it appears
     in Spray Planner, Chemical Work Orders, Seed Bag Requirements and a generated shopping
     list. That is what the seven removed `user_id` filters were about; a collaborator
     merely *viewing* owner-created data looks identical either way.
3. **Round 6 performance** — PERF-1 … PERF-5, chiefly the 1.75 MB bundle.

**Two loose ends deliberately left:** set the `ALLOWED_ORIGIN` secret when there is a
stable production URL, and exercise the `viewer` role in the app.

## How this work is being run

**This changed at Round 3 and the document had not caught up.** Rounds 1–2 were written by
Bolt from prompts Claude wrote. From Round 3 onward Claude has written the code directly,
because these rounds turn on signature changes threaded through many call sites and on
authorization that has to be attacked to be believed — both of which are Bolt's documented
failure mode (confident, plausible, incomplete).

Node was installed on the owner's machine during Round 3, so `npm test`, `tsc`, `eslint`
and `vite build` now run locally and every claim in this document is measured rather than
predicted.

**The working method that actually found things:**

- Database changes are **rehearsed before they are applied** — the migration and its test
  run inside one transaction that ends by raising, so everything rolls back. Only then is
  it applied for real, and the rollback is confirmed afterwards.
- Authorization is not considered fixed until **the attack has been attempted and returned
  zero rows**. Reading a policy and concluding it looks right proved worthless twice.
- Counts are not evidence. Where a baseline could drift, the error **sets** are compared
  with line positions stripped, not the totals.

Rounds 3 and 4 went through branches and pull requests. Round 5 onward was committed
straight to `main`, which meant no diff review before landing — worth reconsidering for
Round 6.

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

### Round 5 — COMPLETE — SEC-5, SEC-3, and the deferred ledger backstop

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

### Invitations never reached anyone — found 30 Aug 2026, fixed

**New finding, not in the original review.** The owner sent a real invitation to a second
address he controls and nothing arrived. It never could have.

**There is no email-sending code anywhere in this project** — no Resend, SendGrid, SMTP,
nor Supabase's own invite API. `sendInvitation()` inserts a `team_members` row and then,
*only if the invited email already has a `user_profiles` row*, sets `invited_user_id` and
creates the in-app notification the Team page reads. Invite anyone who has not signed up
and none of that second half runs.

It did not heal, either. `fetchSharedFarms()` and the notification list both key off
`invited_user_id`, and the RLS policy on `team_members` is
`user_id = auth.uid() OR invited_user_id = auth.uid()` — so the invitee could not see the
row addressed to their own email even after registering with that exact address.

Two things hid it: the function is called `sendInvitation`, and the UI reported
**"Invitation sent to …"**. Both describe something that never happened. The review had
asked whether collaboration was *secure*, and nobody asked whether an invite *arrives*.

**Fix — `20260830033819`.** An AFTER INSERT trigger on `auth.users` links any pending
invitation addressed to the new account's email and creates the notification
`sendInvitation()` would have. The invitee signs up, logs in, and it is waiting. No new UI
was needed, because the existing screens already read exactly those two things. Matching is
case-insensitive, and a guard prevents double-notifying when `sendInvitation()` already
created one.

Verified in a rolled-back transaction: invite linked on signup (with mismatched email
case), notification created, payload shape matches what the Team page reads, and the
invitee can see the row through RLS afterwards.

The Team page copy now says the invitation was *created*, that no email is sent, and that
the recipient needs an account with that address.

**Deliberately not done: actually sending email.** That needs a provider, an API key, and
domain verification to avoid spam folders — a real external dependency. The owner chose the
no-email route for now. Worth revisiting if collaborators are ever people who will not be
told out of band.

### Shared farms never appeared — found 30 Aug 2026, fixed

Immediately after the invitation fix above, the owner signed up as the invitee, accepted
successfully, and still saw only their own default farm. The database was correct in every
respect — `status = 'accepted'`, `invited_user_id` linked, and as the invitee every needed
row was visible through RLS: the membership, the farm, the owner's profile, all three
seasons. The fault was entirely client-side.

`fetchSharedFarms()` asked PostgREST to embed the owner's profile like this:

```
owner_profile:user_profiles!team_members_user_id_fkey(email)
```

`team_members_user_id_fkey` is a foreign key to **`auth.users`**, not to `user_profiles`,
and there is no foreign key between `team_members` and `user_profiles` at all. The
relationship cannot resolve, so the request errored, the function logged it to the console
and returned `[]`. **No shared farm has ever appeared for anyone** — which is why
`team_members` sat at zero rows and collaboration looked untested rather than broken.

**The type checker had been reporting this the whole time.** The error removed by the fix
was:

```
TS2352: Conversion of type
  SelectQueryError<"could not find the relation between team_members and user_profiles">
```

The generated Supabase types encode failed relationships as an error type, so `tsc` was
naming the exact bug in plain language. It sat inside the 103 pre-existing errors that this
whole remediation has been treating as background noise. **That is the strongest argument
yet for WI-19**: the baseline is not just untidy, it is actively hiding real defects. This
one broke an entire feature.

**Fix:** the owner's profile is fetched in a separate query keyed by `user_id` rather than
embedded. `farms(farm_name)` is a genuine foreign key and still embeds fine. As a bonus
`ownerName` is now populated — it was previously hardcoded `null`. No schema change, and no
dependency on every owner having a profile row.

TypeScript baseline drops 99 → 98, entirely from removing that error.

### The collaboration cluster — found and fixed 30 Aug 2026

Four defects, one root cause: **the client had never been run by a second user.** The
database work was sound; every one of these lived in the app. Each fix exposed the next,
which is what made them findable at all.

| # | Defect | Fix |
|---|---|---|
| 1 | Invitations reached nobody — no email code exists, and the in-app notification was only created if the invitee already had an account | Trigger links pending invites at signup (`20260830033819`) |
| 2 | Shared farms never appeared — `fetchSharedFarms` embedded `user_profiles` through a foreign key that points at `auth.users` | Fetch the owner profile in a separate query |
| 3 | Dashboard, Fields, Products, Yields, Sales, Reports empty for a collaborator — reads filtered on the viewer's `user_id` | Dropped those filters; RLS is farm-scoped since Round 5. Also closes WI-14 |
| 4 | Dashboard realtime never fired **for anyone** | Publish the five tables (`20260830040519`) + drop the `user_id` subscription filters |

**On #4, the review was right but understated.** LOG-7 recorded "realtime filters on the
viewer's user_id, so collaborators get no live updates". True — but `supabase_realtime`
published only `cascade_tasks`, so Postgres never emitted a change for `fields`,
`field_costs`, `field_yields`, `commodity_sales` or `commodity_hedges` at all. The filter
never mattered because there were no events to filter. Fixing the filter alone, as the
review proposed, would have changed nothing observable.

The review's suggested filter — `effectiveUserId` — would also be wrong now. Writes stamp
the actual author, so a yield entered by a collaborator carries *their* id and the owner's
id would miss it. Neither user id means "rows for this farm". RLS does, and Realtime
applies RLS per subscriber, so the correct filter is none.

**Deferred by decision: exercising the `viewer` role in the app.** The matrix proves a
viewer can read and cannot write at the database level, and every defect above lived in the
client rather than the database — so read-only access has the same "never actually run"
exposure that produced this cluster. Not urgent; worth doing before anyone is given a
viewer invitation in earnest.

### Round 6, step 1 — `database.types.ts` regenerated — branch `wi-19-type-baseline`

WI-19 opened by regenerating the hand-maintained types file rather than by fixing errors,
so that no effort was spent hand-patching errors regeneration would delete. **Committed on
a branch, not straight to `main`** — the practice note above says Round 5's
commit-direct-to-main left no diff review, and this diff is 1,662 insertions.

**The drift ran in both directions, and the second direction is the instructive one.**

| Direction | Finding |
|---|---|
| Missing from the types file | `shopping_lists`, `shopping_list_lines` — both real, both in use (5 and 42 rows) |
| Declared but not in the database | `field_chemical_program_applications`, `field_fertilizer_program_applications` — created `20260205182505`, dropped `20260217214952`, still declared 6 months later |
| Missing function | `can_view_farm`, added by Round 5 batch 1 |
| Wrong arity | `set_active_season` declared with two arguments; the function takes one |
| Wrong nullability | Widespread — `seasons.is_active`, `created_at`, `updated_at` declared non-null; all three are nullable |

The two dropped junction tables are referenced by **nothing** outside the types file, so
they were dead declarations rather than a live bug. Verified by grep across `src/` and the
edge function.

**TypeScript: 98 → 103. The rise is the point, and it is fully accounted for.**

- **12 resolved.** The entire `ShoppingListsTab` cluster (6) and `shoppingListGeneration`
  (4) — both features were falling through to the `never` table-name overload and were
  effectively untyped. Plus `set_active_season` and one in `farms.ts`.
- **17 revealed.** Mostly nullability the old file suppressed by declaring nullable columns
  non-null. The largest cluster is 11 in `App.tsx` from `Season.is_active`, declared
  `boolean` against a column that is `boolean | null`.

**The `set_active_season` error deserves a note about what stale types cost.** `App.tsx:216`
passes the *correct* single argument; the types file was wrong, so the compiler was
reporting correct code as broken. Noise in that direction is worse than a missing error —
it is what trains a reader to ignore the compiler, which is how the `fetchSharedFarms`
message survived in plain sight.

**The revealed nullability is latent, not live.** Production has 4 seasons and **zero**
NULLs in `is_active`, `created_at` or `updated_at`, so nothing is misbehaving today. The
columns permit NULL and the app assumes they do not; that is a trap, not a current defect.

Floor after the change: **tests 206 passing** (unchanged), **ESLint 134/28** (unchanged),
**build 1,751.96 kB** (byte-identical — types are erased, so this is the expected result
and a change here would have meant something was wrong).

### Round 6, step 2 — the triage, and what it found — commits `e90c377`, `60ed646`

**The thesis held.** Reading the errors rather than fixing them found three defects, one
of which is worse than anything the original review recorded.

**1. Seven more collaboration filters — the second variant.** Yesterday's defect #3 removed
`.eq('user_id', viewer.id)`, which made a collaborator see nothing at all. A different
shape survived that sweep: `.eq('user_id', effectiveUserId)`, where `effectiveUserId` is
the *owner's* id. That shows the owner's rows but hides rows **the collaborator created
themselves**, because writes stamp the real author (`Fields.tsx:185`).

Removed from `useSprayPlanner` ×2, `shoppingListGeneration` ×3, `ChemicalWorkOrders`,
`SeedBagRequirements`. All seven still filter by `season_id`, so scope is unchanged. The
six remaining `.eq('user_id', …)` calls are correct — three on `team_members`, where
`user_id` genuinely is the owner, plus season delete guards.

**Proven, not assumed.** In a rolled-back transaction, a field entered by the accepted
collaborator on the owner's season: **31 rows without the filter, 30 with it.** Rollback
confirmed — 0 probe rows, 92 fields, untouched. Live data has 1 accepted team member and
0 non-owner-authored rows, so this was armed and had not yet fired.

**2. Every template cascade told the user it had failed.** `CascadeUpdateModal` did
`const result = await onConfirm(); if (result.errors.length ...)`, but
`handleCascadeConfirm` returns nothing on every path — it reports through
`addNotification`. So `result` was `undefined`, `result.errors` threw, the modal's own
catch fired, and the user got *"An error occurred while updating the template"* after a
cascade that had just succeeded. Fixed by correcting the modal's contract rather than
adding a second reporting path.

**3. A failed cascade read silently overwrote manual cost overrides.** The worst of the
three, and it was in no review document. `cascadeTemplateUpdate` read
`field_cost_overrides` and applied `|| []` to the result. That map is the **only** thing
stopping the cascade from overwriting a field's manually-overridden costs, so a failed
read replaced every override with the template value — no error, no warning, wrong money.
It now refuses the whole cascade if either read fails, on the same all-or-nothing rule
WI-11 applied to `applyWorkOrder`. Four further reads in that file returned
`{success: true}` with zero counts after a failed query, making "found nothing to do"
indistinguishable from "never ran"; all four are now checked.

**Then the mechanical sweep:** 25 unused imports, types and dead locals, driven by tsc's
own output and diffed before and after — 25 removed, **zero new**. Four were checked
individually rather than deleted blind; all four were genuinely dead, including a
`generate` in `useSprayPlanner` superseded by `generateWithInventory`.

**Measured after Round 6 step 2:**

| | Before WI-19 | After |
|---|---|---|
| TypeScript | 98 | **76** |
| ESLint | 134 errors, 28 warnings | **109 errors, 28 warnings** |
| Tests | 206 passing | **206 passing** |
| Build | 1,751.96 kB | **1,751.91 kB** |

**Not verified in a browser.** All three defects are reachable only with a second signed-in
user, or with a cost template in use, and neither exists in this database. The
collaboration fix is proven at the database level; the other two are proven by reading.

**Fifteen unused symbols remain, all function parameters, left deliberately.** One is a
real gap rather than dead weight: `cascadeTemplateUpdateInSeason` accepts a `taskId` and
never uses it, so cascade warnings from the template path are never logged against the
task — its sibling `cascadeProgramUpdateInSeason` does log them. The rest sit on
signatures mirrored in the edge function (guardrail 7) and should change on both sides at
once or not at all.

### Round 6, step 3 — WI-15 — CLOSED — commit `ffe763f`, edge function **version 10**

**The headline is not WI-15.** While reading the function for WI-15, the
override-overwriting bug fixed on the client in `e90c377` turned out to be present here
too — and this is the copy that actually runs. `cascadeTemplateUpdateInSeason` read
`field_cost_overrides` with the error discarded and then `overrideRows || []`, so a failed
read produced an empty override map and every manually-overridden cost was silently
replaced by the template value.

**Guardrail 7, demonstrated.** The code exists twice and the morning's fix landed on one
side only. The two are now consistent again.

Latent today — `field_cost_overrides` has 0 rows — but it arms the first time an override
is entered.

**WI-15 proper, five parts:**

| | |
|---|---|
| Ten unchecked reads | New `must()` helper throws on a Postgrest error; every cascade read routed through it. The old pattern made a failed query indistinguishable from an empty result |
| One read deliberately *not* wrapped | The `result_data` re-read before the final update. The cascade has already succeeded by then, so failing there would report a completed cascade as failed — the exact inversion WI-15 exists to remove. It records a warning instead |
| `pending → running` | Was unconditional, so a duplicate invocation ran a second cascade concurrently. Now conditional on the task still being `pending`; the loser returns `already-claimed` without redoing the work. Also writes `started_at`, which has existed on the table all along and was never set |
| `{success: true}` after failure | The task row was already marked `failed`, but the function fell through to an unconditional 200. Failure now returns 500 with the message; success returns the real counts |
| The discarded recalc result | **Answered "remove", not "persist".** `runCascadeProductUpdate`/`ChemicalUpdate` called `recalculate*ProgramCost` and threw the result away, then called `cascadeProgramUpdateInSeason`, which recalculates internally and writes the result into the templates. So it was two wasted queries per program, not a lost write — and there is no stored cost column on `*_programs` to persist to |

**Verification — read this before trusting it.**

- Syntax checked with esbuild (which ships with Vite). **Not typechecked: Deno is not
  installed on this machine.**
- The deployed source was fetched back after deploying and compared against the repository
  copy, as Round 5 did. Every marker matches — 10 `must()` call sites, the conditional
  claim, the 500 path, `already-claimed`, zero remaining redundant recalc calls, and the
  em-dashes in the conversion comments round-tripped without mojibake.
- **Functionally confirmed by the owner, 30 Aug, in the running app.** A chemical price was
  changed; cost templates updated, the dashboard reflected the new cost per bushel, and a
  second editor account with the app open saw the change **live, without a reload**.
  That single test covers three separate pieces of work: the v10 deploy runs clean under a
  real JWT (which matters, because it could not be typechecked here), the cascade
  propagates chemical → programs → templates → field costs → dashboard, and Realtime works
  across two accounts — the first time a second account has exercised the collaboration
  work in the app rather than in a test harness.
- **What that test did not exercise, and still has not been:**
  - *The override guard* — the most valuable fix in this round. `field_cost_overrides` has
    0 rows, so there was no override for the cascade to protect. Untested in anger.
  - *Every failure path* — `must()` throwing, the 500 response, `already-claimed`. These
    fire only when a query fails or a task is invoked twice.
  - *The seven `user_id` read filters* — these only matter for rows a **collaborator
    creates**. A second account viewing owner-created data would look identical either way.
- Rollback if needed: version 9 is the previous deployment.

Floor unchanged: TypeScript 76, tests 206 passing, ESLint 109/28.

### Fertilizer contract tracking — F-1 — branch `f-1-fertilizer-density`

New feature work rather than remediation. The design and the reasoning behind every
decision are in `Fertilizer-Contract-Tracking-Design.md`; F-1 is the first of six steps
and the only one that touches existing cost math.

**Liquid fertilizer density.** 6-24-6 is a liquid sold by the ton and applied through the
planter in gallons. Mass and volume do not interconvert, so that pair could not be costed
and the conversion was being done by hand before entry — 2025's 44 lb/ac rate is exactly
4 gal at 11.1 lb/gal. Nothing was broken; the arithmetic was just happening in the owner's
head.

`convertUnits` is **unchanged**, deliberately. It is what guarantees a caller with no
density cannot obtain a mass-to-volume answer, for the same reason `bag` and `seed` are
separate classes (guardrail 8). The bridge lives in a new `convertProductUnits` wrapper.

**The density argument has three meaningful values and the distinction is load bearing:**

| Value | Meaning |
|---|---|
| `undefined` | No density concept — a chemical or seed. Behaves exactly as before; a mass/volume pair stays `incompatible-class`, because telling someone to set a density on a chemical is nonsense |
| `null` | Density applies but is not set. Returns the new `needs-density`, which names the fix |
| `number` | Bridge through it |

Tests lock all three. Do not collapse `null` and `undefined`.

**Threaded through both copies of the cost math** (guardrail 7):
`calculateCostWithConversion`, `shoppingListMath.accumulateNeed`,
`generateFertilizerLines`, `recalculateFertilizerProgramCost`, `seasonImport`, and the
edge function's mirrored module. **Edge function deployed as version 12** and the source
fetched back and compared, not assumed.

**Migration `20260830211202_add_fertilizer_product_density`** — rehearsed in a transaction
that was rolled back (column added, 11.1 accepted, zero and negative rejected by the check
constraint, 19 dry products unaffected), rollback confirmed, then applied. The column is
nullable because dry products have no density.

**`database.types.ts` regenerated, not hand-edited**, and spliced mechanically with the
hand-maintained tail block. The resulting diff was **exactly three lines** — which also
confirms the file carried no other drift since the WI-19 regeneration.

**Floor after F-1:**

| | Before | After |
|---|---|---|
| Tests | 206 passing, 5 files | **222 passing, 5 files** |
| TypeScript | 76 | **76** — sets compared with positions stripped, identical |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Build | 1,751.91 kB (467.46 kB gz) | **1,754.29 kB (468.19 kB gz)** — +2.38 kB for the bridge, the Liquid checkbox and its help text |
| Migrations | 52 | **53** |

**Not verified in a browser.** No product has a density set yet, so the bridge has not run
against real data. The first real exercise is ticking Liquid on 6-24-6, entering 11.1, and
confirming the program cost changes as expected.

**A latent bug recorded while reading `record_purchase`.** Its fertilizer branch matches
the product by **name**:

```sql
UPDATE fertilizer_products SET price_per_unit = p_price_per_unit
 WHERE season_id = v_season AND product_name = v_line.product_name
```

Rename a fertilizer product after generating a shopping list and this matches nothing,
`v_entity` stays null, and **no cascade fires** — silently. F-5 removes fertilizer from
this path entirely, which retires it. If that decision is ever reversed, fix it on its own.

### Fertilizer contract tracking — F-2 — branch `f-2-fertilizer-contract-schema`

Schema only. No client code reads these tables yet, so nothing in the app changes;
F-3 (RPCs) and F-4 (UI) are what make them visible.

**Migration `20260830213751_fertilizer_contracts_and_loads`** — three tables:

| Table | Holds |
|---|---|
| `fertilizer_contracts` | Every commitment. `kind='spot'` is a contract filled the same day, so all prices live here and the weighted average needs no special case |
| `fertilizer_loads` | One delivery ticket: date, ticket number, load type, supplier, `delivery_fee` |
| `fertilizer_load_lines` | What was on the ticket — a blend is its component products on separate lines, mirroring the plant's ticket. **Carries no price** |

Four decisions worth keeping:

1. **No denormalized `farm_id`.** RLS resolves the farm through `seasons.farm_id`,
   which sidesteps the whole SEC-4 class of defect where a denormalized column
   disagrees with the row it points at and the policy believes the column.
2. **The consistency triggers are SECURITY INVOKER**, unusually for this codebase.
   They read `fertilizer_products` and `fertilizer_contracts`, both RLS-protected,
   so running as the caller means naming a row you cannot see fails the `EXISTS`
   and raises. It fails closed. A DEFINER version would cheerfully confirm a row
   the caller has no business naming.
3. **`contract_id` is `ON DELETE RESTRICT`.** Deleting a booking with loads against
   it fails loudly rather than orphaning delivered tonnage.
4. **DELETE uses `can_edit_farm`, not owner-only.** New tables have no existing
   behaviour to widen, and an editor is meant to manage the farm's fertilizer
   buying. This deliberately differs from the older tables, where batch 2 left
   owner-only DELETE alone because changing it would have been a product decision
   rather than a security fix.

**Rehearsed before applying**, migration and matrix in one transaction that ended by
raising: **101 assertions passed, 0 failed**. Rollback then confirmed — no tables, no
trigger functions, no fixture rows. Only then applied for real.

**The rehearsal earned its keep.** The first run failed on `column reference "label"
is ambiguous` — `label` is both the matrix's actor variable and a column on
`fertilizer_contracts`. That is a bug in the test, not the schema, but an unrehearsed
run would have applied the migration and then reported a broken harness against live
tables.

**SEC-5 matrix is now 101 assertions** (was 56). F-2 added 45: 40 in the actor loop
covering all three tables × {read, write} × {own farm, other farm} × four actors, plus
5 proving the consistency triggers and the RESTRICT. One of those five is the control —
a legitimate line must still insert, because a trigger that refuses everything would
pass the other four.

**Post-apply, measured:** RLS enabled on all three tables, 4 policies each, SELECT on
`can_view_farm` and INSERT/UPDATE/DELETE on `can_edit_farm`, **zero references to the
retired helpers**, and no table anywhere in `public` left without RLS or policies.

**`database.types.ts` regenerated** and spliced mechanically: **174 insertions, 0
deletions** — purely additive, exactly the three new tables, tail block intact.

**Floor unchanged:** tests 222 passing, TypeScript 76, ESLint 109/28, build
**byte-identical** at 1,754.29 kB (same chunk hash — types are erased, so anything
else would have meant something was wrong).

### Fertilizer contract tracking — F-3 — branch `f-3-fertilizer-contract-rpcs`

Migration `20260830215258_fertilizer_contract_rpcs_and_blended_price`. Still no client
code; F-4 is the UI.

**`fertilizer_contracts.unit_type` was dropped — a design change made during F-3, not a
tidy-up.** The weighted average was specified to convert each contract's quantity *and*
price into the product's unit. Doing that inside Postgres meant a **third** copy of the
unit conversion table — client, edge function, and SQL — in a third language, computing
the number that drives every field cost. Guardrail 7 records that the existing two copies
have needed hand-syncing three times.

The owner chose instead that a contract is denominated in its product's own unit. The
column was dropped rather than kept-and-constrained, because a constrained duplicate is
denormalization that can drift — the same shape F-2 avoided by not carrying a `farm_id`.
`fertilizer_load_lines.unit_type` stays: a load genuinely can arrive in another unit, and
that rollup is TypeScript, for display.

**The blended price is maintained by a trigger, not only by the RPC.** Same pattern as
`update_master_product_on_hand`. The price therefore cannot desync however a contract row
arrives — through the RPC, a hand-crafted REST call, or a future admin fix.

| Behaviour | Why |
|---|---|
| Unpriced contracts excluded from the average, still counted as tonnage | A booking made before the price is settled must not drag the blend toward zero |
| Price rounded to 2dp before comparison | Float noise must not fire a cascade |
| Deleting the last priced contract leaves the price **unchanged** | An undefined average must never zero out a price someone entered by hand |
| The product a booking is for cannot be changed on update | Re-pointing a contract would silently move money between products |

**Rehearsed before applying — 18 assertions, 0 failures.** The worked example lands
exactly: 60 t @ $550 + 20 t @ $580 + 8 t @ $640 = **$565.00/ton**. Then delete the spot and
it returns to $557.50; delete the rest and it stays at $557.50 rather than zeroing.
Also covered: RPC authorization (editor yes, stranger no, on both save and delete), zero
quantity and negative price refused, the `ON DELETE RESTRICT` when a load references the
booking, and the grants.

**Post-apply, measured:** all four functions `SECURITY DEFINER` with `search_path` pinned;
`save_`/`delete_` executable by `authenticated` and **not** by `anon`; the two internal
functions executable by **neither** role.

**SEC-5 matrix re-run against the live post-F-3 schema: 101 passed, 0 failed.** That also
proves the committed harness still parses after the column drop, which is why it was worth
running rather than assuming.

**Floor unchanged:** tests 222, TypeScript 76, ESLint 109/28, build byte-identical at
1,754.29 kB. Types regenerated: 3 `unit_type` lines removed, 3 function signatures added.

**Not yet exercised by a human.** No contract exists in production. The first real test is
entering two bookings at different prices and watching the product price become the blend —
and, because the cascade is automatic, watching field costs move with it.

### Fertilizer contract tracking — F-4 — branch `f-4-fertilizer-contracts-ui`

The feature is now usable. Products gains a **Fertilizer Contracts** tab: a season strip,
one card per product, booking entry, and load-ticket entry.

**One migration was needed that the design did not anticipate:
`20260830220139_save_fertilizer_load_rpc`.** A delivery ticket is a header plus lines,
which is the exact shape that produced WI-13 — `saveWorkOrder` inserted header, fields and
lines in three requests, logged the failures and returned a valid-looking id, leaving work
orders with no lines. Shipping that again would have been careless, so loads go through one
RPC in one transaction. Rehearsed first: **9 assertions, 0 failures**, including that a bad
line leaves **no orphan header**.

**`computeFertilizerNeedByProduct` was extracted from `generateFertilizerLines`.** The card
shows plan need beside contracted tonnage, and the shopping list shows the same number.
Two implementations could disagree, so there is one, and the shopping list is now its
second consumer rather than its owner.

**The two mobile primitives landed**, as agreed:

| | |
|---|---|
| `<ResponsiveModal>` | Bottom sheet on a phone, centred card from `sm:` up. Deliberately matches the existing modals' overlay, width and close affordance so retrofitting them later is a swap |
| `<NumberField>` | `type="text"` with `inputMode="decimal"`, 44 px tap targets. `type="number"` was rejected: it discards input the browser dislikes, changes on scroll, and varies by browser |

`parseNumberField` lives in `mathUtils.ts`, not beside the component — a file exporting
both a component and a helper breaks Fast Refresh, and doing it the obvious way pushed
ESLint warnings 28 → 29 before it was moved back.

**The new tab is lazy-loaded**, unlike its sibling tabs. Eager, it added 29 kB to every
first paint of an app already 168 kB over WI-22's gzip target. Its siblings stay eager
because converting them is WI-22's job, not this feature's.

**Floor after F-4:**

| | Before | After |
|---|---|---|
| Tests | 222 passing, 5 files | **238 passing, 6 files** |
| TypeScript | 76 | **75** — sets compared with positions stripped; one error *removed* (an unused `farmId` renamed `_farmId`), none added |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Main chunk | 1,754.29 kB (468.19 gz) | **1,755.04 kB (468.60 gz)** — +0.75 kB, with the tab in its own 28.71 kB (7.58 gz) chunk |
| Migrations | 55 | **56** |

**Nothing here has been opened in a browser.** The rollup math has 16 unit tests and both
RPCs were rehearsed against the live database, but no card, modal or button has been
rendered. That is the honest state: the arithmetic and the writes are proven, the screen is
not.

### Fertilizer contract tracking — F-4a — branch `f-4a-ticket-first-spot-buys`

The five faults the owner's first real use of the Contracts tab exposed. All five fixed.
Full detail in §10b of `Fertilizer-Contract-Tracking-Design.md`.

**The design doc said F-4a needed no migration. That was wrong about one of the five,**
and the exception is the instructive part. Entering a spot buy on the ticket writes a
**priced contract and a load in one user action**. As two client calls, a failure on the
second leaves a booking that has already moved `fertilizer_products.price_per_unit` through
the F-3 trigger and already fired a cascade, with nothing to tell a retry the booking
exists — so the retry books the same tons twice. That is the WI-13 shape, and
`save_fertilizer_load` exists as one RPC precisely to prevent it. So the contract insert
moved inside it: `20260831010154_fertilizer_load_inline_spot_buys`.

| Fault | Fix |
|---|---|
| 1 · a spot buy could not be entered where it happens | Inline label + price on the load line; no leaving the modal |
| 2 · "Draws against" defaulted to *No booking* | Defaults to the sole booking when there is exactly one, and every option now shows the tons left on it |
| 3 · the partial draw | A **Split** button divides an over-drawing line — 20.35 t on the booking, 3.65 t on a new spot buy — as two lines, which the schema already allowed |
| 4 · stale price on the Fertilizers tab | The Contracts tab invalidates the Products page's cached fertilizer rows after any price-moving write |
| 5 · the price field was a trap | Read-only where priced bookings exist; the update **omits the column** rather than rewriting it, so a re-blend landing mid-edit is not clobbered |

Fault 2 was not cosmetic. Production still holds the proof: one 24 t Urea spot buy and one
24 t delivery attributed to nothing, so the same tons read as both owed and delivered.

**Rehearsed before applying — 20 assertions, 0 failures**, then rollback confirmed, then
applied. The assertions that earn their keep: the pre-F-4a path still works untouched; the
worked example blends to exactly **$565.00/ton**; an unpriced spot buy books tonnage without
moving a price or firing a cascade; `contract_id` beats `new_contract` so nothing is booked
twice; **a bad later line leaves neither an orphan header nor an orphan spot buy**; one
ticket spilling onto two products returns two cascades; a spot buy survives its line being
edited away; stranger and `anon` both refused.

**A comment inherited from F-4 was wrong and is corrected.** It claimed the load-line
consistency trigger "runs as the caller, so it fails closed". It does not — the trigger is
SECURITY INVOKER, and inside a SECURITY DEFINER function the invoker is the function's
owner. The behaviour is still correct, because the checks compare season ids rather than
testing caller visibility. Probed rather than assumed: foreign-season product and
foreign-season contract are both refused, leaving no orphan header. Worth remembering the
next time a SECURITY INVOKER trigger is described as the safety net for a DEFINER RPC.

**The SEC-5 matrix was not re-run, deliberately.** This migration replaces a function body;
it creates no table, alters no policy and changes no grant. The new attack surface is the
RPC itself, and that was attacked directly in the rehearsal. F-3 re-ran the matrix because
it dropped a column the harness referenced — nothing here touches it.

**`database.types.ts` regenerated: zero diff.** The RPC's signature is unchanged
(`jsonb → jsonb`), only its body, so the file needed nothing — which also re-confirms it
carries no drift.

**Floor after F-4a:**

| | Before | After |
|---|---|---|
| Tests | 238 passing, 6 files | **249 passing, 6 files** — 11 new on `planLineDraw` |
| TypeScript | 75 | **75** — sets compared with positions stripped, identical |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Main chunk | 1,755.04 kB (468.60 gz) | **1,755.99 kB (468.72 gz)** — +0.95 kB, the Products page and the read-only price field |
| Contracts chunk | 28.71 kB (7.58 gz) | **35.21 kB (9.33 gz)** — +6.50 kB, the whole new modal, still lazy |
| Migrations | 56 | **57** |

**Not opened in a browser.** The RPC is proven against the live database and the split
arithmetic has unit tests, but no modal, split button or read-only field has been rendered.

**Left for the owner, not patched in the database.** The existing unattributed 24 t delivery
is now a three-tap repair in the app — edit the ticket, and the dropdown defaults to the
sole booking. Rewriting a production row on the owner's behalf is a bigger decision than
the fix deserves.

### Fertilizer contract tracking — F-5 — branch `f-5-shopping-list-handoff`

The shopping list stops pricing fertilizer and hands off to a booking. Detail in §10c of
`Fertilizer-Contract-Tracking-Design.md`.

**This is the round that makes the price rule statable in one line.**
`fertilizer_products.price_per_unit` had three writers — the Fertilizers form, the F-3
contracts trigger, and `record_purchase` — with no coordination between them, each firing
its own cascade. Last write wins, and the loser's money disappears from every field cost
without a trace. F-4a made the form read-only where priced bookings exist. F-5 removes the
third.

| Situation | Who owns the price |
|---|---|
| Product has ≥1 priced booking | The F-3 trigger; the Fertilizers form is read-only |
| Product has no priced booking | The Fertilizers form, where it genuinely is the input |
| Shopping list | **Nobody** — it computes need and hands off |

**Two halves.** The UI half: fertilizer lines lose *Mark as Purchased* and gain **Book
this**, opening the booking form prefilled with the needed tonnage; chemical and seed lines
are untouched. The database half (`20260831011905`): `record_purchase` **raises** for a
fertilizer line, before anything is written. Removing the button removes the affordance,
not the writer — the RPC stays reachable through a hand-crafted REST call, so the
invariant is enforced where it can actually be enforced.

It raises rather than quietly skipping the price update, because skipping would leave the
line marked `purchased` carrying a number that changed nothing anywhere. That is the same
class of quiet lie WI-15 and the cascade work have been removing.

**The latent `record_purchase` bug recorded in the design doc is now fixed, by deletion.**
That branch matched the product by `product_name` against a name the shopping list
snapshotted at generation time, so a rename made it match nothing, set no cascade target,
and report a successful purchase regardless. The surviving chemical and seed branches
resolve through `master_product_id` — and the rehearsal **renames a chemical and re-runs
the purchase** to prove it, rather than asserting it from reading.

**Rehearsed before applying — 9 assertions, 0 failures**, rollback confirmed, then applied.
Fertilizer refused with the right message; its price untouched; the line not marked
purchased; chemical and seed still price, still write one ledger row, still cascade; the
renamed chemical still resolves; stranger and `anon` both refused.

**The client still resolves a line to a product by name, deliberately.** Fertilizer lines
carry no `master_product_id`, so there is nothing else to match on. The difference from the
bug just deleted is what a miss does: `matchFertilizerProductByName` returns null and the
tab says which product it could not find and where to go instead. It is extracted and has
6 unit tests, including that an exact match beats a case-variant. Putting a real id on the
line needs a schema change for one button; worth doing if renames turn out to be common.

**Floor after F-5:**

| | Before | After |
|---|---|---|
| Tests | 249 passing, 6 files | **255 passing, 6 files** |
| TypeScript | 75 | **75** — sets compared with positions stripped, identical |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Main chunk | 1,755.99 kB (468.72 gz) | **1,760.57 kB (470.17 gz)** — the eager shopping tab's share |
| Fertilizer chunks | 35.21 kB in one file | **33.98 kB across two** — Rollup gave `BookingModal` its own 11.48 kB chunk shared by both lazy boundaries |
| Migrations | 57 | **58** |

**Not opened in a browser**, same as F-4 and F-4a.

**F-4a confirmed working by the owner, 31 Aug.** A spot buy entered on the ticket, then a
booking, then a draw from it, then an over-draw split onto a fresh spot buy — the whole
F-4a sequence, exercised on Potash in the running app. The resulting blend was checked
against the database independently of the trigger: 12 t @ $495 + 2 t @ $550 + 50 t @ $505
= $32,290 over 64 t = **$504.53/ton**, which is what is stored, with every booking exactly
drawn (12/12, 2/2, 4+46 = 50/50). TSP and Urea agree too. **This is the first end-to-end
confirmation that the contract feature computes the right money from real user input.**

### Fertilizer contract tracking — F-4b — branch `f-4b-per-product-summary`

Reported by the owner in the same session: *"The four boxes just display a munged total of
every ton currently booked. That's not useful."* Detail in §10d of the design doc.

**It was a correctness defect, not a display preference.** The season strip summed
`contracted`, `delivered` and `remaining` across products, and every rollup is expressed in
**its own product's unit**. So it added tons to gallons. It looked merely unhelpful because
every product on this farm is priced by the ton today — the first gallon-priced liquid
would have made three headline numbers silently wrong. Worth noting how it survived review:
the code reads perfectly sensibly, and only the *units* make it wrong.

**As built:** tonnage per product in that product's unit, as a summary block above the
cards; over-contract in red; unattributed tonnage and unconvertible lines flagged. The only
cross-product figure left is money — new pure `sumContractCommitment`, which excludes
unpriced bookings and counts them separately so the total presents as a floor. 7 tests, one
deliberately mixing a ton product and a gallon product.

**First browser verification in this project.** A throwaway Vite entry rendered the real
component with fixtures at 1280 px and 375 px, then was deleted. It found a real defect
immediately — *"Over contract"* wrapped on a phone and broke row alignment — which no
amount of reading would have caught. `.claude/launch.json` is committed so the next check
is one command; it hardcodes `node.exe`'s path because `npm` is not on the tool PATH here.

**This is the standing gap closing.** Every fertilizer section above says "not opened in a
browser". That is now demonstrably where the remaining defects are: F-4a's five faults were
all found by using the screen, and F-4b's was too. Rendering is cheap now — prefer it.

**Floor:** TypeScript 75 (identical set), ESLint 109/28, tests 249 → **256** on its own
branch, build succeeds with the **main chunk byte-identical** at 1,755.99 kB; the lazy
Contracts chunk carries all of it, 35.21 → 37.97 kB. No migration.

### Where the fertilizer feature stands

F-1 … F-5 plus F-4a and F-4b are merged on `main` and pushed. **Only F-6 remains** — the
plan calculator (fields × program → computed load lines). It is deliberately last:
everything before it is a complete, usable tracker, and F-6 only removes hand arithmetic
from a screen that already works.

Measured on `main` after merging F-4b and F-5 together — not carried over from either
branch, because neither branch's build figures survive the union:

| | |
|---|---|
| Tests | **262 passing**, 6 files |
| TypeScript | **75** — identical set, positions stripped |
| ESLint | **109 errors, 28 warnings** |
| Build | main **1,760.78 kB** (470.23 gz), lazy `FertilizerContractsTab` **25.06 kB** (6.87 gz) and `BookingModal` **11.48 kB** (3.73 gz) |
| Migrations | **58** |

## Open items and standing notes

Genuinely open: the `set_active_season` type drift below (WI-30). Everything else in this
section is either a practice note or a closed record kept for the reasoning.

**Migration filenames must match the recorded version.** Applying through the Supabase MCP
stamps its own timestamp, which will not be the one in the filename you wrote. Round 4's
three files were renamed after the fact to match (`203718`, `204336`, `204458`). Check
`list_migrations` against the directory after applying, or a `db push` will try to replay
work that is already in the database.

**Pre-existing, unrelated:** `database.types.ts` declares `set_active_season` with two
arguments; the database function takes one. Evidence that the hand-maintained types have
drifted (WI-30).

### CLOSED — CSV negative-number regression — commit `7c87e07`

*Kept here rather than under Completed because the lesson is about this document: the fix
it originally prescribed was wrong.*

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

## Next up

### 1. WI-19 — the type and lint baseline. Promoted to first.

The PRD sequences this as maintainability, after the security work. **That ordering is
wrong and this session proved it.** `fetchSharedFarms` had been broken since it was
written, and `tsc` had been reporting it the whole time in plain language:

```
TS2352: SelectQueryError<"could not find the relation between team_members and user_profiles">
```

It sat inside the 103 errors this document itself taught everyone to treat as background
noise. A whole feature — shared farms — never worked, and the compiler said so on every
run. There is no reason to assume it is the only one.

**Do this first, and start by triaging the remaining 98 for defects rather than by fixing
them in bulk.** The 88 `no-explicit-any` lint errors matter for the same reason: `any`
suppresses exactly this class of message. Getting to zero is the goal, but reading them is
the value.

### 2. Round 6 — performance

PERF-1 … PERF-5. The bundle is the headline: 1,751.96 kB (467.50 kB gz) against WI-22's
≤ 300 kB gzip target, so it needs `React.lazy` on the pages plus `manualChunks` for
recharts, jspdf and html2canvas. PERF-2 (the unbounded override query) is a two-line fix.
PERF-4's O(n²) on-hand trigger now matters more than it did, since Round 4 routes every
work-order and purchase write through it.

### 3. WI-15 — the cascade function still lies

`process-cascade-task` returns `{success: true}` even when the inner block failed, and
swallows the `error` on every query so a transient failure reads as "not found". Round 5
redeployed that function for SEC-3 but deliberately did not touch this. It is the last
place in the system where a failure is silently reported as success.

### Deliberately deferred, with reasons

- **`ALLOWED_ORIGIN`** — SEC-8's mechanism is deployed but falls back to `*`. Left
  permissive because the app has no stable production URL, Bolt preview origins rotate, and
  a wrong value breaks every cascade with an opaque CORS error. Set it when there is a real
  deployment; extend it to a comma-separated list first if more than one origin is needed.
- **The `viewer` role in the app** — proven at the database level by the matrix, never
  exercised through the UI. All four collaboration defects this session lived in the
  client, so read-only carries the same exposure.
- **Real email for invitations** — needs a provider, an API key and domain verification.
  The signup-time trigger covers the case where you can tell someone out of band to
  register.
- **WI-27, one implementation of the cost math** — the conversion table now exists twice
  and has been hand-synchronised three times. Every sync so far has been correct, which is
  precisely why it will eventually not be.

## Baseline metrics

All figures below are measured, not estimated.

| Metric | Review baseline | After Round 3 | After Round 4 | End of 30 Aug | **After Round 6 step 2** |
|---|---|---|---|---|---|
| TypeScript errors | 103 | 103 (identical set) | 99 | 98 | **76** |
| ESLint | 136 errors, 28 warnings | 134 / 28 | 134 / 28 | 134 / 28 | **109 / 28** |
| Tests | 0 | 178 passing, 4 files | 206 passing, 5 files | 206 passing, 5 files | **206 passing, 5 files** |
| CI | none | none | none | none | **none — still WI-21** |
| Main JS chunk | 1,747 kB (465 kB gz) | 1,754.43 kB (467.56 kB gz) | 1,751.97 kB (467.39 kB gz) | 1,751.96 kB (467.50 kB gz) | **1,751.91 kB (467.46 kB gz)** |
| Migrations | 40 files | 43 | 46 | 52 | **52, matching the database** |

**The Round 6 movement, itemised.** 98 → 103 on regenerating `database.types.ts`
(12 resolved, 17 revealed); 103 → 101 from the cascade-modal contract fix and one
nullability error that went away with a removed filter; 101 → 76 from the unused-symbol
sweep. At each step the surviving errors were confirmed to be a strict subset, compared
with line positions stripped. **No error was suppressed, and none was silenced by a cast
or an `any`.** The 25-error ESLint drop is the same deletions satisfying `no-unused-vars`.

**Every drop in the TypeScript count is accounted for, and no error was ever suppressed.**
103 → 99 came from replacing `MarkPurchasedModal`'s hand-rolled write sequence with the
`record_purchase` RPC, which eliminated four real defects including the `price_per_bag`
write to a column that does not exist. 99 → 98 came from fixing `fetchSharedFarms`. At each
step the remaining errors were confirmed to be a strict subset of the previous set,
compared file-by-file with line positions stripped — a matching total is not evidence.

**On the bundle:** Round 3 added 5.45 kB (unit registry, alias table, the new maths modules
and two warning banners); Round 4 gave back 2.46 kB by moving the purchase logic into the
database. The net against the review is roughly +5 kB, which is a real regression against
PERF-1 and an accepted one — WI-22 restructures this chunk entirely.

The review's recorded 1,747 kB / 465 kB was slightly optimistic: `main` measured
1,748.98 kB / 465.70 kB when built on this machine. Compare against that, not the review.

**A caveat on ESLint.** It has sat at 134/28 since Round 3, which reads like stability but
is not evidence of anything: nothing this session was aimed at lint, and 88 of those errors
are `no-explicit-any`, which is the very thing that hides the class of bug WI-19 is now
first in the queue to find.

Toolchain used for these measurements: Node 24.19.0, npm 11.17.0, Vitest 2.1.9, Vite 5.4.8.
Note that npm 11 blocks package install scripts by default (`core-js` and `esbuild`
postinstalls were skipped); nothing in this project needed them, and both test and build
succeed regardless.
