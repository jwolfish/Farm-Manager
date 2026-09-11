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
and the booking form. **Rendering a screen has now found a real defect in nine of the last
thirteen rounds**, across both this feature and field-level rates — so if something misbehaves,
open the screen before reading the code. Splitting presentation from the Supabase-importing
container is what makes that possible on a machine with no credentials.

**But do not over-trust that streak.** Rendering catches what is *visible* — a wrapped
label, a column off the right edge, a tap target measured too small. It does not catch
behaviour under a real input sequence, and the only defect from this work to reach
production was of that kind: a menu that opened and did nothing on a phone, found by the
owner after three cosmetic defects had been caught on the same screen. A streak counted by
defects rather than by severity is not measuring what it appears to.

*The harvest tracker (10 Sep) is the thirteenth round, and rendering found nothing in it —
recorded here rather than quietly dropped. What did find two defects that round was the
baseline ratchet, and what found a third was reading `tsc`'s output. Rendering is one
instrument, not the instrument.*

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

## Field editing (U-1 … U-4 and MOB-3, 10 Sep 2026)

- **`field_costs.seed_variety_id` has two writers and they mean different things.**
  `saveFieldSeed` (`fieldSeedCrud.ts`) changes the seed and nothing else; the template
  wizard sets it while replacing the field's whole cost row. Until U-1 the wizard was the
  only one, so changing a field's seed went through `deleteAllOverrides` and destroyed its
  per-field fertilizer rates. **Do not route an ordinary seed change through a template
  application.**
- **Anything that calls `deleteAllOverrides` must warn by name first.** It clears
  `field_cost_overrides` *and* `field_fertilizer_rates`. `describeCustomisationLoss`
  (`fieldCustomisation.ts`) counts both tables and names the fields; the three callers are
  unlink, reset-all and apply-template. A warning that reads one table would clear a field
  that is about to lose the other.
- **`seedCostMath.ts` is the one seed cost.** `bags/ac = rate ÷ units_per_bag`, `× price`.
  It refuses rather than returning 0 when a variety has no `units_per_bag` — the wizard
  still *saves* 0 for backward compatibility, but it shows the reason.
- **Three shared primitives now, and new controls use them:** `ResponsiveModal` (sheet on a
  phone), `NumberField` (decimal keypad, 46 px), and `ActionMenu` (popover on desktop,
  bottom sheet on a phone). The menu is a sheet on a phone on purpose — a popover anchored
  to a card in a scrolling grid has three ways to render half off-screen.
- **`element.click()` IS NOT A CLICK, and a browser check that uses it proves almost
  nothing about an interactive control.** It dispatches a `click` with no preceding
  `mousedown`, so anything keyed to press-down — outside-close, drag start, focus
  management — never runs. Nor is a synthetic `mousedown`+`mouseup`+`click` in **one task**
  enough: React has not re-rendered between them, so a row that the press *should* have
  unmounted is still there when the click lands, and the check passes. Both of those passed
  over an `ActionMenu` that was **completely inert on a phone** — the menu opened, the
  outside-close listener fired on `mousedown` against a container it did not know about, the
  row unmounted before `mouseup`, and no `click` was ever dispatched. The owner found it in
  production. **Space the three events across tasks, and assert the element survived the
  mousedown.**
- **≥ 44 px is a measurement, not a comment.** Three controls in this round carried a
  comment claiming 44 and rendered at 40, 40 and 36. `p-3` on a `w-5` icon is 44; `p-2.5`
  is 40; `p-2` is 36. Check with `getBoundingClientRect`, in the browser.

The status doc is the source of truth for what is done. Update it when a round lands.

## Harvest tracker (H-1 … H-5, 10 Sep 2026)

A phone screen for entering a field as it comes off, and a per-crop progress view. It does not
add a yield number — it replaces the planning estimate with a measured one, in place.

