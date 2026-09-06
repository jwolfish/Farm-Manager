/*
 * WI-29a. The single place that knows how a sidebar page key and a URL correspond.
 *
 * `DashboardLayout` has always identified pages by a short string — 'dashboard',
 * 'spray-planner' — and it still does, so its props and its highlight logic are
 * untouched by the router. What changed underneath is where that string comes from:
 * it used to be React state seeded from `sessionStorage`, and it is now derived from
 * the URL, which is what makes the browser's back button work at all.
 *
 * Keeping the mapping here rather than inline in App.tsx follows the same rule as
 * `appLoadState.ts` and `renderErrorState.ts`: App.tsx imports the Supabase client at
 * module load and therefore cannot be exercised on a machine with no credentials, so
 * any decision left inside it can only ever be verified by reading. This one can be
 * tested, and is.
 *
 * The paths below are what the address bar shows verbatim — '/fields', not '#/fields'.
 * They were hash routes until the app moved to Netlify on 6 Sep 2026, and the switch
 * touched nothing in this file: the router type in App.tsx is the only thing that knows.
 * What clean paths depend on is the host rewriting unknown paths to index.html, which is
 * committed as `public/_redirects`. Those two must move together or a refresh 404s.
 */

export const DASHBOARD_PAGE = 'dashboard';

/**
 * Page key → path. Every key here is one `DashboardLayout` can navigate to, and every
 * value is a route mounted in App.tsx. The two must stay in step: a key with no route
 * navigates to a URL that falls through to the catch-all and bounces to the dashboard.
 */
export const PAGE_PATHS: Record<string, string> = {
  dashboard: '/dashboard',
  fields: '/fields',
  products: '/products',
  templates: '/templates',
  yields: '/yields',
  sales: '/sales',
  'spray-planner': '/spray-planner',
  reports: '/reports',
  'account-settings': '/account-settings',
  'farm-settings': '/farm-settings',
  team: '/team',
};

/** The route pattern App.tsx matches to decide it is showing one field. */
export const FIELD_DETAIL_PATTERN = '/fields/:fieldId';

const PATH_TO_PAGE: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page])
);

/**
 * Where a sidebar page key navigates to. An unknown key resolves to the dashboard
 * rather than throwing: a bad key is a wrong screen, not a reason to blank the app.
 */
export function pathForPage(page: string): string {
  return PAGE_PATHS[page] ?? PAGE_PATHS[DASHBOARD_PAGE];
}

/**
 * The URL for one field's detail screen. The id is encoded because it lands in a path
 * segment — today these are UUIDs and need nothing, but a matcher that only works for
 * UUIDs is a trap for whatever is routed next.
 */
export function fieldDetailPath(fieldId: string): string {
  return `/fields/${encodeURIComponent(fieldId)}`;
}

/**
 * The page key for a URL, used for the sidebar highlight and for the error boundary's
 * label and reset key.
 *
 * Two cases are deliberate rather than incidental:
 *
 *  - `/fields/<id>` reports **fields**, so the sidebar keeps Fields lit while a field
 *    is open. That screen renders outside `DashboardLayout` today, but the answer is
 *    the honest one either way and stops being academic the moment it does not.
 *  - An unrecognised path reports **dashboard**, matching where the catch-all route
 *    sends it. Returning something else would label one frame of the error panel with
 *    a page the user is not on.
 */
export function pageKeyFromPath(pathname: string): string {
  const normalised = normalisePath(pathname);

  const direct = PATH_TO_PAGE[normalised];
  if (direct) return direct;

  if (normalised.startsWith(`${PAGE_PATHS.fields}/`)) return 'fields';

  return DASHBOARD_PAGE;
}

/**
 * Trailing slashes and casing come from wherever the URL was typed or pasted, not
 * from anything the app emitted, so both are tolerated. An empty path is the bare
 * origin, which is the dashboard.
 */
function normalisePath(pathname: string): string {
  const trimmed = (pathname || '').trim().toLowerCase();
  if (trimmed === '' || trimmed === '/') return PAGE_PATHS[DASHBOARD_PAGE];
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}
