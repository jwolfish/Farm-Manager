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

## Open items

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
