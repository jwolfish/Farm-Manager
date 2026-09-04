# Shopping List Coverage — What I Already Have vs. What I Need to Buy

**Status:** **Built and verified, 4 Sep 2026.** Findings measured against the live
database; the owner confirmed both open assumptions; all six changes landed. See §8
for what was built and how it differs from the plan.
**Companion docs:** `Fertilizer-Contract-Tracking-Design.md`,
`Field-Level-Fertilizer-Rates-Design.md`, `Farm-Manager-Remediation-Status.md`

---

## 1. What was asked, and the short answer

> *"I don't think the shopping list is looking at current inventory (for chemicals) or
> current contracts (for fertilizer) before calculating the required products."*

Half right, and the half that is wrong is wrong in an interesting way.

| Category | Coverage subtracted today? | Where |
|---|---|---|
| **Chemical** | **Yes** — `master_products.on_hand_quantity` is subtracted | `shoppingListGeneration.ts:161` |
| **Seed** | **Yes** — same, in whole bags | `shoppingListGeneration.ts:432` |
| **Fertilizer** | **No** — contracts are ignored entirely | `shoppingListGeneration.ts:318` |

So chemicals *are* netted against inventory. The reason it does not look like it is that
**the list only ever shows the net.** The gross plan need is computed, subtracted from, and
thrown away — never stored, never displayed. The only trace is a 12-pixel grey line under
the product name, and only when on-hand is above zero:

```tsx
{line.on_hand_at_generation > 0 && (
  <div className="text-xs text-gray-400 mt-0.5">
    On hand at gen: {line.on_hand_at_generation.toLocaleString()} {line.unit_type}
  </div>
)}
```

A column headed **Needed** showing 40 gal, with no indication that the plan said 70 and
30 were in the shed, is indistinguishable from a plan that simply needed 40. That is why
the deduction reads as absent — it is invisible, not missing.

Fertilizer genuinely is missing. The comment says so plainly, and it was correct when it
was written:

```ts
// Fertilizer has no on-hand tracking, by design — it goes on the ground
// rather than into the shed, so there is no balance to subtract.
```

True — but F-2 … F-6 built a different balance in the meantime. A contract is fertilizer
already bought. Nothing told the shopping list.

### Measured on the live database

Chemicals — three lines on each of the August lists carried a real deduction, so the path
works end to end. Every `individual_chemicals` row (68/68) and every `seed_varieties` row
(31/31) is linked to a master product, so the subtraction is not quietly skipped for want
of a link. Three of 29 chemical master products currently hold stock.

Fertilizer — the **Sep 4 2026 list, for the 2027 season**, against the 2027 bookings:

| Product | List says buy | Already booked | Should say buy |
|---|---|---|---|
| **Urea** | **63.20 ton** | **30 ton** | **33.20 ton** |
| 6-24-6 | 15.50 ton | — | 15.50 ton |
| AMS | 23.37 ton | — | 23.37 ton |
| Potash | 3.56 ton | — | 3.56 ton |
| Provant Stability | 16.70 gallon | — | 16.70 gallon |
| ProveN 40 | 95.40 gallon | — | 95.40 gallon |
| Rhizosorb P | 1.90 ton | — | 1.90 ton |

That list would take **30 tons of Urea to a supplier for a second quote** on tonnage
already contracted. This is not hypothetical; it is the list sitting in the database now.

---

## 2. What "already covered" means for each category

The two cases are not the same shape and the plan should not pretend they are.

**Chemical and seed — a balance in the shed.** `master_products.on_hand_quantity`,
maintained from `inventory_ledger_entries` by trigger. Already correct, already unit-aware
(the line's canonical unit is taken from the master product, so on-hand and need are
denominated identically by construction).

**Fertilizer — a commitment at the plant.** There is no shed balance and there should not
be one; §9 of the contract design rules that out deliberately. What exists instead is
`fertilizer_contracts`, and the right question is *"how much of this product have I
already bought, whether or not the truck has come?"*

