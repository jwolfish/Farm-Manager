# Farm Manager — working notes for Claude

Farm management app for a row-crop operation: fields, seasons, cost templates, chemical
and fertilizer programs, spray planning, inventory, sales and hedging, plus a PDF/CSV
reporting suite. Built in Bolt; the owner is not a developer, so prefer small reviewable
changes and explain trade-offs in plain language.

## Stack

- React 18 + TypeScript + Vite, Tailwind, lucide-react, recharts
- Supabase: Postgres + RLS + Auth + Realtime, one Deno edge function
  (`supabase/functions/process-cascade-task`)
- jsPDF for some exports; other reports build HTML strings and open them as blob URLs
- Supabase project ref: `wvccxjakqwqfmyewclue`

## Current remediation work

A full code review is in progress, executed one work item at a time. Read these before
making changes — they explain what is broken, what has already been fixed, and why.

@docs/Farm-Manager-Remediation-Status.md
@docs/Farm-Manager-Remediation-PRD.md
@docs/Farm-Manager-Code-Review-Summary.md

## Fertilizer contract tracking (feature complete)

Eight steps — F-1, F-2, F-3, F-4, F-4a, F-4b, F-5, F-6 — **all done**. The design records
the reasoning behind decisions that look arbitrary otherwise: why a spot buy is modelled as
a contract, why load lines carry no price, why the plan calculator's field selection is a
note rather than a record.

Not yet exercised: a second user, the `viewer` role, and a browser look at the load ticket
and the booking form. **Rendering a screen has now found a real defect seven rounds
running**, across both this feature and field-level rates — so if something misbehaves,
open the screen before reading the code. Splitting presentation from the Supabase-importing
container is what makes that possible on a machine with no credentials.

Rules this feature keeps re-learning the hard way:

- **A contract is denominated in its product's own unit.** F-3 dropped
  `fertilizer_contracts.unit_type` rather than constrain it, so any conversion between a
  load line's unit and a booking's happens in TypeScript. Do not move it into SQL — that
  is the third copy of the unit table guardrail 7 is about.
- **Never sum a fertilizer quantity across products.** Each product's rollup is in *its
  own* unit, so a cross-product total adds tons to gallons. The season strip did exactly
  that for three figures and looked fine only because every product here is priced by the
  ton (F-4b). Money is the one thing that may be summed across products.
- **`fertilizer_products.price_per_unit` has exactly one writer at a time.** The F-3
  trigger owns it wherever priced bookings exist; the Fertilizers form is the input only
  when there are none; the shopping list never writes it at all (F-5 —
  `record_purchase` raises on a fertilizer line). Do not add a fourth path.
- **One accumulator for plan need.** `accumulateNeed` in `shoppingListMath.ts` is the only
  place rates × acreage become a tonnage — the shopping list, the Contracts tab and the
  F-6 plan calculator all go through it. They may differ in *scope*; they must never differ
  in *arithmetic*. It reports each distinct failure once, not once per field.
- **A shopping-list line stores a gross, a coverage and a net, and the gross is a column.**
  `plan_quantity` − coverage = `needed_quantity`, clamped at zero by `neededAfterOnHand`.
  Because of that clamp the gross cannot be recovered by subtraction from an over-covered
  line, so it is stored rather than derived. Coverage is `on_hand_at_generation` for
  chemical and seed (a shed balance) or `contracted_at_generation` for fertilizer
  (`coveredByContracts` = `max(contracted, delivered)`, *not* "remaining to call"). A line
  never carries both, and they are deliberately separate columns — one column meaning two
  things is what SEC-4 and F-3 were about.

@docs/Fertilizer-Contract-Tracking-Design.md

## Field-level fertilizer rates (V-0 … V-6 and V-8 done; only V-7, the CSV import, remains)

Per-field rates that replace a program's for one pass on one field. The rules that have
already cost defects:

- **A field's custom state lives in TWO tables, and every reader and every clearer must
  know about both.** `field_cost_overrides` holds the numbers and the program list;
  `field_fertilizer_rates` holds the rates behind a program-shaped override. Reading one
  and not the other showed 185 where 200 was stored; clearing one and not the other left
  orphaned rates after a reset. Same defect, opposite directions, hours apart.
  **Every reader now goes through `resolveFieldFertilizerItems` — V-8 closed the last two,
  the shopping list and the plan calculator. Any new one must too.**
- **Replace-wholly.** Any custom rows for a (field, program) pair *are* that field's item
  list for the pass. No rows means inherit. "None of this pass this year" is expressed by
  removing the program from the field's list, not by an empty rate set.
