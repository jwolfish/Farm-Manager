import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { NumberField } from '../NumberField';
import { parseNumberField } from '../../lib/mathUtils';
import { suggestedYield, totalBushels, isHarvested, localIsoDate } from '../../lib/harvestProgress';
import type { HarvestEntry } from '../../lib/harvestCrud';
import type { HarvestField } from '../../lib/harvestProgress';

/**
 * The entry sheet — H-3. Four controls, used one-handed beside a truck.
 *
 * Presentation only: no Supabase import anywhere in its tree, which is what makes it
 * renderable on a machine with no credentials. Every screen defect found in this project
 * has been found that way, and every fertilizer screen that shipped unrendered shipped with
 * "not opened in a browser" against it because the component reached the client at module
 * load. Same cut as `FieldFertilizerPlanEditor` / `FieldFertilizerPlanModal`.
 *
 * A failed save keeps the sheet open with the numbers intact and says what failed — the
 * `MarkPurchasedModal` discipline, and it matters more here than anywhere else in the app:
 * this is the one screen used where the signal is bad, and losing an entry costs a drive
 * back to the field.
 */

interface Props {
  field: HarvestField & { notes?: string };
  saving: boolean;
  error: string | null;
  onSubmit: (entry: HarvestEntry) => void;
  onClose: () => void;
  /** Offered only for a field already marked off. */
  onUnmark?: () => void;
  /** Injectable so a render check is not at the mercy of the clock. */
  today?: string;
}

export function HarvestEntrySheet({
  field,
  saving,
  error,
  onSubmit,
  onClose,
  onUnmark,
  today,
}: Props) {
  const already = isHarvested(field.yieldRow);
  const suggestion = suggestedYield(field.yieldRow);

  // The estimate is a placeholder, never a prefilled value — a number already in the box is
  // a number that gets saved by a thumb on Save, and an estimate saved as an actual is
  // indistinguishable from a measurement afterwards. Re-opening a harvested field DOES
  // prefill, because there the number on screen is the one that was measured.
  const [yieldText, setYieldText] = useState(
    already && suggestion !== null ? String(suggestion) : ''
  );
  const [date, setDate] = useState(field.yieldRow?.harvestDate ?? today ?? localIsoDate());
  const [moistureText, setMoistureText] = useState(
    field.yieldRow?.moisturePercentage !== null && field.yieldRow?.moisturePercentage !== undefined
      ? String(field.yieldRow.moisturePercentage)
      : ''
  );
  const [notes, setNotes] = useState(field.notes ?? '');
  const [showErrors, setShowErrors] = useState(false);

  const parsedYield = parseNumberField(yieldText);
  const parsedMoisture = moistureText.trim() === '' ? null : parseNumberField(moistureText);

  const yieldError =
    yieldText.trim() === ''
      ? 'Enter the yield'
      : parsedYield === null || parsedYield < 0
        ? 'That is not a number of bushels'
        : null;

  const moistureError =
    moistureText.trim() === ''
      ? null
      : parsedMoisture === null || parsedMoisture < 0 || parsedMoisture > 100
        ? 'Moisture is a percentage between 0 and 100'
        : null;

  const dateError = date ? null : 'Enter the date it was cut';

  const blocked = !!(yieldError || moistureError || dateError);

  const handleSubmit = () => {
    if (blocked) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      bushelsPerAcre: parsedYield as number,
      harvestDate: date,
      moisturePercentage: parsedMoisture,
      notes: notes.trim(),
    });
  };

  const derivedTotal = parsedYield !== null ? totalBushels(parsedYield, field.acreage) : null;

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={field.name}
      subtitle={`${field.cropType} · ${field.acreage} acres`}
      footer={
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {already ? 'Update' : 'Mark harvested'}
            </button>
          </div>

          {already && onUnmark && (
            <button
              type="button"
              onClick={onUnmark}
              disabled={saving}
              className="w-full px-4 py-3 text-sm text-gray-600 hover:text-gray-900 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              Not harvested after all — put the estimate back
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
            <p className="mt-1 text-red-700">Nothing was lost — the numbers below are still here.</p>
          </div>
        )}

        <div>
          <label htmlFor="harvest-date" className="block text-sm font-medium text-gray-700 mb-2">
            Harvest date <span className="text-red-600">*</span>
          </label>
          <input
            id="harvest-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            /* py-3 is a 44px tap target; the app's usual py-2 is about 36. Measured, not assumed. */
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {showErrors && dateError && <p className="mt-1.5 text-sm text-red-600">{dateError}</p>}
        </div>

        <NumberField
          label="Yield"
          value={yieldText}
          onChange={setYieldText}
          suffix="bu/ac"
          required
          placeholder={suggestion !== null && !already ? `Estimated ${suggestion}` : 'Off the monitor'}
          error={showErrors ? yieldError : null}
          help={
            derivedTotal !== null && !yieldError
              ? `${derivedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} bu off ${field.acreage} acres`
              : suggestion !== null && !already
                ? `You estimated ${suggestion} bu/ac for this field`
                : undefined
          }
        />

        <NumberField
          label="Moisture"
          value={moistureText}
          onChange={setMoistureText}
          suffix="%"
          placeholder="Optional"
          error={showErrors ? moistureError : null}
          help="Recorded as you enter it — nothing is shrunk or converted"
        />

        <div>
          <label htmlFor="harvest-notes" className="block text-sm font-medium text-gray-700 mb-2">
            Notes
          </label>
          <input
            id="harvest-notes"
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
