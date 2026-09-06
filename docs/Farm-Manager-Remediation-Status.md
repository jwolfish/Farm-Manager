# Farm Manager Remediation — Status

**Last updated:** 6 Sep 2026 — Rounds 1–6 (steps 1–3) complete, fertilizer F-1 … F-6
complete, shopping-list coverage complete, and **field-level fertilizer rates V-0 … V-6 and
V-8 complete, confirmed in the running app**. Only V-7, the optional CSV import, remains,
and it is **deferred by the owner's decision** until the grid has been used for a season.
**The random reload is acted on at last: R-1, R-5 and R-4 item 2 landed 6 Sep** — the
full-screen amplifier is gone, a failed seasons load no longer reads as an empty farm, and
the render-phase mutation is in an effect. R-2, R-3, the rest of R-4 and R-7 still wait on
an auth-diagnostics dump the owner has not been able to catch; R-6 does not.
**Repo:** `jwolfish/Farm-Manager` — **everything is merged on `main` and pushed to origin
(`9711bf6`)**. Nothing is half-finished and no branch is ahead: `git branch --no-merged
main` is empty. The seven older branches still exist locally and are all 0 commits ahead.
Every migration in `supabase/migrations/` is applied to the live database.
**Edge function:** `process-cascade-task` **version 17** — the V-3 deploy, last updated
2026-09-06 01:24 UTC. Carries WI-15, SEC-3, the F-1 density bridge, the override-total fix,
and V-0's `refreshProgramOverridesInSeason`. **Re-verified byte-for-byte on 6 Sep**:
downloaded and diffed against the repository copy, `sha256
30908b5946d5f712e2e21adeaed582143f2d9cbdd5cebe2b274713dbb8e4fe06` on both sides, 1,151
lines, diff clean.

*(**This number has now been wrong four times** — 10 when the platform was at 11, 12 at 13,
14 at 15, and 16 at 17. Every single time the **source** was correct and only the number
written here was wrong, which is the useful part: the deploy has never actually drifted.
Confirm with `list_edge_functions`, never with this line.)*

*(**A trap when re-verifying on this machine.** The repo copy is CRLF, because git has
`core.autocrlf=true`; the downloaded copy is LF. A plain `sha256sum` therefore reports two
different hashes and a plain `diff` reports **every line changed** — which looks exactly
like a drifted deploy and is not. Compare with `diff --strip-trailing-cr`, and hash the
local file through `tr -d '\r'`. The same thing makes a regenerated `database.types.ts`
look wholly rewritten.)*
**Supabase project:** `wvccxjakqwqfmyewclue` (bolt-native-database-63401892)
**Companion docs:** `Farm-Manager-Code-Review-Summary.md`,
`Farm-Manager-Remediation-PRD.md`, `Farm-Manager-Random-Reload-Diagnosis.md`,
`Fertilizer-Contract-Tracking-Design.md`, `Field-Level-Fertilizer-Rates-Design.md`,
`Shopping-List-Coverage-Design.md`

---

## Start here

**Rounds 1–6 (steps 1–3), fertilizer F-1 … F-6, shopping-list coverage, and field-level
fertilizer rates V-0 … V-6 and V-8 are complete, merged and pushed.** Every migration is
applied to the live database. Nothing is half-finished and nothing is waiting to be merged.

**The two open threads are both pre-existing, and neither is a feature.** The random reload
is diagnosed and untouched; WI-19, performance and CI are where the remaining value is. The
one *feature* step outstanding — V-7, the CSV import — is deferred by the owner's decision,
not blocked: the V-6 grid it would feed is built, and whether the import is worth building
depends on how the grid feels after a season of real entry.

**A live money defect was found and fixed on 31 Aug — see *The override defect* below.**
Code fixed in both copies, 13 tests added, nine production rows repaired, edge function
deployed as **v14** and verified byte-for-byte. The one thing left is a 5-minute check in
the running app — *How to prove the fix*, at the end of that section.

| Measured 6 Sep 2026 | |
|---|---|
| Tests | **401 passing**, 11 files (386 before R-1 added 15; 380 before V-8 added 6; 347 before V-6 added 25) |
| TypeScript | **73 errors** (103 at review, 98 before WI-19, 75 before V-8 replaced two `Json` casts with `Array.isArray` guards). Unmoved by R-1, set compared with positions stripped |
| ESLint | **107 errors, 28 warnings** (from 136/28; 109 before V-8 deleted one `prefer-const` and one `no-explicit-any`). Unmoved by R-1 |
| Build | succeeds — **1,790.05 kB** (477.80 kB gz; 1,787.96 before R-1 added 2.09 kB to the eager `App.tsx` path), plus lazy `FertilizerContractsTab` 25.96 kB, `BookingModal` 19.63 kB and `FieldFertilizerRateGridPanel` 19.83 kB, all three byte-identical |
| Migrations | **63 files**, matching the database one-for-one |
| Edge function | **version 17**, running source confirmed identical to the repo by sha256, re-verified 6 Sep |
| Security advisors | 14 WARN — 13 are the by-design `authenticated_security_definer_function_executable` lint that fires on every RPC, 1 is `auth_leaked_password_protection` (WI-6). No new class of finding. V-6’s internal `apply_field_fertilizer_rates` is correctly absent, being executable by neither role |
| Cascade tasks | **58 total, 0 failed** |
| SEC-5 policy matrix | **120 assertions, 0 failures** (extended at V-1 and re-run against the live schema; was 101 at F-3). **Not re-run since V-1** — V-4 and V-6 changed function bodies and grants, not tables or policies, so the matrix has nothing new to exercise; each was attacked directly in its own rehearsal instead |

**Closed:** SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, SEC-7 · WI-9, WI-10, WI-11, WI-12, WI-13,
WI-14, WI-15, WI-16 · LOG-1, LOG-2, LOG-3, LOG-4, LOG-5, LOG-7, LOG-8, LOG-10 · plus four
collaboration defects found by testing, none of which were in the original review.

**Partial:** SEC-6 (WI-6 untouched) · SEC-8 (mechanism in place, `ALLOWED_ORIGIN` unset by
choice) · WI-19 (103 → 73, triage done, 73 remain) · WI-20 (386 tests, but nowhere near the
80 % target) · WI-23 / PERF-2 (V-8 bounded the shopping list's fertilizer override query
with `.in('field_id', …)`; the chemical one at `shoppingListGeneration.ts:56` still selects
every visible row and filters in JavaScript).

### The override defect — found and FIXED 31 Aug 2026

**Nine fields carried a wrong total cost per acre for six months.** Code fixed in both
copies, tests added, production data repaired. **One step outstanding: the edge function is
not yet redeployed** — see the end of this section.

**The invariant, which nothing in this codebase had written down:** a field cost override
lives in `field_cost_overrides.override_value`, **not** in the `field_costs` column it
names. The column holds the value inherited from the template; `getResolvedFieldCosts` lays
the override over it for display. `createOrUpdateOverride` never writes the column at all —
confirmed in the data, where the override says 70 and the column says 80.

**The defect.** Anything that *totals* a field must lay the two together the same way.
`recalculateFieldTotal` in `fieldCostOverrides.ts` always did. **The cascade never did:**

```
updates.total_cost_per_acre = calculateFieldTotalCost({ ...currentFieldCost, ...updates });
```

That reads the raw columns, so `total_cost_per_acre` silently reverted to the pure template
figure while every line item on screen still showed the override. No error, anywhere.

**The damage, measured.** Stored total equalled the un-overridden sum on all nine fields:

| Field | Stored | Correct | Error |
|---|---|---|---|
| Home East of Farm South, Home West of Bins, Home West of Lane, T & L Back 40 and Middle, Vandemeer NE | 685–699 | 709–723 | **understated ~$24.48/ac** |
| Home North Slew | 691.91 | 715.39 | understated $23.48/ac |
| Adkins, Townline Road | 698.59 / 683.27 | 688.59 / 673.27 | **overstated $10.00/ac** |
| Umek | 683.72 | 663.72 | overstated $20.00/ac |

Errors in **both directions**, which is why "the totals looked plausible" was never evidence
of anything. All nine rows were last rewritten at 2026-08-30 21:43:47 UTC, ~78 seconds after
the F-1 deploy — the cascade run that evening to confirm v10 worked. That test is recorded
in this document as a success. It was, for everything it checked; nobody looked at the
overrides.

**A wrong diagnosis, corrected before it was acted on.** The first read of this blamed the
guard's key names — `overrideMap.has('chemical_programs')` against rows named
`chemical_cost_per_acre`. That is *not* the bug. Those two keys are the correct names for
the array-shaped overrides (`OverrideValue = number | ProgramReference[]`), and once the
total resolves correctly the key mismatch is harmless: the column tracks the template and
the overlay wins. Had the key names been "fixed" as first proposed, the money would still
have been wrong, and the three `hauling` fields — whose names always matched — prove it,
because they were hit too.

**The fix.** New pure `applyFieldCostOverrides` in `templateLib/templateCalculations.ts`,
mirrored in the edge function (guardrail 7). It handles both override shapes: a number lands
in its own column, a `ProgramReference[]` under `chemical_programs`/`fertilizer_programs`
resolves to the matching `*_cost_per_acre` as a sum — which is the first time a
program-shaped override has ever affected a total anywhere. Junk (`null`, `''`, non-numeric)
leaves the template value standing rather than producing `NaN`; a legitimate `0` is honoured.
Both cascades now total `applyFieldCostOverrides({ ...row, ...updates }, overrides)`, and
both queries select `override_value` rather than just the row's existence.

`templateApplication.ts` was checked and needs no change — it calls `deleteAllOverrides`
as it applies, so totalling without overrides is correct there.

**Tests: 13 new, 282 → 295.** They pin the invariant, both override shapes, the junk and
zero cases, non-mutation, and the two production fields as named regressions in both
directions — plus that a field with no overrides totals identically either way, so the fix
is inert for the other 52 rows.