- **`field_yields` is ONE row per field, and `yield_bushels_per_acre` is "the best number
  available"** — the estimate until the field is cut, the actual afterwards. Three readers
  take it blindly (`useDashboardMetrics` cost per bushel, `useReportData`, the Yields screen),
  and that is deliberate: it is what makes cost per bushel become an actual figure with no
  change to any of them. `estimated_yield_bushels_per_acre` holds the forecast and survives
  harvest untouched, because "estimated to go" is that column summed over the fields not yet
  cut. **Do not add a `field_harvests` table** — a second source means every reader resolves
  two and picks a winner, which is the two-table defect the field-rates work produced three
  times.
- **`harvested_at` is the ONLY test for "this field is off", via `isHarvested` /
  `isHarvestedRow` in `harvestProgress.ts`.** Two spellings, one body. Not a harvest date: a
  date in that box says only that somebody typed one. The 2026 wheat field carried one before
  this feature existed and it could not say whether the field had been cut — it had, and the
  app had nowhere to record that, which is precisely why the date proves nothing either way.
  Not a yield above zero either — all 30 of 2026's estimate rows would read as harvested.
  Both of those production rows are tests, and they fail if anyone re-derives the predicate.
- **Progress is measured in acres; bushels are never summed across crops.** Twelve of thirty
  fields can be a fifth of the crop, and a season "total bushels" adds corn to soybeans — the
  same error as F-4b's tons-added-to-gallons. `summariseHarvest` returns one row per crop and
  deliberately offers no total.
- **A field with no estimate is counted and named, never read as zero.** 2027 has 32 fields
  and no yield rows; "0 bushels to go" for them is the WI-15 lie in its quiet direction.
- **The Yields autosave is the hazard, and the guard is in the hook.** It fires 1.5 s after a
  keystroke with no notion of what is already in the row, so a cursor left in a yield box on a
  harvested field would overwrite a measured number with a typed one. Disabling the input is
  the affordance; `autosaveYield` refusing is the writer. The Yields screen writes BOTH
  columns while a field is standing, so the estimate never goes stale.

@docs/Harvest-Tracker-Design.md

## Known baseline — do not treat these as regressions you caused

- `npx tsc --noEmit -p tsconfig.app.json` reports **63 errors** (was 103 at review, 98
  before WI-19 began; 75 until V-8 replaced two `Json`-to-`ProgramRef[]` casts with real
  `Array.isArray` guards, and 73 until the chemical path got the same four guards on
  6 Sep, 69 until WI-29b deleted a dead parameter, and 68 until the field-editing work
  fixed three on 10 Sep — an undeclared `readOnly` prop, a dead parameter and a form reset
  that dropped two fields, and 65 until the harvest tracker fixed two more the same day — a
  SECOND undeclared `readOnly`, this one on `Yields`, and an interface declaring a nullable
  cost column non-null). The regeneration of
  `database.types.ts` briefly took it to 103 —
  12 errors resolved, 17 revealed that the stale hand-written file had been hiding —
  before the unused-symbol sweep brought it to 76. See the WI-19 section of the status
  doc for the full accounting; every movement is itemised there.
- `npx eslint .` reports **105 errors, 27 warnings** (was 136/28 at review; 109 until V-8
  removed one `prefer-const` and one `no-explicit-any` from the code it rewrote, 107 until
  WI-29b deleted a dead parameter and an unnecessary dependency, and 106 until the
  field-editing work deleted another on 10 Sep). **`App.tsx` itself now reports zero**,
  down from five.

  **This line said 105 / 28 from 6 to 10 Sep and the split was wrong** — the committed
  baseline held 106 / 27 the whole time. The total, 133, was right; nothing had moved a
  warning. Quote the split above, and if it ever disagrees with `baselines/eslint.txt`,
  the baseline is the measurement and this sentence is not.
