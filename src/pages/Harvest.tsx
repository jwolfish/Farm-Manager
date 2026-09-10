import { useState } from 'react';
import { Combine, Loader2, RefreshCw } from 'lucide-react';
import { useHarvestTracker } from '../hooks/useHarvestTracker';
import { HarvestProgressCards } from '../components/harvest/HarvestProgressCards';
import { HarvestFieldLists } from '../components/harvest/HarvestFieldLists';
import { HarvestEntrySheet } from '../components/harvest/HarvestEntrySheet';
import type { HarvestFieldWithNotes } from '../lib/harvestCrud';
import type { HarvestEntry } from '../lib/harvestCrud';

/**
 * The harvest tracker — H-4.
 *
 * Its own page rather than a tab on Yields: Yields is a wide planning grid used at a desk in
 * February, this is a one-thumb screen used in a truck in October, and sharing a route would
 * mean one of the two is always wrong.
 *
 * The progress block is at the top because it is the half that gets looked at when nothing
 * is being entered.
 */

interface HarvestProps {
  seasonId: string | null;
  readOnly?: boolean;
}

export function Harvest({ seasonId, readOnly }: HarvestProps) {
  const {
    fields,
    progress,
    loading,
    hasLoadedOnce,
    loadError,
    saving,
    saveError,
    clearSaveError,
    record,
    undo,
    reload,
  } = useHarvestTracker(seasonId);

  const [selected, setSelected] = useState<HarvestFieldWithNotes | null>(null);

  const openField = (field: { fieldId: string }) => {
    clearSaveError();
    setSelected(fields.find(f => f.fieldId === field.fieldId) ?? null);
  };

  const handleSubmit = async (entry: HarvestEntry) => {
    if (!selected) return;
    const ok = await record({ fieldId: selected.fieldId, acreage: selected.acreage }, entry);
    // Only on success. A failed save keeps the sheet open with the numbers intact.
    if (ok) setSelected(null);
  };

  const handleUnmark = async () => {
    if (!selected) return;
    const ok = await undo({ fieldId: selected.fieldId, acreage: selected.acreage });
    if (ok) setSelected(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Combine className="w-6 h-6 text-green-600 shrink-0" />
            Harvest
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Enter a field as it comes off. The actual replaces the estimate everywhere the cost
            per bushel is worked out.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          aria-label="Refresh"
          className="p-3 text-gray-400 hover:text-gray-600 rounded-lg shrink-0"
        >
          <RefreshCw className={`w-5 h-5 ${loading && hasLoadedOnce ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
          {hasLoadedOnce && (
            <p className="mt-1 text-red-700">Showing the last figures that loaded.</p>
          )}
        </div>
      )}

      {!seasonId ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">
          Pick a season to track its harvest.
        </p>
      ) : loading && !hasLoadedOnce ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : fields.length === 0 && !loadError ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">
          This season has no fields yet.
        </p>
      ) : (
        <>
          <HarvestProgressCards progress={progress} />
          <HarvestFieldLists fields={fields} onSelect={openField} readOnly={readOnly} />
        </>
      )}

      {selected && (
        <HarvestEntrySheet
          field={selected}
          saving={saving}
          error={saveError}
          onSubmit={handleSubmit}
          onClose={() => setSelected(null)}
          onUnmark={handleUnmark}
        />
      )}
    </div>
  );
}
