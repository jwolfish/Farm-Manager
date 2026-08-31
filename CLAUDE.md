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

## Fertilizer contract tracking (new feature, in progress)

Seven steps, F-1 … F-6 plus F-4a. **F-1 … F-4 are merged on `main`; F-4a is on
`f-4a-ticket-first-spot-buys`.** F-5 (shopping-list handoff) and F-6 (plan calculator)
remain. The design records the reasoning behind decisions that look arbitrary otherwise —
why a spot buy is modelled as a contract, why load lines carry no price, why the plan
calculator's field selection is a note rather than a record.

Two rules this feature keeps re-learning the hard way:

- **A contract is denominated in its product's own unit.** F-3 dropped
  `fertilizer_contracts.unit_type` rather than constrain it, so any conversion between a
  load line's unit and a booking's happens in TypeScript. Do not move it into SQL — that
  is the third copy of the unit table guardrail 7 is about.
- **`fertilizer_products.price_per_unit` has more than one writer.** The F-3 trigger owns
  it wherever priced bookings exist; the Fertilizers form is the input only when there are
  none. Anything that writes it must know which case it is in.

@docs/Fertilizer-Contract-Tracking-Design.md

The status doc is the source of truth for what is done. Update it when a round lands.

## Known baseline — do not treat these as regressions you caused

- `npx tsc --noEmit -p tsconfig.app.json` reports **75 errors** (was 103 at review, 98
  before WI-19 began). The regeneration of `database.types.ts` briefly took it to 103 —
  12 errors resolved, 17 revealed that the stale hand-written file had been hiding —
  before the unused-symbol sweep brought it to 76. See the WI-19 section of the status
  doc for the full accounting; every movement is itemised there.
- `npx eslint .` reports **109 errors, 28 warnings** (was 136/28 at review).
- `npx vite build` succeeds and emits a **1,755.99 kB** main chunk (468.72 kB gz), plus a
  lazy **35.21 kB** `FertilizerContractsTab` chunk (9.33 kB gz). It was
  1,751.91 kB before fertilizer F-1, which added 2.38 kB for the density bridge, the
  Liquid checkbox and its help text; F-4a added 0.95 kB to the main chunk and 6.50 kB to
  the lazy one, which is where the new load-ticket modal lives.
- `npm test` reports **249 passing** in 6 files.
- There is **no CI**. Adding it is WI-21 in the PRD.
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

9. **The conversion factors are exact integers on purpose.** Mass is based on nanograms
   and volume on femtolitres so that every US customary factor is an exactly
   representable integer below 2^53, which makes lb→oz exactly 16 rather than
   16.000000000000004. Do not "tidy" `OZ_IN_NG` or `FL_OZ_IN_FL` into rounder decimal
   constants — that silently reintroduces float drift into every cost figure.

## Verifying your own work

Bolt and Claude both fail the same way here: confident, plausible, incomplete. Prefer
checks that can return "no" over judgement:

```
npx tsc --noEmit -p tsconfig.app.json   # must stay at 75 or drop
npx eslint .                            # must stay at 109 errors / 28 warnings, or drop
npx vite build                          # must succeed
npm test                                # must stay green
```

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
