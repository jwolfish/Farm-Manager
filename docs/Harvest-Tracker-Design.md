# Harvest Tracker — Design

**Status:** Design agreed 10 Sep 2026. **H-1 … H-5 all built and verified the same day** —
the migration is applied to the live database, the arithmetic has 26 tests, and all three
screens have been rendered at 1280 px and 375 px. **Not yet exercised against real data, and
not yet touched by a human on a phone** — see §11.
**Owner decisions:** captured inline as *Decided*, answered 10 Sep.
**Companion docs:** `Farm-Manager-Remediation-Status.md`, `Field-Level-Fertilizer-Rates-Design.md`
(for the presentation/container split and the touch-verification rule this feature has to follow).

---

## 1. The ask

A phone screen used standing beside the truck: pick a field, enter a harvest date, a final
yield and a moisture, done. Plus a dashboard that says, per crop, how much is off and how
much is left — fields harvested, fields to go, bushels harvested, bushels estimated to go,
and a progress bar.

**And the sentence that decides the whole design:** *"the Yields screen I use in planning to
estimate yield so I can estimate my per-bushel cost. This would take that estimate and
replace it with actual."*

That is not a new number. It is the same number, arriving from a different source at a
different time of year.

## 2. What exists today, measured

`field_yields`, created `20260205193632`, is **one row per field** — `UNIQUE(field_id)`,
and PostgREST reports the relationship as one-to-one. Columns that matter:
`yield_bushels_per_acre`, `total_yield_bushels`, `harvest_date`, `moisture_percentage`,
`notes`. RLS is farm-scoped through `field_id → fields → seasons.farm_id` (Round 5), so
nothing new is needed there.

Live data, 10 Sep 2026:

| Season | Fields | Yield rows | With a harvest date | With moisture | Avg bu/ac |
|---|---|---|---|---|---|
| 2024 | 30 | **0** | 0 | 0 | — |
| 2025 | 32 | 32 | 0 | 0 | corn 191.6, soy 56.3, wheat 120 |
| **2026** | **30** | **30** | **1** | **0** | corn 171.2, soy 51.2, wheat 100 |
| 2027 | 32 | 0 | 0 | 0 | — |

Three things follow from that table, and each one shapes a decision below.

- **2026 already holds 30 rows, and every one of them is an estimate.** The crop is standing
  in the field today. So "actual replaces estimate" is not a migration of empty rows — it is
  a change to 30 rows that are load bearing for the cost-per-bushel figure right now.
- **Moisture has never been recorded once.** The column exists; nothing writes it.
- **One 2026 row already carries a harvest date and was never harvested.** That single row is
  why "has a harvest date" cannot be the test for "this field is off" — see §4.3.

**Every consumer reads `yield_bushels_per_acre` blindly**, with no notion of where the number
came from:

| Reader | What it does with it |
|---|---|
| `useDashboardMetrics.ts:94` | cost per bushel = total cost per acre ÷ yield per acre, acreage-weighted per crop |
| `useReportData.ts:206` | field-level yield, total bushels, and the break-even and efficiency reports built on them |
| `Yields.tsx` / `useYieldEntry.ts` | the planning screen — entry, autosave, gross revenue and profit per acre |

That is the payoff of §3's decision stated in advance: **put the actual in the column those
three already read, and cost per bushel becomes an actual figure with no change to any of
them.**

## 3. Decisions

Answered by the owner, 10 Sep 2026.

| # | Question | Decision |
|---|---|---|
| 1 | Estimate and actual — one row, overwrite, or a second table? | **Keep both on one row.** A new `estimated_yield_bushels_per_acre`, backfilled from today's values; the actual lands in the existing column |
| 2 | What do you type off the ticket? | **Bushels per acre.** The monitor's number. Total is derived from acreage, as the Yields screen already does |
| 3 | Moisture | **Record it only.** No shrink math. The bushels you type are the bushels stored |
| 4 | A field cut over two days, on two tickets | **One final number per field.** Add the tickets up. `UNIQUE(field_id)` stands |

### 3.1 Why not a `field_harvests` table

