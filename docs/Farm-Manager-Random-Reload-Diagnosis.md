# Farm Manager — the "random reload" — diagnosis and remediation

**Investigated:** 30 Aug 2026, from the owner's report: *"It will reload the page completely
randomly, resetting anything I'm currently working on, and usually changing screens from
where I was. I've asked Bolt to fix this many times, and it always munges around and finds
some database call that is causing a reload and claims it fixed the issue…but the issue
remains."*

**Method:** static reading of the client, `@supabase/auth-js` 2.71.1 as installed, and the
git history of prior fix attempts. **Nothing was changed.**

**Update, 31 Aug 2026:** still true of R-1 … R-7 — none of them is implemented, re-verified
against the code on 31 Aug. What *has* landed is the section 4 instrumentation, so the next
step is reading a real session rather than guessing. See **§4a**. One claim in R-2 is
corrected there.

**Companion docs:** `Farm-Manager-Remediation-Status.md`, `Farm-Manager-Remediation-PRD.md`

---

## 1. The headline

**It is almost certainly not a page reload, and it is not one bug.**

There is no code in this repository that can reload the page. Verified by grep across
`src/` and `index.html`:

| Checked | Result |
|---|---|
| `location.reload()` / `location.href =` / `location.assign` / `location.replace` | **zero occurrences** |
| `<a href=…>` anywhere in the app | **zero** — every navigation is a button and a state change |
| Service worker / `registerSW` | none |
| `<form>` elements | 17, and **all 17** call `preventDefault()` — checked individually, including `TemplateForm`, whose handler lives in `useTemplateForm.ts:287` |
| `<meta http-equiv="refresh">` | none |

What is happening instead is a **React remount**: the component tree above the page
unmounts and comes back. Every child's state is discarded — open modals, half-typed forms,
the selected tab, scroll position. To a user that is indistinguishable from a reload.

**And this is why every previous fix failed.** Bolt kept hunting for the query that reloads
the page. There isn't one. The triggers are a *timer* and a *browser event*, and the damage
is done by a single structural decision in `App.tsx` that converts any momentary loading
state into a total teardown.

## 2. The amplifier — fix this first

`src/App.tsx:492`

```tsx
if (authLoading || loading) {
  return <div>Loading…</div>;
}
```

That gate sits **above the entire application** — above `DashboardLayout`, above all
fourteen pages. Anything that sets `loading` true for even one frame unmounts everything.

Three more full-screen early returns sit in the same position and can swap the screen out
from under the user:

| Line | Renders | Reached when |
|---|---|---|
| `App.tsx:467` | "Failed to Load" card | any load error |
| `App.tsx:509` | `<Auth />` login screen | `user` is momentarily null |
| `App.tsx:517` | "Welcome to Crop Tracker! create your first season" | `seasons.length === 0` — **including after a failed query** |

This single structure is why the fault "doesn't seem isolated to any one spot." It isn't
isolated. The *trigger* can be anywhere; the *effect* is always the whole app.

**Consequence for sequencing: R-1 below is worth more than every other item combined**,
because it contains every trigger, named or not, and demotes each one from "the app reset
itself" to "a spinner appeared in one panel."

## 3. The triggers, in order of likelihood

### T-1 · Supabase re-checks the session on every tab focus, and refreshes hourly

**This is the primary suspect.** In `@supabase/auth-js` 2.71.1:

- `GoTrueClient._handleVisibilityChange()` registers a `visibilitychange` listener, and
  `_onVisibilityChanged()` calls `_recoverAndRefresh()` on **every** `hidden → visible`
  transition — alt-tab, switching apps, unlocking a phone, another window uncovering it.
- `AUTO_REFRESH_TICK_DURATION_MS = 30_000` and `AUTO_REFRESH_TICK_THRESHOLD = 3`, so a
  ticker runs every 30 s and refreshes the token whenever it is within 90 s of expiry.
  With Supabase's default 1-hour JWT that is **a refresh roughly once an hour per tab**,
  plus one on focus whenever the token is close to expiry.

An hourly event bearing no relation to what the user is doing is precisely what "completely
randomly" feels like.

