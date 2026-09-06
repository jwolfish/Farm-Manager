import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_PAGE,
  PAGE_PATHS,
  fieldDetailPath,
  pageKeyFromPath,
  pathForPage,
} from './appRoutes';

/*
 * WI-29a. What these are actually guarding.
 *
 * The sidebar's page keys and the router's paths are two lists that have to agree, and
 * nothing but this file makes them. A key that navigates to a path with no route lands
 * on the catch-all and silently bounces to the dashboard — a click that "does nothing",
 * which is the least debuggable class of navigation bug. The round trip below is the
 * assertion that fails if the two lists drift.
 */

describe('the page key and the URL round-trip', () => {
  it('every sidebar page key survives key → path → key', () => {
    for (const page of Object.keys(PAGE_PATHS)) {
      expect(pageKeyFromPath(pathForPage(page))).toBe(page);
    }
  });

  it('every path is distinct, so no two pages share a URL', () => {
    const paths = Object.values(PAGE_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every path is absolute, because a relative one resolves against the current page', () => {
    for (const path of Object.values(PAGE_PATHS)) {
      expect(path.startsWith('/')).toBe(true);
    }
  });
});

describe('pathForPage', () => {
  it('resolves a known key', () => {
    expect(pathForPage('spray-planner')).toBe('/spray-planner');
  });

  /*
   * A wrong screen is recoverable; a thrown error inside a click handler is a crash
   * with no boundary between it and the user.
   */
  it('falls back to the dashboard rather than throwing on an unknown key', () => {
    expect(pathForPage('does-not-exist')).toBe(PAGE_PATHS[DASHBOARD_PAGE]);
    expect(pathForPage('')).toBe(PAGE_PATHS[DASHBOARD_PAGE]);
  });
});

describe('pageKeyFromPath', () => {
  it('reads the bare origin as the dashboard', () => {
    expect(pageKeyFromPath('/')).toBe('dashboard');
    expect(pageKeyFromPath('')).toBe('dashboard');
  });

  it('tolerates a trailing slash, which comes from wherever the URL was pasted', () => {
    expect(pageKeyFromPath('/reports/')).toBe('reports');
  });

  it('tolerates casing for the same reason', () => {
    expect(pageKeyFromPath('/Spray-Planner')).toBe('spray-planner');
  });

  /*
   * The sidebar keeps Fields lit while one field is open. That screen renders outside
   * DashboardLayout today, so nothing displays this answer yet — but it is the honest
   * one, and it stops being academic the moment the layout wraps it.
   */
  it('reports a field detail URL as the Fields page', () => {
    expect(pageKeyFromPath('/fields/8f14e45f-ceea-467a-9ca6-1a5dbb0e5f3c')).toBe('fields');
  });

  it('does not mistake a longer page name for a field id', () => {
    expect(pageKeyFromPath('/fieldsomething')).toBe('dashboard');
  });

  /*
   * Matches where the catch-all route actually sends an unknown path. Any other answer
   * would label one frame of the error panel with a page the user is not on.
   */
  it('reports an unrecognised path as the dashboard', () => {
    expect(pageKeyFromPath('/not-a-page')).toBe('dashboard');
    expect(pageKeyFromPath('/fields/abc/extra')).toBe('fields');
  });
});

describe('fieldDetailPath', () => {
  it('builds a URL the matcher reads back as one field', () => {
    expect(fieldDetailPath('8f14e45f-ceea-467a-9ca6-1a5dbb0e5f3c')).toBe(
      '/fields/8f14e45f-ceea-467a-9ca6-1a5dbb0e5f3c'
    );
  });

  /*
   * Ids are UUIDs today and need no encoding. A matcher that only works for UUIDs is a
   * trap for whatever gets routed next, so the encoding is here before it is needed.
   */
  it('encodes an id that would otherwise break the path segment', () => {
    expect(fieldDetailPath('a/b?c')).toBe('/fields/a%2Fb%3Fc');
  });
});