It is the tidier model in isolation and it was rejected on this project's own evidence. A
field's fertilizer state lives in two tables and **every reader and every clearer has to know
about both**; that split has produced the same defect three times — 185 shown where 200 was
stored, orphaned rates after a reset, and the shopping list ordering at the program's rate
while the field page costed at its own. `CLAUDE.md` carries a standing rule about it.

A second yield table would arm exactly that: the dashboard, the reports, the break-even
analysis and the Yields screen would each have to resolve two tables and pick a winner, and
the first one that forgot would show a plausible wrong cost per bushel — which is the six-month
override defect all over again.

One row, two columns, and **one exported function that says which number wins.**

### 3.2 Why not overwrite the estimate

The dashboard asked for needs *"bushels estimated to go"*, and that figure is
`Σ estimate × acreage` over the fields **not yet cut**. Overwrite the estimate and the number
disappears the moment the first field goes in — the screen would be at its least useful in the
middle of harvest, which is the only time it is open.

## 4. Data model

One migration, additive, no new table.

```sql
ALTER TABLE field_yields
  ADD COLUMN estimated_yield_bushels_per_acre numeric
    CHECK (estimated_yield_bushels_per_acre >= 0),
  ADD COLUMN harvested_at timestamptz;

-- Backfill: every row that exists today is an estimate.
UPDATE field_yields
   SET estimated_yield_bushels_per_acre = yield_bushels_per_acre
 WHERE estimated_yield_bushels_per_acre IS NULL;
```

### 4.1 What each column means

| Column | Meaning | Written by |
|---|---|---|
| `estimated_yield_bushels_per_acre` | The planning estimate. Survives harvest untouched | The Yields screen |
| `yield_bushels_per_acre` | **The best number available for this field** — the estimate until it is cut, the actual afterwards | Yields screen before harvest; the harvest sheet after |
| `total_yield_bushels` | Derived: `yield_bushels_per_acre × fields.acreage`. Existing behaviour, unchanged | Both, from the rate |
| `harvest_date` | The date the field was cut, as entered | The harvest sheet |
| `harvested_at` | System stamp — when the field was marked complete. **This is the test for "off"** | The harvest sheet only |
| `moisture_percentage` | An observation. Nothing computes from it (§3, decision 3) | The harvest sheet |

**The rate is what is stored and the total is derived**, which matches decision 2 and matches
the existing screen. Note this is the *same* rule as the field-level fertilizer rates and for
the same reason: a field gets re-measured, and the yield monitor's bu/ac is the fact that
survives it while a total silently becomes a different yield.

### 4.2 Backfill leaves nothing marked harvested, deliberately

`harvested_at` stays NULL on all 63 existing rows, including 2025's — which really were
actuals. The tracker is a current-season screen, so a closed season reading "0 % harvested" on
a page nobody opens for it costs nothing, and guessing at a harvest date for 32 rows we have
no record of would be manufacturing data that looks measured. If 2025 should read as complete,
that is one deliberate `UPDATE` with a date the owner supplies — not part of this migration.

### 4.3 "Harvested" is one predicate, in one place

Not `harvest_date IS NOT NULL` — a 2026 row already carries a date and was never cut, entered
on the planning screen. Not `yield_bushels_per_acre > 0` — all 30 of 2026's rows would read as
harvested today.

```ts
export function isHarvested(row: FieldYieldRow | undefined): boolean {
  return !!row?.harvested_at;
}
```

Every reader calls it. The moment two screens each decide for themselves what "off" means,
they disagree on a Tuesday in October and the progress bar becomes a thing nobody trusts.

## 5. The numbers on the dashboard

All of it pure, in a new `src/lib/harvestProgress.ts`, unit-tested the way
`shoppingListMath.ts` and `appLoadState.ts` are — which is also what makes it checkable on a
machine with no Supabase credentials.

Per crop:

```
Fields harvested      count where isHarvested
Fields to go          count of the rest
Acres harvested       Σ acreage where isHarvested        ← the progress bar
Acres to go           Σ acreage of the rest
Bushels harvested     Σ yield_bushels_per_acre × acreage  where isHarvested   (the actual)
Bushels to go         Σ estimated_...       × acreage  where NOT isHarvested  (the estimate)
Actual vs estimate    for harvested fields only — Σ actual − Σ their own estimate
```

