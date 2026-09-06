# What is left in the remediation, and what of it gates mobile

**Written:** 6 Sep 2026, from the PRD, the status doc and fresh measurements of the tree at
`main` (`5eebc02`). Every figure below was measured today, not carried over.
**Companion docs:** `Farm-Manager-Remediation-PRD.md`,
`Farm-Manager-Remediation-Status.md`, `Fertilizer-Contract-Tracking-Design.md` §8

---

## 1. The short answer

**Two items gated a mobile effort. BOTH are now done. Everything else does not.**

| | | State |
|---|---|---|
| **WI-22 / PERF-1** | Code-split the bundle | **DONE 6 Sep 2026.** First paint 468 → **102.11 kB gzip** by making 12 of 13 pages `React.lazy`. §3 is kept as the record of what was wrong |
| **WI-29a** | Adopt a router | **DONE 6 Sep 2026.** Real routes (`/fields`, `/fields/:fieldId`) replace `activePage` in `sessionStorage`, so back, forward and a shared link all work. Verified in a browser against the real route table. Shipped as hash routes and switched to clean paths the same day, when the move to Netlify supplied the rewrite rule. §2 is kept as the record of what was wrong |

**First paint is now 119.11 kB gzip**, not 102.11 — `react-router-dom` is +16.29 kB gz and
`App.tsx` imports it eagerly, plus 0.47 for WI-29b's module boundaries and 0.24 for
`BrowserRouter`. WI-22's target is ≤ 300 kB gz, so the router did not spend the headroom
it was given.

**WI-29b, the decomposition, is DONE too, and `App.tsx` is 559 lines rather than 1,118.**
It never gated mobile — the back button was the deliverable — but it was worth doing before
the layout pass edits this file, which is why it followed immediately. Season loading, the
season wizard, farm switching and the five full-screen blocks are now four files of their
own; `App.tsx` is routing and the order of the load gates. **MNT-4 closes with it.**

**So the structural prerequisites are cleared, and the one decision that was left — the
`<DataList>` question — is now ANSWERED**, with measurements rather than opinion: **one
primitive, adopted 12–16 times, not 31.** The twelve report tables are structurally
identical and share a defect; the editable grids and the expandable ones want different
answers that this repo has already proven by hand. §4 has the numbers and the reasoning.

**Nothing structural is now outstanding before the mobile effort.** The first thing to do
in it needs no primitive at all: **eight tables have no scroll container of any kind**, and
those are the ones that will actually break a phone layout. See §4.5.

Everything else on the remediation list — correctness, security, the remaining type errors,
the duplicated cost math — is **independent of form factor** and should not gate mobile.
Some of it is more urgent than mobile on its own merits; none of it gets easier or harder
because of mobile.

## 2. WI-29 was the finding, and it is now closed

> **WI-29a closed 6 Sep 2026, hours after this section was written.** The URL is the
> navigation state; `/fields` and `/fields/:fieldId` are real history entries, so back
> and forward work and a field screen is linkable. `HashRouter` was chosen over clean
> paths precisely because of the gap this section identifies — no host was committed
> anywhere in the repo, so a router that needs a rewrite rule would ship an unverified
> promise. **That gap closed hours later**: the app moved to Netlify, the rewrite is
> committed as `public/_redirects`, and the router is `BrowserRouter`. The `#` is gone.
> The route table is one tested file, `src/lib/appRoutes.ts`; `DashboardLayout`
> took a zero-line diff. Full record in the status doc's WI-29a section. **The
> measurements below are the "before", kept because they are what made the case.**
>
> **One thing this section says that is still true.** The sidebar items are still buttons
> rather than links, so middle-click and open-in-new-tab do not work; that was deliberate,
> to keep `DashboardLayout` out of the diff.
>
> **And one that stopped being true hours later.** It said `App.tsx` had grown to 947
> lines and so WI-29's decomposition half was larger than the review recorded. Both were
> right: it was 1,118 by the time it was opened. **WI-29b took it to 559.**

### As it stood before the fix

The fertilizer design doc's §8 mobile survey (30 Aug) called the bundle the real blocker and
was right about that. It did not mention the router, because on a desktop the missing back
button reads as a papercut — the review filed it under maintainability (MNT-4), next to
"`App.tsx` is a god component."

On a phone it is not a papercut. The back gesture is how people leave a screen. Today:

- `activePage` lives in `sessionStorage`, dispatched through a `switch` (`App.tsx:77`, and
  the page dispatch around `:850`)
