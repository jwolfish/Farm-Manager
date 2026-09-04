# Field-Level Fertilizer Rates — Options and Plan

**Status:** Options paper. Nothing implemented, nothing agreed. Written 3 Sep 2026.
**Companion docs:** `Fertilizer-Contract-Tracking-Design.md`,
`Farm-Manager-Remediation-Status.md`

---

## 1. The ask

Fertilizer rates vary field by field, from soil tests and the variable-rate prescription
that follows. Today the app has one rate per product per program, shared by every field
the program touches, so the per-field figure has been a hand-averaged approximation.

Now that the shopping list feeds a supplier quote, and the quote becomes a contract with a
blended price that cascades back into field costs, the approximation costs more than it
did. If the tonnage that goes to the supplier is built from an average, the contract is
built from an average, and every field cost downstream inherits it.

**What is wanted:** enter real per-field rates where they are known, keep the template
flat-rate path exactly as it is for fields that get the same blend, and have both feed one
tonnage total.

**What is deliberately not wanted:** sub-field zone data. A VR prescription varies inside a
field; this stores the field-average, which is the number that buys fertilizer. Storing the
soil test itself was ruled out as feature creep (§7, question 4).

---

## 2. How a field gets a fertilizer cost today

```
fertilizer_program_items (rate, unit)  ×  fertilizer_products (price, unit, density)
  → recalculateFertilizerProgramCost      → one $/ac per program
  → cost_templates.fertilizer_programs[]  → [{program_id, cost_per_acre}, …]
  → field_costs.fertilizer_cost_per_acre  → the sum of those
  → field_costs.total_cost_per_acre
```

The rate lives on the **program**, which is shared. That single fact is the whole problem —
there is no seam between "which pass" and "how much on this field".

Two seams already exist and neither closes it:

| Existing seam | What it does | Why it is not enough |
|---|---|---|
| `field_cost_overrides` with a **number** under `fertilizer_cost_per_acre` | Pins one field's fertilizer $/ac | Moves money, not tonnage. The shopping list still computes need from program rates, so the field's cost and the fertilizer actually ordered for it silently disagree |
| `field_cost_overrides` with a **`ProgramReference[]`** under `fertilizer_programs` | Gives one field a different *set of programs* than its template | Swaps which passes run, not the rates inside them. And see §3 — this shape has never worked end to end |

Live data, 3 Sep 2026, for scale:

| | |
|---|---|
| 2027 season | 30 fields, 777 ac; **17 have a cost row**, all on one template (`Corn Typical`, 3 fertilizer programs) |
| 2026 season | 30 fields, 30 cost rows, 29 templated across 7 templates |
| `field_cost_overrides` | **9 rows, all numeric** — 0 program-shaped |
| `field_fertilizer_applications` | **0 rows**, referenced by no code (see §6) |

A representative program: `Corn Fall Fertilizer T&L` = Potash 165 lb/ac + TSP 100 lb/ac.
That is exactly the pair a soil test moves in opposite directions on the same field, which
is why a single scaling factor per field will not do (§4, Option D).

---

## 3. Four defects this feature would make live

All four sit in the `ProgramReference[]` override shape. All four are harmless **only**
because production has zero rows of that shape. Any design that writes one arms all four,
so they are step zero regardless of which option is chosen.

1. **`getResolvedFieldCosts` totals a program-shaped override wrong.** It overlays with
   `resolvedCosts[itemName] = value`, so the array lands under the key `fertilizer_programs`
   — which `calculateFieldTotalCost` never reads — while `fertilizer_cost_per_acre` keeps
   the template figure. `recalculateFieldTotal` then stores the *template* total. This is
   the same shape as the override defect fixed on 31 Aug, in the one place that fix did not
   reach: `applyFieldCostOverrides` exists and handles the array correctly, and this
   function does not call it.

2. **`cascadeProgramUpdateInSeason` never refreshes a program-shaped override.** It walks
   `cost_templates` only. The `cost_per_acre` inside an override array is a frozen snapshot,
   so a fertilizer price change — including one from a new contract booking — would move
   every template field and leave every custom-rated field stale. Present in **both** copies
   of the cascade (guardrail 7).

3. **`FieldProgramDetails` ignores overrides entirely.** It reads
   `field_costs.template_id → cost_templates.fertilizer_programs` and nothing else, so a
   field with its own programs would display its template's programs. The screen would be
   confidently wrong about the thing the feature exists to show.

4. **A numeric `fertilizer_cost_per_acre` override and per-field rates would fight.** Both
   claim the field's fertilizer money, and nothing coordinates them — the same "two writers,
   last one wins" pattern F-4a and F-5 spent two rounds removing from
   `fertilizer_products.price_per_unit`.