- **The rate is stored; the total is entered.** The rate is what survives a re-measured
  field. Store the total and a changed acreage silently becomes a different prescription.
- **Neither RPC computes the cost or the total.** That needs the unit table and the density
  bridge, and putting those in SQL is the third copy in a third language that F-3 refused.
  The client re-totals after the save; a missed refresh leaves a total stale, not wrong.
- **`save_field_fertilizer_rates` and `save_field_fertilizer_rates_bulk` share one body**
  (`apply_field_fertilizer_rates`, executable by neither role). Do not fork it.
- **A field with no `field_costs` row cannot be given rates.** Applying a cost template
  calls `deleteAllOverrides`, which clears rates too, so they would be destroyed later.
- **`formatRate` is for display and the V-6 grid only — never the V-5 editor.** A derived
  rate is long on purpose (2 ton over 70 ac is 57.142857142857146 lb/ac). The grid saves the
  exact number it holds in state, so it may show `57.14`; the editor saves whatever its box
  *says*, so shortening its display would round the stored rate on every re-save. The two
  looking inconsistent is the correct state.

@docs/Field-Level-Fertilizer-Rates-Design.md

The status doc is the source of truth for what is done. Update it when a round lands.

## Known baseline — do not treat these as regressions you caused

- `npx tsc --noEmit -p tsconfig.app.json` reports **68 errors** (was 103 at review, 98
  before WI-19 began; 75 until V-8 replaced two `Json`-to-`ProgramRef[]` casts with real
  `Array.isArray` guards, and 73 until the chemical path got the same four guards on
  6 Sep, and 69 until WI-29b deleted a dead parameter). The regeneration of
  `database.types.ts` briefly took it to 103 —
  12 errors resolved, 17 revealed that the stale hand-written file had been hiding —
  before the unused-symbol sweep brought it to 76. See the WI-19 section of the status
  doc for the full accounting; every movement is itemised there.
- `npx eslint .` reports **105 errors, 28 warnings** (was 136/28 at review; 109 until V-8
  removed one `prefer-const` and one `no-explicit-any` from the code it rewrote, and 107
  until WI-29b deleted a dead parameter and an unnecessary dependency). **`App.tsx` itself
  now reports zero**, down from five.
- `npx vite build` succeeds and emits **40 chunks**. The number that matters is **first
  paint: 417.29 kB raw / 118.87 kB gzip**, which is `dist/index.html`'s single
  `<script>` and nothing else — measure it that way, by reading the tags out of
  `index.html`, not by looking for "the main chunk". WI-29a added 48.85 kB raw /
  16.29 kB gzip to it (`react-router-dom`, which `App.tsx` imports eagerly) and WI-29b a
  further 2.55 kB raw of module boundaries; WI-22's
  target is ≤ 300 kB gzip, so it is still met with room.

  **WI-22 landed 6 Sep 2026 and changed what these figures mean.** Until then all thirteen
  pages were static imports, so the eager chunk was 1,794.82 kB / 479.30 gz and every
  round's growth landed in it. Twelve pages are now `React.lazy` (`Auth` stays eager), so
  `recharts` (eleven report sub-pages) and `jspdf` (reached through the `lib/exportUtils`
  barrel) are out of the first paint entirely. **479.30 → 102.11 kB gzip**, against WI-22's
  ≤ 300 kB target. WI-29 then took it to **118.87 kB gzip**.

  Consequence for future work: **app-level code is the only thing that still lands in the
  first paint.** R-1's 2.09 kB, R-6's 4.64 kB and WI-29a's 16.29 kB gz did, because they
  are `App.tsx` and `main.tsx`; a change confined to one page no longer does. Total across all chunks went
  593 → 612 kB gzip from chunking overhead, which is the correct trade and not a
  regression — quote first paint, not the total.
- `npm test` reports **435 passing** in 13 files (422 before WI-29a added 13; 401 before R-6 added 21; 386 before R-1 added 15; 380 before V-8 added 6; 372 before
  `formatRate` added 8; 347 before V-6 added 25; 340 before V-5 added 7; 320 before V-2 added 20; 308 before V-0
  added 12; 295 before shopping-list coverage added 13).
- **CI exists as of 6 Sep 2026** — `.github/workflows/ci.yml`, WI-21's core gate. It runs
  tests, the baseline ratchet and the build on every push and PR. The scheduled
  types-drift job and the pgTAP policy-matrix job the PRD also asks for are **not** built;
  both need Supabase credentials in repository secrets.
- Tests arrived with Round 3: `npm test` (Vitest). Test files are excluded from
  `tsconfig.app.json` so they do not move the 103-error baseline.