That is neither "contracted" nor "delivered" on its own:

| Situation | contracted | delivered | Already bought |
|---|---|---|---|
| Booked 30 t, nothing called yet | 30 | 0 | **30** |
| Booked 30 t, 10 t delivered | 30 | 10 | **30** |
| Booked 24 t, 30 t taken (over-drawn) | 24 | 30 | **30** |
| Nothing booked, 24 t delivered unattributed | 0 | 24 | **24** |

Which is exactly `max(contracted, delivered)`. Both figures already come out of
`rollUpProduct` in `fertilizerContractMath.ts`, unit-converted, with unconvertible load
lines excluded and named. **No new rollup arithmetic is needed and none should be
written** — that module is the single owner of contract rollups, the way `accumulateNeed`
is the single owner of plan need.

One decision worth stating rather than assuming: **the deduction is what has been bought,
not what is left to call for.** Tonnage already delivered against a booking still does not
need shopping for. "Remaining to call" is the Contracts tab's number and answers a
different question.

---

## 3. The display problem is the larger half

The ask names it directly: *"display the currently on hand inventory or contracted
fertilizer and then the additional amount that I need to shop and get quotes for."*

Three numbers per line, not one:

```
Urea           Plan 63.20 ton   Booked 30.00 ton   →   Buy 33.20 ton
Roundup PowerMax   Plan 70 gal      On hand 30 gal   →   Buy 40 gal
Potash          Plan 3.56 ton    —                  →   Buy 3.56 ton
```

Today only the third is stored. `needed_quantity` holds the net and `plan` is discarded,
so a past list cannot be reconstructed even in principle — and because
`neededAfterOnHand` clamps at zero, a fully-covered product loses its gross entirely.
Book 40 t of Urea against a 33 t need and the row reads `0`, with nothing anywhere saying
whether the plan was 33 or 3.

So the gross must be **stored**, not derived. Deriving it as `net + covered` is wrong the
moment coverage exceeds need, which over-booking makes routine.

---

## 4. Plan

Six changes. Only the first touches the database.

### C-1 · Migration — two columns on `shopping_list_lines`

```sql
ALTER TABLE shopping_list_lines
  ADD COLUMN IF NOT EXISTS plan_quantity            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contracted_at_generation numeric NOT NULL DEFAULT 0;
```

| Column | Holds |
|---|---|
| `plan_quantity` | Gross plan need, before any deduction, in `unit_type` |
| `contracted_at_generation` | Fertilizer already bought at generation time — the §2 figure |

**Two columns, not one, and `on_hand_at_generation` is left exactly as it is.** A single
`covered_quantity` reading "inventory" on one row and "contract commitment" on the next is
a column that means two things, which this codebase has paid for twice already
(`fertilizer_contracts.unit_type` in F-3, the denormalised `farm_id` in SEC-4). A line
never carries both, so the pair is cheap and each name is true.

No `coverage_source` column: `product_category` already says which one applies.

**Backfill** existing rows so history reads correctly rather than as zeros:

```sql
UPDATE shopping_list_lines
   SET plan_quantity = needed_quantity + on_hand_at_generation
 WHERE plan_quantity = 0;
```

Exact for every existing row except one that was clamped to zero — for those the gross is
unrecoverable and the backfill under-reports. Acceptable on historical data; the live
lists show `lines_with_onhand` of 3, 3, and 0, so at most a handful of rows are affected
and none of them are clamped.

Writes go straight through `supabase.from('shopping_list_lines').insert(...)`, not an RPC,
so **no function needs changing**. No policy, grant or table is touched, so the SEC-5
matrix does not need re-running — same reasoning F-4a used for a body-only change. RLS
already covers the new columns.

Rehearsed in a transaction that ends by raising, rollback confirmed, then applied, per
standing practice. `database.types.ts` regenerated with the hand-maintained tail block
re-appended (guardrail 6).

