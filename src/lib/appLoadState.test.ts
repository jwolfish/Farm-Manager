import { describe, expect, it } from 'vitest';
import { AppLoadState, resolveAppLoadPresentation } from './appLoadState';

const base: AppLoadState = {
  authLoading: false,
  loading: false,
  hasLoadedOnce: false,
  loadError: null,
};

const resolve = (over: Partial<AppLoadState>) => resolveAppLoadPresentation({ ...base, ...over });

describe('resolveAppLoadPresentation — before the first render (nothing to preserve)', () => {
  it('takes the screen for the very first load', () => {
    expect(resolve({ loading: true }).fullScreen).toBe('loading');
    expect(resolve({ authLoading: true }).fullScreen).toBe('loading');
  });

  it('takes the screen for a failure with nothing behind it', () => {
    expect(resolve({ loadError: 'boom' }).fullScreen).toBe('error');
  });

  it('shows the spinner, not the failure, while a retry is in flight', () => {
    expect(resolve({ loadError: 'boom', loading: true }).fullScreen).toBe('loading');
  });

  it('never renders an overlay it would have nothing to sit beside', () => {
    expect(resolve({ loading: true }).overlay).toBeNull();
    expect(resolve({ loadError: 'boom' }).overlay).toBeNull();
  });
});

describe('resolveAppLoadPresentation — R-1, after the first render', () => {
  /*
   * The regression that matters. Every one of these was a full-screen takeover before
   * R-1, and each one discarded the open modal, the half-typed form and the scroll
   * position. If a later change reinstates any of them, these fail.
   */
  it('does NOT take the screen for a refresh', () => {
    const r = resolve({ hasLoadedOnce: true, loading: true });
    expect(r.fullScreen).toBeNull();
    expect(r.overlay).toBe('refreshing');
  });

  it('does NOT take the screen for a token refresh flipping authLoading', () => {
    const r = resolve({ hasLoadedOnce: true, authLoading: true });
    expect(r.fullScreen).toBeNull();
    expect(r.overlay).toBe('refreshing');
  });

  it('does NOT take the screen for a failed refresh', () => {
    const r = resolve({ hasLoadedOnce: true, loadError: 'Could not load seasons.' });
    expect(r.fullScreen).toBeNull();
    expect(r.overlay).toBe('error');
  });

  it('shows one overlay, not two, when a retry is in flight', () => {
    expect(resolve({ hasLoadedOnce: true, loadError: 'boom', loading: true }).overlay).toBe('error');
  });

  it('shows nothing at rest', () => {
    const r = resolve({ hasLoadedOnce: true });
    expect(r.fullScreen).toBeNull();
    expect(r.overlay).toBeNull();
  });

  /*
   * The farm switch is the exception, and it is expressed by the caller clearing
   * hasLoadedOnce rather than by a rule in here. Pinned so the two stay connected: a
   * farm switch legitimately replaces everything, because the page you were on belongs
   * to the farm you are leaving.
   */
  it('takes the screen again for a farm switch, which resets hasLoadedOnce', () => {
    expect(resolve({ hasLoadedOnce: false, loading: true }).fullScreen).toBe('loading');
  });
});

describe('resolveAppLoadPresentation — R-5, empty seasons vs failed seasons', () => {
  it('confirms an empty list when the load succeeded', () => {
    expect(resolve({ hasLoadedOnce: true }).emptySeasonsIsConfirmed).toBe(true);
  });

  it('refuses to confirm an empty list when the load failed', () => {
    expect(resolve({ loadError: 'Loading seasons timed out.' }).emptySeasonsIsConfirmed).toBe(false);
    expect(resolve({ hasLoadedOnce: true, loadError: 'boom' }).emptySeasonsIsConfirmed).toBe(false);
  });

  it('does not confirm an empty list on the strength of a load still running', () => {
    // A timeout has not fired yet, so there is no error -- but the seasons in hand are
    // the previous ones either way, since R-5 stopped clearing them on failure.
    expect(resolve({ hasLoadedOnce: true, loading: true }).emptySeasonsIsConfirmed).toBe(true);
  });

  it('is independent of whether the screen is being taken', () => {
    // The welcome screen is gated on this flag alone; it must not quietly depend on
    // which surface happens to be showing.
    expect(resolve({ loadError: 'boom' }).emptySeasonsIsConfirmed).toBe(false);
    expect(resolve({ loadError: 'boom', loading: true }).emptySeasonsIsConfirmed).toBe(false);
  });
});
