import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchSharedFarms, SharedFarm } from '../lib/teamMembers';
import { fetchOwnedFarms, createFarm, Farm } from '../lib/farms';
// TEMPORARY — the "random reload" investigation. Remove with lib/authDiagnostics.ts.
import { logAuthDiagnostic } from '../lib/authDiagnostics';

export interface Season {
  id: string;
  year: number;
  name: string;
  is_active: boolean;
  farm_id?: string | null;
}

/*
 * R-5. Was 10 s. On rural cell data a slow seasons query is a normal event, not a
 * failure, and the old timeout turned it into one. Doubling it costs nothing now that
 * a timeout no longer takes the screen away: after the first load the page stays put
 * and the retry banner appears in the corner, so the user is not staring at a spinner
 * while it runs down. A single automatic retry was considered and left out — it doubles
 * the worst case before the user is told anything, and the banner's Try Again is now
 * available without losing the page.
 */
const SEASON_LOAD_TIMEOUT_MS = 20000;

interface UseSeasonDataArgs {
  user: User | null;
  authLoading: boolean;
  activeFarmId: string | null;
  setOwnedFarms: (farms: Farm[]) => void;
  setOwnFarmById: (userId: string, farm: Farm) => void;
  setOwnFarm: (userId: string, farmId: string | null, farmName: string | null) => void;
}

/*
 * WI-29b. Everything App.tsx knew about loading seasons and farms, moved out whole.
 *
 * This hook owns the three-value load state R-1 and R-5 turn on, and they are three
 * distinct ideas that this codebase has twice mistaken for two:
 *
 *   loading        a request is in flight
 *   hasLoadedOnce  something has rendered, so there is state worth keeping
 *   dataLoadError  the last load failed
 *
 * Collapsing the first two is what made every trigger in the reload diagnosis present
 * as the app resetting itself. Treating an empty `seasons` as "this farm has none" —
 * without asking whether the load actually succeeded — is what made a failed refresh
 * present as a brand-new farm. Both fixes live here now, and the DECISION about which
 * surface a load state earns stays in lib/appLoadState.ts where it is unit-tested.
 */
