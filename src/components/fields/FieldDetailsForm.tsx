import { useState } from 'react';
import { NumberField } from '../NumberField';
import { parseNumberField } from '../../lib/mathUtils';
import type { FieldDetailsValues } from '../../lib/fieldCrud';
import type { CropType } from '../../lib/database.types';

/**
 * A field's own details — U-3, presentation only.
 *
 * ONE form for both entry points. Before this, name/crop/acreage/rent/tax/notes were edited
 * from an inline form on the Fields page reached by a bare pencil icon, while rent and tax
 * were ALSO editable on the field page — two homes for the same two numbers, and no home at
 * all for the other four unless you found the icon.
 *
 * No Supabase import: this is the half that renders with fixtures at 375 px.
 */

export interface FieldDetailsFormProps {
  mode: 'create' | 'edit';
  initial?: FieldDetailsValues;
  saving: boolean;
  error: string | null;
  onSubmit: (values: FieldDetailsValues) => void;
  onCancel: () => void;
}

const EMPTY: FieldDetailsValues = {
  name: '',
  cropType: 'corn',
  acreage: 0,
  landRentPerAcre: 0,
  propertyTaxPerAcre: 0,
  notes: null,
};

export function FieldDetailsForm({
  mode,
  initial,
  saving,
  error,
  onSubmit,
  onCancel,
}: FieldDetailsFormProps) {
  const start = initial ?? EMPTY;
  const [name, setName] = useState(start.name);
  const [cropType, setCropType] = useState<CropType>(start.cropType);
  const [acreageText, setAcreageText] = useState(initial ? String(start.acreage) : '');
  const [rentText, setRentText] = useState(initial ? String(start.landRentPerAcre) : '');
  const [taxText, setTaxText] = useState(initial ? String(start.propertyTaxPerAcre) : '');
  const [notes, setNotes] = useState(start.notes ?? '');
  const [touched, setTouched] = useState(false);

  const acreage = parseNumberField(acreageText);
  const rent = parseNumberField(rentText);
  const tax = parseNumberField(taxText);

  /*
   * Acreage is required and must be positive — it is the multiplier under every per-acre
   * figure on this field, and a zero would make the field page divide by it. Rent and tax
   * are optional and blank means zero, which is what the old form did by way of
   * `parseFloat(...) || 0`.
   */
  const acreageError =
    touched && (acreage === null || acreage <= 0) ? 'Enter the acreage — it must be more than zero.' : null;
  const rentError = touched && rentText.trim() !== '' && rent === null ? 'Not a number.' : null;
  const taxError = touched && taxText.trim() !== '' && tax === null ? 'Not a number.' : null;

  const nameError = touched && name.trim() === '' ? 'Give the field a name.' : null;

  const valid =
    name.trim() !== '' &&
    acreage !== null &&
    acreage > 0 &&
    (rentText.trim() === '' || rent !== null) &&
    (taxText.trim() === '' || tax !== null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || saving) return;
    onSubmit({
      name: name.trim(),
      cropType,
      acreage: acreage!,
      landRentPerAcre: rent ?? 0,
      propertyTaxPerAcre: tax ?? 0,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
  };

  return (
    <form className="space-y-5 pb-6" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="field-name" className="mb-2 block text-sm font-medium text-gray-700">
          Field name <span className="text-red-600">*</span>
        </label>
        <input
          id="field-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. North 40, Home West of Lane"
          /* py-3 is a 44px tap target; the app's usual py-2 is about 36. */
          className={`w-full rounded-lg border px-3 py-3 focus:border-transparent focus:ring-2 ${
            nameError ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'
          }`}
        />
        {nameError && <p className="mt-1.5 text-sm text-red-600">{nameError}</p>}
      </div>

      <div>
        <label htmlFor="field-crop" className="mb-2 block text-sm font-medium text-gray-700">
          Crop
        </label>
        <select
          id="field-crop"
          value={cropType}
          onChange={(e) => setCropType(e.target.value as CropType)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 focus:border-transparent focus:ring-2 focus:ring-green-500"
        >
          <option value="corn">Corn</option>
          <option value="soybeans">Soybeans</option>
          <option value="wheat">Wheat</option>
        </select>
      </div>

      <NumberField
        label="Acreage"
        value={acreageText}
        onChange={setAcreageText}
        suffix="acres"
        placeholder="e.g. 120.5"
        required
        error={acreageError}
      />

      {/* Single column on a phone. The old form had these two in an unguarded grid-cols-2,
          which at 375 px leaves about 160 px for a labelled currency input. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Land rent"
          value={rentText}
          onChange={setRentText}
          prefix="$"
          suffix="/ac"
          placeholder="0.00"
          error={rentError}
        />
        <NumberField
          label="Property tax"
          value={taxText}
          onChange={setTaxText}
          prefix="$"
          suffix="/ac"
          placeholder="0.00"
          error={taxError}
        />
      </div>

      <div>
        <label htmlFor="field-notes" className="mb-2 block text-sm font-medium text-gray-700">
          Notes
        </label>
        <textarea
          id="field-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Soil type, rotation history, etc."
          className="w-full rounded-lg border border-gray-300 px-3 py-3 focus:border-transparent focus:ring-2 focus:ring-green-500"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {/* Stacked on a phone. `flex-col-reverse` puts the submit above Cancel, so the
          dismissive action is the last thing in the sheet — the platform convention, and
          checked on screen rather than assumed. */}
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
          disabled={saving}
          className="rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create field' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