### C-2 · `coveredByContracts` — one pure function, in the module that owns rollups

In `fertilizerContractMath.ts`, beside `rollUpProduct`:

```ts
/** How much of this product is already bought — booked, delivered, or both. */
export function coveredByContracts(rollup: ProductRollup): number {
  return Math.max(rollup.contracted, rollup.delivered);
}
```

Four lines, and the reason it is a named export rather than an inline `Math.max` is that
the §2 table is a judgement, not an obvious identity, and it should be pinned by tests in
one place.

### C-3 · `fertilizerCoverage.ts` — a lean reader, in its own file

Fetches the season's contracts and load lines, groups by `fertilizer_product_id`, calls
`rollUpProduct`, returns `Map<productId, { covered: number; issues: string[] }>`.

**Its own module, deliberately.** The natural home is `fertilizerContracts.ts`, but that
file already imports `computeFertilizerNeedByProduct` from `shoppingListGeneration.ts`, so
importing back the other way is a cycle. A new module importing only `supabase` and
`fertilizerContractMath` has no such problem, and `loadContractData` can be pointed at it
later to drop its own duplicate grouping.

Every read error thrown, not swallowed — a failed contract read that returned an empty map
would silently restore today's behaviour and shop for the Urea twice. That is the WI-15
lie in its purest form.

Products key by **id**, not name: `computeFertilizerNeedByProduct` already returns
`productId`, so F-5's `matchFertilizerProductByName` fragility does not arise here.

### C-4 · `generateFertilizerLines` — subtract, and keep the gross

```ts
export async function generateFertilizerLines(seasonId, _farmId) {
  const [needs, coverage] = await Promise.all([
    computeFertilizerNeedByProduct(seasonId),
    loadFertilizerCoverage(seasonId),
  ]);

  return needs.map((need) => {
    const cover = coverage.get(need.productId);
    const covered = cover?.covered ?? 0;
    return {
      masterProductId: null,
      productName: need.productName,
      productCategory: 'fertilizer',
      planQuantity: need.total,
      neededQuantity: neededAfterOnHand(need.total, covered),
      onHandAtGeneration: 0,
      contractedAtGeneration: covered,
      unitType: need.unit,
      issues: [...need.issues, ...(cover?.issues ?? [])],
    };
  });
}
```

`neededAfterOnHand` is reused rather than re-clamped — it is already
`Math.max(0, total - covered)` and the two categories must not differ in arithmetic.

Contracts are denominated in their product's own unit (F-3) and the fertilizer line's unit
*is* that unit (`accumulateNeed` is passed `priceUnit`), so **contracts need no conversion
at all**. Load lines can arrive in another unit and `rollUpProduct` already converts them,
flagging any that will not. Those flags join the line's existing `issues`, because an
excluded load line means coverage is an undercount and therefore the buy quantity is an
overcount — the safe direction, but it should still say so.

`generateChemicalLines` and `generateSeedLines` gain `planQuantity: accumulated.total` and
nothing else. Their subtraction is already right.

**A line that is fully covered stays on the list** at Buy 0, rather than being dropped.
Seeing that Urea is handled is the point of the exercise; a silently absent row is how you
end up asking whether the app forgot it. Chemicals already behave this way.

### C-5 · The list screen

Replace the single **Needed** column with three, and delete the grey sub-line:

| Product | Plan Need | Already Have | To Buy | Order Qty | Supplier | $/Unit | Status |

- *Already Have* is headed **On Hand** on chemical and seed lists, **Booked** on
  fertilizer — the header is per-list, so no row has to explain itself.
- Zero coverage renders as `—`, not `0`, so the eye goes to the rows that have some.
- Over-coverage — booked 40 against a 33 t plan — renders To Buy as `0` with
  `7.00 ton over` beneath it in the Contracts tab's red. Silently showing 0 would hide a
  real over-commitment.
