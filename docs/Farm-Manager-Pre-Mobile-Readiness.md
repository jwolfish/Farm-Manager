# What is left in the remediation, and what of it gates mobile

**Written:** 6 Sep 2026, from the PRD, the status doc and fresh measurements of the tree at
`main` (`5eebc02`). Every figure below was measured today, not carried over.
**Companion docs:** `Farm-Manager-Remediation-PRD.md`,
`Farm-Manager-Remediation-Status.md`, `Fertilizer-Contract-Tracking-Design.md` §8

---

## 1. The short answer

**Two items gate a mobile effort. Everything else does not.**

| | | Why it gates mobile |
|---|---|---|
| **WI-22 / PERF-1** | Code-split the bundle | 468 kB gzip on first paint over rural cell data. No amount of responsive CSS repairs a slow first load, and splitting after a responsive pass means restructuring the same components twice |
| **WI-29** | Adopt a router | **No back button.** Navigation is `sessionStorage` plus a hand-rolled `switch`, so the phone's back gesture leaves the app instead of going back a screen. On a desktop this is an annoyance; on a phone it is the primary navigation control |

**One decision to settle before starting**, not a work item: the `<DataList>` question in §4.

Everything else on the remediation list — correctness, security, the remaining type errors,
the duplicated cost math — is **independent of form factor** and should not gate mobile.
Some of it is more urgent than mobile on its own merits; none of it gets easier or harder
because of mobile.

## 2. WI-29 is the finding, and it is not currently written down as a mobile blocker

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

## 3. WI-22, measured today

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

1. **WI-22 — code-split.** `React.lazy` the 13 pages, `manualChunks` for recharts, jsPDF and
   html2canvas. This is the prerequisite, and CI now exists to catch what it breaks, which
   makes it a much safer change than it would have been a week ago.
2. **WI-29 — router.** Adopt React Router, move `activePage` out of `sessionStorage`, and
   extract season management out of the 947-line `App.tsx` while doing it. The back button
   is the deliverable; the decomposition is the means.
3. **Answer the `<DataList>` question** — one primitive adopted 31 times, or 31 hand
   retrofits. Decide before starting, not during.
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