**Bolt already found half of this, and the patch is incomplete.** Commit `31bee38`
*"Fix AuthContext & preserve selections"* added guards at `AuthContext.tsx:64-80` with a
comment that says, in so many words, *"for SIGNED_IN events fired on tab focus."* But:

```ts
const tokenChanged = accessToken !== currentAccessTokenRef.current;
…
if (userChanged || tokenChanged) {
  setUser(session?.user ?? null);   // ← fires on every real token refresh
}
```

The guard suppresses `setUser` only when the user id *and* the access token are both
unchanged. On a genuine refresh the token always changes, so a brand-new `user` object is
published anyway. The tab-focus no-op case was fixed; the hourly case was not.

`setSession(session)` is also unconditional, which changes the memoized context value at
`AuthContext.tsx:126` and re-renders every `useAuth()` consumer.

### T-2 · That new `user` object re-runs data loads in four files

Someone has already been through converting `user` → `user?.id` in dependency arrays and
got most of them. These were missed, and each one calls `setLoading(true)` on its own
page — replacing the page body with a spinner and unmounting any open modal:

| Location | Effect when it re-runs |
|---|---|
| `Fields.tsx:118`, `:124` | reloads fields; the add/edit field modal disappears |
| `Products.tsx:128`, `:132` | reloads the active tab; product forms and the load-ticket modal disappear |
| `useYieldEntry.ts:122`, `:124` | reloads yields mid-entry |
| `useTemplateForm.ts:184`, `:188` | reloads programs **inside an open cost-template form** |

This is the flavour where the screen does *not* change — the user just loses what they were
typing. It matches "resetting anything I'm currently working on" exactly.

`eslint` reports **24 `react-hooks/exhaustive-deps` warnings** (of the 28 warnings in the
109/28 baseline). Those warnings are the map of this class of defect and have never been
triaged; they are WI-19 item 4 in the PRD.

### T-3 · A single failed token refresh silently signs the user out

This is the one that explains **"usually changing screens from where I was."**

In `GoTrueClient._callRefreshToken()` and `_recoverAndRefresh()`:

```js
if (!isAuthRetryableFetchError(error)) {
  await this._removeSession();      // → emits SIGNED_OUT
}
```

`isAuthRetryableFetchError` is true **only** for `AuthRetryableFetchError` — an actual
network-layer fetch failure. Any HTTP error from the auth server is treated as terminal,
including `400 refresh_token_not_found` / *"Invalid Refresh Token: Already Used."* The
session is deleted from storage and `SIGNED_OUT` fires with no user-visible explanation.

Downstream in this app:

1. `App.tsx:509` renders `<Auth />` **and wipes `sessionStorage.activePage` as a side effect
   during render** — a render-phase mutation, which under `<StrictMode>` runs twice.
2. `App.tsx:200` clears `loadedForUserIdRef`.
3. When the session comes back, that cleared ref lets `loadInitialData()` (`App.tsx:139`)
   run in full — and it **unconditionally** resets the active farm to `ownedFarms[0]`
   (`App.tsx:177`) and the season to whichever is `is_active`.

So: you were on Spray Planner on a shared farm; you come back on the Dashboard of your own
first farm. That is the reported symptom, precisely.

**What makes this fire.** Supabase rotates refresh tokens by default. Within one browser
`navigatorLock` serializes tabs, so same-browser tabs are protected. **Across devices there
is no shared lock** — the same account signed in on a phone and a laptop can race, and the
loser is signed out with `refresh_token_not_found`. Given that this app is explicitly headed
for phone-in-the-truck use, and that a second collaborator account is now in play, this is
worth testing directly.

### T-4 · A slow or failed seasons query shows the first-run welcome screen

`loadSeasonsByFarm` (`App.tsx:64`) sets `setSeasons([])` on **any** failure, including its
own 10 s `AbortController` timeout. `App.tsx:517` then renders *"Welcome to Crop Tracker!
Let's create your first growing season."*

An empty result and a failed request are rendered identically. On rural cell data this
presents as the app resetting itself to first-run state. Same defect shape as WI-15's
"a failed query is indistinguishable from an empty one," here surfacing in the UI instead
of in the cascade.

### T-5 · There is no error boundary anywhere

Grep for `ErrorBoundary`, `componentDidCatch`, `getDerivedStateFromError` across `src/`:
**zero hits.** `main.tsx` renders `<App />` bare inside `<StrictMode>`.

