import { useMemo, useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { NumberField } from '../NumberField';
import { parseNumberField } from '../../lib/mathUtils';
import { calculateSeedCostPerAcre, describeSeedCostIssue } from '../../lib/seedCostMath';
import type { SeedVarietyOption } from '../../lib/fieldSeedCrud';
import type { CropType } from '../../lib/database.types';

/**
 * The per-field seed editor — U-1, presentation only.
 *
 * No Supabase import, on purpose: this is the half that can be rendered with fixtures at
 * 375 px on a machine with no credentials. Every fertilizer step before F-4b shipped with
 * "not opened in a browser" against it because its components reached the client at module
 * load, and rendering has found a real defect in eight of the last eleven rounds.
 */

export interface FieldSeedEditorProps {
  fieldName: string;
  acreage: number;
  cropType: CropType;
  hasCostRow: boolean;
  currentVarietyId: string | null;
  effectiveSeedingRate: number | null;
  varieties: readonly SeedVarietyOption[];
  saving: boolean;
  error: string | null;
  onSave: (save: {
    varietyId: string;
    seedingRate: number;
    seedCostPerAcre: number;
    standardSeedingRate: number | null;
  }) => void;
  onCancel: () => void;
}

export function FieldSeedEditor({
  fieldName,
  acreage,
  cropType,
  hasCostRow,
  currentVarietyId,
  effectiveSeedingRate,
  varieties,
  saving,
  error,
  onSave,
  onCancel,
}: FieldSeedEditorProps) {
  const [varietyId, setVarietyId] = useState<string>(currentVarietyId ?? '');
  const [rateText, setRateText] = useState<string>(
    effectiveSeedingRate == null ? '' : String(effectiveSeedingRate)
  );

  /*
   * Varieties for this field's crop, matching what the template wizard offers. If the season
   * has none for that crop the whole list is shown instead, with a note — an empty dropdown
   * that explains nothing is worse than an odd one that does.
   */
  const forCrop = useMemo(
    () => varieties.filter((v) => v.cropType === cropType),
    [varieties, cropType]
  );
  const showingAllCrops = forCrop.length === 0 && varieties.length > 0;
  const options = showingAllCrops ? varieties : forCrop;

  const selected = options.find((v) => v.id === varietyId) ?? null;
  const rate = parseNumberField(rateText);
  const cost = selected ? calculateSeedCostPerAcre(selected, rate) : null;

  /*
   * Picking a variety adopts its standard rate, but only when the box is empty or still
   * holds the previous variety's standard. Someone who typed 32,500 for this field meant it,
   * and having a dropdown quietly overwrite a typed number is how a prescription becomes a
   * different prescription.
   */
  const handleVarietyChange = (nextId: string) => {
    const previous = options.find((v) => v.id === varietyId) ?? null;
    const next = options.find((v) => v.id === nextId) ?? null;
    const boxIsUntouched =
      rateText.trim() === '' ||
      (previous?.standardSeedingRate != null && parseNumberField(rateText) === previous.standardSeedingRate);

    setVarietyId(nextId);
    if (boxIsUntouched && next?.standardSeedingRate != null) {
      setRateText(String(next.standardSeedingRate));
    }
  };

  const canSave = hasCostRow && !saving && selected != null && cost?.ok === true;

  const handleSubmit = () => {
    if (!selected || !cost?.ok || rate == null) return;
    onSave({
      varietyId: selected.id,
      seedingRate: rate,
      seedCostPerAcre: cost.costPerAcre,
      standardSeedingRate: selected.standardSeedingRate,
    });
  };

  if (!hasCostRow) {
    return (
      <div className="pb-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">{fieldName} has no cost row yet</p>
            <p className="mt-1">
              Seed is stored alongside this field's costs, so it needs a cost template first.
              Select the field on the Fields page and use <strong>Apply Template</strong>.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-3 text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (varieties.length === 0) {
    return (
      <div className="pb-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">This season has no seed varieties</p>
            <p className="mt-1">Add one in Products → Seeds, then come back.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-3 text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-5 pb-6"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div>
        <label htmlFor="seed-variety" className="mb-2 block text-sm font-medium text-gray-700">
          Seed variety
        </label>
        <select
          id="seed-variety"
          value={varietyId}
          onChange={(e) => handleVarietyChange(e.target.value)}
          /* py-3 is a 44px tap target; the app's usual py-2 is about 36. */
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 focus:border-transparent focus:ring-2 focus:ring-green-500"
        >
          <option value="">Select a variety…</option>
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.productName}
              {showingAllCrops ? ` (${v.cropType})` : ''}
            </option>
          ))}
        </select>
        {showingAllCrops && (
          <p className="mt-1.5 text-xs text-amber-700">
            No {cropType} varieties in this season, so every variety is listed.
          </p>
        )}
      </div>

      <NumberField
        label="Seeding rate"
        value={rateText}
        onChange={setRateText}
        suffix="seeds/ac"
        placeholder="e.g. 34000"
        required
        help={
          selected?.standardSeedingRate != null
            ? `${selected.productName} standard: ${selected.standardSeedingRate.toLocaleString()} seeds/ac`
            : 'This variety has no standard rate set.'
        }
      />

      {/* The live figure. Entry is a rate; what the owner recognises is the money. */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        {cost?.ok ? (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-600">Seed cost</span>
              <span className="text-xl font-semibold text-green-700">
                ${cost.costPerAcre.toFixed(2)}
                <span className="ml-1 text-sm font-normal text-gray-500">/acre</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-sm text-gray-600">
              <span>
                {cost.bagsPerAcre.toFixed(3)} {selected?.unitType ?? 'bag'}/ac × {acreage} ac
              </span>
              <span className="font-medium text-gray-900">
                ${(cost.costPerAcre * acreage).toFixed(2)} for the field
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span>
              {selected == null
                ? 'Pick a variety to see the cost.'
                : describeSeedCostIssue(cost!.reason, selected.productName)}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg bg-gray-100 px-4 py-3 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Save seed'}
        </button>
      </div>
    </form>
  );
}