Four rules on those, each of which this project has learned the hard way somewhere else:

- **The progress bar measures acres, not fields.** Twelve of thirty fields can be a fifth of
  the crop. The field counts sit beside it as text, where they are honest.
- **Bushels are never summed across crops.** Corn bushels and soybean bushels are different
  goods; a headline "total bushels" is the season strip adding tons to gallons (F-4b), in a
  new costume. Money may cross crops; bushels may not.
- **A field with no estimate is counted and named, never treated as zero.** 2027 has 32 fields
  and 0 yield rows. Silently reading that as "0 bushels to go" is the WI-15 lie — the quiet
  direction, where a missing number reads as a smaller job. The strip says *"3 fields, 74 ac —
  no estimate"* beside the figure.
- **"Actual vs estimate" compares like with like** — a harvested field against *its own*
  estimate, not against a season average. It is the line that tells you whether the standing
  crop is running ahead or behind, which is the number worth having in the middle of harvest.

## 6. Screens

### 6.1 Harvest — a new page, `/harvest`

Its own page rather than a tab on Yields: Yields is a wide planning grid used at a desk in
February, and this is a one-thumb screen used in a truck in October. Sharing a route would
mean one of the two is always wrong.

**Adding a page means both `PAGE_PATHS` in `src/lib/appRoutes.ts` and the sidebar list in
`DashboardLayout.tsx`, or neither** — guardrail 13. A sidebar key with no route falls through
the catch-all to the dashboard, which presents as a click that does nothing.

Layout, top to bottom:

1. **The progress block** — one card per crop with the bar, the counts, and the two bushel
   figures. This is the "fun progress bar", and it is the top of the page because it is the
   half that gets looked at when no field is being entered.
2. **To go** — the unharvested fields, grouped by crop, biggest acreage first. One tap opens
   the sheet.
3. **Off** — the harvested ones, collapsed, most recent first, each showing date, bu/ac and
   moisture. Tapping re-opens the sheet to correct it.

### 6.2 The entry sheet

`ResponsiveModal` — bottom sheet on a phone, centred card from `sm:` up. Four controls and
nothing else:

| | |
|---|---|
| **Date** | `type="date"`, **defaulting to today**. The common case is zero taps |
| **Yield** | `NumberField`, `inputMode="decimal"`, the field's estimate shown as placeholder text so you can see what you expected. Total bushels derived and shown live beneath: *"186 bu/ac × 83 ac = 15,438 bu"* |
| **Moisture** | `NumberField`, optional, `%` |
| **Notes** | Optional, one line |

Save writes the actual, the date, the moisture, and stamps `harvested_at`. **Every control is
measured at ≥ 44 px with `getBoundingClientRect`, not asserted in a comment** — three controls
in the field-editing round carried a comment claiming 44 and rendered at 40, 40 and 36.

**Never lose an entry on a failed save**: the sheet stays open with the numbers intact and says
what failed. Signal in a field is unreliable, and this is the one screen where a swallowed
`console.error` costs a re-drive.

### 6.3 What the Yields screen gains

One badge and one guard, no redesign. A harvested field's row shows **Actual** and its estimate
beside it; typing a new estimate into a harvested field is refused with the reason, because
that box would otherwise overwrite the actual through the existing autosave path. That is the
same class as the F-4a read-only price field: two writers, last one wins, and the loser's
number vanishes from every cost figure without a trace.

## 7. What this changes downstream, for free

Nothing to build — this is the consequence of putting the actual in the column the readers
already use:

- **Cost per bushel becomes actual** on the dashboard as each field comes off, acreage-weighted,
  mixing actuals for cut fields with estimates for standing ones. Which is exactly what you
  want mid-harvest and exactly what the owner asked for.
- **Reports, break-even and the efficiency pages** follow the same number.
- **Realtime already works**: `useDashboardMetrics` subscribes to `field_yields` (Round 5's
  publication fix), so a field entered on the phone moves the dashboard on the laptop.

## 8. Deliberately excluded

