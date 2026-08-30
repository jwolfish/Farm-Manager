# Fertilizer Contract & Load Tracking — Design

**Status:** Design agreed 30 Aug 2026. Not yet implemented.
**Owner decisions:** captured inline as *Decided*.
**Companion docs:** `Farm-Manager-Remediation-Status.md`, `Farm-Manager-Remediation-PRD.md`

---

## 1. The problem

Fertilizer is contracted in bulk from the plant and drawn down as loads. A load may be a
24-ton semi, a 12-ton truck, or 4 ton picked up in the spreader. The only number that
matters day to day is **how much of my contract is left to call for**.

This was previously a spreadsheet: one column per product, contracted amount at the top,
a row per order, a running remainder at the bottom. The goal is parity with that
spreadsheet plus the things a spreadsheet cannot do — the contracted amount compared
against the plan, multiple bookings at different prices, an accurate blended cost per ton
flowing into field costs, and — since the app already holds every rate — a calculator that
turns "these fields, this program" into the tonnage to order, instead of a hand calculator
(section 8).

**Fertilizer is deliberately not tracked like chemical inventory.** Chemicals live in the
shed and have an on-hand balance. Fertilizer arrives and goes on the ground. There is no
`on_hand_quantity`, no `inventory_ledger_entries`, no work orders, and no field-level
application record in this design.

## 2. What already exists

`generateFertilizerLines` already computes plan need — programs × acreage, rolled up per
product, converted to the product's pricing unit. The last generated list:

| Product | Plan need |
|---|---|
| Urea | 62.7 ton |
| Potash | 55 ton |
| DAP | 33 ton |
| Gypsum | 13.2 ton |
| AMS | 11 ton |
| 6-24-6 Starter | 9.68 ton |

That number is kept and shown, but it is **not copied** into the contract. Planned and
contracted drift apart on purpose — round loads, changed plans, opportunistic booking — so
they are displayed side by side and the contract is typed.

**There is no place to record a contract today.** The only price entry point is
"Mark as Purchased" on a shopping-list line, which calls `record_purchase`. For fertilizer
that RPC writes no ledger row (correct — fertilizer lines carry no `master_product_id`),
stamps one `purchased_quantity` and one `purchased_price_per_unit` on the line, overwrites
`fertilizer_products.price_per_unit` with that single price and cascades. It is a single
value where a list is needed: a second entry replaces the first rather than adding to it.

### A latent bug found while reading it

The fertilizer branch of `record_purchase` matches the product by **name**:

```sql
UPDATE fertilizer_products SET price_per_unit = p_price_per_unit
 WHERE season_id = v_season AND product_name = v_line.product_name
```

Rename a fertilizer product after generating a list and this matches nothing, `v_entity`
stays null, and no cascade fires — silently. Section 8 removes fertilizer from this path,
which retires the bug. If that decision is ever reversed, this needs fixing on its own.

## 3. Liquid fertilizer and density

6-24-6 is a **liquid** sold by the ton and applied through the planter in gallons, at
11.1 lb/gal. Other liquids will have different densities.

**This is not currently broken.** Every program rate unit converts cleanly to its price
unit today — 6-24-6 is entered in the programs at 65 lb/ac against a per-ton price, which
converts fine. What is happening is that the density conversion is being done by hand
before entry. (2025's rate of 44 lb/ac is exactly 4 gal at 11.1 lb/gal; 2026–27's 65 lb/ac
is 5.86 gal/ac.) Density support removes that manual step and lets rates be entered in the
unit the planter monitor actually reads.

**Decided:** density lives on `fertilizer_products` (season-scoped), next to price and
unit. Everything that needs it already reads that table, there is no nullable join, and
season import carries it forward. Cost: it is entered once per product per season.

`convertUnits` stays exactly as it is — class-bounded and total, per guardrail 8. Mass and
volume do not interconvert there because the module has no per-product data, the same
reason `bag` and `seed` are separate classes. A new product-aware wrapper sits beside it:

```ts
export function convertProductUnits(
  from: string, to: string, amount: number, densityLbPerGal?: number
): ConversionResult
```