In React 18 an uncaught error during render or commit unmounts the **entire root**. Any
one-off bug in any page — a null that was assumed non-null, of which the type baseline
still lists 32 — blanks the whole application with nothing on screen to explain it. This
will not be the common case, but it is the one that would look most like a crash.

Note also the two `React.lazy` chunks (`Products.tsx:27`, `ShoppingListsTab.tsx:20`). If a
new build is deployed while a tab is open, the old chunk hash 404s, the dynamic `import()`
rejects, and with no boundary the tree unmounts.

### T-6 · Dashboard realtime re-enters full-page loading on any cascade

`useDashboardMetrics.ts:227-228` subscribes to `field_costs` and `field_yields` with **no
filter at all** — deliberately, per WI-16, since RLS is farm-scoped and neither user id
means "rows for this farm." But the handler calls `loadAll()`, which sets `loading` true for
the whole dashboard.

A cascade writes many `field_costs` rows. So any price change — including one made by a
collaborator — flashes the dashboard back to a spinner. Correct data, wrong presentation.

## 4. Confirm which one you are hitting before fixing anything

The single cheapest diagnostic. The next time it happens, **before touching anything**,
open DevTools and run:

```js
performance.getEntriesByType('navigation')[0].type
```

- **`"reload"` or `"navigate"`, with a cleared console** — the browser genuinely reloaded.
  Nothing in this document applies; look outside the app. The most likely cause is the
  Bolt/Vite dev preview doing an HMR full reload or a container restart, which no code
  change here can fix. Retest against a deployed static build.
- **`"navigate"` from the original page load, with console history intact** — a React
  remount. Everything above applies.

Then add temporary instrumentation to separate T-1 from T-3. In `AuthContext`'s
`onAuthStateChange`, before anything else:

```ts
console.log('[auth]', new Date().toISOString(), event, session?.user?.id ?? null);
```

- `TOKEN_REFRESHED` roughly hourly, or on tab focus → **T-1 / T-2**.
- A `SIGNED_OUT` nobody asked for → **T-3**; check the Network tab for a `400` on
  `/auth/v1/token?grant_type=refresh_token` and read its `error_code`.
- Neither, but the screen still reset → **T-4** (look for a failed `seasons` request) or
  **T-5** (look for a red error immediately above the reset in the console).

**Two questions for the owner that cost nothing and could halve the search:**

1. Does it correlate with coming back to the tab after being away?
2. Is the same account signed in on a phone or a second machine at the same time?

## 4a. The instrumentation, as built — 31 Aug 2026

**This is now in the code.** `src/lib/authDiagnostics.ts` plus three call sites. It is
write-only observation: no auth behaviour changed, and the floor is unmoved (TypeScript 75,
ESLint 109/28, 282 tests, build succeeds; the main chunk grows **1,762.90 kB** from
1,760.80, which is +2.10 kB of temporary code to be given back when this is removed).

**It writes to `localStorage`, not just the console.** The console is useless for the one
case that matters most — a genuine reload clears it — and the owner is not going to be
sitting with DevTools open at the moment it happens. The log survives reloads, and the
buffer is a 300-entry ring so it cannot grow without bound.

**To read it, after the fault happens:**

```js
authDiag.dump()
```

That prints a table. `authDiag.clear()` empties it. No build step, no bookmarklet.

**What each entry answers:**

| Entry | Tells you |
|---|---|
| `page-load` with `navigationType` | **The headline question.** `reload` means the browser genuinely reloaded and nothing in this document applies — look at the host (Bolt preview HMR, a container restart). A disruption that produces **no new `page-load` entry** was a React remount |
| `provider-mount` / `provider-unmount` | A remount, directly. A mount with no `page-load` above it is the proof |
| `event:TOKEN_REFRESHED` | T-1. Look at the spacing — roughly hourly, or clustered on tab focus |
| `event:SIGNED_OUT` nobody asked for | T-3. Then check the Network tab for a `400` on `/auth/v1/token?grant_type=refresh_token` |
| `decision` with `setUser: true` and `userChanged: false` | **The R-2 defect firing.** A new user object for the same person, which re-runs the four files in R-3 |
| `seasons-load-failed` | T-4. The welcome screen is about to render as though the farm had no seasons |
| `loading-timeout-fired` | The 5 s escape hatch in `AuthContext` flipped `loading` regardless of the session, which trips the R-1 gate |

