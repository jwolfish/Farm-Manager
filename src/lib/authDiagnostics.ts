/*
 * TEMPORARY INSTRUMENTATION — the "random reload" investigation.
 *
 * See docs/Farm-Manager-Random-Reload-Diagnosis.md section 4. This exists to answer
 * two questions with measurement instead of argument, before R-1 ... R-7 are written:
 *
 *   1. Is the page actually RELOADING, or is React REMOUNTING? They look identical to
 *      a user and have completely different fixes. `performance.getEntriesByType(
 *      'navigation')[0].type` settles it, but only if something records it -- a real
 *      reload wipes the console, which is why every previous look at this failed.
 *   2. If it is a remount, is it T-1 (an hourly/tab-focus TOKEN_REFRESHED publishing a
 *      new user object) or T-3 (an unasked-for SIGNED_OUT from a failed refresh)?
 *
 * Everything here is WRITE-ONLY observation. It must never change auth behaviour.
 *
 * The buffer lives in localStorage on purpose: it has to survive a genuine page reload,
 * which is the one case where the console is useless. Delete this file and its three
 * call sites when the investigation closes.
 */

const STORAGE_KEY = 'farmManager.authDiagnostics.v1';
const MAX_ENTRIES = 300;

export interface AuthDiagnosticEntry {
  /** Wall clock, so entries can be matched against "it just happened at 2:14". */
  at: string;
  /** ms since this page load. Makes the ~hourly refresh cadence visible at a glance. */
  sincePageLoad: number;
  event: string;
  detail?: Record<string, string | number | boolean | null>;
}

function nowSincePageLoad(): number {
  try {
    return Math.round(performance.now());
  } catch {
    return -1;
  }
}

function read(): AuthDiagnosticEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuthDiagnosticEntry[]) : [];
  } catch {
    // A private window, cleared site data, or a browser blocking storage. Losing the
    // history is acceptable; breaking the app to preserve it is not.
    return [];
  }
}

function write(entries: AuthDiagnosticEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* ignore */
  }
}

/**
 * Record one observation. Goes to the console (for a live watch with DevTools open)
 * and to localStorage (for the far more likely case of noticing after the fact).
 */
export function logAuthDiagnostic(
  event: string,
  detail?: Record<string, string | number | boolean | null>
): void {
  const entry: AuthDiagnosticEntry = {
    at: new Date().toISOString(),
    sincePageLoad: nowSincePageLoad(),
    event,
    ...(detail ? { detail } : {}),
  };

  console.log('[auth-diag]', entry.at, event, detail ?? '');

  const entries = read();
  entries.push(entry);
  write(entries);
}

/**
 * Called once when the JS bundle first evaluates.
 *
 * `navigationType` is the whole ballgame. If it says "reload" or "navigate" on an entry
 * that appears mid-session, the browser genuinely reloaded and nothing in the reload
 * diagnosis applies -- look at the host (Bolt preview HMR, a container restart) instead.
 * If the only page-load entry is the original one and the disruption left no new entry,
 * it was a React remount.
 */
export function recordPageLoad(): void {
  let navigationType = 'unknown';
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type) navigationType = nav.type;
  } catch {
    /* ignore */
  }

  logAuthDiagnostic('page-load', {
    navigationType,
    url: window.location.pathname + window.location.search,
  });
}

/** Summarise a session without ever recording the token itself. */
export function describeSession(session: {
  user?: { id?: string } | null;
  access_token?: string | null;
  expires_at?: number | null;
} | null): Record<string, string | number | boolean | null> {
  if (!session) return { session: 'null' };

  const expiresAt = session.expires_at ?? null;
  return {
    // First 8 chars is enough to tell two accounts apart without logging a real id.
    userId: session.user?.id ? session.user.id.slice(0, 8) : null,
    // A fingerprint, NOT the token. Enough to see that it rotated.
    tokenTail: session.access_token ? session.access_token.slice(-8) : null,
    expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    // Negative means the token was already expired when this fired -- that is the
    // shape that precedes a refresh failure and a T-3 sign-out.
    expiresInSec: expiresAt ? Math.round(expiresAt - Date.now() / 1000) : null,
  };
}

export function dumpAuthDiagnostics(): AuthDiagnosticEntry[] {
  const entries = read();
  console.table(
    entries.map(e => ({
      at: e.at,
      sincePageLoad: e.sincePageLoad,
      event: e.event,
      ...(e.detail ?? {}),
    }))
  );
  return entries;
}

export function clearAuthDiagnostics(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  console.log('[auth-diag] cleared');
}

/*
 * Exposed on window so the owner can read this without a build, a bookmarklet, or any
 * knowledge of the module system. The whole point is that it is usable at the moment
 * the fault happens, from a phone-adjacent laptop, by typing one word.
 */
declare global {
  interface Window {
    authDiag?: {
      dump: typeof dumpAuthDiagnostics;
      clear: typeof clearAuthDiagnostics;
    };
  }
}

export function installAuthDiagnosticsGlobal(): void {
  window.authDiag = { dump: dumpAuthDiagnostics, clear: clearAuthDiagnostics };
}
