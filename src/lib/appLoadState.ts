/*
 * R-1 / R-5 — which app-level surface a load state earns.
 *
 * This is the decision the "random reload" investigation calls the amplifier. It used
 * to be four early returns in App.tsx's render body, each replacing the ENTIRE tree:
 * a load error, one frame of `loading`, and an empty seasons list all discarded every
 * page, every open modal and every half-typed form. The trigger could be anywhere; the
 * effect was always the whole app.
 *
 * It is a pure function here for the reason every other rule in this codebase became
 * one — `accumulateNeed`, `planLineDraw`, `refreshProgramCostInRefs`. App.tsx reaches
 * the Supabase client at module load and cannot be exercised on a machine with no
 * credentials, so a rule left inline there can only ever be verified by reading. This
 * one has a truth table instead.
 */

export interface AppLoadState {
  /** The auth provider is still resolving a session. */
  authLoading: boolean;
  /** An app-level data load is in flight. */
  loading: boolean;
  /**
   * The app has rendered its chrome and a page at least once, so there is now state
   * worth preserving. Cleared deliberately on a farm switch, which is the one
   * transition that legitimately replaces everything on screen.
   */
  hasLoadedOnce: boolean;
  /** The message from the most recent failed load, or null. */
  loadError: string | null;
}

export interface AppLoadPresentation {
  /**
   * A surface that REPLACES the whole app. Only ever legitimate before the first
   * successful render, when there is nothing to preserve.
   */
  fullScreen: 'loading' | 'error' | null;
  /**
   * A surface rendered BESIDE the app, leaving the page, its modals and its form state
   * exactly where they were.
   */
  overlay: 'refreshing' | 'error' | null;
  /**
   * R-5. Whether an empty seasons list may be presented as a brand-new farm. An empty
   * list means one of two things — a load that succeeded and found none, or a load that
   * never completed — and only the first may show "Welcome to Crop Tracker!".
   */
  emptySeasonsIsConfirmed: boolean;
}

export function resolveAppLoadPresentation(state: AppLoadState): AppLoadPresentation {
  const { authLoading, loading, hasLoadedOnce, loadError } = state;
  const busy = authLoading || loading;
  const emptySeasonsIsConfirmed = loadError === null;

  if (!hasLoadedOnce) {
    /*
     * Error is tested before loading, preserving the original order of the early
     * returns. It is also gated on `!loading`, so a retry already in flight shows the
     * spinner rather than the failure it is busy trying to clear.
     */
    if (loadError !== null && !loading) {
      return { fullScreen: 'error', overlay: null, emptySeasonsIsConfirmed };
    }
    if (busy) {
      return { fullScreen: 'loading', overlay: null, emptySeasonsIsConfirmed };
    }
    return { fullScreen: null, overlay: null, emptySeasonsIsConfirmed };
  }

  /*
   * Past the first load nothing takes the screen. The error outranks the refresh pill
   * so a retry in flight does not stack two overlays; the banner already says a load is
   * being attempted.
   */
  if (loadError !== null) {
    return { fullScreen: null, overlay: 'error', emptySeasonsIsConfirmed };
  }
  if (busy) {
    return { fullScreen: null, overlay: 'refreshing', emptySeasonsIsConfirmed };
  }
  return { fullScreen: null, overlay: null, emptySeasonsIsConfirmed };
}