- *Order Qty* stays the editable field and still defaults to *To Buy*.

Two extra columns on a table already 7 wide. The house rule for new screens is card-first
(§8 of the contract design), but this is an existing table on an existing tab and
converting it is WI-22 / the `<DataList>` question, not this change's job. It must be
checked at 375 px and given `overflow-x-auto` if it needs it.

**F-5's "Book this" needs no change** and is the reason to be careful here: `startBooking`
prefills from `line.adjusted_quantity ?? line.needed_quantity`, which after C-4 is the
*uncovered* tonnage. Booking from a covered line will then suggest 33.20 t rather than
63.20 t — correct, and today it would double-book. That behaviour is worth a test of its
own, because it is the failure this whole change exists to prevent and it arrives for
free.

### C-6 · The PDF export

`shoppingListPdfExport.ts` mirrors the three columns. The supplier is the audience for
this document, so **Plan Need** and **Already Have** should read as context and **To Buy**
as the quantity being quoted — bold, or the only one repeated in the footer total. The
estimated-cost figures already use `adjusted_quantity ?? needed_quantity` and stay as they
are.

---

## 5. What this deliberately does not do

| Not doing | Why |
|---|---|
| An on-hand balance for fertilizer | Still ruled out in §9 of the contract design. A contract is a commitment, not a shed balance, and this change reads it as one |
| Netting chemical need against unapplied work orders | A drafted work order commits stock that on-hand still counts as available, so the list can under-shop. Real, out of scope, and arguably wanted the other way round |
| Live coverage on an already-generated list | Both columns are `_at_generation` snapshots, matching `on_hand_at_generation`'s existing semantics. A list is a document you took to a supplier; it should not silently restate itself afterwards. Regenerating is the way to refresh |
| Reconciling coverage across seasons | Contracts are season-scoped and so is the list. Fertilizer bought in Oct 2026 for the 2027 crop already lives in the 2027 season by §7 of the contract design |

---

## 6. Interaction with the field-level rates work

`Field-Level-Fertilizer-Rates-Design.md`, in progress on this branch, changes what
`computeFertilizerNeedByProduct` *returns* — the gross, built from per-field rates instead
of one shared program rate. This change subtracts coverage from whatever that produces.
They compose and neither blocks the other; if both land, the rates work makes `Plan Need`
truer and this makes `To Buy` truer.

The one shared risk is `accumulateNeed`. Both changes route through it and CLAUDE.md's
standing rule is that its consumers may differ in *scope* and never in *arithmetic*.
Neither change should acquire its own copy.

---

## 7. Verification

Per standing practice — a check that can return "no" beats a judgement.

**Unit tests** (`fertilizerContractMath.test.ts`, `shoppingListMath.test.ts`):

- `coveredByContracts` over all four §2 rows, plus a rollup whose load lines were excluded
  for an unconvertible unit.
- Fertilizer line generation: 63.20 need against 30 booked yields 33.20; 40 booked yields
  0 with the gross still 63.20; no contract yields today's number unchanged, so the change
  is inert for the six untouched products.
- Chemical and seed generation: `planQuantity` is the gross and `neededQuantity` is
  unchanged from today, byte for byte.
- Coverage `issues` reach the line and are deduplicated by the `Set` F-6 added.

**Against the live database**, read-only: regenerate the 2027 fertilizer list and confirm
Urea reads Plan 63.20 / Booked 30.00 / Buy 33.20 and the other six are unmoved.

**In a browser** — this is the part with the record. F-4a, F-4b and F-6 each found a real
defect by rendering, none of which reading had caught, and this change is two new columns
on a table that has never been checked narrow. Note the F-5 follow-up finding: this tab
imports the Supabase client at module load and throws on a machine with no credentials, so
the harness needs the row presentation split out the way F-6 split `PlanCalculator` from
`PlanCalculatorModal`.

