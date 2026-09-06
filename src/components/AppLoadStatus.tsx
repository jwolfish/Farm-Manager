import { AlertTriangle } from 'lucide-react';

/*
 * R-1 / R-5 — the in-place replacements for two full-screen takeovers in App.tsx.
 *
 * Before this, any momentary `loading` returned a spinner from ABOVE the whole tree,
 * and any load error returned a "Failed to Load" card from the same position. Either
 * one unmounted every page, every open modal and every half-typed form. That is the
 * amplifier the "random reload" investigation named: the trigger can be anywhere, the
 * effect was always the entire app. These two say the same thing without taking the
 * screen away.
 *
 * Presentation only, and deliberately in its own file with NO Supabase import, so it
 * can be rendered in a browser on a machine with no credentials. App.tsx cannot be —
 * it reaches the Supabase client at module load. Same cut F-4b made for the season
 * summary and F-6 made for the plan calculator, and the reason either could be checked
 * on screen at all.
 *
 * Both are fixed-position, so neither reflows the page underneath — the whole point is
 * that the page stays exactly where it was. Both sit at z-40, below the z-50
 * ToastContainer, so a toast still wins.
 */

/**
 * Shown while a refresh is in flight AFTER the app has loaded once. Deliberately small
 * and non-blocking: it must not read as "the app is busy, stop typing."
 *
 * A bar pinned to the very top edge, NOT a centred pill. The pill was the first version
 * and rendering it at 375 px killed it: on a phone the header occupies the top of the
 * viewport, so a centred pill sat squarely over the season name — "2027 Growing Season"
 * read as "027 Growing Season". Obscuring which season you are in is not an acceptable
 * price for saying a refresh is running, and this app has already paid once for a
 * column that fell off the right edge on a phone (F-4b). The top three pixels belong to
 * nothing, at every width.
 *
 * `pointer-events-none` on top of that, so it cannot swallow a tap even in principle.
 */
export function AppRefreshIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 h-[3px] z-40 pointer-events-none overflow-hidden bg-blue-100"
    >
      <div className="h-full w-full bg-blue-600 animate-pulse" />
      <span className="sr-only">Refreshing</span>
    </div>
  );
}

/**
 * Shown when a load fails after the app has loaded once. The page underneath keeps the
 * data it already had — R-5's rule that a failed load must not be presented as an empty
 * one — so this is a retry offer, not an error screen.
 *
 * Bottom-left rather than bottom-right, where the toasts live. On a phone it spans the
 * width and a toast may briefly overlay it; the toast is transient and this is not.
 */
export function AppLoadErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-40"
    >
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-white p-4 shadow-xl">
        <div className="bg-red-100 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Could not refresh</p>
          <p className="text-sm text-gray-600 mt-0.5">{message}</p>
        </div>
        {/* py-3 keeps this at a >=44px tap target, per the design doc's rule for new controls. */}
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

/**
 * WI-22. Shown while a lazily-loaded page's chunk is in flight.
 *
 * It renders INSIDE `DashboardLayout`, in the page area, so the sidebar, the header and
 * the season picker stay on screen and stay usable while a page arrives. That placement
 * is the whole point and it is R-1's rule applied to a new cause: a load in flight is not
 * a reason to replace the screen. A `<Suspense>` fallback hoisted above the layout would
 * reinstate exactly the full-screen takeover R-1 removed, by a different route.
 *
 * Deliberately quiet — no spinner text, no "Loading…" heading. On a fast connection this
 * is visible for a few frames, and anything louder would flash. It has a min-height so
 * the layout does not collapse and then jump when the page lands.
 */
export function PageLoadFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-label="Loading page">
      <div
        className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-green-600 animate-spin"
        aria-hidden="true"
      />
    </div>
  );
}