If any of these numbers move, say so explicitly and account for the difference.

## Guardrails learned the hard way

These are real mistakes made during this work, not hypotheticals.

1. **`$${` is correct.** In a template literal, `$${value}` renders a literal dollar sign
   before an interpolation. It has been mistaken for a typo and stripped twice, silently
   removing the currency symbol from every cost figure in the PDF reports. Never delete
   the leading `$`.

2. **Escape user data going into HTML, but not values that are already entities.**
   Report HTML is opened as a same-origin blob URL, so unescaped names are an XSS vector.
   `src/lib/htmlEscape.ts` exports `esc()`; every dynamic interpolation in
   `src/lib/pdfReports/**` and `src/lib/exports/printExporter.ts` must go through it.
   Do NOT wrap hardcoded literals that already contain `&amp;`, and do NOT escape
   `${styles}` or `${el.outerHTML}` in `printExporter.ts` — that breaks printing.

3. **`REVOKE ... FROM PUBLIC` is not enough on Supabase.** Supabase grants EXECUTE to
   `anon` and `authenticated` via default privileges, so a new function stays callable
   after revoking from PUBLIC. Revoke from the named roles explicitly, then verify with
   `pg_proc.proacl` or `has_function_privilege`.

4. **Every `SECURITY DEFINER` function needs `SET search_path = public, pg_catalog`** and
   an explicit revoke. Check with the Supabase security advisor after any DDL.

5. **One migration file per change.** A duplicated migration was written twice with two
   timestamps; only one applied, and a from-scratch rebuild would fail because
   `CREATE POLICY` has no `IF NOT EXISTS`. Check the migrations directory for a
   near-identical file before adding one.

6. **`src/lib/database.types.ts` is now generated, not hand-written.** Regenerate it after
   every migration (Supabase MCP `generate_typescript_types`) rather than hand-editing —
   hand-maintenance drifted it badly enough to hide a broken feature for months.
   The file ends with a small hand-maintained block that must be preserved across
   regenerations: `CropType`, `UserRole` and `InvitationStatus` are derived from the
   generated `Enums`, but `ProductCategory`, `LedgerEntryType`, `LedgerSourceType` and
   `WorkOrderStatus` are CHECK-constraint columns rather than Postgres enums, so the
   generator cannot emit them. Re-append that block after regenerating.

7. **Cost math exists twice.** `convertUnits`, `calculateCostWithConversion`,
   `calculateFieldTotalCost` and both `recalculate*ProgramCost` functions are implemented
   in `src/lib/` AND again in the edge function, which cannot import from `src/`. A fix
   to one must be applied to the other until WI-27 consolidates them.

8. **`convertUnits()` returns a `ConversionResult`, not a number** (WI-11, landed on
   `main`). Every caller must handle `ok: false` — never fall back to
   the unconverted amount, which is what the old version did silently. Do not "simplify"
   it back to returning a number. Two things that look like bugs and are not: identity
   succeeds even for unrecognised units (`'jug'`→`'jug'` needs no conversion), and
   `bag`, `seed` and `unit` are separate classes on purpose, because bag↔seed needs a
   per-product `units_per_bag` the module does not have.

9. **A field cost override does not live in the column it names.** It lives in
   `field_cost_overrides.override_value`; the `field_costs.<column>` holds the value
   inherited from the template, and `getResolvedFieldCosts` lays the override over it.
   `createOrUpdateOverride` never writes the column. **So anything that totals a field
   must resolve the two first** — use `applyFieldCostOverrides` before
   `calculateFieldTotalCost`, exactly as `recalculateFieldTotal` does. The cascade did
   not, and nine real fields carried a wrong total for six months: the per-item lines on
   screen showed the override while the total silently reverted to the template, wrong in
   *both* directions, with no error anywhere. Mirrored in the edge function per
   guardrail 7. Two things that look like the bug and are not: the guard keys
   `chemical_programs` / `fertilizer_programs` are correct — they are the names for the
   *array-shaped* overrides — and skipping the column write is harmless once the total
   resolves, because the overlay wins on display either way.

10. **The conversion factors are exact integers on purpose.** Mass is based on nanograms
   and volume on femtolitres so that every US customary factor is an exactly
   representable integer below 2^53, which makes lb→oz exactly 16 rather than
   16.000000000000004. Do not "tidy" `OZ_IN_NG` or `FL_OZ_IN_FL` into rounder decimal
   constants — that silently reintroduces float drift into every cost figure.