`expiresInSec` is on every session entry. A **negative** value is the shape that precedes a
refresh failure and a T-3 sign-out.

**Nothing sensitive is recorded.** User ids are truncated to 8 characters and the access
token is reduced to its last 8 characters as a rotation fingerprint — enough to see that it
changed, never enough to use. Verified by assertion, not by inspection.

**One correction to R-2 that the instrumentation exists to settle.** R-2 quotes the
`if (userChanged || tokenChanged) setUser(...)` block and says it "fires on every real token
refresh." Reading the file again on 31 Aug: real refreshes take the `TOKEN_REFRESHED` branch
*above* that block, and that branch already guards correctly — it calls `setUser` only when
the user id actually changed. The quoted block is the **fallthrough** path, reached by
`SIGNED_IN`, `SIGNED_OUT`, `USER_UPDATED` and friends. A `SIGNED_IN` emitted on tab focus
with a rotated token would still publish a new user object, so R-2 may well be real — but by
a different route than described, and possibly not at all. The `decision` entries measure it
either way. **Do not implement R-2 until the log shows `setUser: true` with
`userChanged: false` in a real session.**

**Verified in a browser**, per the standing practice: a throwaway harness exercised the
module at `localhost:5173` — 14/14 assertions, including that `navigationType` reads
`navigate` on a fresh load and `reload` after an actual reload, that the buffer survives a
full document navigation intact, that the ring caps at 300, and that the token never appears
in full. The harness was deleted afterwards. The module has no Supabase import, which is
what made this possible on a machine that has never had credentials.

**Still not exercised:** the instrumentation has not run against a real signed-in session,
because this machine has no Supabase credentials. The first real reading is the owner's.

## 5. Work items

Sequenced by leverage, not by cause. **R-1 first** — it is the only item that helps even if
the diagnosis above turns out to be incomplete.

### R-1 — Stop a transient loading state from tearing down the app · P0 · M

**Problem.** `App.tsx:492` returns a full-screen spinner above the entire tree, so any
momentary `loading` discards all page state.

**Required behaviour.** After the first successful load, the chrome and the active page stay
mounted. Subsequent loading is indicated *within* the region being loaded.

**Implementation.** Track first-load separately from refresh — e.g. a `hasLoadedOnce` ref;
gate the full-screen spinner on `!hasLoadedOnce` and render an unobtrusive inline indicator
afterwards. Apply the same rule to the three sibling early returns: "Failed to Load" and the
welcome screen should become in-place states inside `DashboardLayout`, not replacements
for it.

**Acceptance criteria.**
- [ ] With a modal open on Products, forcing `loading` true and false again leaves the modal open and its fields populated.
- [ ] Switching farms still shows a full-screen load — that transition legitimately replaces everything.
- [ ] A season load failure shows an error banner without unmounting the current page.

### R-2 — Do not publish a new `user` object on token refresh · P0 · S

**Problem.** `AuthContext.tsx:79` calls `setUser` when `tokenChanged`, which is true on every
real refresh.

**Required behaviour.** `user` changes identity only when the authenticated identity changes.
The rotated access token is carried by `session`, which is what needs it.

**Implementation.** Drop `tokenChanged` from the `setUser` condition; keep it for
`setSession`. Consider splitting the context the way `NotificationContext` already is
(`NotificationActionsContext` / `NotificationListContext`) so a session change does not
re-render every `useAuth()` consumer.

**AC.** `[ ]` A forced `TOKEN_REFRESHED` with the same user id produces zero re-renders in
components that read only `user`. `[ ]` Sign-in and sign-out still work.

### R-3 — Finish the `user` → `user?.id` dependency conversion · P0 · S

Four files, eight dependency arrays: `Fields.tsx:118,124`, `Products.tsx:128,132`,
`useYieldEntry.ts:122,124`, `useTemplateForm.ts:184,188`.

**AC.** `[ ]` Zero dependency arrays in `src/` contain a bare `user`. `[ ]` The 24
`exhaustive-deps` warnings are each triaged — fixed, or suppressed with a written reason,
never left ambient. `[ ]` Lint does not regress past 109/28.

