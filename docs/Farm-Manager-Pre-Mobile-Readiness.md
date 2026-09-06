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
| **WI-29a** | Adopt a router | **DONE 6 Sep 2026.** Hash routes (`#/fields`, `#/fields/:fieldId`) replace `activePage` in `sessionStorage`, so back, forward and a shared link all work. Verified in a browser against the real route table. §2 is kept as the record of what was wrong |

**First paint is now 118.40 kB gzip**, not 102.11 — `react-router-dom` is +16.29 kB gz and
`App.tsx` imports it eagerly. WI-22's target is ≤ 300 kB gz, so the router did not spend
the headroom it was given.

**WI-29b, the decomposition, remains and does NOT gate mobile.** `App.tsx` is still
~1,000 lines. The back button was the deliverable and it is delivered; extracting
`SeasonProvider` and farm switching is maintainability, and it is worth doing before the
layout pass touches this file — but nothing is blocked on it.

**So the structural prerequisites are cleared, and what is left before starting is one
decision**, not a work item: the `<DataList>` question in §4.

Everything else on the remediation list — correctness, security, the remaining type errors,
the duplicated cost math — is **independent of form factor** and should not gate mobile.
Some of it is more urgent than mobile on its own merits; none of it gets easier or harder
because of mobile.

## 2. WI-29 was the finding, and it is now closed

> **WI-29a closed 6 Sep 2026, hours after this section was written.** The URL is the
> navigation state; `#/fields` and `#/fields/:fieldId` are real history entries, so back
> and forward work and a field screen is linkable. `HashRouter` was chosen over clean
> paths precisely because of the gap this section identifies — no host is committed
> anywhere in the repo, so a router that needs a rewrite rule would ship an unverified
> promise. The route table is one tested file, `src/lib/appRoutes.ts`; `DashboardLayout`
> took a zero-line diff. Full record in the status doc's WI-29a section. **The
> measurements below are the "before", kept because they are what made the case.**
>
> **Two things this section says that are still true.** `App.tsx` has *not* shrunk — the
> decomposition is WI-29b and is not started. And the sidebar items are still buttons
> rather than links, so middle-click and open-in-new-tab do not work; that was deliberate,
> to keep `DashboardLayout` out of the diff.

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

## 4. The decision to settle first: `<DataList>`

§8 of the fertilizer design doc deliberately did **not** build a general
table-on-desktop / cards-on-mobile primitive, on the grounds that generalising from one
example would produce the wrong abstraction. That was the right call then. The measurement
today:

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

Two things to read out of that.

**The retrofit pile is growing faster than it is being paid down.** Raw tables went from
20-odd to 31 while the responsive primitives spread to 5–6 files. New feature work keeps
adding tables because there is no primitive to reach for. Every month this waits, the
mobile pass gets bigger.

**But the new-code discipline is working.** `inputMode` more than doubled, and
`ResponsiveModal`/`NumberField` are in use wherever new screens were built. The rule
"new code does not add to the pile" is being kept; the pile itself is untouched.

There are now far more than the "two or three real cases" §8 said to wait for. **The
question is answerable now and should be answered before the mobile effort starts**, because
it determines whether the effort is "retrofit 31 screens by hand" or "build one primitive
and adopt it 31 times."

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
   **WI-29b — extract `SeasonProvider` and farm switching from the ~1,000-line
   `App.tsx` — is still open, and no longer blocks anything.** Worth doing before the
   layout pass edits this file, not before starting.
3. **Answer the `<DataList>` question** — one primitive adopted 31 times, or 31 hand
   retrofits. Decide before starting, not during. **This is now the only thing standing
   between here and the mobile effort.**
4. **Then the mobile effort proper**, which at that point is layout and input hygiene
   (45 `type="number"` to convert, 21 modals to swap to `<ResponsiveModal>`) rather than
   architecture.

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

**And that last sentence went stale the same day it was written.** Both landed on 6 Sep —
WI-22 in the morning, WI-29a in the afternoon. **Mobile is not waiting on anything
structural any more.** What is left before the effort starts is the `<DataList>` decision
in §4, which is a judgement call rather than a work item, and the effort itself is then
layout and input hygiene. Recording the correction rather than editing the claim away,
because a document that names the blockers is exactly the one that goes quietly wrong when
they are removed.
