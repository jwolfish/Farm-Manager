import { useState, useEffect } from 'react';
import { X, TrendingDown } from 'lucide-react';
import { cropConfig, CONTRACT_TYPE_LABELS } from '../lib/salesUtils';
import type { CropType } from '../lib/database.types';

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

  const computedNetPrice = () => {
    const futures = parseFloat(formData.futures_price);
    const basis = parseFloat(formData.basis);
    if (!isNaN(futures) && !isNaN(basis)) {
      return futures + basis;
    }
    return null;
  };

  const netPrice = computedNetPrice();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const bushels = parseFloat(formData.bushels_hedged);
    const futures = parseFloat(formData.futures_price);
    const basis = parseFloat(formData.basis);

    if (!formData.contract_date) { setError('Contract date is required'); return; }
    if (!formData.delivery_month) { setError('Delivery month is required'); return; }
    if (isNaN(bushels) || bushels <= 0) { setError('Enter a valid number of bushels'); return; }
    if (isNaN(futures) || futures < 0) { setError('Enter a valid futures price'); return; }
    if (isNaN(basis)) { setError('Enter a valid basis (use 0 if none)'); return; }

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className={`flex items-center justify-between px-6 py-4 border-b ${config.headerBg} ${config.headerBorder}`}>
          <div className="flex items-center gap-2">
            <TrendingDown className={`w-5 h-5 ${config.headerText}`} />
            <h3 className={`text-lg font-semibold ${config.headerText}`}>
              {initialData ? 'Edit' : 'Add'} {config.label} Hedge
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors hover:bg-black hover:bg-opacity-10`}
          >
            <X className={`w-5 h-5 ${config.headerText}`} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Date</label>
              <input
                type="date"
                value={formData.contract_date}
                onChange={(e) => setFormData({ ...formData, contract_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Month</label>
              <input
                type="month"
                value={formData.delivery_month}
                onChange={(e) => setFormData({ ...formData, delivery_month: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Type</label>
              <select
                value={formData.contract_type}
                onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                {CONTRACT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{CONTRACT_TYPE_LABELS[ct]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Broker / Elevator</label>
              <input
                type="text"
                value={formData.broker_elevator}
                onChange={(e) => setFormData({ ...formData, broker_elevator: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bushels Hedged</label>
            <input
              type="text"
              inputMode="decimal"
              value={formData.bushels_hedged}
              onChange={(e) => setFormData({ ...formData, bushels_hedged: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="0"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Futures Price / Bu</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500 font-medium">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.futures_price}
                  onChange={(e) => setFormData({ ...formData, futures_price: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Basis</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500 font-medium">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.basis}
                  onChange={(e) => setFormData({ ...formData, basis: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="-0.20"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Negative = below futures</p>
            </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Any notes about this hedge..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : initialData ? 'Update Hedge' : 'Add Hedge'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