### R-4 — Treat an unexpected sign-out as an error, not a logout · P1 · M

**Problem.** A single non-retryable refresh failure silently drops the user to the login
screen, wipes `activePage`, and resets the farm and season on return.

**Required behaviour.**

1. Distinguish a user-initiated `signOut()` from a `SIGNED_OUT` the app did not ask for. The
   latter should say *"Your session expired — sign in to continue"* and preserve
   `activePage`, the active farm and the season across re-authentication.
2. `sessionStorage.removeItem('activePage')` must move out of the render body
   (`App.tsx:510`) into the sign-out handler. A render-phase side effect is a bug
   independent of everything else here, and `<StrictMode>` runs it twice.
3. `loadInitialData` must not reset the active farm to `ownedFarms[0]` when a farm is
   already selected and still present.

**AC.** `[ ]` Simulating a forced `SIGNED_OUT` and signing back in returns the user to the
same page, farm and season. `[ ]` A real sign-out still clears everything.

### R-5 — Distinguish "no seasons" from "could not load seasons" · P1 · S

**Problem.** `loadSeasonsByFarm` (`App.tsx:64`) sets `setSeasons([])` on failure, so a
timeout renders the first-run welcome screen.

**Implementation.** Give the seasons load a three-state result — loaded / empty / failed —
and render the welcome screen only for a *confirmed* empty. On failure keep the previous
seasons and show a retry banner. Ten seconds is also short for rural cell data; consider
raising it and retrying once.

**AC.** `[ ]` A seasons query forced to fail shows a retry banner, not "Welcome to Crop
Tracker." `[ ]` A genuinely new farm still gets the welcome screen.

### R-6 — Add an error boundary · P1 · S

Wrap the page area — ideally also the whole root — in a boundary that renders a recoverable
error panel and logs the error, so one bad render degrades one region instead of blanking
the app. Give the lazy-chunk case its own handling: a rejected dynamic `import()` after a
deploy is the one situation where offering the user a reload button is the correct answer.

**AC.** `[ ]` A component made to throw shows the error panel with the rest of the app still
usable. `[ ]` A failed lazy chunk offers a reload rather than a blank screen.

### R-7 — Realtime should refresh data, not re-enter loading · P2 · S

`useDashboardMetrics.ts:220` — `loadAll()` sets `loading` true, and the realtime handler
calls it. Give the background refresh path a separate `refreshing` flag that does not blank
the dashboard. The unfiltered `field_costs` and `field_yields` subscriptions are correct as
they stand — see the comment at `useDashboardMetrics.ts:214` — and must not be "fixed" back
to a `user_id` filter.

**AC.** `[ ]` A cascade updates the dashboard numbers in place with no spinner.

## 6. What this is not

Recorded so the next investigation does not re-tread them:

| Ruled out | Evidence |
|---|---|
| A database call causing a reload | No reload primitive exists in the codebase |
| An unguarded form submit | All 17 forms call `preventDefault()`, verified individually |
| Anchor navigation | Zero `<a href>` in `src/` |
| `FarmContext` churn | Properly memoized with stable setters (`FarmContext.tsx:66`) |
| `NotificationContext` churn | Already split into actions/list contexts, both memoized |
| `useCascadeTaskNotifications` | Keyed on the `userId` **string**, not the user object — correct |
| Service worker / cache | None present |

## 7. Verification

Standing practice from `Farm-Manager-Remediation-Status.md` applies. Specific to this work:

- **The floor must hold**: TypeScript 75, ESLint 109/28 or better, `npm test` green, build
  succeeds. R-3 should *reduce* the warning count; say by how much.
- **This one has to be verified in a browser.** Every item here is a runtime-timing defect;
  none can be proven by reading, and none is reachable from a unit test. The minimum honest
  check is: open a modal, force a `TOKEN_REFRESHED`, confirm the modal survives — run before
  and after, so the fix is shown to change the behaviour rather than assumed to.
- **Instrument before fixing.** Section 4's one-line auth log costs nothing and turns four
  plausible causes into one measured one. Landing R-1 … R-7 without it would repeat the
  mistake this document exists to explain: a confident, plausible, incomplete fix that
  cannot be shown to have worked.