| Not doing | Why |
|---|---|
| Per-load / per-ticket rows | Decision 4. Add the tickets up. A child table would make the field's yield a derived figure every reader has to resolve |
| Moisture shrink to 15.5 % / 13 % | Decision 3. Correct only if the entered number is always wet; applied to a dry elevator figure it under-reports ~10 % silently |
| Test weight, split fields, hybrid-by-field | Not asked for |
| Bushels sold vs bushels harvested | A genuinely good later increment — `commodity_sales` already holds the other half — but it is a second feature, and this one has to be usable in the next three weeks |
| Fixing WI-17 (revenue allocated by acreage regardless of yield) | Actual yields will make that error *visible* for the first time, which is worth knowing. It is an open PRD item with its own acceptance criteria and does not belong inside this |

## 9. Sequencing

| # | Step | Done when |
|---|---|---|
| **H-1** | The migration and the backfill | Rehearsed inside a transaction that ends by raising, rollback confirmed, then applied. Asserts: 63 rows get an estimate equal to their current value, **0 rows are marked harvested**, and the 2026 cost-per-bushel figures are byte-identical before and after. `database.types.ts` regenerated and spliced on the `// ---` marker |
| **H-2** | `harvestProgress.ts` + `isHarvested` | Unit tests, including: a field with no estimate is reported and not zeroed; bushels do not cross crops; the bar is acres; a harvested field with an estimate of 0 still counts |
| **H-3** | The entry sheet, split presentation from container | Rendered at 1280 px and 375 px; every control measured ≥ 44 px; `scrollWidth === clientWidth`; and the save path driven with **`mousedown` / `mouseup` / `click` spaced across tasks**, asserting the row survives the mousedown |
| **H-4** | The progress block and the page, route + sidebar together | Rendered with fixtures at both widths; the round-trip test that every sidebar key survives key → path → key |
| **H-5** | The Yields badge and the overwrite guard | A harvested field refuses an estimate edit, and says why |

### As built, 10 Sep 2026 — all five

**H-1 — migration `20260910173555`.** Rehearsed against the live database inside a
transaction that ended by raising: **62 rows, 7 assertions, 0 failures**. (The design said 63;
the measurement says 62, and the measurement wins.) Rollback confirmed — 0 new columns, 62
rows intact — then applied for real. Post-apply: 62 of 62 backfilled, **0 marked harvested**,
and corn's acreage-weighted cost per bushel is **3.534193 both before and after**, which is
the assertion that makes "additive in effect" a measurement rather than a claim.
`database.types.ts` regenerated and spliced on the `// ---` marker: **6 insertions, 0
deletions**, exactly the two columns across Row/Insert/Update. Security advisor at the
documented **14 WARN** baseline, unchanged — this migration creates no function, table or
policy.

**H-2 — `harvestProgress.ts`, 26 tests.** Two of them are production rows rather than
inventions: the 2026 wheat row that carries a harvest date and was never cut, and an estimate
row with a yield above zero. Both are the reasons `harvestedAt` is the only predicate, and
both fail if someone re-derives it from a date or a number.

**H-3 / H-4 — rendered, and the numbers checked by hand on screen.** A throwaway fixture
harness using the 2026 season's real field names and acreages, deleted afterwards:

| | |
|---|---|
| Corn in the bin | 83 × 204.3 + 61 × 168 = **27,205 bu**, matching the card |
| Actual vs estimate | 27,204.9 − 144 × 171.2 = **+2,552 bu**, on what is off |
| Moisture | (16,957 × 22.4 + 10,248 × 17.1) ÷ 27,205 = **20.4 %**, bushel-weighted, over **2 fields** |
| The bar | corn **37 %** = 144 of 393 **acres**, beside "2 of 6 fields" — the two figures the bar could have shown, and it shows the honest one |
| Unestimated | "2 fields · 104 acres … Prairie Stream 2, Umek" — named, and excluded from *estimated to go* |
| A field that made nothing | Townline Road, harvested at 0 bu/ac: soybeans read 10 % harvested, 0 in the bin, **2,048 bu under estimate** |
| Derived total, live | 186 bu/ac × 70 ac → "13,020 bu off 70 acres" while typing |
| 375 px | `scrollWidth === clientWidth === 375`, `scrollX` 0; the sheet renders as a true bottom sheet, flush to the bottom edge |
| Tap targets | **all 15 controls 44–76 px**, measured with `getBoundingClientRect` |
| Console | clean |