---

## 4. Options

### Option A — Keep averaging

Cost: nothing. Still viable, and worth stating plainly: it has been wrong in a *known*
direction, which is better than wrong in an unknown one.

What it forfeits is the round trip. The shopping list is now the document a supplier quotes
against, so an averaged tonnage becomes a contracted tonnage, a blended price, and a field
cost — the error stops being confined to one screen.

### Option B — Per-field cost override only

Already possible today: type a number on the field's fertilizer line.

**Rejected.** It moves money without moving tonnage. Field costs would be right and the
shopping list would be wrong, with nothing on either screen saying so. That is the exact
class of quiet disagreement the last six rounds have been removing.

### Option C — Per-field program set (the existing array override)

Give a field its own list of programs. The mechanism exists; the shopping list already
honours it.

**Insufficient alone.** It answers "this field gets a different pass", not "this field gets
the same blend at a different rate", which is the actual requirement. It also carries all
four defects in §3.

### Option D — Per-field rate multiplier

One factor per field per program: 0.9 × the program.

**Rejected.** Soil tests move P and K in opposite directions on the same field. Potash 165
→ 200 while TSP 100 → 60 is not a multiplier.

### Option E — Per-field rate rows *(recommended)*

A sparse table keyed `(field_id, program_id, fertilizer_product_id)` holding a rate and a
unit. No rows for a (field, program) pair means inherit the program, exactly as today. Any
rows means that set **is** the field's item list for that pass.

- Fields that flat-rate keep working with zero new data — the template path is untouched.
- Only deviations are stored: 3 VR fields out of 17 costs 3 fields' worth of rows.
- "Reset to program" is a delete, so the escape hatch is trivial and obvious.
- Replace-wholly rather than per-item merge, because a merge has to explain what an absent
  row means and a replacement does not. It also covers the case Option F is for: a field
  whose product list genuinely differs from the program just has a different set of rows.
- The program keeps its meaning as a *pass* — which matters, because `application_cost`
  ($4/ac on most programs here) is per pass, not per product.

### Option F — Per-field standalone fertilizer plan

Drop the program relationship for VR fields; give the field its own product list. Could
reuse the empty `field_fertilizer_applications` table.

**Close second.** It is a cleaner mental model in isolation, but it loses the pass grouping
and the application cost, loses "reset to program", and creates a second way a field can
have fertilizer — one template-shaped, one not — that every consumer (cost, shopping list,
plan calculator, reports) then has to branch on. Option E covers its one real advantage.

---

## 5. Recommended design

### 5.1 Schema — one table

```
field_fertilizer_rates
  id                     uuid pk
  field_id               uuid not null → fields (cascade)
  program_id             uuid not null → fertilizer_programs (cascade)
  fertilizer_product_id  uuid not null → fertilizer_products (cascade)
  application_rate       numeric not null check (>= 0)
  application_rate_unit  text not null
  sort_order             integer
  user_id                uuid not null       -- the real author, per convention
  created_at, updated_at
  unique (field_id, program_id, fertilizer_product_id)
```

Following the F-2 precedents:

- **No denormalized `farm_id`.** RLS resolves it `field_id → fields → seasons.farm_id`
  via `can_view_farm` / `can_edit_farm`, the shape Round 5 batch 2 settled on.
- **Consistency triggers, SECURITY INVOKER**, comparing season ids rather than testing
  caller visibility (per the correction in §10b of the fertilizer design doc): the
  program's season and the product's season must both equal the field's season.
- **`check >= 0`, not `> 0`**, so a product can be zeroed on a field while staying visible
  in the editor rather than vanishing.

### 5.2 One resolver, and where the money lands

A new pure `resolveFieldFertilizerItems(field, programs, customRates)` returns, per field
per program, the effective item list — custom rows if any exist for that pair, program items
otherwise. **Every consumer goes through it**: the field's $/ac, the shopping list, the
Contracts tab, the F-6 plan calculator. They may differ in scope; they must never differ in
arithmetic. That is the same rule `accumulateNeed` is already held to, and this resolver
sits directly upstream of it.

The resulting per-field cost is written as a **program-shaped `field_cost_overrides` row**
(`cost_item_name = 'fertilizer_programs'`), one entry per program in the field's effective
list, custom cost where custom, program cost where inherited.

That choice is deliberate. It is not a new mechanism — it is the signal the cascade already
understands. `cascadeTemplateUpdate` skips `fertilizer_cost_per_acre` when that key is
present, and `applyFieldCostOverrides` already sums the array into the right column, **in
both copies including the edge function**. Writing the number straight into
`field_costs.fertilizer_cost_per_acre` instead would leave the next template cascade free to
stomp it.

