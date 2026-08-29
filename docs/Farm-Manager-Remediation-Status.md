# Farm Manager Remediation — Status

**Last updated:** 29 Aug 2026 (Round 3 landed on branch `round-3-unit-conversion`)
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

### Round 3 — branch `round-3-unit-conversion` (not yet merged)

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

## Open items

**CSV guard is too broad (regression from Round 2).** In `csvExporter.ts`, the check
`'=+-@\t\r'.includes(s[0])` prefixes any value starting with `-`, including legitimate
negative numbers. `FieldROI`, `YearOverYearProfit`, `CostBreakdownComparison` and
`PricingPerformance` all export negative currency via `.toFixed(2)`, so negative net
profit now exports as text and will not sort or sum in Excel. Fix: only prefix when the
value is not a well-formed number:

```js
const RISKY = /^[=+\-@\t\r]/;
if (RISKY.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
```

**Pre-existing, unrelated:** `database.types.ts` declares `set_active_season` with two
arguments; the database function takes one. Evidence that the hand-maintained types have
drifted (WI-30).

**Round 3 is unverified against the toolchain.** The machine Claude ran on has no Node
installed, so `npm test`, `tsc`, `eslint` and `vite build` were never executed against
this branch. What *was* verified is below. Run the four commands before merging.

## Verifying Round 3 before merge

```
npm install          # brings in vitest + @vitest/coverage-v8
npm test             # expect 4 files, ~180 cases, all passing
npm run typecheck    # must be 103 or fewer
npm run lint         # must be 136 or fewer (expect 134: two prefer-const fixed)
npx vite build       # must succeed
```

What has already been verified, and how:

- **The conversion arithmetic**, by executing the module's logic in a real JavaScript
  engine: 355 assertions, 0 failures. All 102 pairs from the old lookup table reproduce
  at *exact* float equality (`Object.is`, not `toBeCloseTo`); worst round-trip error
  across every within-class pair was 8.9e-16 against a 1e-9 requirement; the WI-12
  worked example (2 qt/ac × 100 ac + 16 fl oz/ac × 50 ac, held in gallons) came out at
  exactly 56.25 gal.
- **The live-data audit** described in the Round 3 section, run against the production
  database as read-only queries.

Not verified: TypeScript compilation, ESLint, the production build, that Vitest itself
runs green, and any browser behaviour of the changed React components.

## Next up — Round 4

Round 4 — WI-9, WI-10, WI-13 (apply/unapply, record_purchase, save_work_order as
transactional RPCs). These depend on WI-11, which is why it went first. Note that WI-9
now inherits a typed `WorkOrderApplyResult` and a working error banner, so its remaining
work is the transaction, the status guard, the unique index and the in-flight button
disable.

Round 5 — SEC-5 (farm-scoped membership; large blast radius, best written by hand rather
than generated) and SEC-3 (edge function authorization). **Redeploy
`process-cascade-task` in this round** — its source has Round 3's conversion change but
the deployed copy does not. Round 6 — PERF-1 through PERF-5 and remaining debt.

## Baseline metrics

| Metric | Review baseline | After Round 3 |
|---|---|---|
| TypeScript errors | 103 | expected 103 (tests excluded from `tsconfig.app.json`) |
| ESLint | 136 errors, 28 warnings | expected 134 errors — two `prefer-const` in `shoppingListGeneration.ts` fixed in passing |
| Tests | 0 | 4 files (`unitConversions`, `shoppingListMath`, `inventoryMath`, `templateCalculations`) |
| CI | none | none — still WI-21 |
| Main JS chunk | 1,747 kB (465 kB gzipped) | expected unchanged |

Every "expected" figure above is a prediction, not a measurement. If a number differs,
believe the tool and not this table.