export function useSeasonData({
  user,
  authLoading,
  activeFarmId,
  setOwnedFarms,
  setOwnFarmById,
  setOwnFarm,
}: UseSeasonDataArgs) {
  const wasAuthenticated = useRef(false);
  const loadedForUserIdRef = useRef<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharedFarms, setSharedFarms] = useState<SharedFarm[]>([]);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  /*
   * R-1. `loading` says a load is in flight. It does NOT say the screen should be
   * replaced, and treating the two as the same thing is what made every trigger in the
   * reload diagnosis feel like the app resetting itself.
   *
   * Once the app has rendered once there is state worth keeping — an open modal, a
   * half-typed form, the active tab, the scroll position — so a later load shows an
   * indicator and leaves the tree mounted. Before that there is nothing to preserve,
   * so the full-screen spinner is correct.
   *
   * A farm switch sets this back to false on purpose: that transition legitimately
   * replaces everything on screen, and a full-screen load is the honest presentation
   * of it. `beginFullScreenLoad` is the only way to do that, so the intent is greppable
   * rather than four scattered `setHasLoadedOnce(false)` calls.
   */
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!authLoading && !loading && user) {
      setHasLoadedOnce(true);
    }
  }, [authLoading, loading, user]);

  /*
   * WI-29b. The `forUserId` second parameter is GONE, and its absence is the point.
   *
   * It had been unused since Round 5 made every read farm-scoped — the query filters on
   * `farm_id` and RLS decides visibility, exactly as the "do not filter reads by
   * `user_id`" convention requires. ESLint had been reporting it as dead the whole time,
   * inside the baseline this remediation spent a week learning not to treat as noise.
   * Callers were passing an owner id that changed nothing, which is a false signal about
   * what scopes this query.
   */
  const loadSeasonsByFarm = useCallback(async (farmId: string) => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEASON_LOAD_TIMEOUT_MS);
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('farm_id', farmId)
        .order('year', { ascending: false })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;

      setSeasons(data || []);

      if (data && data.length > 0) {
        const active = data.find((s: Season) => s.is_active) || data[0];
        setCurrentSeason(active);
      } else {
        setCurrentSeason(null);
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (!isAbort) {
        console.error('Error loading seasons:', error);
        setDataLoadError('Could not load seasons. Please check your connection and try again.');
      } else {
        setDataLoadError('Loading seasons timed out. Please try again.');
      }
      /*
       * R-5. This used to `setSeasons([])`, which made a FAILED load indistinguishable
       * from a farm that genuinely has no seasons. Same defect shape as WI-15's "a
       * failed query is indistinguishable from an empty one", surfacing in the UI
       * instead of in the cascade.
       *
       * A CORRECTION to what the diagnosis doc says about this, and to the comment that
       * stood here: on THIS path the welcome screen never actually appeared. The catch
       * above sets dataLoadError, and the "Failed to Load" gate is tested before the
       * welcome gate, so a failed farm seasons load showed the error card. It was still
       * a full-screen takeover — R-1's problem — but not the first-run lie. The lie was
       * reachable on the legacy no-farm branch of loadSeasons below, which cleared the
       * seasons and reported nothing at all.
       *
       * Clearing them was still wrong here, and more wrong after R-1: the error is now
       * a banner over a live page, so an emptied list would leave the user looking at an
       * app with no seasons in it while being told a refresh failed.
       *
       * The previous seasons are kept instead. Three states, not two: loaded (seasons
       * replaced), confirmed empty (seasons set to [] on a SUCCESSFUL load), failed
       * (seasons untouched, dataLoadError set). Only a confirmed empty may reach the
       * welcome screen, which is what emptySeasonsIsConfirmed gates.
       *
       * The diagnostic entry stays until authDiagnostics.ts is removed; it is now a
       * record of a handled failure rather than a warning about an impending lie.
       */
      logAuthDiagnostic('seasons-load-failed', {
        farmId: farmId.slice(0, 8),
        reason: isAbort ? 'timeout' : 'error',
        timeoutMs: SEASON_LOAD_TIMEOUT_MS,
        note: 'previous seasons kept; retry banner shown',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSeasons = useCallback(
    async (forUserId: string) => {
      if (activeFarmId) {
        await loadSeasonsByFarm(activeFarmId);
      } else {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('seasons')
            .select('*')
            .eq('user_id', forUserId)
            .order('year', { ascending: false });

          if (error) throw error;
          setSeasons(data || []);
          if (data && data.length > 0) {
            const active = data.find((s: Season) => s.is_active) || data[0];
            setCurrentSeason(active);
          } else {
            setCurrentSeason(null);
          }
        } catch (error) {
          /*
           * R-5, the legacy no-farm path. This one was worse than its sibling above: it
           * cleared the seasons AND reported nothing at all, so a failure here rendered
           * the welcome screen with no error anywhere. Keep the seasons and say so.
           */
          console.error('Error loading seasons:', error);
          setDataLoadError('Could not load seasons. Please check your connection and try again.');
        } finally {
          setLoading(false);
        }
      }
    },
    [activeFarmId, loadSeasonsByFarm]
  );

  const loadSharedFarms = useCallback(async () => {
    if (!user) return;
    const farms = await fetchSharedFarms(user.id);
    setSharedFarms(farms);
  }, [user]);

  const loadInitialData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setDataLoadError(null);
    try {
      const [farmsResult, sharedFarmsResult, profileResult] = await Promise.allSettled([
        fetchOwnedFarms(user.id),
        fetchSharedFarms(user.id),
        supabase.from('user_profiles').select('farm_name').eq('id', user.id).maybeSingle(),
      ]);

      if (farmsResult.status === 'rejected') {
        setDataLoadError('Could not load your farms. Please check your connection and try again.');
        setLoading(false);
        return;
      }

      const farms = farmsResult.value;
      const sharedFarmsData = sharedFarmsResult.status === 'fulfilled' ? sharedFarmsResult.value : [];
      const profileData = profileResult.status === 'fulfilled' ? profileResult.value : { data: null };

      if (sharedFarmsResult.status === 'rejected') console.error('Error loading shared farms:', sharedFarmsResult.reason);
      if (profileResult.status === 'rejected') console.error('Error loading profile:', profileResult.reason);

      setSharedFarms(sharedFarmsData);

      let resolvedFarms = farms;

      if (farms.length === 0) {
        const defaultName = profileData.data?.farm_name || 'My Farm';
        const { farm: newFarm } = await createFarm(user.id, defaultName);
        if (newFarm) {
          resolvedFarms = [newFarm];
        }
      }

      setOwnedFarms(resolvedFarms);

      if (resolvedFarms.length > 0) {
        const firstFarm = resolvedFarms[0];
        setOwnFarmById(user.id, firstFarm);
        await loadSeasonsByFarm(firstFarm.id);
      } else {
        setOwnFarm(user.id, null, profileData.data?.farm_name ?? null);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setDataLoadError('Something went wrong loading your account. Please try again.');
      setLoading(false);
    }
  }, [user, setOwnedFarms, setOwnFarmById, setOwnFarm, loadSeasonsByFarm]);

  useEffect(() => {
    if (user) {
      wasAuthenticated.current = true;
      if (loadedForUserIdRef.current !== user.id) {
        loadedForUserIdRef.current = user.id;
        loadInitialData();
      }
    } else if (!authLoading) {
      loadedForUserIdRef.current = null;
      setLoading(false);
    }
  }, [user?.id, authLoading, loadInitialData]);

  const retryInitialLoad = useCallback(() => {
    setDataLoadError(null);
    loadInitialData();
  }, [loadInitialData]);

  /**
   * R-1. Declares that the next load legitimately replaces the whole screen — a farm
   * switch, or a sign-out that ends the session the loaded state belonged to. Call it
   * ALONGSIDE the load, not at the top of a handler, so a switch that bails out early
   * (no access) leaves the current screen alone.
   */
  const beginFullScreenLoad = useCallback(() => setHasLoadedOnce(false), []);

  return {
    seasons,
    setSeasons,
    currentSeason,
    setCurrentSeason,
    loading,
    dataLoadError,
    hasLoadedOnce,
    sharedFarms,
    wasAuthenticated,
    loadSeasonsByFarm,
    loadSeasons,
    loadSharedFarms,
    retryInitialLoad,
    beginFullScreenLoad,
  };
}

export type SeasonData = ReturnType<typeof useSeasonData>;