**Floor**, with any movement accounted for: TypeScript 75 (sets compared with line
positions stripped), ESLint 109 / 28, tests 295 → up, `vite build` succeeds, migrations
58 → 59.

---

## 8. As built — 4 Sep 2026

All six changes landed. Two departures from the plan, both found by doing the work.

### The migration — `20260904183110_shopping_list_line_coverage_columns`

Exactly as planned: `plan_quantity` and `contracted_at_generation`, both
`numeric NOT NULL DEFAULT 0`, plus the backfill. Column comments carry the meaning so
the next reader does not have to find this document.

**Rehearsed before applying — 9 assertions, 0 failures**, then rollback confirmed (no
columns, no probe row, 59 lines intact), then applied for real.

The rehearsal earned its keep in the way rehearsals usually do: assertion 3 asserted
three rows would gain a gross above their net, and got six. **The assertion was wrong,
not the migration** — three lines carried on-hand on *each* of the two August chemical
lists. It now measures the expected count before the change rather than hard-coding a
number read off a single list.

Verified after applying: both columns present and correctly typed, 0 rows where
`plan_quantity <> needed_quantity + on_hand_at_generation`, 0 rows with invented
coverage, 4 policies still on the table.

`database.types.ts` regenerated and spliced mechanically. The diff is the six expected
column lines (two columns × Row/Insert/Update) plus five parenthesisations the generator
now emits in its own helper types — cosmetic, and confirmation the file carried no other
drift. The hand-maintained tail block was re-appended by script and checked for all
seven aliases.

### Departure 1 — the row was extracted so it could be looked at

`ShoppingListsTab` imports the Supabase client at module load and throws on a machine
with no credentials, so nothing inside it had ever been rendered. The plan said to check
the new columns at 375 px; that was not possible without a split.

So `ShoppingListLineRow.tsx` is a new file: pure presentation, no Supabase import, no
state — editing state stays on the tab, because the tab is what saves it. Same cut F-6
made between `PlanCalculator` and `PlanCalculatorModal`, for the same reason. 157 lines
of inline JSX became a 17-line call site.

### Departure 2 — the coverage column folds into the product cell on a phone

**Rendering found the defect, again — four rounds running.** With nine columns at
375 px the table scrolls, and the column that fell off the right edge was **To Buy** —
precisely the one the whole change exists to surface. Reading the markup would never
have shown this; the desktop view is fine.

Tightening the column padding was tried first and abandoned: 16 px against an overflow
of several hundred is fiddling, and inconsistent padding is worse than none.

What shipped instead: the coverage column is `hidden sm:table-cell`, and below `sm:` its
value appears as a small line under the product name — *"Booked 30 ton"*. So a phone
shows Product / Plan Need / To Buy with coverage in the product cell, and all three
numbers are on screen. The red *"7 ton over"* line survives at both widths.

This is a narrow responsive treatment of one table, not the `<DataList>` the contract
design deliberately deferred (§8, *Deliberately not built*): it generalises nothing and
adds two utility classes.

### Verified in a browser

A throwaway Vite entry mounted the real `ShoppingListLineRow` with seven fertilizer and
three chemical fixtures — the live Urea case, no coverage, over-booked, exactly covered,
a gallon-priced liquid, a booked-and-purchased line, and a four-figure quantity — at
1280 px and 375 px, then deleted along with its HTML entry.

### Verified against live data

The coverage arithmetic was recomputed independently in SQL against the 2027 season and
compared line for line with the Sep 4 list:

| Product | List said buy | Covered | Now says buy |
|---|---|---|---|
| **Urea** | 63.2025 ton | **30 ton** | **33.2025 ton** |
| 6-24-6, AMS, Potash, Provant Stability, ProveN 40, Rhizosorb P | — | 0 | unchanged |

Six of seven products are untouched, which is the evidence the change is inert where
there is nothing booked.

