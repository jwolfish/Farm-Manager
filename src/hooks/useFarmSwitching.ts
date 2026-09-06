import { useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchOwnedFarms, Farm } from '../lib/farms';
import { SharedFarm } from '../lib/teamMembers';
import type { ActiveFarm } from '../contexts/FarmContext';
import type { SeasonData } from './useSeasonData';

interface UseFarmSwitchingArgs {
  user: User | null;
  activeFarm: ActiveFarm | null;
  ownedFarms: Farm[];
  setOwnedFarms: (farms: Farm[]) => void;
  setOwnFarm: (userId: string, farmId: string | null, farmName: string | null) => void;
  setOwnFarmById: (userId: string, farm: Farm) => void;
  setSharedFarm: (farm: {
    farmId: string;
    ownerId: string;
    ownerName: string | null;
    farmName: string | null;
    role: 'editor' | 'viewer';
  }) => void;
  addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  data: SeasonData;
  goToDashboard: () => void;
}

/*
 * WI-29b. The five farm handlers, moved out of App.tsx unchanged.
 *
 * R-1's rule is what holds them together and is why they are one hook rather than five
 * loose functions: every one of them calls `beginFullScreenLoad()` IMMEDIATELY BEFORE
 * its load, never at the top. A farm switch is the single transition that legitimately
 * replaces the whole screen — the page you were on belongs to the farm you are leaving
 * — so the full-screen spinner is right there and only there. Set at the top instead,
 * a switch that bails out early (no access) would blank a screen it never left.
 *
 * `handleFarmsUpdated` is the odd one out and deliberately does NOT declare a
 * full-screen load: renaming a farm from Farm Settings does not change which farm you
 * are looking at, so nothing needs replacing.
 */
export function useFarmSwitching({
  user,
  activeFarm,
  ownedFarms,
  setOwnedFarms,
  setOwnFarm,
  setOwnFarmById,
  setSharedFarm,
  addNotification,
  data,
  goToDashboard,
}: UseFarmSwitchingArgs) {
  const { loadSeasonsByFarm, loadSeasons, loadSharedFarms, beginFullScreenLoad } = data;

  const handleSwitchToOwnedFarm = useCallback(
    async (farm: Farm) => {
      if (!user) return;
      setOwnFarmById(user.id, farm);
      beginFullScreenLoad();
      await loadSeasonsByFarm(farm.id);
      goToDashboard();
    },
    [user, setOwnFarmById, beginFullScreenLoad, loadSeasonsByFarm, goToDashboard]
  );

  const handleSwitchToSharedFarm = useCallback(
    async (farm: SharedFarm) => {
      if (!user) return;

      const { data: accessRecord } = await supabase
        .from('team_members')
        .select('id, status')
        .eq('invited_user_id', user.id)
        .eq('farm_id', farm.farmId)
        .eq('status', 'accepted')
        .maybeSingle();

      if (!accessRecord) {
        addNotification('Access to this farm is no longer available.', 'error');
        await loadSharedFarms();
        return;
      }

      setSharedFarm({
        farmId: farm.farmId,
        ownerId: farm.ownerId,
        ownerName: farm.ownerName,
        farmName: farm.farmName,
        role: farm.role,
      });
      beginFullScreenLoad();
      if (farm.farmId) {
        await loadSeasonsByFarm(farm.farmId);
      } else {
        await loadSeasons(farm.ownerId);
      }
      goToDashboard();
    },
    [
      user,
      setSharedFarm,
      addNotification,
      loadSharedFarms,
      beginFullScreenLoad,
      loadSeasonsByFarm,
      loadSeasons,
      goToDashboard,
    ]
  );

  const handleSwitchToOwnFarm = useCallback(async () => {
    if (!user) return;
    const farms = ownedFarms.length > 0 ? ownedFarms : await fetchOwnedFarms(user.id);
    beginFullScreenLoad();
    if (farms.length > 0) {
      setOwnFarmById(user.id, farms[0]);
      await loadSeasonsByFarm(farms[0].id);
    } else {
      setOwnFarm(user.id, null, null);
      await loadSeasons(user.id);
    }
    goToDashboard();
  }, [
    user,
    ownedFarms,
    setOwnFarmById,
    setOwnFarm,
    beginFullScreenLoad,
    loadSeasonsByFarm,
    loadSeasons,
    goToDashboard,
  ]);

  const handleFarmCreated = useCallback(
    async (newFarm: Farm) => {
      if (!user) return;
      const updatedFarms = [...ownedFarms, newFarm];
      setOwnedFarms(updatedFarms);
      setOwnFarmById(user.id, newFarm);
      beginFullScreenLoad();
      await loadSeasonsByFarm(newFarm.id);
      goToDashboard();
    },
    [user, ownedFarms, setOwnedFarms, setOwnFarmById, beginFullScreenLoad, loadSeasonsByFarm, goToDashboard]
  );

  const handleFarmsUpdated = useCallback(async () => {
    if (!user) return;
    const farms = await fetchOwnedFarms(user.id);
    setOwnedFarms(farms);
    if (activeFarm?.isOwn && activeFarm.farmId) {
      const updated = farms.find((f) => f.id === activeFarm.farmId);
      if (updated) {
        setOwnFarmById(user.id, updated);
      }
    }
  }, [user, activeFarm, setOwnedFarms, setOwnFarmById]);

  const handleInviteAccepted = useCallback(async () => {
    await loadSharedFarms();
  }, [loadSharedFarms]);

  return {
    handleSwitchToOwnedFarm,
    handleSwitchToSharedFarm,
    handleSwitchToOwnFarm,
    handleFarmCreated,
    handleFarmsUpdated,
    handleInviteAccepted,
  };
}