- there is no `react-router` dependency at all
- so the browser's history stack has exactly one entry, and back exits the app

Anyone testing the app on a phone will hit this in the first thirty seconds, and it will
read as "the app closed itself" — which, given the session's history with the *random
reload* complaint, is precisely the kind of thing that will be misdiagnosed as a
regression.

`App.tsx` has also grown to **947 lines** from the 763 the review recorded, so WI-29's
decomposition half is larger than it was, not smaller.

## 3. WI-22 — the state that prompted this, and what it is now

> **Closed 6 Sep 2026, hours after this section was written.** First paint is now
> **365.89 kB raw / 102.11 kB gzip** — a single `<script>` in `dist/index.html` — against
> the ≤ 300 kB target. Twelve of the thirteen pages are `React.lazy`; `Auth` stays eager.
> `recharts` and `jspdf` are out of the first paint entirely. `manualChunks` was considered
> and deliberately not added, because once the pages are lazy it moves nothing. Full record
> in the WI-22 section of the status doc. **The measurements below are the "before", kept
> because they are what made the case.**

### As measured before the fix

| Chunk | Raw | Gzip |
|---|---|---|
| `index` (main, eager) | **1,753.11 kB** | **468.06 kB** |
| `html2canvas` | 197.56 kB | 46.91 kB |
| `index.es` (jsPDF) | 147.31 kB | 50.42 kB |
| `FertilizerContractsTab` | 25.38 kB | 6.94 kB |
| `purify.es` | 23.72 kB | 8.96 kB |
| `FieldFertilizerRateGridPanel` | 19.38 kB | 6.21 kB |
| `BookingModal` | 19.18 kB | 5.76 kB |
| **Total** | **2,185.65 kB** | **593.25 kB** |

**The first-paint number is 468 kB gzip against WI-22's ≤ 300 kB target.**

The state of the work is worth stating precisely, because "four lazy chunks exist" has been
recorded as progress and it is progress on a different axis:

- **13 pages are imported eagerly in `App.tsx`. `React.lazy` appears zero times there.**
- The four lazy chunks are all *inside* pages — a tab, a grid panel, a modal, and
  html2canvas pulled in by jsPDF. None of them is a page.
- `manualChunks` is not configured; `vite.config.ts` has no `build` section at all.

So the pattern the status doc says to "repeat, not the job done" has genuinely not been
applied to the pages, which is where the weight is. Recharts and jsPDF are both in the main
chunk today, and Reports is the only screen that needs either.

**And it is growing.** R-1 added 2.09 kB and R-6 added 4.64 kB, both eager because
`App.tsx` and `main.tsx` are eager. Every future app-level fix lands in the first paint
until this is split.

## 4. The decision to settle first: `<DataList>` — ANSWERED 6 Sep 2026

> **THE OWNER OPENED THE APP ON A PHONE, 6 Sep 2026: *"the website as it is on the phone is
> a mess and scrolls poorly … it's unusable."*** That is the single most important line in
> this document, and it is worth more than every measurement below it.
>
> It reframes what follows. §4.3's finding — the identity column scrolling out of view on
> the report tables — is real and still the argument for the primitive, but it is now
> clearly **one instance of a general problem, not the problem**. The verdict is not "the
> report tables are awkward"; it is that the app cannot be used on a phone at all. Nothing
> in this section should be read as a claim that fixing the twelve report tables makes the
> app mobile-ready.
>
> It also means the mobile effort is no longer speculative work against a measurement.
> There is a user, on a device, who cannot use it.

**Answer: build one primitive, adopt it 12–16 times, and leave the rest alone.** Not 31.
The 31 raw tables are not one population, and the framing this section used to carry —
"retrofit 31 screens by hand or build one primitive and adopt it 31 times" — was a false
choice that would have produced the wrong abstraction in the other direction from the one
§8 was guarding against.

The measurements below were taken by rendering four of the report tables at 375 px with
real field names, and by reading the markup of all 31.

### 4.1 The 31 split three ways, and the groups want different answers

| Group | Count | What they are |
|---|---|---|
| **Read-only report tables** | 12–13 | `pages/reports/**`. **Structurally identical**, not merely similar |
| **Editable grids** (inputs in cells) | 7 | Rate grids, the three product tabs, import wizard, work-order edit |
| **Expandable / grouped rows** | 4 | Hedges, sales, spray planner, chemical work orders |