**Data repaired.** Nine rows updated, scoped to fields that have an override and only where
the value actually differed. Verified afterwards: **0 overridden fields still wrong**, the 9
`field_cost_overrides` rows untouched. Previous values, for reversal: Adkins 698.59, Home
East of Farm South 686.89, Home North Slew 691.91, Home West of Bins 689.51, Home West of
Lane 699.05, T & L Back 40 and Middle 690.76, Townline Road 683.27, Umek 683.72,
Vandemeer NE 685.15.

**Deployed — `process-cascade-task` version 14**, 31 Aug 2026 18:44 UTC, via the newly
installed Supabase CLI (`npm run deploy:cascade`).

**Verified byte-for-byte, which is new.** Every prior round compared *markers* — call-site
counts, a few distinctive strings — because the deployed source could only be read back
through the MCP tool. `supabase functions download` writes it to disk, so the check is now
a hash:

```
local  sha256: fda58ee3567e4057cb30da4adbc103189a3980b82d69d9f7221d28cdaec92de3
remote sha256: fda58ee3567e4057cb30da4adbc103189a3980b82d69d9f7221d28cdaec92de3
978 lines both sides; diff reports identical
```

That retires the whole class of doubt this document has carried about what is actually
running. **Use this method from now on** — see the deploy note in `CLAUDE.md`.

**State after the deploy**, re-checked: all nine fields still `correct`, nothing regressed.

**Not yet exercised: a real cascade against a real override.** The deployed code is
byte-identical to the code 13 unit tests cover, but no cascade has run since the deploy, so
the end-to-end path has still never been observed protecting an override. That is the one
test that closes this properly, and it needs the running app — see *How to prove the fix*
below.

### How to prove the fix — 5 minutes in the app — **RUN AND PASSED, 6 Sep 2026**

**This is closed.** The owner set 2025's hauling to 0, the cascade ran on edge function v16,
and all nine overrides survived with every total reconciling — including the two fields that
correctly moved by exactly $80 because their override was on chemical, not hauling. Full
result in *The override fix is PROVEN END TO END* below. The recipe is kept for reference:

1. Note a field with an override — e.g. **Umek**, whose total should read **663.72**
   (hauling overridden to $60 against the template's $80).
2. Change any chemical or fertilizer price that feeds a program used by these fields'
   template, which is what queues a cascade. (A price change back and forth works;
   the 30 Aug test used exactly this.)
3. Wait for the cascade notification, then re-check the totals.

**Pass:** all nine totals unchanged, and Umek still 663.72. **Fail:** any total springs back
to the un-overridden figure (Umek 683.72, Home West of Bins 689.51, etc.).

The query in *The override defect* above answers it in one shot — every row should say
`correct`.

**Two unrelated inconsistencies found while verifying, deliberately NOT touched:**

| Field | Issue |
|---|---|
| `Vandemeer South` | Stored total is $0.01 above the sum of its columns. Float noise in `calculateFieldTotalCost`; harmless |
| `Home Behind Woods` | Stored total is **$20.00 above** the sum of its columns. It has **no template and no override**, so no cascade ever touched it, and it was last written 2026-02-06. Which number is right is unknowable from the data — fixing it would be guessing. Worth asking the owner |

### Then, in order

1. **The random reload — R-1, R-5 and R-4 item 2 landed 6 Sep; R-2, R-3, R-4, R-6, R-7
   remain.** `Farm-Manager-Random-Reload-Diagnosis.md` §5a has the detail. The amplifier is
   gone: a transient load or a load error no longer unmounts the app, a failed seasons load
   no longer presents as an empty farm, and the render-phase `sessionStorage.removeItem` is
   in an effect. **Still true and still waiting on the auth log:** `tokenChanged` gating
   `setUser` at `AuthContext.tsx:79` (R-2 — the diagnosis says explicitly not to touch it
   until a real session shows the `decision` entry), the bare `user` dependency arrays
   (R-3), the rest of R-4, and R-7. **R-6, the error boundary, needs no log either and is
   the obvious next one.**

   **One check outstanding, and it is the owner's**: open a modal on Products, force a
   token refresh, confirm the modal and its fields survive. Nothing on this machine can
   reach `App.tsx` at runtime, so the behaviour is proven by 15 tests over the extracted
   decision and by rendering the two indicators — not by watching a modal live through a
   refresh.
2. **Finish WI-19.** **73** errors left (75 until V-8 replaced two `Json` casts with
   `Array.isArray` guards): nullability, the remaining unguarded `Json` casts, recharts
   formatter signatures, unused parameters, and the residue. The nullability
   block is the one with real value left in it — it means reconciling the app's
   hand-written interfaces against the schema. Note it also makes R-6 (error boundary)
   worth more, since those nullability bugs are what would blank the app.
3. **The collaboration test that is now cheap.** Production now has **2 farms** and **1
   accepted team member** (it had 1 farm and 0 when this was last written). Have the
   collaborator account create a field or a chemical, then check it appears in Spray
   Planner, Chemical Work Orders, Seed Bag Requirements and a generated shopping list.
   That is what the seven removed `user_id` filters were about; a collaborator merely
   *viewing* owner-created data looks identical either way.
4. **Round 6 performance** — PERF-1 … PERF-5, chiefly the bundle: **477 kB gzip** against
   WI-22's ≤ 300 kB target. This is also the real prerequisite for the mobile ambition, not
   responsive CSS.
5. **WI-21, CI.** There is still none. Every figure in the table above was measured by hand
   this session, which is exactly how they went stale.

**Two loose ends deliberately left:** set the `ALLOWED_ORIGIN` secret when there is a
stable production URL, and exercise the `viewer` role in the app (`team_members` still has
**0** viewer rows).

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

**This paragraph originally read "Latent today — `field_cost_overrides` has 0 rows — but it
arms the first time an override is entered." That was wrong on both counts.** The table has
held 9 rows since February 2026, and the bug was not latent.

**The fix recorded in this section is real but was aimed at the wrong thing.** Its comment
claimed the override map was "the ONLY thing stopping this cascade from overwriting a
field's manually-overridden costs." It is not: an override lives in
`field_cost_overrides.override_value`, a different table, so the cascade cannot overwrite it
by writing `field_costs`. What the cascade *was* doing — and what this round did not catch —
is recomputing `total_cost_per_acre` from the raw columns, so the total reverted to the
template figure on nine real fields. Fixed 31 Aug; see *The override defect* in *Start
here*. Guarding the read was still worth doing, but it was never the whole guard.

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
  - *The override guard* — the most valuable fix in this round. **Superseded 31 Aug: this
    said `field_cost_overrides` had 0 rows so there was nothing to protect. It had 9, and
    that very cascade left all nine with a wrong total.** It was exercised in anger, and it
    guarded the wrong thing — the columns, not the total. See *The override defect* in
    *Start here*.
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
edge function's mirrored module. **Edge function deployed as version 13** — recorded here
as 12 at the time; the platform reports 13, updated 30 Aug 21:42 UTC — and the source
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

### Fertilizer contract tracking — F-6 — branch `f-6-plan-calculator`

The plan calculator, and the last step of the feature. Detail in §10e of the design doc.

**"These fields, this program — how many tons?"** Reachable at two scopes, which is the
same question asked twice: from the load ticket, to fill a delivery from the plan; and from
the booking form, scoped to that product, to answer "how much do I contract for these
fields?". Both open the same component.

**Selected fields × selected programs**, mirroring the Spray Planner, not each field's cost
template. `computeFertilizerNeedByProduct` answers "what does the season plan say?"; this
answers "what if I ran *this* program on *these* fields?". Both converge on
`accumulateNeed`, so the two can differ in scope and never in arithmetic — which is exactly
why F-4 extracted that accumulator in the first place.

**`computed_quantity` is finally written.** In the schema since F-2, in the RPC payload
since F-4, always null until now. On an over-draw split the kept line keeps it and the
spill gets none, because the calculator produced one number for that product on that ticket.

**Two defects found by rendering it**, neither findable by reading:

1. **`accumulateNeed` reported the same failure once per field** — five fields of a liquid
   with no density produced five identical sentences joined by semicolons. Fixed at the
   source with a `Set`, which **also fixes the shopping list's flagged lines**; they had the
   same repetition and it had never been noticed. Two tests pin it.
2. The sheet's subtitle truncated on a phone.

That is now three consecutive rounds where browser verification found something review did
not. It is no longer a nice-to-have for this feature's screens.

**Floor:** TypeScript 75 (identical set), ESLint 109/28, tests 262 → **282**, build
succeeds, main chunk 1,760.78 → **1,760.80 kB** — effectively all of it in the lazy chunks.
No migration.

### Where the fertilizer feature stands

**All eight steps are complete — F-1, F-2, F-3, F-4, F-4a, F-4b, F-5, F-6.** The feature is
finished as designed. *(This line said "seven" while listing eight.)*

Measured on `main` after merging F-4b and F-5 together — not carried over from either
branch, because neither branch's build figures survive the union — then again after F-6:

| | After F-5/F-4b merge | After F-6 |
|---|---|---|
| Tests | 262 passing, 6 files | **282 passing, 7 files** |
| TypeScript | 75 — identical set | **75** — identical set |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Build — main | 1,760.78 kB (470.23 gz) | **1,760.80 kB** (470.24 gz) |
| Build — lazy | `FertilizerContractsTab` 25.06, `BookingModal` 11.48 | **25.96** and **19.97 kB** |
| Migrations | 58 | **58** — F-4b and F-6 needed none |

**What is still not done, and is worth saying plainly.** Nothing in this feature has been
exercised by a second user, the `viewer` role has never been tried on these screens, and
only the Contracts tab's summary and the plan calculator have been rendered in a browser —
the load ticket, the booking form and the shopping-list handoff have not. Given that
looking at screens has now found defects three rounds running, those are the obvious next
checks if anything here misbehaves.

**Live data as of 31 Aug 2026**, for whoever picks this up next:

| | |
|---|---|
| `fertilizer_contracts` | 7 |
| `fertilizer_loads` / `fertilizer_load_lines` | 6 / 8 |
| Load lines with no `contract_id` | **1** — the unattributed 24 t Urea delivery from F-4a, still not repaired. It is a three-tap fix in the app: edit the ticket, and the dropdown now defaults to the sole booking |
| `fertilizer_products` with no density | 28 — all dry, expected |
| Farms / accepted team members / viewers | 2 / 1 / **0** |

### Shopping-list coverage — 4 Sep 2026 — branch `field-fertilizer-rates-design`

**The shopping list was asking a supplier to quote fertilizer that was already bought.**
Reported by the owner as "I don't think it looks at current inventory or current
contracts". Half right, and the half that was wrong is the instructive half. Full detail
in `Shopping-List-Coverage-Design.md`.

| Category | Coverage subtracted before this? |
|---|---|
| Chemical | **Yes**, `master_products.on_hand_quantity`, and it worked |
| Seed | **Yes**, the same, in whole bags |
| Fertilizer | **No** — contracts were ignored entirely |

**Chemicals were already netted; the deduction was simply invisible.** The gross plan
need was computed, subtracted from, and thrown away — never stored, never shown. A
column headed *Needed* reading 40 gal, with the 70-gal plan and the 30 gal in the shed
nowhere on screen, is indistinguishable from a plan that wanted 40. That is why a
working feature read as a missing one.

**Fertilizer was genuinely missing, and it was live.** The Sep 4 list for the 2027
season asked for **63.20 t of Urea against 30 t already booked**. That list would have
gone to a supplier for a second quote on tonnage already contracted.

**What "already bought" means, and why it is not "remaining to call".** Tonnage
delivered against a booking still does not need shopping for. The figure is
`max(contracted, delivered)`, exported as `coveredByContracts` beside `rollUpProduct`,
which is the single owner of contract rollups. The four cases are the argument for
`max`: booked-not-called, booked-part-called, over-drawn, and delivered-unattributed.
A sum double-counts the first two; `contracted` alone under-counts the last two.

**The gross is stored, not derived.** `neededAfterOnHand` clamps at zero, so
`plan − covered` cannot be recovered from an over-booked line — 40 t booked against a
33 t plan reads identically to 33 against 33. Migration `20260904183110` adds
`plan_quantity` and `contracted_at_generation`. **Two columns, not one:** a single
`covered_quantity` meaning a shed balance on one row and a plant commitment on the next
is the shape SEC-4's denormalized `farm_id` and F-3's `fertilizer_contracts.unit_type`
were both removed for. `on_hand_at_generation` is untouched.

**Rehearsed before applying — 9 assertions, 0 failures**, rollback confirmed, then
applied. The rehearsal caught a wrong *assertion*, not a wrong migration: it expected
three backfilled rows and got six, because three lines carried on-hand on *each* of the
two August chemical lists. It now measures the expected count rather than hard-coding
one read off a single list.

**A new module rather than a new home for old code.** `fertilizerCoverage.ts` reads
contracts and load lines and groups them by product id. It could not live in
`fertilizerContracts.ts`, which already imports `computeFertilizerNeedByProduct` from
`shoppingListGeneration.ts` — the shopping list is what needs coverage, so that would
be a cycle. Every read throws rather than returning empty: a swallowed contract read
would silently restore the old behaviour and shop for the Urea twice.

**Rendering found a defect for the fourth round running.** With nine columns at 375 px
the table scrolls, and the column that fell off the right edge was **To Buy** — the one
the change exists to surface. Fixed by hiding the coverage column below `sm:` and
folding its value under the product name there, so a phone shows Product / Plan Need /
To Buy with *"Booked 30 ton"* beneath the name. Padding tweaks were tried first and
abandoned as fiddling.

**That check needed `ShoppingListLineRow` split out of the tab**, which imports the
Supabase client at module load and throws with no credentials — the same cut F-6 made
between `PlanCalculator` and `PlanCalculatorModal`, and the reason every fertilizer
section before F-4b said "not opened in a browser". 157 lines of inline JSX became a
17-line call site.

**Verified against live data**, independently of the TypeScript: the coverage figures
were recomputed in SQL for the 2027 season and compared line for line. Urea 63.2025 →
33.2025; the other six products unchanged, which is the evidence the change is inert
where nothing is booked.

**The F-5 "Book this" prefill is now correct for free.** It reads `needed_quantity`, so
booking from a covered line suggests 33.20 t rather than 63.20 t. Before this it would
have double-booked.

**Floor:**

| | Before | After |
|---|---|---|
| Tests | 295 passing, 7 files | **308 passing, 7 files** |
| TypeScript | 75 | **75** — identical set, positions stripped |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Build — main | 1,763.95 kB (471.50 gz) | **1,767.66 kB (472.37 gz)** |
| Migrations | 58 | **59** |

**CONFIRMED end to end by the owner, 4 Sep 18:52 UTC.** A fertilizer list generated in
the running app reads **Urea 33.2 ton**. The stored row proves more than the screen:
`plan_quantity` 63.2025, `contracted_at_generation` 30, `needed_quantity` 33.2025,
`adjusted_quantity` 33.2025, and `plan − covered − needed = 0` on every line. That
establishes what neither the unit tests nor the SQL check could — that coverage resolves
to the right product by id against real data, that all three columns are written rather
than only the one displayed, and that Order Qty defaults to the net, which is what stops
F-5's *Book this* double-booking. Six of the seven products are unchanged, which is the
control.

**The chemical side confirmed too, 18:56 UTC.** Ten lines, six carrying a real on-hand
deduction — double what the August lists had, because inventory has moved.

**And the over-coverage case arrived on its own.** NanoPro: plan 2.281 gal against 3 gal
on hand, so To Buy clamps to 0 and the row is 0.72 gal long. That is the one row where
`plan − covered − needed` is **not** zero — every other line on both lists reconciles to
exactly 0.000000 — and it is the clearest argument for storing the gross rather than
deriving it. Derived as `net + covered`, NanoPro would report 3 gal of plan need nobody
planned, and the surplus would be invisible. The row that breaks the subtraction is the
row the column exists for.

**The red line renders — confirmed by the owner minutes later.** NanoPro reads `0 gal`
with `0.72 gal over` beneath it, against real data rather than fixtures. **Every element
of this change has now been seen working in the running app**, which is a first for
anything in the fertilizer area: F-4 through F-6 all shipped with "not opened in a
browser" against them.

**Still unexercised:** no *fertilizer* product has been booked past its plan, so
over-coverage via `contracted_at_generation` rather than `on_hand_at_generation` has not
occurred. `coverageView` adds the two and the row component does not distinguish them,
so this is close to a formality.


### Field-level fertilizer rates — V-0 — 4 Sep 2026 — on `main`

The first step of `Field-Level-Fertilizer-Rates-Design.md`: fix the latent defects in the
**program-shaped override** before anything writes one. No migration, no new feature, no
behaviour change for any row that exists today.

**Why this had to come first.** `field_cost_overrides.override_value` has two shapes — a
number keyed by its own column, or a `ProgramReference[]` keyed `fertilizer_programs` /
`chemical_programs`. Production holds **9 rows, all numeric, zero arrays**, and the array
shape has no UI writer. It has therefore never run, and it was broken in three places.
Per-field fertilizer rates write one for every custom-rated field.

| # | Defect | Fix |
|---|---|---|
| 1 | `getResolvedFieldCosts` overlaid each override onto the key it names, so an array landed under `fertilizer_programs` — which `calculateFieldTotalCost` never reads — leaving `fertilizer_cost_per_acre` on the template figure. `recalculateFieldTotal` then stored the **template** total | Resolves through `applyFieldCostOverrides`, which already handled both shapes. The same defect fixed in the cascade on 31 Aug, in the one place that fix did not reach |
| 2 | `cascadeProgramUpdateInSeason` walked `cost_templates` only, so the `cost_per_acre` inside an override array was a snapshot frozen when it was written. A price change moved every template field and left every overridden one stale | New `refreshProgramOverridesInSeason`, called **before** the template loop so the template cascade re-totals against fresh values. Mirrored in the edge function (guardrail 7) |
| 3 | `FieldProgramDetails` read `template_id → cost_templates` and nothing else, so a field with its own programs displayed its template's | Reads the override first, falls back to the template. A field with an override and **no** template now renders at all — it previously fell through the `if (template_id)` guard and showed nothing |
| 4 | A numeric `fertilizer_cost_per_acre` override and per-field rates would both claim the field's money | **Not fixed here, and cannot be.** Per-field rates do not exist until V-1. This is a V-5 guard on `FieldDetail`, as §5.4 of the design doc says |

Defect 4 is listed in §3 as one of four, so **V-0 closes three of them**. Saying "four
fixed" would be the same kind of count this remediation keeps deleting.

**The decision is a pure function.** `refreshProgramCostInRefs` in
`templateCalculations.ts` — the same extraction pattern as `accumulateNeed` and
`planLineDraw` — so the arithmetic is testable without a database, and the edge function
carries a marked duplicate rather than a second idea. It refuses a non-finite new cost
(a failed recalculation must not replace a stale number with a meaningless one), compares
to the cent so float noise cannot queue a cascade, honours a legitimate drop to zero, and
repairs an entry whose stored cost is junk.

**Two deliberate choices worth recording:**

- **The override refresh is NOT added to `fieldsUpdated`.** An overridden field is normally
  also a template field and would be counted twice. WI-15 deleted a count that reported
  work never done; inflating one is the same lie in the other direction. The refreshes are
  recorded as task warnings instead.
- **Two queries, not one embedded PostgREST select.** Scoping overrides to a season could
  be `field_cost_overrides` embedding `fields!inner`, but a mis-resolved embed is exactly
  what broke `fetchSharedFarms` for months. Two explicit queries per program cascade is the
  cheaper mistake.

**Verification.**

- **12 new tests, 308 → 320**, all green. They pin the refresh decision and — the one that
  matters — reproduce the *old* overlay beside the new one and assert the totals differ,
  so the test fails if the fix is reverted. Plus a control asserting the fix is inert for a
  numeric override, which is all nine production rows.
- **TypeScript 75, error set byte-identical** to the pre-change set with line positions
  stripped. **ESLint 109 / 28, unchanged.**
- **Build succeeds**, main chunk 1,767.66 → **1,768.55 kB** (472.37 → 472.56 gz). The
  +0.89 kB is the override read and the two "Custom for this field" badges in
  `FieldProgramDetails`, which is eager.
- **Edge function bundles clean** under esbuild with the Deno specifiers external. Deno is
  still not installed here, so it is **not typechecked**.
- **Live data re-checked and unchanged:** all 9 overrides are still `number`-shaped, and
  every stored `total_cost_per_acre` still equals the sum of the columns with the override
  laid over — Umek 663.72, Adkins 688.59, and the rest. Nothing ran against the database.

**What is NOT verified, and should not be claimed.** Only the pure decision has tests. The
functions that touch the database — `getResolvedFieldCosts`, `refreshProgramOverridesInSeason`
and its edge-function twin — are proven by reading. No cascade has run against an array-shaped
override, because none exists to run against.

*Deployed 5 Sep as part of V-3 — see that section. The sentence that stood here said the two
copies differ until V-3 deploys; they no longer do.*


### Field-level fertilizer rates — V-1 — 4 Sep 2026

`field_fertilizer_rates` applied to the live database as **`20260905040540`**. One sparse
table: a field on the flat template rate stores nothing, and the template path is untouched.
Full detail in §5.1 and §7 of `Field-Level-Fertilizer-Rates-Design.md`; the migration header
carries the reasoning for each column.

**Rehearsed before applying — 12 assertions, 0 failures**, rollback confirmed (no table, no
function, no policies), then applied for real. The assertion that earns its keep is the
precision one, because §7.1 turns on it: **8.2 ton over 43 ac stores 381.3953488372093023
lb/ac and reads back as exactly 8.2000 ton.** `application_rate` is an unconstrained
`numeric`, matching `fertilizer_program_items`; the `numeric(10,2)` used for money and
acreage would not have round-tripped, and entry is by total tons.

**SEC-5 matrix extended and re-run: 101 → 120 assertions, 0 failures. MATRIX GREEN.**
16 in the actor loop (four actors × read/write × own farm/other farm) plus 3 for the
consistency trigger — a rate naming another season's program refused, another season's
product refused, and the control proving a legitimate rate still inserts. Fixtures rolled
back and confirmed gone.

One wrinkle worth recording for whoever extends the matrix next: `field_fertilizer_rates` is
UNIQUE on (field, program, product), so a write probe aimed at the fixture row's own triple
collides with it and reports a *unique violation* as a permissions failure. The matrix
therefore probes against a spare product and deletes the probe immediately — anyone whose
INSERT succeeded can also DELETE, since both policies are `can_edit_farm`, so the cleanup
cannot itself fail. That is the same class of false negative the harness header already
warns about for probe rows inflating read counts.

**Post-apply:** table present, RLS on, 4 policies, 4 indexes, 0 rows, `application_rate`
reports `numeric` with no precision, and no table anywhere in `public` lacks RLS. Security
advisor: **12 WARN, the documented baseline** — 11 by-design
`authenticated_security_definer_function_executable` and WI-6. No new class of finding.

`database.types.ts` regenerated and spliced with the hand-maintained tail block: **61
insertions, 0 deletions**, purely the new table, which re-confirms no other drift. Floor
unchanged — TypeScript 75 identical set, ESLint 109/28, tests 320, build byte-identical at
1,768.55 kB. Migrations **59 → 60**.

**Deliberately NOT done:** dropping the dead `field_fertilizer_applications` and
`field_chemical_applications` tables, which §6 of the design doc recommends. They are empty
and referenced by nothing, but dropping a table is irreversible and they are not in this
feature's way. Left for an explicit decision.

### Field-level fertilizer rates — V-3, the deploy — 5 Sep 2026

**`process-cascade-task` is version 17** — recorded here as 16 at the time, while the
platform reports 17. The *source* was verified in both directions, so the number was the
only thing wrong, for the fourth time. It carries V-0's `refreshProgramOverridesInSeason`
and its `recalculateFieldTotal` helper. Deployed with `npm run deploy:cascade`, which reads
the file from disk.

**Verified byte-for-byte, both directions.**

*Before* deploying, the running function was downloaded and diffed against the repository
copy **as it stood before V-0** — identical. That mattered more than it looks: it proved
nothing had drifted while the two copies were deliberately out of step, so the deploy could
only add V-0's changes and nothing else.

*After* deploying, downloaded again:

```
1151 lines both sides
local  sha256: 30908b5946d5f712e2e21adeaed582143f2d9cbdd5cebe2b274713dbb8e4fe06
remote sha256: 30908b5946d5f712e2e21adeaed582143f2d9cbdd5cebe2b274713dbb8e4fe06
diff reports identical
```

**The recorded version number was wrong for the third time.** This document said v14; the
platform reported **15** before this deploy and **16** after. The pre-deploy download is what
settles it — the source matched, so the drift was only ever in the number written here, not
in the code. Confirm with `list_edge_functions`, never with this line.

**Still not exercised: a real cascade.** The deployed source is byte-identical to code that
12 unit tests cover, but no cascade has run since the deploy, and none has ever run against
an array-shaped override because none exists. The end-to-end path remains proven by reading.

**Baseline captured for the app check**, so the comparison is one glance. All nine
overridden fields currently reconcile — every row reads `correct`:

| Field | Override | Total |
|---|---|---|
| Adkins | hauling 70 | 688.59 |
| Home East of Farm South | chemical 105 | 711.37 |
| Home North Slew | chemical 104 | 715.39 |
| Home West of Bins | chemical 105 | 713.99 |
| Home West of Lane | chemical 105 | 723.53 |
| T & L Back 40 and Middle | chemical 105 | 715.24 |
| Townline Road | hauling 70 | 673.27 |
| Umek | hauling 60 | **663.72** |
| Vandemeer NE | chemical 105 | 709.63 |

**Pass:** every total unchanged after a cascade, Umek still 663.72. **Fail:** any total
springs back to its un-overridden figure — Umek 683.72, Home West of Bins 689.51.

That check closes two things at once: V-3's own acceptance criterion, and the *How to prove
the fix* item outstanding since 31 Aug, which has never been run.

### The override fix is PROVEN END TO END — 6 Sep 2026, 01:02–01:05 UTC

**The check outstanding since 31 August has been run, and it passes.** Until now the
override fix was proven by 25 unit tests and by reading; nobody had ever watched the system
preserve an override through a live cascade. *How to prove the fix* can be deleted from
*Next up*.

**What the owner did:** set the 2025 season's hauling cost to 0 and let the cascade run.
Two `cascade_product_update` tasks completed against **edge function v16** — the deploy from
minutes earlier — plus a client-side template cascade at 01:04:49. All nine overridden
fields were rewritten, so this is not the empty result a cascade that never ran would give.

**The control is what makes it evidence.** Six fields unchanged proves nothing on its own;
what proves it is that the *right* two moved, by the right amount:

| Field | Override | Hauling column | Total before → after |
|---|---|---|---|
| Umek | hauling **60** | stays 80 | **663.72 → 663.72** |
| Adkins | hauling 70 | stays 80 | 688.59 → 688.59 |
| Townline Road | hauling 70 | stays 80 | 673.27 → 673.27 |
| Home East of Farm South | chemical 105 | → 90 | 711.37 → 711.37 |
| Home North Slew | chemical 104 | → 90 | 715.39 → 715.39 |
| Home West of Bins | chemical 105 | → 90 | 713.99 → 713.99 |
| Home West of Lane | chemical 105 | → 90 | 723.53 → 723.53 |
| T & L Back 40 and Middle | chemical 105 | **→ 0** | 715.24 → **635.24** |
| Vandemeer NE | chemical 105 | **→ 0** | 709.63 → **629.63** |

The three fields with a **hauling** override kept their hauling column at 80 — the cascade
skips writing a column it has an override for — and their totals did not move. The two
fields whose hauling went to 0 have **chemical** overrides, not hauling ones, so their
hauling correctly followed the template and their totals fell by exactly $80.00, while their
chemical override of 105 was still honoured in the new total.

**All nine reconcile:** `expected_total` computed independently in SQL equals the stored
`total_cost_per_acre` on every row. That is the same query that found the defect on 31 Aug,
now returning `correct` after a cascade rather than before one.

**Cascade tasks: 58 total, 0 failed.** Both post-deploy tasks completed with empty warnings.

**What this does NOT prove, and must not be claimed.** `refreshProgramOverridesInSeason` —
the V-0 fix this deploy was for — **did not run**, because it only fires on array-shaped
overrides and production still has zero of them. What ran was the numeric-override path,
which was already correct. So v16 is now confirmed healthy under a real JWT against real
data, and the *new* code in it is still exercised only by unit tests. The first real
exercise will be the first custom-rated field, at V-5.

### Field-level fertilizer rates — V-2 and V-4 — 5–6 Sep 2026

**V-2** — `src/lib/fieldFertilizerRates.ts`, pure and unit-tested: `resolveFieldFertilizerItems`
(replace-wholly resolution), `costResolvedItems` (WI-11 rules, one issue per distinct
failure), `contributionsFromItems` (the seam into `accumulateNeed`) and the §7.1
`rateFromTotal` / `totalFromRate` pair. **20 tests, 320 → 340.** Nothing imports it yet —
wiring the shopping list and plan calculator is V-8 — and the build being byte-identical is
what confirms that.

**V-4** — `save_field_fertilizer_rates(jsonb)`, applied as **`20260906011521`**.

**The design decision worth keeping.** The RPC was specified as "delete, insert, recompute
override, recompute total". It does the first three and **not the fourth**, and it does not
compute the cost either:

| | Where it happens | Why |
|---|---|---|
| rates → `$/ac` | **Client**, `costResolvedItems` | Needs the unit table and the density bridge. In SQL that is a third copy in a third language, computing the number that drives every field cost — what F-3 refused when it dropped `fertilizer_contracts.unit_type` |
| the override array | **RPC**, atomically with the rates | List maintenance, not cost math |
| `total_cost_per_acre` | **Client**, existing `recalculateFieldTotal` | A flat sum, but already implemented twice; a SQL copy would be a third language for it too |

The honest cost: if the client dies between the RPC and the recalculation, the field's total
is stale until the next override edit or cascade. That is a crash window, and self-healing.
It is **not** the 31 Aug defect, which was systematic — every cascade reverted the total,
every time. Atomicity is spent where a half-write would leave data *inconsistent* (rates
without their override), not merely *stale*. It is also exactly what `createOrUpdateOverride`
has always done for a numeric override, so this is not a new pattern.

**Seeding is the subtle part.** The override array is the field's whole fertilizer program
list, so saving one program must update that entry and leave its siblings alone. When the
field has no override yet it is seeded **from the template** — which is what the field was
inheriting a moment ago. Seeding from empty would silently drop every other pass, and the
field's fertilizer cost would collapse to one program.

**Reset semantics:** an empty `rates` array clears that program's rows and the caller
supplies the *program's own* cost, so the entry reverts to it. The override row is
deliberately not deleted — its value then equals what the template would give, the total
resolves identically, and per guardrail 9 the skipped column write is harmless.

**Rehearsed before applying — 14 assertions, 0 failures**, rollback confirmed (no function,
no rate rows, the nine numeric overrides untouched), then applied for real. The ones that
earn their keep: the override is seeded from the template with **siblings preserved** and
only this program replaced; two programs coexist holding both costs; a re-save **replaces**
rather than appends; **a bad later rate leaves no partial set**; cross-season program and
cross-season product both refused; stranger and anonymous both refused; `SECURITY DEFINER`
with `search_path` pinned, executable by `authenticated` and not by `anon`.

**Post-apply:** function present, SECURITY DEFINER, `search_path=public, pg_catalog`,
`authenticated` may execute and `anon` may not, 0 rate rows and 0 array-shaped overrides —
nothing in production changed. Security advisor **13 WARN**: the documented 12 plus exactly
one more of the same by-design `authenticated_security_definer_function_executable`, which
is what adding an RPC does. No new class of finding.

`database.types.ts` regenerated: **1 insertion, 0 deletions**, purely the new function
signature. Floor unchanged — TypeScript 75 identical set, ESLint 109/28, tests 340, build
byte-identical at 1,768.55 kB. Migrations **60 → 61**.

**A splice hazard worth recording.** Regenerating `database.types.ts` and re-appending the
hand-maintained tail by *line number* clipped a line off that block twice in this session —
`} as const` once and `WorkOrderStatus` once. Both were caught by checking the diff was
purely additive, which is the check to keep. Splice on the `// ---` marker, not on a line
count.

### Field-level fertilizer rates — V-5, the editor — 6 Sep 2026

The first step of this feature a user can reach. *Edit plan* on `FieldDetail`'s Fertilizer
Programs section opens a per-field plan editor carrying both controls §7.2 needs: which
passes run on this field, and the rates within each pass. Entry is by **total** (§7.1), with
the derived rate beside it and either editable.

**Split for rendering, deliberately.** `FieldFertilizerPlanEditor` is presentation only, with
no Supabase import; `FieldFertilizerPlanModal` and `fieldFertilizerRatesCrud` do the loading
and saving. Every fertilizer step before F-4b shipped with *"not opened in a browser"*
against it precisely because the components reached the Supabase client at module load and
threw without credentials. F-6 had to cut `PlanCalculator` out of `PlanCalculatorModal` for
the same reason. That split is what made the check below possible.

**Rendering found a defect for the fifth round running, and this one would have made the
feature unusable.** The first version disabled **Save** whenever any row could not convert —
so a field carrying one liquid with no density could not have **any** of its rates edited.
The Potash figure the owner opened the screen to change is perfectly valid and perfectly
storable, and it was being held hostage by a different product in a different pass.

The fix separates two things the first version conflated. A conversion failure is a **note**:
what fails is the *display* of that row's total and its contribution to the cost, and
`costResolvedItems` already reports the shortfall by name so the $/ac presents as an
undercount rather than a total (WI-11). The real blocker is a rate box holding something that
is not a number, because the save silently drops those rows.

**Also found: a 38 px tap target** on the rate and total inputs, against the ≥44 px the design
doc sets for new controls — and these are the primary entry surface on a phone. Raised to
46 px, confirmed in the browser.

**Verified on screen, against hand figures**, at 1280 px and 375 px:

| | |
|---|---|
| Potash 200 lb/ac × 83 ac | **8.3 ton** |
| TSP 60 lb/ac × 83 ac | **2.49 ton** |
| Urea 185 lb/ac × 83 ac | **7.678 ton** |
| Fall pass | 0.1 t × $450 + 0.03 t × $825 + $4 = **$73.75/ac** |
| Topdress | 0.0925 t × $600 + $4 = **$59.50/ac** |
| Field total | **$133.25/ac** |

At 375 px the page does not scroll sideways (`scrollWidth` = `clientWidth` = 375); each
program's table scrolls inside its own container, and the column that stays visible is
**Total for field** — the one the owner actually types into. That is the F-4b lesson applied:
there, the column that fell off the right edge was the one the change existed to surface.

**One thing NOT verified:** the *Reset to program* control's padding was raised from 16 px in
the same pass, but the dev server kept serving a stale module for that file and the browser
never showed the new class. The padded version is on disk and in the build; it has not been
seen rendering. It is a secondary control, not the entry surface.

**Defect 4 is now addressed** — the one V-0 could not fix because rates did not exist yet.
Where a field also carries a typed `fertilizer_cost_per_acre` override, the editor says so
and warns that saving a plan makes it the source of the field's fertilizer money. Two numbers
claiming the same cost is how they end up disagreeing.

**Floor:** TypeScript 75 identical set, ESLint 109/28, tests 347, build 1,768.55 →
**1,784.40 kB** (+15.85 kB — the editor, modal and CRUD are on the eager `FieldDetail` path).

**Not yet done:** nothing has been saved through this screen against real data. The RPC is
proven by rehearsal and the arithmetic by tests and by reading figures off the screen, but no
`field_fertilizer_rates` row exists in production yet, so the round trip — save, re-open,
see the same numbers, watch the field cost move — has not been observed.

### V-5 confirmed in the app, and two defects it found — 6 Sep 2026

**The round trip works.** The owner set Adkins' Corn Topdress N Urea rate to 200, and both
reset paths — *Reset All Custom Values* on the field page and *Reset to program* inside the
editor — were confirmed working after the fixes below.

**Two defects, both found by using the screen, both the same class in opposite directions.**
A field's custom state lives in **two tables**, and every path that reads or clears one has
to know about the other:

| | What happened | Fix |
|---|---|---|
| Display | The save was perfect — Urea 200 stored, program cost 82.75 → 87.25, total 561.11 → 565.61 — but the screen still read **185**. `FieldProgramDetails` read item rates from the shared `fertilizer_program_items` and never read `field_fertilizer_rates` | Resolves through `resolveFieldFertilizerItems`, the same function the editor and cost math use. Each program whose rates came from the field is labelled **Field rates** |
| Reset | *Reset All Custom Values* cleared `field_cost_overrides` and left **3 orphaned rate rows**. The cost reverted to the template while the screen would still have shown the field's 200 | Both delete paths clear both tables. `deleteOverride` does so only for `fertilizer_programs`, so resetting a hauling override cannot delete rate work nobody asked to touch |

V-0 had fixed which *programs* the screen shows; the first was which *rates*, one level
deeper, and it went live the moment the first row existed. Money right, screen wrong — then
the exact inverse an hour later. This feature will keep producing that pair until every
reader knows about both tables. **The one that still does not is the shopping list, which is
V-8**: it computes tonnage from program rates and ignores per-field ones.

**PRODUCTION NOW HOLDS ITS FIRST ARRAY-SHAPED OVERRIDE.** Adkins carries a
`fertilizer_programs` override whose array is byte-identical to its template's — the
documented V-4 reset semantics, which leave the row rather than delete it, so the total
resolves identically (`override_sum` 176.1125, column 176.11, total 561.11, all reconciling).

That matters beyond this field. Every note in this document saying the program-shaped
override "has never run" and "production holds zero rows of that shape" is now **out of
date**. `refreshProgramOverridesInSeason` — the V-0 fix, in both copies, live in edge
function v16 — is armed for the first time and will actually execute on the next fertilizer
price change. Until now it had no row to act on, and the 6 Sep cascade proof explicitly did
not exercise it.

**So the next fertilizer price change is a real test of code that has only ever had unit
tests.** Watch that Adkins' three program costs move with the template's rather than
freezing.

### Correction — the array-shaped override is gone again, 6 Sep 2026

**The section above is out of date within hours of being written, and the reason is worth
keeping.** It recorded that production held its first `fertilizer_programs` override
(Adkins 2027) and concluded that `refreshProgramOverridesInSeason` was armed at last.

Re-measured at the start of V-6: **9 overrides, all numeric, 0 array-shaped, 0 rate rows.**
The owner then tested *Reset All Custom Values*, which deletes the override row outright —
so the row that armed it was removed by the very test that confirmed the reset works.

So the V-0 cascade fix is **still exercised only by unit tests**, exactly as it was before,
and the standing note that production holds zero rows of that shape is true again. The
first custom-rated field that survives will re-arm it. Recording the correction rather than
editing the claim away, because the sequence — feature writes the row, reset removes it —
is how a "this is now live" note goes quietly stale.

### Field-level fertilizer rates — V-6, the bulk grid — 6 Sep 2026

§5.3's answer to the entry burden: **rows are fields, columns are products, one program at
a time.** Reached from a *Fertilizer Rates* button on the Fields page, which opens a
full-screen panel with a program picker. Entry is by total for the field, with one toggle
to the rate per acre — one toggle for the whole grid rather than two boxes per cell,
because 32 fields × 3 products × 2 boxes is not a screen anyone can read.

It is load bearing twice: §10.7 makes it the CSV import's review surface, so V-7 populates
this grid rather than building a screen of its own.

**Migration `20260906023514` — one transaction for a whole grid.** V-4's
`save_field_fertilizer_rates` writes one (field, program) pair, which was right for the
single-field editor. Looping it over 17 fields would be a save that can stop half way, and
§10.7 requires the import commit to be all-or-nothing. So:

| | |
|---|---|
| `apply_field_fertilizer_rates` | V-4/V-5's body, moved. `SECURITY DEFINER`, `search_path` pinned, executable by **neither** role — the F-3 pattern for an internal. Not an API |
| `save_field_fertilizer_rates` | now a one-line delegate. Signature, grants and callers unchanged |
| `save_field_fertilizer_rates_bulk` | `{"saves":[…]}`, one transaction, authorization re-checked **per entry** so a payload mixing two farms is refused on the foreign field |

**The refactor is the point, not the new entry point.** Two copies of "what it means to save
a field's rates for a pass" — the template seeding, replace-wholly, the `applies:false`
branch — would eventually mean two different meanings on the row that carries every
custom-rated field's fertilizer money. That is the shape guardrail 7 warns about.

Two guards the wrapper adds beyond a loop: a **duplicate (field, program) pair raises**
rather than letting the last one win, and an **empty payload raises** rather than reporting
a successful save of nothing.

**Rehearsed before applying — 13 assertions, 0 failures**, rollback confirmed (neither new
function present, 0 rate rows), then applied for real. The ones that earn their keep: the
V-4 entry point behaves identically after the refactor, asserted first; **a bad later entry
rolls back the whole batch, leaving the good earlier one unwritten**; the duplicate pair and
the empty and non-array payloads are all refused; `applies:false` still clears rates and
drops the pass; an unknown field takes the batch down with it; unauthenticated is refused;
and the internal is executable by neither `authenticated` nor `anon` while both wrappers are
`authenticated`-only.

**The SEC-5 matrix was not re-run, deliberately** — this migration replaces function bodies
and adds one RPC. It creates no table, alters no policy and changes no grant on any table.
The new surface is the RPC, and that was attacked directly in the rehearsal. Advisor is at
the documented baseline plus exactly one more by-design
`authenticated_security_definer_function_executable`, which is what adding an RPC does.

**Still client-side, on purpose: the cost and the total.** The bulk RPC computes neither
(§5.2a). The re-totalling loop that follows the save is therefore outside the transaction —
V-4's documented trade-off, widened from one field to a batch. A total that misses its
refresh is **stale, not wrong**, and self-heals on the next edit or cascade; a failure there
is reported to the user rather than raised, because raising would say the save failed when
the rates are safely committed.

**One trap found while designing it, and closed.** A field with no `field_costs` row is
shown **locked**. Applying a cost template calls `deleteAllOverrides`, which since 6 Sep
also clears `field_fertilizer_rates` — so rates entered on a field before it has a template
would be destroyed the moment one was assigned, and `recalculateFieldTotal` has nowhere to
write in the meantime. Ten of 2027's 32 fields are in exactly that state today. Accepting
work that will vanish is worse than saying why it cannot be accepted.

**Rendering found defects for the sixth round running.** Both were invisible in review:

1. **At 375 px not one product cell was reachable.** The field-name column plus a separate
   *On* checkbox column consumed the whole viewport, so the only thing on screen was a name
   and a checkbox. That is the F-4b defect exactly — the column the screen exists for is the
   one that falls off the right edge. Fixed by folding the checkbox into the name cell and
   capping that cell at `11rem` below `sm:`; two product columns now sit beside it, the page
   does not scroll sideways (`scrollX` stays 0 after `scrollTo(999,0)`), and the table
   scrolls inside its own container.
2. **A row with an unparseable box showed a plausible, smaller `$/acre`.** Typing `60 lb`
   into AMS dropped that product to nothing and the row read **$62.30** instead of $75.35 —
   a legitimate-looking number produced by a silently missing product. The save was already
   blocked; the cost now reads a red `?` instead.

Also raised the mode toggle from a 36 px to a 46 px tap target; the rate boxes and the
program picker were already 46/47 px.

**Verified on screen against hand figures**, at 1280 px and 375 px, with a throwaway
fixture harness (deleted afterwards):

| | |
|---|---|
| Antioch, custom Urea 200 lb/ac × 24 ac | **2.4 ton**, $/ac **$64.00** |
| Beck Road, inheriting, 13 ac | 1.203 t Urea, 0.377 t AMS, 0.455 gal Provant, **$75.35** |
| Home West of Lane, custom, 83 ac | 7.055 t Urea, 3.735 t Potash, **$75.25** |
| Program rate, computed independently | **$75.35/acre**, matching every inheriting row |

**Replace-wholly proved through the save, not just on screen.** Typing a total into an
inheriting row flips it to *Custom*, and the emitted payload carried **all three** products —
Urea at the derived 230.769 lb/ac plus AMS 58 and Provant 0.14 — so the two the user did not
touch are adopted rather than silently dropped. It is the **rate** that is emitted, not the
total (§7.1). A field-only column (Potash on a Topdress row) renders, labelled *field only*.

**One rule now has one implementation.** "A field's program list is its override array if it
has one, else its template's" was about to be spelled out a third time, so it is extracted as
`enabledProgramIds` and the V-5 loader was rewired onto it. The RPC's copy is in SQL and has
to be, but there is no reason for two TypeScript readers to disagree.

**Floor:**

| | Before | After |
|---|---|---|
| Tests | 347 passing, 8 files | **372 passing, 9 files** — 25 on the grid model |
| TypeScript | 75 | **75** — set byte-identical, positions stripped |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Build — main | 1,785.60 kB (476.72 gz) | **1,786.66 kB (476.95 gz)** — +1.06 kB |
| Build — lazy | — | **`FieldFertilizerRateGridPanel` 19.83 kB (6.35 gz)** |
| Migrations | 62 | **63**, matching the database one-for-one |

The panel is lazy, like the Contracts tab: ~20 kB on every first paint of the Fields page,
for a screen most visits never open, is the wrong trade on a bundle already well past
WI-22's target. `database.types.ts` regenerated and spliced on the `// ---` marker rather
than a line count: **5 insertions, 0 deletions**, purely the two new function signatures.

**NOT verified: the panel and its data layer against real data.** The grid's arithmetic has
25 unit tests, the component was driven in a browser, and the RPC was attacked in a
rehearsal — but `loadRateGridContext` and `saveRateGrid` have never run, because this
machine has no Supabase credentials and production still holds **0 rate rows**. The round
trip — save a grid, reload, see the same numbers, watch the field costs move — is the
outstanding check, and it is the one that found both V-5 defects.



### V-6 confirmed end to end, and the decimal places — 6 Sep 2026

**The first per-field rate written against real data, and every figure reconciles.** The
owner set Prairie Stream 2's *Prairie Stream P & K* pass to **2 tons of Rhizosorb P**. What
landed, checked in SQL independently of the client:

| | |
|---|---|
| `field_fertilizer_rates` | Rhizosorb **57.142857142857146 lb/ac** — 2 ton ÷ 70 ac, exactly — and **Potash 75 lb/ac**, carried over untouched |
| The pass's cost | 0.0285714 t × $1399 + 0.0375 t × $450 + $4 = **$60.846428571** |
| The override array | that figure, in the P&K entry, siblings preserved at 39.4625 / 82.75 / 53.9 |
| `total_cost_per_acre` | 653.94 − 224.97 + 236.958929 = **665.93**, which is what is stored |

**The controls are what make it evidence.** Potash was *not* touched and is still 75 lb/ac,
so replace-wholly kept the sibling product rather than dropping it. The program itself is
still 40 lb/ac of Rhizosorb, so nothing leaked back into the shared program. Prairie Stream1
sits on the same template at **$653.94** and did not move. And the delta is exactly right:
the program's own P&K is $48.855/ac, the field's is $60.846, and the field total rose by
**$11.99** — the same number, to the cent.

That closes the check V-6 shipped without: `loadRateGridContext` and `saveRateGrid` had
never run, and now the whole chain — grid → bulk RPC → rates + override → recalculated
total — has been observed working on real data. It is also the first time
`field_fertilizer_rates` has held a row in production.

**And it produced the reason a rate is stored rather than a total.** 57.142857142857146 is
the honest value; §7.1 stores it precisely so the prescription survives a re-measured field.

**The owner's report: too many decimal places in the Field display.** New pure `formatRate`
in `mathUtils.ts` — two decimal places, trailing zeros dropped so 75 stays `75` — used by
both rate tables in `FieldProgramDetails`. 8 tests.

**The guard is the point.** A rate below 0.005 would round to `0`, and `0` reads as *none of
this product on this field* — a different statement entirely, and the exact class of
plausible-wrong number this remediation keeps deleting. When two places would erase a
non-zero rate, `formatRate` keeps enough significant digits to show it is not zero.

**Where it may and may not be used, which is not symmetric:**

| | |
|---|---|
| `FieldProgramDetails` | Pure display. Safe |
| The V-6 grid's Rate/acre box | Safe — the grid saves `cell.rate`, the exact number held in state, and never re-reads the box. Confirmed on screen: the rate reads **57.14** while $/acre stays **$60.85**, which is the figure from 57.142857; rounding the value would have given $60.84 |
| The V-5 single-field editor | **NOT safe, and left at 4 dp.** Its `handleSave` emits `parseNumberField(rateText)` — the text in the box *is* what gets stored — so shortening the display there would round the stored rate on every re-save, touched row or not |

Both files now carry a comment saying so, because 57.1429 sitting beside the grid's 57.14
looks exactly like an inconsistency somebody should tidy up.

**`FieldProgramDetails` could not be rendered here — CONFIRMED BY THE OWNER instead.** It
imports the Supabase client at module load, so it throws on a machine with no credentials —
the same reason F-4b had to split components before anything in this feature could be
looked at. The grid's half was rendered; the field page's half was checked in the running
app and reads the shortened rate. Both halves of the change are now seen working.

That leaves **nothing outstanding on V-6**: the arithmetic has tests, the RPC was attacked
in a rehearsal, the grid was rendered, the save was proven against real data, and the
display was confirmed on screen.

**Floor:** TypeScript 75 (identical set), ESLint 109/28, tests 372 → **380**, build
1,786.66 → **1,786.85 kB**. No migration.


### Field-level fertilizer rates — V-8, the last reader — 6 Sep 2026

**The shopping list and the plan calculator now resolve per field.** Until this, a
custom-rated field was costed correctly on its own page and *ordered at the program's rate*
— Prairie Stream 2's 2 ton of Rhizosorb would have gone to a supplier as 1.4. The field's
money and the field's tonnage came from two different readings of the same plan.

That is the two-table defect this feature has produced three times now, in opposite
directions each time: V-5's display read the program, the reset cleared only one table, and
these two read the program. **This was the last reader that did not know**, and closing it
is what the design doc's §8 lists V-8 as.

| Reader | Was | Now |
|---|---|---|
| `computeFertilizerNeedByProduct` — the shopping list **and** the Contracts tab | walked each program's shared item list | resolves per (field, program) through `resolveFieldFertilizerItems` |
| `computePlanNeed` — the F-6 plan calculator | same | same |

Both go through the one resolver and the one accumulator, so they still differ in **scope**
and cannot differ in **arithmetic** — which is why F-4 extracted the accumulator and V-2
extracted the resolver in the first place.

**`custom` is a REQUIRED argument on `computePlanNeed`, not an optional one.** An optional
parameter would let a caller silently get the pre-V-8 answer, which is exactly how the
shopping list came to disagree with the field page for a day. Callers pass empty collections
to mean "this season has no custom rates" — a statement rather than an omission. Making it
required is also what surfaced the change: eight existing tests failed to compile against
the new signature rather than quietly passing the old behaviour.

**The products map is season-wide, deliberately.** Both functions previously took each
product's metadata from the product embedded in the program item. Under replace-wholly a
field may carry a product its program never had — Prairie Stream 2 could add Urea to the
P & K pass — and a map built from the programs alone would drop that product's tonnage
without a word, because it would simply not appear in the list.

**VERIFIED AGAINST LIVE DATA, independently of the TypeScript.** The resolution was
recomputed in SQL for the 2027 season and compared before and after:

| Product | Before V-8 | After V-8 | Delta |
|---|---|---|---|
| Urea | 63.2025 | 63.2025 | 0 |
| AMS | 23.3730 | 23.3730 | 0 |
| Potash | 3.5625 | 3.5625 | 0 |
| 6-24-6 | 15.5025 | 15.5025 | 0 |
| **Rhizosorb P** | **1.9000** | **2.5000** | **+0.6000** |

Two things make that evidence rather than a number. **Urea's 63.2025 is exactly the figure
the 4 Sep list recorded**, so the query is reproducing the real logic and not an invention
of mine. And **four of five products move by zero**, which is the control: the change is
inert wherever nothing is customised. The one that moves is Prairie Stream 2's 70 acres
going from the program's 40 lb/ac (1.4 t) to its own 57.142857 lb/ac (2.0 t), on top of the
0.5 t another field contributes unchanged.

**A correction worth recording, because the wrong number was nearly written down.** The
first version of that query cross-joined the before and after sets — `FROM products LEFT
JOIN before LEFT JOIN after` — which multiplied every sum by the row count of the other
side. It reported Urea at 2,401 ton and Rhizosorb moving by +1.2 instead of +0.6. Both sides
were inflated, so the shape looked plausible. What caught it was the magnitude failing a
sanity check against a known figure, not the query looking wrong. A verification query needs
checking as hard as the code it verifies.

**Rendering found a defect for the seventh round running, and this one was a lie on screen.**
The plan calculator's footnote still read *"Rates come from the programs as written."* That
was true when F-6 shipped it and V-8 made it false — and false in the expensive direction:
it tells the owner the answer ignores per-field rates, so anyone believing it would adjust
the tonnage a second time for a field already counted at its own rate. It now says which
fields are counted at which rates. **Copy that describes behaviour ages with the behaviour.**

**Checked on screen against hand figures**, with Prairie Stream's real numbers: Prairie
Stream1 at 25 ac × 40 lb = 0.5 t plus Prairie Stream 2 at 70 ac × 57.142857 = 2.0 t gives
**Rhizosorb 2.5 ton**, matching the SQL to the digit; Potash 95 ac × 75 lb = **3.56 ton**.

**Every read in the two changed paths is now checked.** `computeFertilizerNeedByProduct`
swallowed five. A swallowed read there returns a *shorter* list, which reads as a smaller
plan and under-orders — the quiet direction, and the WI-15 lie in its purest form.

**Two baselines moved down, and both are real deletions rather than suppressions:**

- **TypeScript 75 → 73.** Two `TS2352` casts of a `Json` column to `ProgramRef[]` are gone,
  replaced by `Array.isArray` guards. That is a behaviour fix as well as a type fix: a
  non-array `override_value` or `fertilizer_programs` was previously iterated as if it were
  a program list. The remaining 73 are a strict subset of the old 75, compared with
  positions stripped.
- **ESLint 109 → 107.** One `prefer-const` (`let templateMap`) and one `no-explicit-any`
  (`.filter((o: any) => …)`), both in the code rewritten here. Diffed by rule and message,
  not by count.

**Floor:** tests 380 → **386**, build 1,786.85 → **1,787.96 kB** (477.04 → 477.27 gz). No
migration.

**CONFIRMED END TO END by the owner, 6 Sep.** A 2027 fertilizer list generated in the
running app reads **Rhizosorb 2.5 ton**. The stored row proves more than the screen:

| Product | Plan | Contracted | Needed |
|---|---|---|---|
| **Rhizosorb P** | **2.5** | 0 | **2.5** |
| Urea | 63.2025 | **30** | 33.2025 |
| AMS | 23.373 | 0 | 23.373 |
| Potash | 3.5625 | 0 | 3.5625 |
| 6-24-6 | 15.5025 | 0 | 15.5025 |
| Provant Stability | 16.695 gal | 0 | 16.695 |
| ProveN 40 | 95.4 gal | 0 | 95.4 |

`plan − covered − needed = 0.000000` on **every** line. Four things this establishes that
neither the unit tests nor the SQL check could:

- **Rhizosorb's 2.5 is the figure the SQL predicted**, produced by the real code path against
  real rows rather than by a query written to model it.
- **Urea is still 63.2025 / 30 / 33.2025 — unchanged from the 4 Sep list.** So V-8 is inert
  where nothing is customised, *and* the F-2…F-6 contract coverage still works underneath it.
  A regression in either would have shown here.
- **AMS, Potash and 6-24-6 match the SQL to the digit**, which is the control repeated three
  more times.
- **Provant Stability and ProveN 40 arrive in gallons.** Both were outside the SQL check,
  which only compared pound-rated products — so this is the first evidence that the
  quart-to-gallon path through `accumulateNeed` survived the rewrite.

**With that, every reader is confirmed, not merely changed.**

**With this, every reader of a field's fertilizer plan resolves through one function.**
`FieldProgramDetails`, `FieldDetail`'s cost math, the V-5 editor, the V-6 grid, the shopping
list, the Contracts tab and the plan calculator all call `resolveFieldFertilizerItems`. The
next one added must too, and the standing rule in `CLAUDE.md` says so.

### The random reload — R-1, R-5 and R-4 item 2 — 6 Sep 2026

**The first code change against the reload complaint, and it went in without the dump.**
The owner has not been able to catch an `authDiag.dump()`, and the diagnosis's own
sequencing says to instrument before fixing — so the item chosen is the one that sequencing
does not apply to. R-1 aims at the **amplifier**, not a trigger: `App.tsx` returned a
full-screen spinner and a full-screen error card from **above** `DashboardLayout` and all
fourteen pages, so any momentary `loading` unmounted every page, every open modal and every
half-typed form. It contains every trigger in §3, named or not, and would be right even if
that whole section turned out to be wrong about causes.

R-2, R-3, the rest of R-4 and R-7 each aim at a *particular* trigger and are untouched;
**R-2 must not be implemented until the log shows `setUser: true` with `userChanged: false`
in a real session**, which is §4a's whole purpose. R-6, the error boundary, needs no log
either and is the obvious next one.

**What changed:** after the first successful render nothing takes the screen. A refresh
shows a 3 px bar at the top edge; a failed load shows a retry banner and **keeps the data
already on screen**. A farm switch still loads full-screen, because that transition
legitimately replaces everything — expressed by clearing `hasLoadedOnce` at the load rather
than by a second flag. R-5 stops both seasons paths clearing `seasons` on failure, so an
empty list means a *confirmed* empty, and only that may reach "Welcome to Crop Tracker!".
R-4's item 2 moves `sessionStorage.removeItem('activePage')` out of the render body into an
effect; **its behaviour is deliberately unchanged**, because whether an unexpected sign-out
should keep the page is the rest of R-4 and still wants the log.

**The decision is a pure function**, `resolveAppLoadPresentation` in `lib/appLoadState.ts`,
with **15 tests**. That is the `accumulateNeed` / `planLineDraw` pattern, and here it is
what makes the change checkable at all: `App.tsx` imports the Supabase client at module
load, so a rule left inline in it can only ever be verified by reading on this machine.
**Proved to be a regression guard rather than merely green** — with `hasLoadedOnce` forced
back out of the decision, exactly the four R-1 assertions fail and the other eleven pass.

**Rendering found a defect for the eighth round running, and this time it was in the fix.**
The refresh indicator started as a centred pill at `top-3`. At 375 px the header owns the
top of the viewport, so it sat over the season name — *"2027 Growing Season"* rendered as
*"027 Growing Season"*. That is the F-4b defect exactly: the thing obscured is the thing
that matters, and which season you are in is not negotiable. It is now a 3 px bar on the
top edge, which obscures nothing at any width.

**A false claim caught before it was committed.** An intermediate version added `sm:w-full`
to the banner with a comment saying rendering had proved it necessary. Measured with and
without: **448 px both ways** — the apparently shrink-wrapped banner was the 0.625
screenshot scale being misread. Class and comment both removed. *A screenshot is evidence of
what is on screen, not of why.*

**A correction to the diagnosis doc, found while fixing it.** T-4 says a failed seasons load
renders the welcome screen. On the farm path it did not: the catch also sets `dataLoadError`
and the "Failed to Load" gate is tested first, so the error card appeared — a takeover, but
not the first-run lie. The lie was real only on the legacy no-farm branch of `loadSeasons`,
which cleared the seasons and reported **nothing at all**. `dataLoadError` predates the
diagnosis by five months (`a9dcbca`, 14 Mar), so this was wrong when written — and it was
then copied into the 31 Aug instrumentation comment. Recorded in §5a of that document.

**Not verified, and not to be claimed:** no transient `loading` has been observed leaving a
real modal mounted. That needs `App.tsx` against Supabase and is the owner's check — open a
modal on Products, force a token refresh, confirm the modal and its fields survive.

**Floor:** TypeScript **73**, set byte-identical with positions stripped · ESLint
**107 / 28** · tests 386 → **401** · build succeeds, main chunk 1,787.96 → **1,790.05 kB**
(477.27 → 477.80 gz), the three lazy chunks byte-identical. The seasons timeout also went
10 s → 20 s, which costs nothing now that a slow load no longer blanks the page.

## Open items and standing notes

**Nothing in this section is open any more.** It is all practice notes and closed records
kept for the reasoning. The one item that was genuinely open — the `set_active_season` type
drift — was closed by the Round 6 step 1 regeneration; verified 31 Aug, the types file now
declares it with the one argument the function actually takes.

**Migration filenames must match the recorded version.** Applying through the Supabase MCP
stamps its own timestamp, which will not be the one in the filename you wrote. Round 4's
three files were renamed after the fact to match (`203718`, `204336`, `204458`). Check
`list_migrations` against the directory after applying, or a `db push` will try to replay
work that is already in the database.

**CLOSED — the `set_active_season` type drift.** `database.types.ts` declared it with two
arguments where the function takes one, so the compiler was reporting *correct* code at
`App.tsx:216` as broken. Fixed by regenerating the file in Round 6 step 1. Kept here for
the lesson: noise in that direction is worse than a missing error, because it is what
trains a reader to ignore the compiler — which is how the `fetchSharedFarms` message
survived in plain sight for months.

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

*Two items that used to head this list are done and have been removed: proving the override
fix in the running app (6 Sep, on edge function v16 — see* The override fix is PROVEN END TO
END*), and field-level fertilizer rates V-0 … V-8 bar the import.*

### 1. The random reload

`Farm-Manager-Random-Reload-Diagnosis.md`, R-1 … R-7. Diagnosis only; **nothing has been
implemented**, re-verified 31 Aug. Follow that document's own sequencing:

- **Instrument first.** The one-line auth log in its section 4 costs nothing and turns four
  plausible causes into one measured one. Landing R-1 … R-7 without it would repeat exactly
  the mistake the document exists to explain.
- **Then R-1**, which is worth more than the rest combined: it contains every trigger, named
  or not, and demotes each from "the app reset itself" to "a spinner appeared in one panel."

This is also the owner's loudest day-to-day complaint, and the only item in any of these
documents that the person using the app actually feels every day.

### 2. WI-19 — the type and lint baseline

The PRD sequences this as maintainability, after the security work. **That ordering is
wrong and this session proved it.** `fetchSharedFarms` had been broken since it was
written, and `tsc` had been reporting it the whole time in plain language:

```
TS2352: SelectQueryError<"could not find the relation between team_members and user_profiles">
```

It sat inside the 103 errors this document itself taught everyone to treat as background
noise. A whole feature — shared farms — never worked, and the compiler said so on every
run. There is no reason to assume it is the only one.

**Triage the remaining 73 for defects rather than fixing them in bulk.** The 86
`no-explicit-any` lint errors matter for the same reason: `any` suppresses exactly this
class of message. Getting to zero is the goal, but reading them is the value. The
nullability block is the one with real value left, and it is also the argument for R-6 — an
uncaught null is what blanks the whole app when there is no error boundary.

**V-8 is a small worked example of why.** Two of the errors it removed were casts of a
`Json` column to `ProgramRef[]`. Replacing them with `Array.isArray` guards was a behaviour
fix as well as a type fix, because a non-array value had been iterated as if it were a
program list. That is the second time reading this baseline has found a real defect, after
`fetchSharedFarms`.

### 3. Round 6 — performance

PERF-1 … PERF-5. The bundle is the headline: **1,787.96 kB (477.27 kB gz)** against WI-22's
≤ 300 kB gzip target, so it needs `React.lazy` on the pages plus `manualChunks` for
recharts, jspdf and html2canvas. Four lazy chunks exist now — the two fertilizer ones, the
V-6 grid panel and html2canvas — which is the pattern to repeat, not the job done.
PERF-2 is half fixed: V-8 bounded the fertilizer override query with `.in('field_id', …)`;
the chemical one at `shoppingListGeneration.ts:56` is the same two-line change.
PERF-4's O(n²) on-hand trigger now matters more than it did, since Round 4 routes every
work-order and purchase write through it. Note the reload diagnosis's point: this, not
responsive CSS, is the real prerequisite for calling the app mobile-ready.

### 4. WI-21 — CI

Still none. Every figure in this document was measured by hand, which is precisely how the
figures that were wrong at the top of this file got that way, and how a 9-row table came to
be recorded as empty.

### Deliberately deferred, with reasons

- **V-7, the FieldAlytics CSV import** — deferred by the owner on 6 Sep 2026, and correctly
  so. It exists to make the annual entry burden survivable (~100 numbers a season), and the
  V-6 grid it would populate is now built and confirmed working. **Whether the import is
  worth building is a question only a season of real entry answers**, and building it first
  would be guessing at that answer. Nothing is blocked: §10 of
  `Field-Level-Fertilizer-Rates-Design.md` holds the settled column mapping (`Product Total`
  + `Units`; acreage, `Avg Rate` and all three cost columns ignored), the requirement that a
  `--Multiple--` row be refused by name rather than approximated, and §10.7's rule that the
  grid is the review surface and nothing is written until the review is committed.
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

| Metric | Review baseline | After Round 3 | After Round 4 | End of 30 Aug | After Round 6 step 2 | Measured 31 Aug | **Measured 6 Sep** |
|---|---|---|---|---|---|---|---|
| TypeScript errors | 103 | 103 (identical set) | 99 | 98 | 76 | 75 | **73** |
| ESLint | 136 errors, 28 warnings | 134 / 28 | 134 / 28 | 134 / 28 | 109 / 28 | 109 / 28 | **107 / 28** |
| Tests | 0 | 178 passing, 4 files | 206 passing, 5 files | 206 passing, 5 files | 206 passing, 5 files | 282 passing, 7 files | **386 passing, 10 files** |
| CI | none | none | none | none | none | none | **none — still WI-21** |
| Main JS chunk | 1,747 kB (465 kB gz) | 1,754.43 kB (467.56 kB gz) | 1,751.97 kB (467.39 kB gz) | 1,751.96 kB (467.50 kB gz) | 1,751.91 kB (467.46 kB gz) | 1,760.80 kB (470.25 gz) | **1,787.96 kB (477.27 kB gz)** |
| Lazy chunks | — | — | — | — | — | `FertilizerContractsTab` 25.96, `BookingModal` 20.02 | **those two plus `FieldFertilizerRateGridPanel` 19.83 kB (6.36 gz)** |
| Migrations | 40 files | 43 | 46 | 52 | 52 | 58 | **63, diffed against the database one-for-one** |
| Edge function | — | v8 pending | — | v10 | v10 | v13 | **v17, source confirmed in sync by sha256** |

**The 6 Sep column is shopping-list coverage plus field-level rates V-0 … V-8, itemised.**

- **Tests 282 → 386**, every step accounted for: +13 pre-coverage work (282 → 295), +13
  shopping-list coverage (→ 308), +12 V-0 (→ 320), +20 V-2 (→ 340), +7 V-5 (→ 347), +25 V-6
  (→ 372), +8 `formatRate` (→ 380), +6 V-8 (→ **386**).
- **TypeScript 75 → 73**, a strict subset. Both removals are V-8's, where a `Json` column
  was cast to `ProgramRef[]` and is now guarded with `Array.isArray` — a behaviour fix as
  much as a type fix.
- **ESLint 109 → 107**, also V-8: one `prefer-const` and one `no-explicit-any` deleted from
  the code it rewrote. Diffed by rule and message, not by count.
- **Main chunk 1,760.80 → 1,787.96 kB.** +3.71 shopping-list coverage, +0.89 V-0, +15.85
  V-5 (the plan editor is on the eager `FieldDetail` path), +1.06 V-6, +1.11 V-8, and the
  rest is the eager share of the Shopping Lists tab. The V-6 grid panel itself is lazy —
  19.83 kB that never loads unless the screen is opened.
- **Migrations 58 → 63:** shopping-list coverage columns, `field_fertilizer_rates`, the save
  RPC, its `applies` flag, and V-6's bulk RPC.

**The 31 Aug column is the fertilizer feature landing.** 76 → 75 TypeScript and 206 → 282
tests are F-4 … F-6; the main chunk grew 8.89 kB across F-1 (density bridge, +2.38),
F-4 (+0.75), F-4a (+0.95), F-5 (the eager Shopping Lists tab's share of the handoff) and
F-6 (+0.02), with everything else landing in the two lazy chunks. 52 → 58 migrations is
F-1, F-2, F-3, F-4's `save_fertilizer_load`, F-4a's inline spot buys and F-5's
`record_purchase` refusal.

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