11. **A load in flight is not a reason to replace the screen.** `App.tsx` returned a
   full-screen spinner and a full-screen error card from **above** `DashboardLayout` and
   all fourteen pages, so one frame of `loading` unmounted every page, every open modal and
   every half-typed form. That is the amplifier behind the "random reload": the trigger
   could be anywhere, the effect was always the whole app. R-1 split the two ideas —
   `loading` says a load is running, `hasLoadedOnce` says whether there is anything worth
   keeping — and the decision now lives in `resolveAppLoadPresentation`
   (`src/lib/appLoadState.ts`) with 14 tests, four of which fail if the takeover is
   reinstated. **Any new app-level early return must go through it.** The one legitimate
   full-screen load is a farm switch, which clears `hasLoadedOnce` at its load. Related:
   a failed load must never clear the data it failed to refresh — an empty seasons list may
   only mean "new farm" when a load actually *succeeded* and found none.

12. **"Reload the page" is correct for exactly one error, and wrong for the rest.** R-6's
   boundaries classify a caught error through `describeRenderError`
   (`src/lib/renderErrorState.ts`, 21 tests). A rejected dynamic `import()` — a tab left
   open across a deploy, so the lazy chunk filename is gone — is the **only** case where a
   reload fixes anything; for every other render error a reload replays the fault after
   destroying whatever else was on screen. The classifier therefore matches the four real
   browser wordings and deliberately does **not** match a bare `Failed to fetch` or
   `NetworkError`, which is what a failed *data* request looks like: advising a reload
   there is advice that cannot work, because the reload needs the same network. Half the
   tests exist to pin that negative. Also: every boundary needs a `resetKey` (or an
   `action`) or the region it guards stays broken until a reload — the blank page in
   miniature.

13. **The URL is the navigation state, and `lib/appRoutes.ts` is the only thing that
   knows how a page key and a path correspond.** WI-29a replaced `activePage` in
   `sessionStorage` with hash routes (`#/fields`, `#/fields/:fieldId`), because the old
   scheme left the history stack with one entry — so the phone's back gesture exited the
   app. `DashboardLayout` still speaks in page keys ('dashboard', 'spray-planner') and is
   deliberately untouched; the mapping is what got extracted, so it can be tested where
   `App.tsx` cannot. **Add a page in both places or not at all** — a sidebar key with no
   route navigates to a URL that falls through the catch-all and bounces to the dashboard,
   which presents as a click that does nothing. Three things that look like oversights and
   are not: `HashRouter` is chosen so a deep link and a refresh need no rewrite rule from
   the host, and swapping it for `BrowserRouter` is the only change needed if a host ever
   provides one; sidebar items are still buttons rather than `<Link>`s, so middle-click and
   open-in-new-tab do not work yet; and `handleBackFromFieldDetail` navigates to `/fields`
   explicitly rather than calling `navigate(-1)`, because a field screen is now reachable
   by link and history.back() with nothing behind it leaves the app — the exact failure
   WI-29 exists to remove.

14. **`App.tsx` is routing and the ORDER of the load gates. Everything else moved out
   (WI-29b, 1,118 → 559 lines).** Where things live now:

   | | |
   |---|---|
   | `hooks/useSeasonData.ts` | Season and farm loading, and the R-1 / R-5 load state |
   | `hooks/useSeasonCrud.ts` | Create / import-into / delete a season |
   | `hooks/useFarmSwitching.ts` | The five farm handlers |
   | `components/app/AppFullScreens.tsx` | The five full-screen blocks, presentation only |

   The gate order in `App.tsx` — fatal error, first load, signed out, confirmed-empty
   seasons, wizard, page — **stays there on purpose**. Which surface a load state earns is
   R-1's whole subject, and a hook that decided when to take the screen would be the
   amplifier coming back by another route. Three rules that came with the split:
   **`useSeasonData` owns three distinct values, not two** — `loading` (a request is in
   flight), `hasLoadedOnce` (something rendered, so there is state worth keeping) and
   `dataLoadError`; collapsing the first two is what R-1 fixed. **Declare a legitimate
   full-screen load with `beginFullScreenLoad()`, alongside the load and never at the top
   of a handler**, so a switch that bails out early does not blank a screen it never left.
   And **`AppFullScreens.tsx` must keep importing nothing from `lib/`** — that is what
   makes those screens renderable on a machine with no Supabase credentials, which is how
   every screen defect in this project has been found.

## Verifying your own work

Bolt and Claude both fail the same way here: confident, plausible, incomplete. Prefer
checks that can return "no" over judgement.

**One command runs the whole floor, and CI runs the same one on every push (WI-21):**

```
npm run verify
```