It delegates to `convertUnits` first. Only on `incompatible-class`, with one side mass and
one side volume and a density supplied, does it bridge: volume → gal → × lb/gal → lb →
target mass unit, and the inverse. A new failure reason `needs-density` reports the
actionable case — *"6-24-6: enter a density to convert gallons to tons"* — instead of
guessing or silently dropping the item.

The exact-integer discipline of guardrail 9 is untouched: the within-class factor table
does not change. A density bridge is inherently inexact because the density itself is a
measured decimal. That is expected and affects no existing pair.

**Blast radius (guardrail 7).** Density must be threaded through both copies of the cost
math: `calculateCostWithConversion`, `shoppingListMath.accumulateNeed`,
`generateFertilizerLines`, the new contract rollup, and the edge function's mirrored
`convertUnits` / `calculateCostWithConversion` / `recalculateFertilizerProgramCost`. This
makes WI-27 — one implementation of the cost math — more pressing than it was.

## 4. Data model

Three tables, all season-scoped. **None carries a denormalized `farm_id`.** RLS resolves
the farm through `seasons.farm_id` via `can_view_farm` / `can_edit_farm`, the shape Round 5
batch 2 settled on. This avoids the entire SEC-4 class of defect where a denormalized farm
column disagrees with the row it points at.

### `fertilizer_contracts` — every commitment, contract or spot

**A spot buy is a contract you filled the same day.** Modelling it separately would put
prices in two tables and create two paths into the weighted average. One table with a
`kind` column collapses the special case entirely.

```
id                    uuid pk
season_id             uuid not null → seasons (cascade)
fertilizer_product_id uuid not null → fertilizer_products (cascade)
kind                  text not null default 'contract'  check in ('contract','spot')
label                 text            'Fall booking', 'January add-on', 'June spot'
contracted_quantity   numeric not null check > 0
unit_type             text not null   defaults to the product's unit
price_per_unit        numeric null    check null or > 0
supplier              text null       free text, as on grain sales
booked_on             date null       unconstrained — see section 7
notes                 text null
user_id               uuid not null   the real author
created_at, updated_at
```

Example for one product:

| Label | Kind | Qty | Price | Date |
|---|---|---|---|---|
| Fall booking | contract | 60 t | $550 | 2026-09-15 |
| January add-on | contract | 20 t | $580 | 2027-01-20 |
| June spot | spot | 8 t | $640 | 2027-06-04 |

A spot row shows 0 remaining as soon as its load lands, which reads correctly with no flag.

### `fertilizer_loads` — the delivery ticket

```
id            uuid pk
season_id     uuid not null → seasons (cascade)
delivered_on  date not null     unconstrained — see section 7
ticket_number text null
load_type     text null         check in ('semi','tender','truck','spreader','pickup','other')
supplier      text null
delivery_fee  numeric default 0 check >= 0
notes         text null
user_id       uuid not null
created_at, updated_at
```

### `fertilizer_load_lines` — what was on the ticket

**Decided:** a blended load is recorded as its **component products on separate lines**,
mirroring the ticket the plant issues. A ticket therefore transcribes line for line.

```
id                    uuid pk
load_id               uuid not null → fertilizer_loads (cascade)
fertilizer_product_id uuid not null → fertilizer_products
contract_id           uuid null → fertilizer_contracts (on delete restrict)
quantity              numeric not null check > 0
computed_quantity     numeric null    what the plan calculator said, if it was used
unit_type             text not null   may differ from the contract's
notes                 text null
created_at
```

`computed_quantity` is written only by the plan calculator (section 8) and is never edited
by hand. Keeping it beside the real `quantity` is the only way plan-versus-actual drift
becomes visible across a season — the calculator says 23.4 t, the truck brings 24, and the
difference is worth seeing accumulate.

**Load lines carry no price.** Every dollar figure lives in `fertilizer_contracts` and
nowhere else. A line says only "3 t of urea against the January booking."

`on delete restrict` on `contract_id` is deliberate: deleting a booking that has loads
against it must fail with a clear message rather than silently orphaning delivered
tonnage. Reassign or delete the loads first.

### Consistency triggers

Following the Round 2 pattern of enforcing referential truth at the database rather than
trusting the client:

- A contract's `fertilizer_product_id` must belong to its `season_id`.
- A load line's `contract_id`, where set, must be for the same product and the same season
  as its parent load.

### Indexes

