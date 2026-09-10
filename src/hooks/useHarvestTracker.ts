import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  loadHarvestSeason,
  saveHarvest,
  clearHarvest,
  type HarvestEntry,
  type HarvestFieldWithNotes,
} from '../lib/harvestCrud';
import { summariseHarvest } from '../lib/harvestProgress';

/**
 * The loading half of the harvest tracker — H-4.
 *
 * All of the arithmetic is in `harvestProgress.ts` and none of it is here, which is what
 * lets the screens be rendered with fixtures and the figures be tested without a database.
 *
 * A failed load does NOT clear the fields already on screen. That is R-1's rule in
 * miniature: an empty list may only mean "this season has no fields" when a load actually
 * succeeded and found none, and this screen is used where the signal drops.
 */
export function useHarvestTracker(seasonId: string | null) {
  const { user } = useAuth();
  const [fields, setFields] = useState<HarvestFieldWithNotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seasonId) {
      setFields([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const context = await loadHarvestSeason(seasonId);
      setFields(context.fields);
      setLoadError(null);
      setHasLoadedOnce(true);
    } catch (err) {
      // Deliberately not clearing `fields`.
      setLoadError(err instanceof Error ? err.message : 'Could not load this season');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    setHasLoadedOnce(false);
    load();
  }, [load]);

  const record = useCallback(
    async (field: { fieldId: string; acreage: number }, entry: HarvestEntry): Promise<boolean> => {
      if (!user) {
        setSaveError('You are signed out. Sign in again and the entry below will still be here.');
        return false;
      }
      setSaving(true);
      setSaveError(null);
      try {
        await saveHarvest(field, entry, user.id);
        await load();
        return true;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save the harvest');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user, load]
  );

  const undo = useCallback(
    async (field: { fieldId: string; acreage: number }): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        await clearHarvest(field.fieldId, field.acreage);
        await load();
        return true;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not undo the harvest');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const progress = useMemo(() => summariseHarvest(fields), [fields]);

  return {
    fields,
    progress,
    loading,
    hasLoadedOnce,
    loadError,
    saving,
    saveError,
    clearSaveError: useCallback(() => setSaveError(null), []),
    record,
    undo,
    reload: load,
  };
}