The report cluster is as strong a case for a shared component as this codebase will ever
present. Every one is the same `<div className="overflow-x-auto">` wrapping the same
`<table className="w-full text-sm">`, the same
`<th className="text-left|right py-2.5 px-3 font-semibold text-gray-700">`, the same zebra
`i % 2 === 0 ? 'bg-gray-50' : 'bg-white'`, and the same `—` for a null. They differ in
exactly three things: the column labels, the alignment, and a per-cell render function.
That is a `columns[]` array and nothing else. **§8's worry is fully retired for these
twelve** — there is no generalising-from-one-example risk left when twelve examples are
already byte-identical in structure.

**The other nineteen are a different problem, and extending the same component to them
would recreate §8's error in the opposite direction** — props bloat until one component
serves three jobs and is harder to read than the duplication was.

### 4.2 The evidence against cards for the editable grids is already in this repo

Two of these tables have **already** been made to work at 375 px, by hand, verified in a
browser, and **neither answer was cards**:

- **V-6's rate grid** — the field-name column capped at `11rem` below `sm:`, the table
  scrolling inside its own container, two product columns beside the name. Confirmed with
  `scrollX` staying 0.
- **The shopping list** — the coverage column hidden below `sm:` and its value folded under
  the product name, so a phone shows Product / Plan Need / To Buy.

A `<DataList>` that turned those into cards would be undoing verified work. For an editable
grid it would also be actively worse: cards destroy column alignment, and alignment is the
entire point of entering seventeen fields' rates in one sitting.

### 4.3 What rendering the report tables at 375 px actually found

The earlier note in this document said the report tables "already scroll, so they survive a
phone". **That was half right, and the half that is wrong is the half that matters.**

Four rendered with fixtures at 375 px, with this farm's real field names:

| Report | Table width in a 325 px container | Hidden | Visible at scroll-left | Visible at scroll-right |
|---|---|---|---|---|
| Field ROI | 578 px | **44 %** | Field, Crop, Acres | Cost/Ac, Net/Ac, Total Net |
| Cost per Bushel | 673 px | **52 %** | Field, Crop, Acres, Yield/Ac | Cost/Bu, Revenue/Bu, Margin/Bu |
| Field Cost Comparison | 656 px | **50 %** | Field, Crop, Acres, Seed | Chem, Land, Total/Ac |
| Buyer Breakdown | 599 px | **46 %** | Destination, Crops, Sales, Bushels | % of Total, Revenue, Avg Price |

**The containment works.** `document.scrollWidth === clientWidth === 375` on all four, so
the page never scrolls sideways and none of these is broken. The `overflow-x-auto` wrappers
do their job.

**But the identity column scrolls away with everything else, on all four.** Measured, not
eyeballed: once the container is scrolled far enough right to read the money columns, the
Field (or Destination) cell is entirely outside it. The user is looking at three columns of
dollars with nothing on screen saying which field they belong to.

**That is the F-4b defect in a new place** — the column the screen exists to explain is the
one that falls off the edge — and it is the same defect V-6 hit and fixed. It has now
appeared three times in three unrelated tables, which is what makes it a property of the
table pattern rather than of any one screen.

**And the identity column is only 96 px, so it wraps before you scroll at all.** In that
cell, "Home East of Farm South" renders 81 px tall, "Home West of Bins" 80 px, "Townline
Road" 60 px, "Umek" 40 px. Rows are ragged and the table is roughly twice as tall as it
needs to be, on the device with the least vertical room.

### 4.4 What that changes about the decision

It raises the primitive's value rather than lowering it, and for a reason better than
tidiness: **the twelve do not merely share markup, they share a defect.** Twelve hand
retrofits would be twelve opportunities to solve "keep the row's identity visible" twelve
slightly different ways — which is the shape of every defect cluster in the status doc.
One primitive solves it once, and the right answer is already proven here: V-6's pattern of
capping the identity column and keeping it in place, not a card conversion.

**Recommended shape**, to be discovered from the twelve rather than designed up front:

- Columns declared as `{ key, label, align, render }`, which is all the twelve differ by.
- The first column is the identity column, capped below `sm:` and **kept visible** while
  the rest scroll. This is the whole point; a primitive that does not do this is not worth
  building.
- Zebra striping, the `—` null rendering and the `overflow-x-auto` container move inside.
- Editable grids and expandable rows are **out of scope** and keep their own treatment.

### 4.5 Sequencing, and the part that needs no primitive at all