`fertilizer_contracts (season_id)`, `(fertilizer_product_id)`;
`fertilizer_loads (season_id)`; `fertilizer_load_lines (load_id)`, `(contract_id)`,
`(fertilizer_product_id)`.

## 5. The derived numbers

Nothing below is stored. All of it is computed by pure functions in
`src/lib/fertilizerContractMath.ts`, unit-tested the way `shoppingListMath.ts` is.

Per product, expressed in the product's own `unit_type`:

```
Plan need    from generateFertilizerLines — reused, not reimplemented
Contracted   sum of contracts, quantities converted to the product unit
Delivered    sum of load lines, quantities converted
Remaining    Contracted − Delivered          ← the number this feature exists for
Plan vs contract   Contracted − Plan need    ← over/under booked
```

Season-level: total delivery fees and the load count.

Over-delivery is allowed and shown negative in red. Buying above contract is normal and
the app should not argue with it.

Any contract or load line whose unit cannot be converted to the product unit — including
`needs-density` — is **excluded and flagged by name**, never silently folded in. Same
all-or-nothing rule WI-11 applied to `applyWorkOrder`.

### Weighted average price

```
avgPrice = sum(qty × price) / sum(qty)     over contracts, both kinds
```

**Superseded at F-3.** This originally said quantities *and* prices were converted into
the product's unit first. Implementing that inside Postgres meant a **third** copy of the
unit conversion table — client, edge function, and SQL — in a third language, computing
the number that drives every field cost. Guardrail 7 records that the existing two copies
have needed hand-syncing three times already.

So **a contract is denominated in its product's own unit**, and `fertilizer_contracts.
unit_type` was dropped rather than kept-and-constrained: a constrained duplicate is
denormalization that can drift, which is the same shape F-2 avoided by not carrying a
`farm_id`. The average is now exact arithmetic with no conversion at all.

`fertilizer_load_lines.unit_type` **stays** — a load genuinely can arrive in another unit,
and that rollup is computed in TypeScript for display, not in SQL.

Worked example:

```
60 t @ $550   fall booking
20 t @ $580   January
 8 t @ $640   June spot
──────────────────────────
88 t @ $565.00/ton
```

Today `fertilizer_products.price_per_unit` would hold $550 and every field cost in the
season would be understated by $15/ton.

Two details that matter:

- **Contracts with a null price are excluded from the average** but still counted in
  contracted tonnage. A booked-but-unpriced load must not drag the average toward zero.
- **Decided:** the average is weighted by **contracted** quantity, so it is meaningful
  before anything is delivered. The delivered-weighted figure is displayed beside it for
  late season, when a contract has been under- or over-taken.

## 6. Cascading into field costs

**Decided: automatic on every contract change.** Inserting, editing or deleting a contract
or spot row recalculates the weighted average and, if it differs from the product's current
price, writes it and queues a cascade. Recording a load does not cascade, since loads carry
no price.

Consequences the owner has accepted:

- The **first** booking entered for a product immediately moves that product's price off
  whatever was typed on the Fertilizers tab and rewrites every field cost using it.
- Entering three bookings in a row queues three cascades.

**Landed at F-3 with one change: the recompute is a trigger, not RPC-only.** A trigger on
`fertilizer_contracts` maintains `fertilizer_products.price_per_unit` as the weighted
average, the same pattern as `update_master_product_on_hand` maintaining on-hand from the
ledger. That means the price cannot desync however a contract row arrives — the RPC, a
hand-crafted REST call, or a future admin fix. The RPC's remaining job is to validate,
write, and hand the client a cascade target.

Implementation follows the `record_purchase` precedent rather than the pre-WI-10 pattern of
sequential unguarded client writes:

```
save_fertilizer_contract(payload jsonb)   → writes the row, recomputes the average,
delete_fertilizer_contract(p_id uuid)       updates fertilizer_products.price_per_unit,
                                            returns the cascade target