The input sequence was driven as **`mousedown` → gap → `mouseup` → gap → `click`**, spaced
across tasks, with the assertion that the pressed element survived the `mousedown` — the
method the `ActionMenu` defect established on 10 Sep. Both the list row and the Save button
survive. A bad moisture (140 %) is refused by name with the sheet still open and the typed
numbers intact, and a forced save error keeps every entered value and says *"Nothing was
lost."*

**H-5 — and it retired a baseline entry.** `Yields` had never declared the `readOnly` prop
`App.tsx` has always passed it, so **a viewer on a shared farm could edit every yield**. The
compiler had been reporting it as a `TS2322` inside the baseline the whole time. That is the
**fourth** real defect read out of that baseline, after `fetchSharedFarms`, V-8's casts and
`Fields`.

**Then the owner's check, and it is the one that matters:** a **real tap on a real phone**,
entering one field from the truck. Every check above uses dispatched events in a desktop
browser at a 375 px viewport, which is a narrower version of the same mistake that shipped an
`ActionMenu` completely inert on a phone. Nothing on this machine can do that step.

## 10. Honest risks

- **The estimate column is a second number claiming to be the field's yield.** §4.3's single
  predicate is what keeps them apart; the day a reader inlines its own test is the day they
  disagree. It needs a test, not a comment.
- **The autosave path on the Yields screen already writes `yield_bushels_per_acre`** on a
  1.5 s debounce with no guard on what is already there. H-5 is not cosmetic — without it, an
  idle cursor in a yield box on the planning screen can quietly overwrite a harvest actual.
- **Entering harvest is the first time this app is used somewhere with poor signal and one
  hand free.** Not a new screen risk so much as a new *conditions* risk, and the reason the
  failed-save behaviour is specified rather than left to habit.
- **63 existing rows are being rewritten by the backfill.** They are the input to every cost
  per bushel on the dashboard. Byte-identical figures before and after is the assertion that
  proves the migration was additive in effect and not only in shape.

---

## 11. What is NOT verified — read this before trusting the screens

Three things, and the third is the one that has bitten this project hardest.

**Nothing has run against Supabase.** `harvestCrud.ts` and `useHarvestTracker.ts` have never
executed: this machine has no credentials, and production holds **0 rows with
`harvested_at` set**. So the round trip — enter a field, reload, see it in the Off list,
watch the field's cost per bushel move — is proven by reading. It is the check that found
both V-5 defects and the one that closes this properly.

**The sheet's desktop form was not measured.** The Browser pane was hidden for the second
half of the session, which zeroes the viewport, so the centred-card layout above `sm:` was
never measured — only the phone bottom sheet was, and the three progress cards were seen
side by side at 800 px in the first render. `ResponsiveModal` is the same primitive five
other screens already use at both widths, so this is low risk and it is still unmeasured.

**Every input above was DISPATCHED, not tapped.** Real browser input could not be driven
with the pane hidden. Spacing the events across tasks is what the `ActionMenu` post-mortem
prescribes and it is strictly better than `element.click()` — but the same post-mortem says
plainly that a real tap fires `touchstart`/`touchend` before any mouse event, and that no
dispatched sequence proves what a touchscreen does. **The owner's check is a real tap on a
real phone**, and it is the owner's by nature rather than by omission: nothing in the tooling
here can perform it.

### The checks, in order

1. Open **Harvest** on the phone. The three crop cards should read 0 % with *estimated to go*
   already populated from the 2026 estimates — 30 fields' worth, none of them harvested.
2. Tap a field in **To go**. The sheet should rise from the bottom, the date should already
   be today, and the yield box should be **empty** with the estimate as grey placeholder text.
3. Enter a yield and save. The field moves to **Off**, the bar moves by that field's acres,
   and *in the bin* moves by yield × acreage.
4. Open **Yields** and find that field: it should show an **Actual** badge, a disabled yield
   box, and the estimate you had. Try to type in it — nothing should happen.
5. Open the **Dashboard**: that crop's cost per bushel is now computed from the actual for
   that field and from estimates for the rest, which is the point of the whole feature.
6. Back on Harvest, re-open the field and press **Not harvested after all**. The estimate
   should come back and the bar should move back.