### Floor

| | Before | After |
|---|---|---|
| Tests | 295 passing, 7 files | **308 passing, 7 files** — 11 on `coveredByContracts`, 2 on the clamp |
| TypeScript | 75 | **75** — sets compared with line positions stripped, identical |
| ESLint | 109 errors, 28 warnings | **109 / 28** |
| Build — main | 1,763.95 kB (471.50 gz) | **1,767.66 kB (472.37 gz)** — +3.71 kB |
| Build — CSS | 45.57 kB | **45.61 kB** — the two responsive classes |
| Migrations | 58 | **59** |

The main chunk grew because `ShoppingListsTab` is eager: the coverage reader, the
extracted row and the two PDF columns all land there. The lazy fertilizer chunks are
byte-identical, which is the expected result and would have meant something was wrong
otherwise.

### Confirmed end to end by the owner — 4 Sep 2026, 18:52 UTC

**A fertilizer list generated in the running app reads Urea 33.2 ton.** This section
previously said the write path had never been exercised; it now has been, and the stored
row proves more than the screen does:

| Product | `plan_quantity` | `contracted_at_generation` | `needed_quantity` | `adjusted_quantity` |
|---|---|---|---|---|
| **Urea** | 63.2025 | **30** | **33.2025** | 33.2025 |
| 6-24-6, AMS, Potash, Provant Stability, ProveN 40, Rhizosorb P | = needed | 0 | unchanged | unchanged |

`plan − covered − needed = 0.000000` on every row. Three things this establishes that
the unit tests and the SQL check could not:

1. **`loadFertilizerCoverage` resolves the product by id against real data** — 30 t
   landed on Urea and nowhere else.
2. **All three columns are written**, not just the one on screen. A version that
   displayed correctly while storing only the net would have looked identical.
3. **Order Qty defaults to the net**, which is what makes the F-5 *Book this* prefill
   suggest 33.20 t rather than 63.20 t. That was the double-booking this change existed
   to prevent, and it now demonstrably does not happen.

Six of seven products unchanged is the evidence the change is inert where nothing is
booked — the same control the SQL check used, now through the real code path.

### The chemical side, confirmed the same day — 4 Sep 18:56 UTC

Ten lines, **six carrying a real on-hand deduction** — double what the August lists had,
because inventory has moved since:

| Product | Plan | On hand | To Buy |
|---|---|---|---|
| Ag Saver Glyphosate | 30.797 gal | 15 | 15.797 |
| Sharp | 22.8125 gal | 6.5 | 16.3125 |
| Enlist One | 18.25 gal | 7.5 | 10.75 |
| 2,4D LV6 | 11.406 gal | 3.5 | 7.906 |
| Predator | 1.711 gal | 1 | 0.711 |
| **NanoPro** | **2.281 gal** | **3** | **0** — covered, and 0.72 gal long |

**The over-coverage case arrived on its own, on the first chemical list.** This section
previously said no product had ever been covered past its plan and the red *"n over"*
line had been seen only against fixtures. NanoPro is that case, in production.

It is also the clearest possible argument for the design decision in §3. For that row
`plan − covered − needed` is **not** zero — it is −0.72, because the clamp fired. Every
other row on both lists reconciles to exactly 0.000000. Had the gross been derived as
`net + covered` instead of stored, NanoPro would read 3 gal of plan need that nobody
planned, and the 0.72 gal of surplus would be invisible. The one row that breaks the
subtraction is the row the column exists for.

### Still not done

- **The red over-coverage line has not been seen rendered against real data**, only
  against fixtures — though NanoPro now makes that a ten-second look rather than a
  contrivance.
- **No fertilizer product has been booked past its plan.** The chemical path now covers
  the over-coverage arithmetic; the fertilizer path reaches it through
  `contracted_at_generation` rather than `on_hand_at_generation`, and that particular
  combination has not occurred.