```

One RPC, one transaction, `SECURITY DEFINER` with `search_path` pinned, revoked from PUBLIC
and `anon`, granted to `authenticated`. The client queues the cascade only after the write
commits. Both RPCs re-check `can_edit_farm` internally.

Guards:

- The price is rounded to 2 dp before comparison, so float noise cannot trigger a cascade.
- Deleting the last contract for a product leaves the product price **unchanged**. An
  undefined average must not zero out a price.
- A failed cascade is already loud since WI-15 and will surface to the user.

## 7. Dates

`booked_on` and `delivered_on` are unconstrained. Fertilizer delivered in October 2026 for
the 2027 crop is entered in the **2027 season** with its real 2026 date, and the cost lands
where it belongs. The app must never reject a date for falling outside the season's year.

## 8. Screens

A new **Fertilizer Contracts** tab on the Products page, beside Seeds / Fertilizers /
Chemicals / Programs / Shopping Lists.

**Season strip.** Total contracted, delivered, remaining; delivery fees counting up while
tonnage counts down — *"Delivery fees: $4,280 across 19 loads."*

**One card per product**, for any product with a contract or a plan need:

```
Urea                                                        ton
Plan 62.7    Contracted 88    Delivered 34
████████████░░░░░░░░░░░░░░░░░░░   54 ton left to call
Blended cost $565.00/ton  (delivered-weighted $558.24)

  Fall booking     contract   60 t @ $550   Doolittle Ag    26 t remaining
  January add-on   contract   20 t @ $580                   20 t remaining
  June spot        spot        8 t @ $640                    8 t remaining
                                            + Add booking   + Add load
