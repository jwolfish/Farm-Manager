# Farm Manager Remediation — Status

**Last updated:** 29 Aug 2026
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

## Next up — Round 3

Unit conversion rewrite (WI-11) plus the first real test suite (WI-20), then canonical
accumulation in shopping lists (WI-12). This is the one round that self-verifies: the
tests are the oracle, no database changes, no deployment. It must land before Round 4,
because the three inventory RPCs depend on conversion being trustworthy.

Remaining after that: Round 4 — WI-9, WI-10, WI-13 (apply/unapply, record_purchase,
save_work_order as transactional RPCs). Round 5 — SEC-5 (farm-scoped membership; large
blast radius, best written by hand rather than generated) and SEC-3 (edge function
authorization). Round 6 — PERF-1 through PERF-5 and remaining debt.

## Baseline metrics (unchanged since review)

103 TypeScript errors · 136 ESLint errors, 28 warnings · 0 tests · no CI ·
1,747 kB main JS chunk (465 kB gzipped).
