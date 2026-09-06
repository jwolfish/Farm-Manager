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

- `npx tsc --noEmit -p tsconfig.app.json` reports **69 errors** (was 103 at review, 98
  before WI-19 began; 75 until V-8 replaced two `Json`-to-`ProgramRef[]` casts with real
  `Array.isArray` guards, and 73 until the chemical path got the same four guards on
  6 Sep). The regeneration of `database.types.ts` briefly took it to 103 —
  12 errors resolved, 17 revealed that the stale hand-written file had been hiding —
  before the unused-symbol sweep brought it to 76. See the WI-19 section of the status
  doc for the full accounting; every movement is itemised there.
- `npx eslint .` reports **107 errors, 28 warnings** (was 136/28 at review; 109 until V-8
  removed one `prefer-const` and one `no-explicit-any` from the code it rewrote).
- `npx vite build` succeeds and emits a **1,794.82 kB** main chunk (479.30 kB gz), plus
  three lazy chunks: **25.96 kB** `FertilizerContractsTab` (7.10 gz), **19.63 kB**
  `BookingModal` (5.90 gz) — shared by the Contracts tab, the Shopping Lists tab and the
  plan calculator — and **19.83 kB** `FieldFertilizerRateGridPanel` (6.36 gz).

  It was 1,751.91 kB before fertilizer F-1, which added 2.38 kB for
  the density bridge, the Liquid checkbox and its help text; F-4a added 0.95 kB to the main
  chunk and 6.50 kB to the lazy one; F-5 added the Shopping Lists tab's share of the handoff
  to the main chunk and split `BookingModal` out; F-4b added the season summary to the lazy
  Contracts chunk only; F-6 added the plan calculator to the lazy chunks and **0.02 kB** to
  the main one; shopping-list coverage added **3.71 kB** to the main chunk, which is eager;
  field-rates V-0 added **0.89 kB**, the override read and two badges in
  `FieldProgramDetails`; V-5 added **15.85 kB** for the per-field plan editor on the eager
  `FieldDetail` path; V-6 added only **1.06 kB** to the main chunk, putting its grid panel in
  a lazy chunk of its own; V-8 added **1.11 kB**; the reload work's R-1 added
  **2.09 kB**, which is eager because it is `App.tsx`; and R-6's error boundary added
  **4.64 kB**, eager for the same reason — it is `main.tsx` and `App.tsx`.
- `npm test` reports **422 passing** in 12 files (401 before R-6 added 21; 386 before R-1 added 15; 380 before V-8 added 6; 372 before
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

## Verifying your own work

Bolt and Claude both fail the same way here: confident, plausible, incomplete. Prefer
checks that can return "no" over judgement.

**One command runs the whole floor, and CI runs the same one on every push (WI-21):**

```
npm run verify
```

That is `npm test` → `npm run baselines` → `npm run build`. The middle step is the
interesting one. `tsc` reports **69** and `eslint` **107 errors / 28 warnings** on a healthy
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
npx tsc --noEmit -p tsconfig.app.json   # 69
npx eslint .                            # 107 errors / 28 warnings
npx vite build                          # must succeed
npm test                                # 422 passing, must stay green
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
