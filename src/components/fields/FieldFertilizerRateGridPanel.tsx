import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { FieldFertilizerRateGrid } from './FieldFertilizerRateGrid';
import { buildRateGrid, type GridSavePayload, type RateGridModel } from '../../lib/fieldFertilizerGrid';
import {
  fieldsForProgram,
  loadRateGridContext,
  saveRateGrid,
  type RateGridContext,
} from '../../lib/fieldFertilizerGridCrud';

/**
 * The container for the V-6 bulk rate grid: loading, saving, and the shell it lives in.
 *
 * A full-screen panel rather than `<ResponsiveModal>`, which is `max-w-md` — right for the
 * single-field editor and hopeless for 32 rows across six columns. Navigation stays shallow
 * (page → panel → close), because WI-29 means there is no router and the browser back
 * button already does not work; a screen that needs a back path the app cannot provide is a
 * screen that traps people.
 */

interface Props {
  seasonId: string;
  onClose: () => void;
  /** Fired after a successful save so the Fields list can pick up the new totals. */
  onSaved: () => void;
}

export function FieldFertilizerRateGridPanel({ seasonId, onClose, onSaved }: Props) {
  const [context, setContext] = useState<RateGridContext | null>(null);
  const [programId, setProgramId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadRateGridContext(seasonId);
      setContext(next);
      setProgramId((current) =>
        next.programs.some((p) => p.programId === current)
          ? current
          : next.programs[0]?.programId ?? ''
      );
    } catch (e) {
      setContext(null);
      setError(e instanceof Error ? e.message : 'Could not load the rate grid');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (payload: GridSavePayload[]) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveRateGrid(payload);
      /*
       * Reload rather than patch the draft in place. The save writes rates AND rewrites the
       * override array, and the grid's own idea of what is custom is derived from both — so
       * re-reading is the only way the screen is showing what the database now holds rather
       * than what the client believes it sent.
       */
      await load();
      onSaved();
      setNotice(
        result.staleTotals.length === 0
          ? `Saved ${result.fieldsWritten} field${result.fieldsWritten === 1 ? '' : 's'}.`
          : `Saved ${result.fieldsWritten}, but the stored total could not be refreshed for ` +
            `${result.staleTotals.join(', ')}. The rates are safe; the total catches up on the ` +
            'next edit or price cascade.'
      );
    } catch (e) {
      // The bulk RPC is one transaction, so a failure here means nothing was written at all.
      setError(e instanceof Error ? e.message : 'Could not save. Nothing was written.');
    } finally {
      setSaving(false);
    }
  };

  const program = context?.programs.find((p) => p.programId === programId);
  const grid: RateGridModel | null =
    context && program
      ? buildRateGrid(program, fieldsForProgram(context, programId), context.rates, context.products)
      : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the rate grid"
            className="rounded-lg p-3 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-12 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fields and programs…
          </div>
        )}

        {!loading && error && !grid && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && context && context.programs.length === 0 && (
          <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            This season has no fertilizer programs yet. Add one under Products → Application
            Programs, then come back to set per-field rates.
          </p>
        )}

        {!loading && context && grid && (
          <FieldFertilizerRateGrid
            seasonLabel={context.seasonLabel}
            programs={context.programs}
            products={context.products}
            grid={grid}
            selectedProgramId={programId}
            onSelectProgram={setProgramId}
            saving={saving}
            error={error}
            notice={notice}
            onSave={handleSave}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
