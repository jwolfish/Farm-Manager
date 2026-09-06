import { useCallback, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Season, SeasonData } from './useSeasonData';
import type { SeasonFormData } from '../components/app/AppFullScreens';

const emptyForm = (): SeasonFormData => ({
  year: new Date().getFullYear(),
  name: '',
  importFromSeason: '',
});

interface UseSeasonCrudArgs {
  user: User | null;
  activeFarmId: string | null;
  isOwnFarm: boolean;
  data: SeasonData;
}

/*
 * WI-29b. Creating, importing into and deleting a season, moved out of App.tsx whole.
 *
 * It is a separate hook from `useSeasonData` because the two answer different
 * questions. `useSeasonData` owns what the app is currently looking at and whether the
 * load that produced it succeeded — the R-1 / R-5 machinery. This owns a short-lived
 * wizard: a form, a pending id, a confirmation. Nothing in here is consulted to decide
 * what to render behind an overlay, and keeping the two apart is what stops a
 * half-typed season form from ever being mistaken for a load state again.
 *
 * The reload timeouts here are deliberately NOT the 20 s of useSeasonData. This one is
 * a re-read immediately after a write the user just watched complete, not a cold load
 * over cell data, and it is left exactly as it was rather than harmonised on the way
 * past — a behaviour change smuggled into a move is the thing this round must not do.
 */
export function useSeasonCrud({ user, activeFarmId, isOwnFarm, data }: UseSeasonCrudArgs) {
  const { setSeasons, setCurrentSeason, currentSeason, seasons, loadSeasonsByFarm, loadSeasons } = data;

  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonFormData, setSeasonFormData] = useState<SeasonFormData>(emptyForm);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [pendingSeasonId, setPendingSeasonId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);

  /** Re-read after a write, through whichever path the active farm implies. */
  const reloadSeasons = useCallback(async () => {
    if (!user) return;
    if (activeFarmId) {
      await loadSeasonsByFarm(activeFarmId);
    } else {
      await loadSeasons(user.id);
    }
  }, [user, activeFarmId, loadSeasonsByFarm, loadSeasons]);

  const handleSeasonChange = useCallback(
    async (seasonId: string) => {
      const season = seasons.find((s) => s.id === seasonId);
      if (season) {
        setCurrentSeason(season);

        if (user && isOwnFarm) {
          const { error } = await supabase.rpc('set_active_season', { p_season_id: seasonId });
          if (error) console.error('set_active_season failed:', error);
        }
      }
    },
    [seasons, user, isOwnFarm, setCurrentSeason]
  );

  const handleCreateSeason = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!user) return;

      try {
        const name = seasonFormData.name || `${seasonFormData.year} Growing Season`;

        const insertData: any = {
          user_id: user.id,
          year: seasonFormData.year,
          name,
          is_active: seasons.length === 0,
        };

        if (activeFarmId) {
          insertData.farm_id = activeFarmId;
        }

        const { data: created, error } = await supabase
          .from('seasons')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;

        const defaultEquipmentRates = (['corn', 'soybeans', 'wheat'] as const).map((crop, i) => ({
          season_id: created.id,
          user_id: user.id,
          crop_type: crop,
          rate_per_acre: [185.0, 155.0, 145.0][i],
          source: 'Iowa Custom Rate Survey 2026',
          is_overridden: false,
        }));

        await supabase.from('equipment_rates').insert(defaultEquipmentRates);

        if (seasonFormData.importFromSeason) {
          setPendingSeasonId(created.id);
          setShowImportWizard(true);
          setShowSeasonForm(false);
        } else {
          setSeasonFormData(emptyForm());
          setShowSeasonForm(false);
          await reloadSeasons();
          setCurrentSeason(created as Season);
        }
      } catch (error) {
        console.error('Error creating season:', error);
        alert('Error creating season. Please try again.');
      }
    },
    [user, seasonFormData, seasons.length, activeFarmId, reloadSeasons, setCurrentSeason]
  );

  const handleImportComplete = useCallback(async () => {
    const importedSeasonId = pendingSeasonId;
    setShowImportWizard(false);
    setPendingSeasonId(null);
    setSeasonFormData(emptyForm());
    if (user) {
      if (activeFarmId) {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        );
        const controller = new AbortController();
        const dataPromise = supabase
          .from('seasons')
          .select('*')
          .eq('farm_id', activeFarmId)
          .order('year', { ascending: false })
          .abortSignal(controller.signal);
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const { data: rows, error } = (await Promise.race([dataPromise, timeoutPromise])) as any;
          clearTimeout(timeoutId);
          if (!error && rows) {
            setSeasons(rows);
            if (importedSeasonId) {
              const season = rows.find((s: Season) => s.id === importedSeasonId);
              if (season) setCurrentSeason(season);
            }
          }
        } catch {
          clearTimeout(timeoutId);
          controller.abort();
        }
      } else {
        const { data: freshData } = await supabase
          .from('seasons')
          .select('*')
          .eq('user_id', user.id)
          .order('year', { ascending: false });
        if (freshData) {
          setSeasons(freshData);
          if (importedSeasonId) {
            const season = freshData.find((s: Season) => s.id === importedSeasonId);
            if (season) setCurrentSeason(season);
          } else if (freshData.length > 0) {
            const active = freshData.find((s: Season) => s.is_active) || freshData[0];
            setCurrentSeason(active);
          }
        }
      }
    }
  }, [pendingSeasonId, user, activeFarmId, setSeasons, setCurrentSeason]);

  const handleImportCancel = useCallback(() => {
    setShowImportWizard(false);
    setPendingSeasonId(null);
    setSeasonFormData(emptyForm());
    void reloadSeasons();
  }, [reloadSeasons]);

  const handleDeleteSeason = useCallback((season: Season) => {
    setSeasonToDelete(season);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDeleteSeason = useCallback(async () => {
    if (!seasonToDelete || !user) return;

    try {
      const { error } = await supabase.from('seasons').delete().eq('id', seasonToDelete.id).eq('user_id', user.id);

      if (error) throw error;

      setShowDeleteConfirm(false);
      setSeasonToDelete(null);

      if (currentSeason?.id === seasonToDelete.id) {
        setCurrentSeason(null);
      }

      await reloadSeasons();
    } catch (error) {
      console.error('Error deleting season:', error);
      alert('Error deleting season. Please try again.');
    }
  }, [seasonToDelete, user, currentSeason?.id, setCurrentSeason, reloadSeasons]);

  const cancelDeleteSeason = useCallback(() => {
    setShowDeleteConfirm(false);
    setSeasonToDelete(null);
  }, []);

  const openSeasonForm = useCallback(() => setShowSeasonForm(true), []);

  const closeSeasonForm = useCallback(() => {
    setShowSeasonForm(false);
    setSeasonFormData(emptyForm());
  }, []);

  return {
    showSeasonForm,
    openSeasonForm,
    closeSeasonForm,
    seasonFormData,
    setSeasonFormData,
    showImportWizard,
    pendingSeasonId,
    showDeleteConfirm,
    seasonToDelete,
    handleSeasonChange,
    handleCreateSeason,
    handleImportComplete,
    handleImportCancel,
    handleDeleteSeason,
    confirmDeleteSeason,
    cancelDeleteSeason,
  };
}