The rate table is the source of truth; the override is a derived cache with exactly one
writer.

### 5.3 Entry

Two ways in, one data shape:

- **On the field.** `FieldDetail`'s Fertilizer Programs section becomes editable — per
  program, a table of products prefilled with the program's rates, a *Custom rates* badge,
  and *Reset to program*. Rate/ac and total-for-the-field are shown side by side and either
  can be typed, because a prescription summary usually reads as a total.
- **A grid.** Rows = fields, columns = products, one program at a time. Entering 17 fields
  one modal at a time is the thing that would make this feature go unused; a soil-test
  spreadsheet already looks like this grid.

### 5.4 What must change, by file

| Area | Change |
|---|---|
| `templateLib/fieldCostOverrides.ts` | `getResolvedFieldCosts` to use `applyFieldCostOverrides` — defect 1 |
| `templateLib/cascadeUpdates.ts` | Refresh program-shaped overrides on a program price change — defect 2 |
| `functions/process-cascade-task/index.ts` | The same, mirrored — guardrail 7 |
| `components/fields/FieldProgramDetails.tsx` | Read the override, not just the template — defect 3 |
| `shoppingListGeneration.ts` | `computeFertilizerNeedByProduct` walks resolved items |
| `fertilizerPlanMath.ts` | `computePlanNeed` takes per-field rates |
| `FieldDetail.tsx` | Block or warn on a numeric fertilizer override where rates exist — defect 4 |
| `FieldDetail.tsx` | New control: which programs run on this field — §7.2 |
| new | `fieldFertilizerRates.ts` resolver + math, `save_field_fertilizer_rates` RPC |

`seasonImport.ts` needs no change: rates do not carry forward (§7).

---

## 6. `field_fertilizer_applications`

Created 20260205170031, **0 rows, referenced by no code**, but with live farm-scoped RLS
from Round 5 batch 3. Its sibling `field_chemical_applications` is in the same state.

They are a trap for the next reader: the names describe precisely what this feature does,
and they are not what it uses. Recommend **dropping both** in the schema step, in a
migration that asserts they are empty first. (Their two dropped cousins,
`field_*_program_applications`, sat in `database.types.ts` for six months after being
dropped from the database — this is the same class of debris, still attached.)

---

## 7. Decisions — answered by the owner, 3 Sep 2026

| # | Question | Decision |
|---|---|---|
| 1 | Replace-wholly, or per-product merge? | **Replace-wholly** |
| 2 | Rate per acre, or total tons? | **Enter the total**; both are readable off the prescription |
| 3 | Carry rates forward on season import? | **No** — and this is the answer that changed the design |
| 4 | Store the soil test itself? | **No** — feature creep |
| 5 | Zero on a field — a 0 row? | **No 0 rows anywhere.** See 7.2 |
| 6 | Chemicals too? | **No.** "More programmatic with chemicals than with fertilizer; what changes in season is often trivial and will not be tracked here" |
| 7 | The untemplated 2027 fields | Soybeans usually get no fertilizer ahead of them. One correction outstanding — see 7.3 |

### 7.1 Entry is the total; the *rate* is still what is stored

The stored value stays `application_rate`, in the rate's own unit. The total is an entry
mode and a display, derived as `rate × acreage`.

That is not a preference, it is which number survives an acreage change. Fields get
re-measured, split, and lose headlands. If the total is stored, a changed acreage silently
changes the rate — the prescription quietly becomes a different prescription. If the rate is
stored, a changed acreage changes the total, which is right: more acres needs more product.

Round-tripping is exact enough to be invisible, because
`fertilizer_program_items.application_rate` is an **unconstrained `numeric`** with no scale
limit, and the new column will match it. 8.2 ton entered on 43 ac stores 381.3953… lb/ac and
reads back as 8.2 ton. Had it been the `numeric(10,2)` used for money and acreage, it would
not have.

**The entry field can legitimately fail.** Tons typed against a lb/ac rate needs a
conversion, and a liquid entered in gallons against a per-ton price needs the density
bridge. `convertProductUnits` already does both, including returning `needs-density`. The
form must surface that failure by name rather than quietly producing no number — the same
rule F-5 applies to the booking suggestion.

### 7.2 No carry-forward makes "none this year" a first-class case, and that changed the design

The reason given for no carry-forward is the important part: *"I often fertilize one field
with multiple years of fertilizer, and then apply zero the next year."* So a field running
zero of a pass is not an edge case to be tolerated — it is a routine state, and it happens
the year after every double application.

**No situation needs a 0 row. Absence is always the answer.** What differs is *what* is
absent:

| Situation | How it is stored | Cost and tonnage |
|---|---|---|
| Field has no fertilizer program at all — soybeans, or a template with an empty fertilizer list | Nothing. No rows anywhere | $0, no tonnage. Already works today |
| Field runs the pass but skips one product — Potash went on last year, TSP still goes | Custom row set for that (field, program) holding **only TSP**; Potash is simply absent | Potash contributes nothing |
| Field runs the template but gets **none of this pass** | The program is removed from **this field's program list** | The pass contributes nothing |

The third row is the case the original design did not cover, and the owner's question found
it. Under replace-wholly, "no rows means inherit the program" leaves no way to say *custom,
and the custom answer is nothing* — zero rows is indistinguishable from never having touched
it.

So the field editor needs one more control: **which programs run on this field**, as a
checkbox per program above the rate table. It writes the same
`field_cost_overrides('fertilizer_programs')` row the derived costs land in — the mechanism
Option C describes, promoted from unused to load bearing.

**This weakens one of the design's selling points, and that should be said plainly.** §5.2
claimed that override row has exactly one writer. It still has one writer, but now two
inputs: a user decision about which passes run, and a derived cost per pass. Any code
touching it must preserve the first while recomputing the second — precisely the mistake
pattern this project keeps finding, so it needs a test of its own rather than a comment.

**One thing this decision makes cheaper:** `seasonImport.ts` needs no change at all.

### 7.3 Correction outstanding on question 7

The answer covers 12 of the 13 fields. The 13th is **Home West of Lane, 29 ac, wheat**,
which has no `field_costs` row at all — so no seed, no chemicals and no costs of any kind,
not merely no fertilizer. There is a `Wheat Template` and a `Wheat Spring Urea` program in
2026, both used by no field.

Separately, and not a fertilizer question: 2027 currently costs **382 of its 777 acres**,
because the 12 soybean fields have no cost row either. Reasonable in early September for a
2027 crop, but worth knowing before any 2027 total is read as complete.

---

## 8. Sequencing

Each step independently verifiable, per the standing practice.

| # | Step | Verified by |
|---|---|---|
| **V-0** | Fix the four latent override defects (§3). No migration, no new feature | Unit tests pinning the array shape end to end; the 9 existing numeric overrides unchanged |
| **V-1** | Migration: `field_fertilizer_rates`, triggers, RLS; drop the two dead application tables | Rehearsed in a rolled-back transaction, SEC-5 matrix extended, then applied, then rollback confirmed |
| **V-2** | `resolveFieldFertilizerItems` + per-field cost math, pure and unit-tested | Worked example checked by hand; identical output to today for a field with no custom rows |
| **V-3** | Cascade refresh of program-shaped overrides, **both copies**, edge function deployed | `sha256` of the downloaded function against the repo copy; a real price change observed leaving a custom-rated field correct |
| **V-4** | `save_field_fertilizer_rates` RPC — delete, insert, recompute override, recompute total, one transaction | Rehearsed; a bad line leaves no partial rate set; stranger and `anon` refused |
| **V-5** | Field-level entry UI: which programs run (§7.2), then rates, entered as totals (§7.1) | Rendered in a browser at 1280 px and 375 px before it is called done; a test that editing rates preserves the program list and vice versa |
| **V-6** | Bulk grid | Same |
| **V-7** | Shopping list and plan calculator honour per-field rates | One season's tonnage computed by hand against the app |

**V-3 must land before V-5.** Until it does, a custom-rated field is protected from being
stomped by a template cascade but goes stale on a price change — and a fertilizer booking
changes prices, which is the whole reason this feature exists.

**Browser verification is not optional here.** Rendering screens found real defects three
rounds running on the fertilizer feature; V-5 and V-6 are the two steps most exposed to it.

---

## 9. Honest risks

- **Guardrail 7, again.** This adds a second thing the cascade must resolve per field, in
  two hand-synchronised copies. Every sync so far has been correct, which is precisely why
  one eventually will not be. This is the strongest argument yet for WI-27.
- **The override table becomes load bearing.** It currently holds 9 rows and has cost this
  project one six-month money defect already. This puts every VR field through it. V-0 is
  not optional throat-clearing; it is what makes the rest safe.
- **Entry burden, now annual.** 17 fields × 3 programs × 2–3 products is ~100 numbers, and
  nothing carries forward (§7), so it is ~100 numbers *every* season. If V-6's grid is not
  good, the feature will not get used and the averages will come back. This is the single
  largest risk to the feature being worth building.
- **The override row now carries a user decision as well as a derived one** (§7.2). Every
  code path that recomputes the costs must preserve the program list, and vice versa.
- **Two sources of tonnage truth in the owner's head.** Once some fields are custom and some
  are template, "what does the plan say" needs the screen to make the split visible — which
  fields deviate, and by how much.
