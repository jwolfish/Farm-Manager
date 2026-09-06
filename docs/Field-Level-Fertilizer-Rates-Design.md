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

### 5.2a The save RPC cannot compute the cost itself — found building V-2

V-4's RPC is specified as "delete, insert, recompute override, recompute total, one
transaction". The middle step cannot happen in SQL.

Recomputing the override means turning rates into a `$/ac`, which needs
`rate × acreage → the product's unit → price` — a **unit conversion**, including the
density bridge for a liquid. Putting that in the RPC would be the third copy of the unit
table, in a third language, computing the number that drives every field cost. That is
exactly what F-3 refused when it dropped `fertilizer_contracts.unit_type`, and guardrail 7
records that the existing two copies have needed hand-syncing three times.

**So the client computes the cost and passes it in.** `costResolvedItems` (V-2) produces
it; the RPC's job is to write the rate rows, the program-shaped override and the field
total **atomically**, not to derive any of them. Payload shape:

```
{ field_id, program_id, program_cost_per_acre, rates: [{product_id, rate, unit, sort}] }
```

The RPC still validates — `can_edit_farm`, the season match, and that
`program_cost_per_acre` is a finite non-negative number — because a client-supplied figure
that lands in money must not be taken on trust. It simply does not *recalculate* it.

This is the same division F-4a settled for `save_fertilizer_load`, where a contract's
quantity is converted client-side into the product's unit before the RPC ever sees it.

### 5.3 Entry

Two ways in, one data shape:

- **On the field.** `FieldDetail`'s Fertilizer Programs section becomes editable — per
  program, a table of products prefilled with the program's rates, a *Custom rates* badge,
  and *Reset to program*. Rate/ac and total-for-the-field are shown side by side and either
  can be typed, because a prescription summary usually reads as a total.
- **A grid.** Rows = fields, columns = products, one program at a time. Entering 17 fields
  one modal at a time is the thing that would make this feature go unused; a soil-test
  spreadsheet already looks like this grid.
- **A CSV import** of the FieldAlytics summary, which populates that same grid for review
  rather than writing anything directly. See §10 — it is what makes the annual entry burden
  survivable, and it is the reason the grid has to be good.

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

Separately, and not a fertilizer question: 2027 does not yet cost all of itself, because the
soybean fields have no cost row either. Reasonable in early September for a 2027 crop, but
worth knowing before any 2027 total is read as complete.

*Re-measured 4 Sep, later the same day: 2027 has grown to **32 fields / 872 acres**, of
which **22 fields / 550 acres** carry a cost row — Prairie Stream 1 and 2 were added during
this session. The shape of the point is unchanged; the numbers move whenever fields are
added, which is the argument for measuring them rather than quoting this paragraph.*

---

## 8. Sequencing

Each step independently verifiable, per the standing practice.

| # | Step | Verified by |
|---|---|---|
| **V-0** | **DONE 4 Sep 2026.** Defects 1–3 fixed; defect 4 is a V-5 guard and cannot be built before rates exist. No migration, no behaviour change for any existing row | 12 new tests (308 → 320); the old overlay reproduced beside the new one so a revert fails; tsc set byte-identical at 75; lint 109/28; the 9 numeric overrides re-checked in production and unchanged. Edge function mirrored but **not deployed** — that is V-3 |
| **V-1** | **DONE 4 Sep 2026** — migration `20260905040540` applied. The two dead application tables were **not** dropped; see §6 | Rehearsed 12/0 then rolled back, applied, rollback confirmed. SEC-5 matrix extended 101 → **120 assertions, 0 failures**. Advisor at the documented 12 WARN baseline |
| **V-2** | **DONE 4 Sep 2026** — `src/lib/fieldFertilizerRates.ts`: the resolver, the cost math, and the §7.1 rate/total round trip. Not yet wired to anything | 20 tests (320 → **340**), including the control that a farm with no custom rates accumulates identically to the program-only path. Build byte-identical, which confirms nothing imports it yet |
| **V-3** | **Deployed 5 Sep 2026 — edge function v16.** Code landed in V-0; the cascade has not yet been observed running | `sha256` of the downloaded function against the repo copy; a real price change observed leaving a custom-rated field correct |
| **V-4** | `save_field_fertilizer_rates` RPC — write rates, override and total in one transaction. **It does not compute the cost; see §5.2a** | Rehearsed; a bad line leaves no partial rate set; stranger and `anon` refused |
| **V-5** | Field-level entry UI: which programs run (§7.2), then rates, entered as totals (§7.1) | Rendered in a browser at 1280 px and 375 px before it is called done; a test that editing rates preserves the program list and vice versa |
| **V-6** | Bulk grid — fields down, products across, one program at a time. **Also the import review surface** (§10) | Same. Must stand on its own, because V-7 depends on it |
| **V-7** | **Optional** CSV import of the FieldAlytics per-field export into that grid (§10) | Parsed against the real exported file; a `--Multiple--` row refused by name, not approximated; the imported total round-trips through the shopping list exactly; nothing written until the review is committed |
| **V-8** | Shopping list and plan calculator honour per-field rates | One season's tonnage computed by hand against the app |