**Eight tables have no scroll container of any kind** — `ChemicalsTab`, `FertilizersTab`,
`SeedsTab`, `WorkOrderDetailModal`, `WorkOrderEditModal`, `FieldApplicationHistory`,
`FieldProgramDetails`, `SprayPlanner`. Those are where a phone layout will actually break,
they are one-line fixes each, and none of them needs a component to exist first. **Do those
before the primitive**, not after.

Then build the primitive from the twelve. Then re-measure what is left, which will be a
smaller and far better understood number than 31.

### 4.6 What is NOT verified here, and should not be claimed

- **Four of twelve were rendered**, not all twelve. The other eight share the identical
  markup so the same result is expected, but that is inference.
- **No screenshot survives.** The browser pane returned the same frame regardless of scroll
  position while the DOM measurements were plainly updating, so every figure above comes
  from element geometry rather than from looking. Geometry is the stronger evidence for
  "44 % is hidden" and "the identity cell is outside the container", but it is not the same
  as having seen it, and this document has been careful about that distinction since F-4b.
  ~~A glance on a real phone is the cheap confirmation.~~ **That glance has been taken —
  see the box at the top of this section — and it was worse than the geometry predicted.**
  The geometry described a specific defect on twelve specific tables; the phone says the
  whole app is unusable. Where the two disagree, **the phone is right**, and this is the
  clearest example yet of why this project renders things rather than reasoning about them.
- **The fixtures are representative, not real.** Field names and acreages are this farm's;
  the dollar figures are plausible rather than queried.

### 4.7 The standing measurements

| | 30 Aug | 6 Sep |
|---|---|---|
| Files containing a raw `<table>` | "20+" | **31** |
| `.tsx` files total | — | 88 |
| Files using any `sm:`/`md:`/`lg:` class | "effectively unused" | 28 |
| `type="number"` occurrences | 43 | **45** |
| `inputMode` occurrences | 6 | **14** |
| Files using `<ResponsiveModal>` | 2 (new) | 6 |
| Files using `<NumberField>` | 2 (new) | 5 |
| Files still using the raw `fixed inset-0` modal | — | **21** |

**The retrofit pile is growing faster than it is being paid down.** Raw tables went from
20-odd to 31 while the responsive primitives spread to 5–6 files. New feature work keeps
adding tables because there is no primitive to reach for. Every month this waits, the
mobile pass gets bigger.

**But the new-code discipline is working.** `inputMode` more than doubled, and
`ResponsiveModal`/`NumberField` are in use wherever new screens were built. The rule
"new code does not add to the pile" is being kept; the pile itself is untouched.

## 5. Everything else that is open, and why it does not gate mobile

Verified against the tree today, not taken from the status doc.

### Correctness — open, and independent of form factor

| Item | State |
|---|---|
| **WI-17** field revenue allocation | **Untouched.** `useReportData.ts:214` still allocates crop revenue by acreage share, so a field that yielded nothing is still credited revenue. Confirmed in code |
| **WI-18** inventory lookup | **Untouched.** `workOrderCrud.ts:426–427` and `:444–445` still key one map by both `row.id` and `row.canonical_name`, so a seed and a chemical sharing a name collide |
| **WI-6 / SEC-6** signup hygiene | **Untouched.** Raw auth errors still reach the UI (account enumeration), no password policy on signup, profile row still inserted client-side. The `auth_leaked_password_protection` advisor warning is this |

### Performance — open, and only one of them is a mobile issue

| Item | State |
|---|---|
| **WI-23 / PERF-2** | **Half done.** The fertilizer override query is bounded (`.in('field_id', …)` at `:273`/`:277`); the chemical one at `shoppingListGeneration.ts:57` still selects every visible row and filters in JavaScript. It is the same two-line change |
| **WI-24 / PERF-3** | **Untouched.** Reports still load every season, field and sale and aggregate in the browser |
| **WI-25 / PERF-4** | **Untouched.** The on-hand trigger still re-sums the entire ledger per row |
| **WI-26 / PERF-5** | **Untouched.** Unbounded `Promise.all` fan-out, JSONB read-modify-write, and the cascade still awaited inside one HTTP request |
| **PERF-6** | 28 `select('*')`, 24 `exhaustive-deps` warnings — the latter overlap R-3 |

PERF-3 and PERF-4 will be *felt* more on a phone, because a slow query on cell data is worse
than a slow query on a desk. But they are not blockers: they do not change how the mobile
work is done, and doing them first does not make it cheaper.

### Debt