```

**Load entry** is the phone-in-the-truck path. Date, load-type buttons that preset the
quantity (Semi 24 / Truck 12 / Spreader 4), ticket number, supplier, delivery fee, then one
or more product lines — product, quantity, and which booking it draws against. A full semi
of one product is two taps.

### Two ways to fill a ticket

The product lines can be populated two ways. **Both produce identical
`fertilizer_load_lines`** — this is a prefill, not a second record type, and it adds no
tables and no parallel state.

| Mode | How |
|---|---|
| **Transcribe** | Type each product and tonnage straight off the plant ticket |
| **From plan** | Pick fields and a fertilizer program; the app computes tons per product; edit, then save |

*From plan* is the calculator half of the Spray Planner without the work-order half. That
distinction is the point: the Spray Planner's status lifecycle, apply/unapply and ledger
writes exist because chemicals have a shed balance to deduct from. Fertilizer has none, so
only the arithmetic is worth taking.

The machinery already exists. `accumulateNeed` in `shoppingListMath.ts` is pure, takes
`{rate, rateUnit, acreage}[]` and resolves the canonical unit — exactly what a
fields × program selection produces. `useSprayPlanner` already has the
`selectedFields` / `selectedPrograms` selection model to copy. `generateFertilizerLines`
needs only an optional field-id filter to serve a subset instead of the whole season.

**Decided — rates are not overridden.** The calculator uses program rates as written and
the **resulting tonnage** is what you edit before saving. That covers the common case (the
truck brought 24, the plan said 23.4) without building per-field rate override UI, which
would be the single largest chunk of work in this feature. If varying rates per field turns
out to matter in practice, it is a clean later increment.

**Decided — the field selection becomes a note, not a record.** The calculator writes a
plain-language line into the ticket's notes:

```
Ordered for: Home 80, Creek 60 — Fall P&K
```

Human-readable, visible in the load list, no new tables. It is deliberately a memo rather
than structured data, because the owner reorders fields and changes rates once product is
in the truck: a structured "applied to" record would be false often enough that nothing
later could distinguish the true rows from the wrong ones. See section 9.

The same calculator is reachable from the booking form — *"how much do I need to contract
for these twelve fields"* is the same arithmetic at a different scope. The shopping list
answers it for a whole season; this answers it for a subset.

### Mobile readiness

The app is intended to become a mobile-ready web app — not native — at some future point.
**Retrofitting existing screens is explicitly out of scope here.** The rule for this feature
is narrower: build the new code so it does not add to the retrofit pile, and extract the
two primitives that make the eventual retrofit a component swap rather than a redesign.

Measured state of the codebase, 30 Aug 2026:

| | |
|---|---|
| Viewport meta | **Correct** in `index.html:6` — the one thing that would have hurt to find late |
| Responsive classes | Effectively unused; the heaviest file has 4 `sm:`/`md:` occurrences, most have none |
| Raw `<table>` | **20+ components**, including all four Products tabs — the single largest retrofit cost |
| Numeric inputs | 43 × `type="number"`, only 6 × `inputMode` |

**The real blocker is not layout.** The production bundle is 1,751.91 kB (467.46 kB gzip).
On rural cell data that is a slow first load no amount of responsive CSS repairs. PERF-1 /
WI-22 is the actual prerequisite for calling this app mobile-ready; good layout here must
not be mistaken for having solved it.

**Decided — two primitives, built with this feature:**

- **`<ResponsiveModal>`** — bottom sheet on phones (`items-end`, full width,
  `rounded-t-2xl`), centered card at `sm:` and above. The existing modals are
  `fixed inset-0 flex items-center justify-center p-4` with `max-w-md`, so this is a
  drop-in replacement for them later.
- **`<NumberField>`** — `type="text"` with `inputMode="decimal"`, consistent styling, and
  the parse-and-validate logic currently copy-pasted into every form.

**Deliberately not built:** a general `<DataList>` that renders as a table on desktop and
cards on mobile. It is the highest-leverage idea here *and* the one most likely to be
wrong, because it would be generalized from a single example before the other nineteen
table screens have stated their requirements. Extract it later, from two or three real
cases.

**Conventions the new screens follow:**

- **Card-first, never table-first.** Load history is a stacked list that reflows, not a
  `<table>`. Costs nothing now and adds nothing to the pile.
- `inputMode="decimal"` for tonnage and price, `type="date"` for dates, `inputMode="numeric"`
  for ticket numbers. In a truck this is the difference between a keypad and a full keyboard.
- **Tap targets ≥ 44 px.** Existing buttons run `px-3 py-2` (~36 px); new ones use `py-3`
  minimum, which is where gloves stop being a problem.
- **Preset buttons over typing** wherever the set is small and known — the Semi 24 /
  Truck 10 / Spreader 4 buttons are the model.
- **Never lose an entry on a failed save.** Signal at the plant is unreliable.
  `MarkPurchasedModal` already keeps the modal open and preserves state on error; that
  discipline is copied deliberately rather than by accident. Real offline support is out
  of scope.
- **Navigation stays shallow** — tab → card → modal. WI-29 means there is no router and the
  browser back button already does not work; the new feature must not need a back path it
  cannot provide.

**Shopping list handoff.** *Decided:* fertilizer lines lose **Mark as Purchased** and gain
**Book this →**, which opens the booking form prefilled with the needed quantity. The
shopping list keeps doing what it is good at — computing need — and hands off. Chemical and
seed lines are untouched.

This is the point of the decision: otherwise two features write
`fertilizer_products.price_per_unit` and each fires its own cascade, last write wins. That
is precisely the failure pattern the last six rounds have been removing from this codebase.

## 9. Deliberately excluded

| Not doing | Why |
|---|---|
| On-hand balance for fertilizer | Fertilizer goes on the ground, not in the shed |
| `inventory_ledger_entries` rows | Would drag fertilizer into the chemical apply/unapply machinery |
| Field-level application records | Owner's explicit call: tonnage left on contract is the only figure wanted. The plan calculator's field selection is stored as a **note**, never as structured "applied to" data — fields and rates change once product is in the truck, so a structured record would be wrong often enough to be untrustworthy |
| Per-field rate overrides in the calculator | The computed tonnage is editable, which covers the common case; overrides are the largest chunk of UI here and can be added later if missed |
| Work-order lifecycle for fertilizer | No status transitions, no apply/unapply, no idempotency guards — there is no inventory balance for a double-apply to corrupt |
| Delivery fees in field costs | Tracked and totalled separately, by decision |
| Importing 2025 spreadsheet history | Product names carry over via season import; nothing else is wanted |
| Splitting one delivered tonnage across products | Blends arrive as component lines, so it never occurs |

## 10. Sequencing

Five changes, each independently verifiable. The first ships alone and is useful alone.

| # | Change | Contents | State |
|---|---|---|---|
| **F-1** | Density and conversion | `density_lb_per_gal` column, `convertProductUnits`, both copies of the cost math, unit tests, season-import carry-forward | **Done** — merged, edge function v12 |
| **F-2** | Schema | Three tables, triggers, indexes, RLS, SEC-5 matrix extended | **Done** — migration `20260830213751`, matrix 101/0 |
| **F-3** | RPCs | `save_fertilizer_contract`, `delete_fertilizer_contract`, auto-cascade | **Done** — migration `20260830215258` |
| **F-4** | UI | Fertilizer Contracts tab, cards, booking and load entry; the `<ResponsiveModal>` and `<NumberField>` primitives | **Done** — plus `save_fertilizer_load` (`20260830220139`) |
| **F-4a** | Ticket-first spot buys + one price writer | See below | Not started — **do before F-5** |
| **F-5** | Handoff | Shopping list "Book this"; Mark as Purchased removed for fertilizer | Not started |
| **F-6** | Plan calculator | Fields × program → computed load lines; `computed_quantity`; the auto-note; reachable from both the load and booking forms | Not started |

## 10a. F-4a — what the owner's first real use exposed

Found 30 Aug 2026 by entering one spot buy and one load in the running app. Three related
faults, all in the UI, none needing a migration.

**1. A spot buy cannot be entered where it happens — on the ticket.**
The owner had to create the ticket, be told there were no tons to draw on, leave for
**Add booking**, enter the spot buy, then come back. A spot buy and its load are the same
event; splitting them across two screens is what produced fault 2.

**2. The "Draws against" dropdown defaults to "No booking".**
So the natural flow records delivered tonnage attributed to nothing. Live proof: a 24-ton
semi of Urea sits unattributed beside a 24-ton spot buy showing 24 t still to call — the
same tons counted as both owed and delivered. It should default to the sole booking when a
product has exactly one.

**3. The partial-draw case the owner identified.**
A 24-ton load against a booking with 20.35 t left. **The schema already handles this**: a
load line is per-product *per booking*, and nothing stops two lines for the same product on
one ticket with different `contract_id`s. So it is two lines — 20.35 t on the contract,
3.65 t on a spot buy — which is also more truthful than one number, because those tons
genuinely cost different amounts and the blend should say so.

**The fix, all in `LoadTicketModal`:** per line, choose a booking; when the quantity exceeds
what remains, offer to spill the remainder onto a new spot buy created inline (label and
price) without leaving the modal.

**4. And the price field on the Fertilizers tab is now a trap.**
`fertilizer_products.price_per_unit` has three writers: that form, the F-3 contracts
trigger, and `record_purchase`. For a product with priced bookings the trigger owns the
number, but the form still lets you type one — it saves, cascades, moves field costs, and
is then silently reverted by the next contract change. Make it read-only with "blended from
N bookings — edit in Fertilizer Contracts" when priced bookings exist, and leave it
editable when there are none, where it genuinely is the input. F-5 removes the third writer.

F-6 is deliberately last. Everything before it is a complete, usable tracker — the
calculator removes hand arithmetic from an already-working screen rather than being load
bearing for it. If the schedule slips, this is the piece to drop without stranding
anything.

## 11. Verification

Per the standing practice in `Farm-Manager-Remediation-Status.md`:

- Migrations **rehearsed** inside a transaction that ends by raising, then applied for
  real, then the rollback confirmed.
- The SEC-5 policy matrix extended to all three new tables and run to **0 failures** — a
  policy is not verified until the attack has been attempted and returned zero rows.
- `database.types.ts` regenerated after the migration, with the hand-maintained tail block
  (`CropType`, `UserRole`, `InvitationStatus`, `ProductCategory`, `LedgerEntryType`,
  `LedgerSourceType`, `WorkOrderStatus`) re-appended.
- Floor held and any movement accounted for: TypeScript 76, ESLint 109/28, tests passing,
  build succeeds.
- New unit tests: the density bridge (including `needs-density` and round-trips), the
  rollup math, and the weighted average with null-priced and unit-mismatched contracts.

## 12. Risks

- **Auto-cascade churn.** Every contract edit queues an edge-function cascade. Accepted by
  decision; watch it in practice and add debouncing if it becomes noisy.
- **The mirrored edge function.** F-1 changes cost math that exists twice. Both copies must
  land together or fertilizer costs will differ between the client and the cascade.
- **Density entered per season.** A new liquid product added mid-season without a density
  will report `needs-density` rather than costing. That is the intended loud failure, but
  the product form should prompt for it when the Liquid box is ticked.
