import { useState, useEffect } from 'react';
import { cropConfig, CONTRACT_TYPE_LABELS } from '../lib/salesUtils';
import type { CropType } from '../lib/database.types';
import { parseNumberField } from '../lib/mathUtils';
import { ResponsiveModal } from './ResponsiveModal';
import { NumberField } from './NumberField';

export interface HedgeFormData {
  contract_date: string;
  delivery_month: string;
  contract_type: string;
  broker_elevator: string;
  bushels_hedged: number;
  futures_price: number;
  basis: number;
  notes: string;
}

interface HedgeEntryFormProps {
  cropType: CropType;
  onSave: (data: HedgeFormData) => Promise<void>;
  onClose: () => void;
  initialData?: HedgeFormData & { notes: string | null };
}

const CONTRACT_TYPES = [
  'futures',
  'forward_contract',
  'options_put',
  'htc',
  'basis_contract',
] as const;

/* py-3 is a 44px tap target, matching NumberField beside these. */
const INPUT = 'w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent';
const LABEL = 'block text-sm font-medium text-gray-700 mb-2';
const FORM_ID = 'hedge-entry-form';

export function HedgeEntryForm({ cropType, onSave, onClose, initialData }: HedgeEntryFormProps) {
  const [formData, setFormData] = useState({
    contract_date: '',
    delivery_month: '',
    contract_type: 'futures',
    broker_elevator: '',
    bushels_hedged: '',
    futures_price: '',
    basis: '0',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = cropConfig[cropType];

  useEffect(() => {
    if (initialData) {
      setFormData({
        contract_date: initialData.contract_date,
        delivery_month: initialData.delivery_month,
        contract_type: initialData.contract_type,
        broker_elevator: initialData.broker_elevator,
        bushels_hedged: initialData.bushels_hedged.toString(),
        futures_price: initialData.futures_price.toString(),
        basis: initialData.basis.toString(),
        notes: initialData.notes || '',
      });
    }
  }, [initialData]);

  // parseNumberField, not parseFloat: these boxes are text, so "10,000" is typeable,
  // and parseFloat('10,000') is 10. It also keeps a negative basis ("-0.20").
  const bushels = parseNumberField(formData.bushels_hedged);
  const futures = parseNumberField(formData.futures_price);
  const basis = parseNumberField(formData.basis);
  const netPrice = futures !== null && basis !== null ? futures + basis : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.contract_date) { setError('Contract date is required'); return; }
    if (!formData.delivery_month) { setError('Delivery month is required'); return; }
    if (bushels === null || bushels <= 0) { setError('Enter a valid number of bushels'); return; }
    if (futures === null || futures < 0) { setError('Enter a valid futures price'); return; }
    if (basis === null) { setError('Enter a valid basis (use 0 if none)'); return; }

    setSaving(true);
    try {
      await onSave({
        contract_date: formData.contract_date,
        delivery_month: formData.delivery_month,
        contract_type: formData.contract_type,
        broker_elevator: formData.broker_elevator.trim(),
        bushels_hedged: bushels,
        futures_price: futures,
        basis,
        notes: formData.notes.trim(),
      });
    } catch {
      setError('Failed to save hedge. Please try again.');
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={`${initialData ? 'Edit' : 'Add'} ${config.label} Hedge`}
      footer={
        <div className="space-y-3">
          {/* In the footer, not above the form: in a scrolling sheet the top of the
              form can be out of sight when Save is pressed. */}
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              form={FORM_ID}
              disabled={saving}
              className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : initialData ? 'Update Hedge' : 'Add Hedge'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="hedge-contract-date" className={LABEL}>Contract Date</label>
            <input
              id="hedge-contract-date"
              type="date"
              value={formData.contract_date}
              onChange={(e) => setFormData({ ...formData, contract_date: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="hedge-delivery-month" className={LABEL}>Delivery Month</label>
            <input
              id="hedge-delivery-month"
              type="month"
              value={formData.delivery_month}
              onChange={(e) => setFormData({ ...formData, delivery_month: e.target.value })}
              className={INPUT}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="hedge-contract-type" className={LABEL}>Contract Type</label>
            <select
              id="hedge-contract-type"
              value={formData.contract_type}
              onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
              className={`${INPUT} bg-white`}
            >
              {CONTRACT_TYPES.map((ct) => (
                <option key={ct} value={ct}>{CONTRACT_TYPE_LABELS[ct]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hedge-broker" className={LABEL}>Broker / Elevator</label>
            <input
              id="hedge-broker"
              type="text"
              value={formData.broker_elevator}
              onChange={(e) => setFormData({ ...formData, broker_elevator: e.target.value })}
              className={INPUT}
              placeholder="Optional"
            />
          </div>
        </div>

        <NumberField
          label="Bushels Hedged"
          value={formData.bushels_hedged}
          onChange={(v) => setFormData({ ...formData, bushels_hedged: v })}
          placeholder="0"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Futures Price / Bu"
            prefix="$"
            value={formData.futures_price}
            onChange={(v) => setFormData({ ...formData, futures_price: v })}
            placeholder="0.00"
            required
          />
          <NumberField
            label="Basis"
            prefix="$"
            value={formData.basis}
            onChange={(v) => setFormData({ ...formData, basis: v })}
            placeholder="-0.20"
            help="Negative = below futures"
          />
        </div>

        {netPrice !== null && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">Net Price / Bushel</span>
            <span className="text-lg font-bold text-blue-900">
              ${netPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </span>
          </div>
        )}

        <div>
          <label htmlFor="hedge-notes" className={LABEL}>Notes (Optional)</label>
          <textarea
            id="hedge-notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className={INPUT}
            placeholder="Any notes about this hedge..."
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