- `npx vite build` succeeds and emits **45 chunks**. The number that matters is **first
  paint: 410.00 kB raw / 116.54 kB gzip**, which is `dist/index.html`'s single
  `<script>` and nothing else — measure it that way, by reading the tags out of
  `index.html`, not by looking for "the main chunk". WI-29a added 48.85 kB raw /
  16.29 kB gzip to it (`react-router-dom`, which `App.tsx` imports eagerly), WI-29b a
  further 2.55 kB raw of module boundaries, and the Netlify move 1.36 kB raw for
  `BrowserRouter` in place of `HashRouter`, the field-editing work 0.13 kB raw, and the harvest tracker 0.99 kB raw for its route, sidebar item and page label (the page itself is a 17.19 kB lazy chunk); WI-22's
  target is ≤ 300 kB gzip, so it is still met with room.

  **WI-22 landed 6 Sep 2026 and changed what these figures mean.** Until then all thirteen
  pages were static imports, so the eager chunk was 1,794.82 kB / 479.30 gz and every
  round's growth landed in it. Twelve pages are now `React.lazy` (`Auth` stays eager), so
  `recharts` (eleven report sub-pages) and `jspdf` (reached through the `lib/exportUtils`
  barrel) are out of the first paint entirely. **479.30 → 102.11 kB gzip**, against WI-22's
  ≤ 300 kB target. WI-29 then took it to 118.87, and the Netlify move to
  **119.11 kB gzip**, the field-editing work to **119.16**, and the harvest tracker to **119.43**.

  **Those last two figures are WRONG and the tree is the measurement.** `main` at
  `4e9b451` builds **409.98 kB raw / 116.54 kB gzip**, not 419.77 / 119.43. Measured on
  10 Sep by building `main` directly, because a +0.02 kB change appeared to have saved
  9.77 kB — the discrepancy was in the record, not the diff. This is the same class as
  the edge-function version being wrong five times and the ESLint split being wrong for
  four days: **build it and read `dist/index.html`, never quote this paragraph.** The
  per-round deltas above are still each other's differences and are probably fine; it is
  the absolute figure that drifted, and nobody has re-derived where.

  Consequence for future work: **app-level code is the only thing that still lands in the
  first paint.** R-1's 2.09 kB, R-6's 4.64 kB and WI-29a's 16.29 kB gz did, because they
  are `App.tsx` and `main.tsx`; a change confined to one page no longer does. Total across all chunks went
  593 → 612 kB gzip from chunking overhead, which is the correct trade and not a
  regression — quote first paint, not the total.