That is `npm test` → `npm run baselines` → `npm run build`. The middle step is the
interesting one. `tsc` reports **68** and `eslint` **105 errors / 28 warnings** on a healthy
tree, so CI cannot require a zero exit; `scripts/check-baselines.mjs` instead compares
against the committed sets in `baselines/` and fails only on something **new**.

- **Sets, not counts** — one error fixed and one introduced leaves the total unchanged, and
  this document has said since Round 3 that a matching total is not evidence.
- **Line and column are stripped**, so adding a line above an error is not a new error.
- **Fixing something never fails the build.** It prints how many entries disappeared and
  asks you to run `npm run baselines:update` and commit `baselines/` to lock the
  improvement in. Do that in the same commit as the fix.
- **Moving a baseline the wrong way is possible but must be argued.** `--update` will
  happily record new problems; if you use it that way, say why in the commit message.
- Tests have **no** baseline. Green is the standard.

The individual commands still work when you want one of them:

```
npx tsc --noEmit -p tsconfig.app.json   # 68
npx eslint .                            # 105 errors / 28 warnings
npx vite build                          # must succeed; first paint 118.87 kB gz
npm test                                # 435 passing, must stay green
```

**The Supabase CLI is installed as a dev dependency** (`supabase` 2.116.0, added 31 Aug
2026). Deploy the edge function with:

```
npm run deploy:cascade
```

which is `supabase functions deploy process-cascade-task --project-ref wvccxjakqwqfmyewclue
--use-api`. `--use-api` bundles server-side, so Docker is not required, and no
`supabase/config.toml` is needed. **It reads the file from disk** — prefer it to the MCP
`deploy_edge_function` tool, which takes the ~950-line source inline and so risks a
transcription error in the one file that computes every field cost.

Deploying needs a one-time login **run by the owner in their own terminal**. PowerShell
blocks `.ps1` scripts on this machine, so `npx supabase login` fails with
`UnauthorizedAccess` — use `npx.cmd supabase login`, or
`node node_modules\supabase\dist\supabase.js login`. The token is stored by the CLI and
never passes through here. `LegacyPlatformAuthRequiredError` means that login has not been
done or has expired.

**Verify every deploy byte-for-byte** — this is now cheap and there is no excuse for
markers:

```
supabase functions download process-cascade-task --project-ref wvccxjakqwqfmyewclue --use-api
```

into a scratch directory, then compare it against
`supabase/functions/process-cascade-task/index.ts`. Earlier rounds could only compare a
handful of distinctive strings.

**Normalise line endings or the check lies to you.** The repo copy is CRLF (git
`core.autocrlf=true`); the download is LF. A plain `sha256sum` gives two different hashes
and a plain `diff` reports *every* line changed — indistinguishable from a drifted deploy.
Use `diff --strip-trailing-cr`, and hash the local file through `tr -d '\r'`. The same
thing makes a regenerated `database.types.ts` look wholly rewritten when it is not.

**The recorded version number has been wrong four times** (10/11, 12/13, 14/15, 16/17) and
the *source* was correct every time. Read the version from `list_edge_functions`, never
from a document.

For anything touching RLS, policies, or `SECURITY DEFINER` functions, a change is not
verified until the attack it prevents has actually been attempted against the database
and returned zero rows. Reading the policy and concluding it looks correct is not
verification — an open policy and a closed one behave identically until attacked.

When testing against real data, wrap setup and attack in `BEGIN; ... ROLLBACK;` so
nothing persists. Watch for false negatives from empty tables: an `INSERT ... SELECT`
with no source rows inserts nothing and fires no trigger, which reads as "allowed".

## Conventions

- **Do not filter reads by `user_id`.** Since Round 5 every RLS policy is farm-scoped, so
  the database already refuses rows from farms the caller cannot reach; `season_id` or
  `farm_id` does the rest. Adding `.eq('user_id', user.id)` back returns **nothing** on a
  shared farm, because those rows carry the *owner's* id. That single mistake, spread over
  a dozen files, made Dashboard, Fields, Products, Yields, Sales and Reports all render
  empty for a collaborator while Spray Planner and Cost Templates worked. Writes still
  stamp the real author's `user_id`, which is what preserves "who entered this".
- Farm-scoped data hangs off `farms` → `seasons` → `fields`. `master_products` are
  farm-scoped and persist across seasons; season-scoped product rows link to them via
  `master_product_id`. That link must never cross a farm boundary — triggers enforce it.
- `effectiveUserId` from `FarmContext` is the *owner's* id on a shared farm, not the
  viewer's. Queries filtering on the viewer's `user_id` break collaboration.
- Errors are frequently swallowed with `console.error` and no user-visible result. When
  touching a write path, surface failures to the user.