| Item | State |
|---|---|
| **WI-27** one implementation of the cost math | **Untouched, and the highest-risk item on this list.** The conversion table and four cost functions exist twice and have been hand-synchronised four times now. Every sync has been correct, which is exactly why one eventually will not be |
| **WI-28** deduplicate the line generators | **Untouched.** `generateChemicalLines` (`:46`) and `generateFertilizerLines` (`:455`) are still near-identical |
| **WI-30** housekeeping | `package.json` still reads `"vite-react-typescript-starter"`, `"version": "0.0.0"`. **103** `console.*` calls |

### Verification

| Item | State |
|---|---|
| **WI-19** | 69 errors. All 73 read for defects on 6 Sep, none found; 86 `no-explicit-any` is the substantive group left |
| **WI-20** | 422 tests, nowhere near the ≥80 % target on `src/lib/**` |
| **WI-21** | **Core gate done 6 Sep.** The scheduled types-drift job and the pgTAP matrix job both need Supabase credentials in repository secrets |

### Blocked, not open

R-2, R-3, the rest of R-4 and R-7 all wait on an auth-diagnostics dump the owner has not
been able to catch. Nothing can be done on them from this side.

### Deferred by decision

V-7 (the FieldAlytics CSV import), `ALLOWED_ORIGIN`, exercising the `viewer` role in the UI,
real email for invitations, and the collaboration test with a second account.

## 6. Recommended order

1. ~~**WI-22 — code-split.**~~ **Done 6 Sep 2026.** `manualChunks` turned out to be
   unnecessary once the pages were lazy; see §3.
2. ~~**WI-29 — router.**~~ **WI-29a done 6 Sep 2026.** The decomposition turned out not to
   be "the means" — the router landed without it, and keeping them apart kept one large
   diff out of the file carrying R-1's load presentation, R-6's boundaries and WI-22's
   `Suspense` placements. **WI-22 did make it easier**, as predicted: each page was already
   a lazily-loaded unit, so the route boundaries were the boundaries WI-22 had drawn.
   **WI-29b is done too** — `App.tsx` 1,118 → 559 lines, into three hooks and one
   presentational file. Not a `SeasonProvider` as the PRD proposed: nothing here is a
   distant descendant, pages take `seasonId` as an explicit prop, and a context only
   `App.tsx` reads would be ceremony plus a second way for a page to learn its season.
3. ~~**Answer the `<DataList>` question.**~~ **Answered 6 Sep 2026 — see §4.** One
   primitive, **12–16 adoptions, not 31**. The framing this item used to carry ("31 hand
   retrofits or one primitive adopted 31 times") was a false choice: the 31 are three
   populations, and forcing one component across all of them would have produced the wrong
   abstraction in the opposite direction from the one §8 of the fertilizer design doc was
   guarding against.
4. **Then the mobile effort proper**, which at that point is layout and input hygiene
   (45 `type="number"` to convert, 21 modals to swap to `<ResponsiveModal>`) rather than
   architecture. **Start with the eight tables that have no scroll container** (§4.5) —
   one line each, no primitive needed, and they are the ones that actually break a phone.
   Then the primitive, discovered from the twelve identical report tables. Then re-measure.

**Sweep up whenever convenient, they are small:** PERF-2's remaining two lines, and WI-30's
package name and version.

**Do not let these gate mobile, but do not lose them either:** WI-17, WI-18, WI-6 are real
correctness and security defects that happen to be form-factor independent. WI-27 is the
one whose risk grows silently with every round that touches cost math.

## 7. One thing that is no longer true

Earlier notes recorded the mobile effort as waiting on remediation finishing and on the
fertilizer contract system being built. **The fertilizer contract system is built** —
F-1 … F-6 complete, confirmed end to end against real data — and the remediation is far
enough along that the only genuine mobile prerequisites are the two structural items in §1.
Mobile is no longer waiting on features. It is waiting on the bundle and the router.

**And that last sentence went stale the same day it was written.** All three landed on
6 Sep — WI-22 in the morning, then WI-29a and WI-29b. **Mobile is not waiting on anything
structural any more.**

**The `<DataList>` decision went the same way, hours later.** This section said it was
"what is left before the effort starts… a judgement call rather than a work item". It is
answered in §4, and the answer needed measurement rather than judgement: rendering four
report tables at 375 px found that the identity column scrolls out of view on every one of
them, which is what settled it. **Mobile is now waiting on nothing at all.**

Recording both corrections rather than editing the claims away, because a document that
names the blockers is exactly the one that goes quietly wrong when they are removed — and
this section has now had to correct itself twice in a day for that reason.