- `npm test` reports **489 passing** in 17 files (463 before the harvest tracker added 26; 456 before the ActionMenu fix added 7; 435 before the field-editing work added 21; 422 before WI-29a added 13; 401 before R-6 added 21; 386 before R-1 added 15; 380 before V-8 added 6; 372 before
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
   `sessionStorage` with real routes (`/fields`, `/fields/:fieldId`), because the old
   scheme left the history stack with one entry — so the phone's back gesture exited the
   app. `DashboardLayout` still speaks in page keys ('dashboard', 'spray-planner') and is
   deliberately untouched; the mapping is what got extracted, so it can be tested where
   `App.tsx` cannot. **Add a page in both places or not at all** — a sidebar key with no
   route navigates to a URL that falls through the catch-all and bounces to the dashboard,
   which presents as a click that does nothing. Three things that look like oversights and
   are not: **`BrowserRouter` depends on `public/_redirects`**, the `/* /index.html 200`
   rewrite the Netlify move added on 6 Sep — those two move together, and a host without
   that rule needs `HashRouter` back, which is the one-line reversal (the symptom is that
   in-app navigation works while every refresh and pasted link 404s); sidebar items are
   still buttons rather than `<Link>`s, so middle-click and
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

## Hosting — Netlify, deployed by CI (6 Sep 2026)

The app left Bolt on 6 Sep 2026. There is **no publish step**: push to `main`, CI runs the
floor, and only then does a `deploy` job upload `dist/`. A pull request gets its own
preview URL. Full detail is in `DEVELOPER_GUIDE.md` → Deployment; the parts that bite:

- **`public/_redirects` is why `BrowserRouter` is allowed.** See guardrail 13. It and the
  router type move together or refresh returns 404.
- **`public/_headers` marks `/assets/*` immutable and `index.html` not cacheable.** The
  second half matters: a cached `index.html` names chunk filenames a deploy has deleted,
  which manufactures R-6's chunk-load error on purpose.
- **Deploys are gated on `verify`, not on Netlify's Git integration.** Do not connect the
  Netlify site to the repository as well — it would build on every push regardless of
  whether the floor passed, and deploy twice.
- **A build with no `VITE_SUPABASE_*` succeeds and ships a white page**, because
  `supabase.ts` throws at module import, above React and above every error boundary. The
  deploy job greps the bundle for the URL rather than trusting the build's exit code.

## Verifying your own work

Bolt and Claude both fail the same way here: confident, plausible, incomplete. Prefer
checks that can return "no" over judgement.

**One command runs the whole floor, and CI runs the same one on every push (WI-21):**

```
npm run verify
```

That is `npm test` → `npm run check:readonly` → `npm run baselines` → `npm run build`.
`tsc` reports **63** and `eslint` **105 errors / 27 warnings** on a healthy tree, so CI
cannot require a zero exit; `scripts/check-baselines.mjs` instead compares against the
committed sets in `baselines/` and fails only on something **new**.

- **Sets, not counts** — one error fixed and one introduced leaves the total unchanged, and
  this document has said since Round 3 that a matching total is not evidence.
- **Line and column are stripped**, so adding a line above an error is not a new error.
- **Fixing something never fails the build.** It prints how many entries disappeared and
  asks you to run `npm run baselines:update` and commit `baselines/` to lock the
  improvement in. Do that in the same commit as the fix.
- **Moving a baseline the wrong way is possible but must be argued.** `--update` will
  happily record new problems; if you use it that way, say why in the commit message.
- Tests have **no** baseline. Green is the standard.

**`npm run check:readonly` is the newest step and exists because the other two are blind
to it.** `App.tsx` hands `readOnly={activeRole === 'viewer'}` to seven pages, and the
contract has broken three times. Two of those — `Fields` and `Yields`, both 10 Sep — were
pages that never *declared* the prop, which `tsc` reports as a TS2322 and the ratchet
therefore catches. The third, `SalesTracking`, **declared it and never bound it**: six
commodity sections rendered full add / edit / delete for a viewer. Declaring the prop is
exactly what silences `tsc`; an interface member is not an unused variable, so `eslint`
says nothing either. It survived two sweeps of the baseline because the instrument was
blind, not because anyone was careless — hence a check of its own
(`scripts/check-readonly-props.mjs`). **A new page that takes `readOnly` must bind it.**

The individual commands still work when you want one of them:

```
npx tsc --noEmit -p tsconfig.app.json   # 63
npx eslint .                            # 105 errors / 27 warnings
npx vite build                          # must succeed; first paint 116.54 kB gz
npm test                                # 489 passing, must stay green
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
- **An RLS-empty result is not a fact. This has now cost three defects.** A `select` that
  returns zero rows because the policy hid them is indistinguishable from one that found
  nothing — and the code has three times read the second meaning into the first.
  `fetchSharedFarms` returned `[]` and no shared farm appeared for months; V-8 iterated a
  non-array `override_value`; and on 11 Sep `sendInvitation` read `user_profiles` for an
  invitee it could not see, so signup-then-invite produced an invitation the invitee could
  never accept. **Never branch on "no rows" for a table whose policy can hide the row from
  this caller.** Resolve it in a `SECURITY DEFINER` function that can see what the caller
  cannot — `link_invitation_to_account` is the worked example — and always destructure
  `error`, because all three of these discarded it.
- **Invitations have two orders and both must work.** Invite-then-signup is handled by the
  `resolve_pending_invitations_for_new_user` trigger; signup-then-invite by the
  `link_invitation_to_account` RPC. **They share one body**
  (`link_pending_invitations_for_user`, executable by neither role) on purpose — the
  trigger's old body *was* that body, and a second copy is the guardrail 7 shape. No email
  is ever sent by this app, by the owner's decision; the invitation waits in-app.