**V-3 must land before V-5.** Until it does, a custom-rated field is protected from being
stomped by a template cascade but goes stale on a price change — and a fertilizer booking
changes prices, which is the whole reason this feature exists.

**V-3's deploy was held back overnight on 4 Sep and done on 5 Sep with the owner present.**
The reason for waiting: the cascade is the single function that computes every field cost,
and Deno is not installed on this machine, so it could be bundled but not typechecked.
Deploying unattended would have left the running money math unverified-by-use.

**Deployed 5 Sep as version 16**, byte-verified in both directions — the running source was
downloaded and diffed against the pre-V-0 repo copy *before* replacing it (identical, so
nothing had drifted while the copies were deliberately out of step), then downloaded again
after (`sha256 30908b59…`, 1,151 lines, diff clean). The two copies are back in step.

**What remains is the observation, not the deploy.** No cascade has run since, so the
end-to-end path is still proven by reading and by 12 unit tests. See the V-3 section of the
status doc for the baseline table to compare against.

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
  nothing carries forward (§7), so it is ~100 numbers *every* season. This was the single
  largest risk to the feature being worth building. **§10's CSV import is the answer to it**
  — but that turns it into a dependency rather than removing it: if the import proves
  fragile, the manual path is all that is left. So the grid must be good enough to use on
  its own, and must not be allowed to coast on the import that has not been built yet.
- **The override row now carries a user decision as well as a derived one** (§7.2). Every
  code path that recomputes the costs must preserve the program list, and vice versa.
- **Two sources of tonnage truth in the owner's head.** Once some fields are custom and some
  are template, "what does the plan say" needs the screen to make the split visible — which
  fields deviate, and by how much.

---

## 10. Importing VR prescriptions — added 4 Sep 2026

Proposed by the owner against §9's entry-burden risk. Typing ~100 numbers a season is what
would kill this feature; the numbers already exist in a file. Written against a real
FieldAlytics export, not an imagined format.

**The import is optional.** The grid (V-6) is the primary surface and must work without it.

### 10.1 The CSV summary, not the shapefile and not the PDF

Three formats arrive with every script: a shapefile triple (`.shp` / `.shx` / `.dbf`, rates
in the `.dbf`), a human-readable PDF with maps and a tonnage block, and a summary CSV
exported from FieldAlytics.

**The CSV, and the reason is better than convenience.** The `.dbf` holds *zone* rates —
sub-field, which §1 excludes. Turning those into a field figure means area-weighting each
zone, which needs the polygon geometry from the `.shp`, so a shapefile parser and a
planimetry step, all to reproduce a number FieldAlytics has already computed. And if the two
ever disagreed, the vendor's figure is the one the applicator actually spreads. The PDF is
worse: layout-dependent, and it breaks silently on a template change.

The shapefile stays the fallback if the summary ever proves untrustworthy. It is not the
first cut.

### 10.2 The export must be split by field

FieldAlytics can group the report or break it out per field. **Count on the per-field
export** — the owner can split it before running the report.

This matters because the first sample arrived *grouped*: `Field Name` read `--Multiple--`,
with one row per product carrying a combined total across every field the Rx covered. That
file cannot produce per-field rates. It says 8.78 ton of Potash went somewhere across
97.82 acres, and nothing in it says how much landed on each field.

Splitting such a total across picked fields by acreage was considered and **rejected by the
owner.** It would keep the tonnage exact — 8.78 ton is 8.78 ton however it is divided — but
it manufactures per-field rates that *look* measured and are not, and six months later
nothing would distinguish them from real ones. That is precisely the defect class this
remediation has spent six rounds removing.

So a `--Multiple--` row is **refused by name**, with the fix stated: re-run the report split
by field. Not silently skipped, not approximated.

### 10.3 A script is a pass, so an import is scoped to one program

The rate table is keyed `(field, program, product)`, and the export names a field and a
product but never says *which pass*. Rather than infer it, the import is scoped: "import
this script as **Corn Fall Fertilizer T&L**." That matches how scripts are produced — one
script is one application — and removes the only genuinely ambiguous column.

One import = one program × the fields the file names.

### 10.4 The columns, from the real file

Header row as exported, 4 Sep 2026:

```
Status, Farm Name, Field Name, Rx Name, Date Entered, Product, Applied Acres,
Field Acres, Product Total, Units, Avg Rate, Units, Total Product Cost,
Cost/Applied Acre, Cost/Acre
```

| Column | What the import does |
|---|---|
| `Product Total` + `Units` | **The number this import exists for.** `tons` normalises to `ton`; that alias already exists in `unitConversions` |
| `Field Name` | Matched to a field (§10.6). `--Multiple--` is refused (§10.2) |
| `Product` | Matched to a `fertilizer_products` row, confirmed rather than guessed (§10.6) |
| `Rx Name` | Prefills the import's note — `26 Rec` |
| `Farm Name` | Sanity check only. `T&L Farm` against `T & L Doolittle Farms LLC`; never used to route a write |
| `Applied Acres`, `Field Acres` | **Ignored.** The owner's instruction, and the correct call — see §10.5 |
| `Avg Rate` + `Units` | **Ignored.** It is per *applied* acre — see the warning in §10.5 |
| `Total Product Cost`, `Cost/Applied Acre`, `Cost/Acre` | **Ignored.** Fertilizer prices belong to the F-3 contracts trigger. An import must never touch money |
| `Status`, `Date Entered` | Ignored. Dates are unconstrained anyway (§7) |

Nine of the fifteen columns are deliberately unused. Worth saying, so the next reader does
not assume they were forgotten.

### 10.5 What gets stored — the total drives the rate

The file gives a total; §7.1 stores a rate. So the import divides:

```
stored rate = Product Total ÷ the app's acreage for that field
```

converted into the rate's unit.

**Divided by the app's acreage, deliberately.** The tonnage is what must round-trip: the
shopping list recomputes `rate × acreage`, so dividing by the same acreage it will later
multiply by returns exactly the imported total. Dividing by the file's `Field Acres` or
`Applied Acres` would make the shopping list disagree with the prescription — the one thing
this import exists to prevent. `fields.acreage` itself is never written.

> **The stored rate will not equal the file's `Avg Rate`, and that is correct.**
> `Avg Rate` is per *applied* acre. In the sample, Potash is 191.08 lb/ac over 91.87
> **applied** acres of a 97.82-acre Rx, because the script zeroes some zones — and
> 191.08 × 91.87 ÷ 2000 = 8.78 ton, which confirms the reading. The app has no
> applied-versus-field distinction, so its rate is a field average and is necessarily
> lower. Anyone later "fixing" the import to carry `Avg Rate` through verbatim will
> silently inflate every tonnage by the ratio of field acres to applied acres.

### 10.6 Matching, and the picker

| What must match | Handling |
|---|---|
| **Field name** | Exact → automatic. Differs only by case or whitespace → automatic, noted. Otherwise → **a picker**, the owner's call and the simple one: choose the field, or skip the row |
| **Product name** | The same ladder, but **never** auto-matched on a fuzzy hit. `8-39-0 RhizoSorb` really is the 2027 `Rhizosorb P` (ton, $1,399) — a match no matcher should make on its own, since `RhizoSorb` is common to both and `8-39-0` and `P` are not. Confirmed once per import |
| **Product absent from the season** | The row is skipped and named. Creating products from an import is out of scope |
| **Unit** | Through `convertProductUnits`, which returns `needs-density` for a liquid. A failure names the product, per the F-5 rule |

**No alias table in the first cut.** Persisting `name → product_id` per farm is the obvious
next thought and it is premature: a handful of products confirmed once or twice a season is
a dozen dropdowns a year, against a new table, new RLS, and a new thing that can go stale.
Revisit if it grates.

Precedent to copy rather than reinvent: `matchFertilizerProductByName` exists from F-5, with
tests including that an exact match beats a case-variant. Its governing lesson is the one
that matters here — **a miss must say which name it could not place, and where to fix it.**
The bug F-5 deleted reported success on a miss.

### 10.7 Review is the grid; nothing is written until it is committed

The import gets no screen of its own. It parses, matches, and **populates the V-6 grid**,
where the numbers sit next to each other and can be edited before anything lands. One
surface, built once, doing both jobs — which is also why the grid is load bearing twice
over.

- **Nothing is written until the review is committed.** All-or-nothing, the rule
  `applyWorkOrder` and the cascade already follow: a half-applied import leaves plausible
  wrong rates, which is worse than no import.
- **Re-import replaces, it does not append** — §4 Option E's replace-wholly rule applied to
  the file. A corrected script over the same (program, fields) replaces those fields' rows.
- **Fields the file does not name are left alone.** An import speaks only for the fields it
  mentions; it must not silently zero the rest.
- **Nothing about acreage, price or cost is ever written** (§10.4).
