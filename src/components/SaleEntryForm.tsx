import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import type { CropType } from '../lib/database.types';
import { parseNumberField } from '../lib/mathUtils';
import { ResponsiveModal } from './ResponsiveModal';
import { NumberField } from './NumberField';

interface SaleFormData {
  sale_date: string;
  delivery_month: string;
  destination: string;
  bushels_sold: string;
  price_per_bushel: string;
  notes: string;
}

interface SaleEntryFormProps {
  cropType: CropType;
  onSave: (data: {
    sale_date: string;
    delivery_month: string;
    destination: string;
    bushels_sold: number;
    price_per_bushel: number;
    notes: string;
  }) => Promise<void>;
  onClose: () => void;
  initialData?: {
    sale_date: string;
    delivery_month: string;
    destination: string;
    bushels_sold: number;
    price_per_bushel: number;
    notes: string | null;
  };
}

const cropLabels: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

/* py-3 is a 44px tap target, matching NumberField beside these. */
const INPUT = 'w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent';
const LABEL = 'block text-sm font-medium text-gray-700 mb-2';
const FORM_ID = 'sale-entry-form';

export function SaleEntryForm({ cropType, onSave, onClose, initialData }: SaleEntryFormProps) {
  const [formData, setFormData] = useState<SaleFormData>({
    sale_date: '',
    delivery_month: '',
    destination: '',
    bushels_sold: '',
    price_per_bushel: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        sale_date: initialData.sale_date,
        delivery_month: initialData.delivery_month,
        destination: initialData.destination,
        bushels_sold: initialData.bushels_sold.toString(),
        price_per_bushel: initialData.price_per_bushel.toString(),
        notes: initialData.notes || '',
      });
    }
  }, [initialData]);

  // parseNumberField, not parseFloat: these boxes are text, so "12,500" is typeable,
  // and parseFloat('12,500') is 12 — a sale saved at a thousandth of its size.
  const bushels = parseNumberField(formData.bushels_sold);
  const price = parseNumberField(formData.price_per_bushel);
  const revenue =
    bushels !== null && price !== null && bushels > 0 && price > 0
      ? (bushels * price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.sale_date) {
      setError('Sale date is required');
      return;
    }
    if (!formData.delivery_month) {
      setError('Delivery month is required');
      return;
    }
    if (bushels === null || bushels <= 0) {
      setError('Enter a valid number of bushels');
      return;
    }
    if (price === null || price <= 0) {
      setError('Enter a valid price per bushel');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        sale_date: formData.sale_date,
        delivery_month: formData.delivery_month,
        destination: formData.destination.trim(),
        bushels_sold: bushels,
        price_per_bushel: price,
        notes: formData.notes.trim(),
      });
    } catch {
      setError('Failed to save sale. Please try again.');
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={`${initialData ? 'Edit' : 'Add'} ${cropLabels[cropType]} Sale`}
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
              {saving ? 'Saving...' : initialData ? 'Update Sale' : 'Add Sale'}
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
            <label htmlFor="sale-date" className={LABEL}>Sale Date</label>
            <input
              id="sale-date"
              type="date"
              value={formData.sale_date}
              onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="sale-delivery-month" className={LABEL}>Delivery Month</label>
            <input
              id="sale-delivery-month"
              type="month"
              value={formData.delivery_month}
              onChange={(e) => setFormData({ ...formData, delivery_month: e.target.value })}
              className={INPUT}
            />
          </div>
        </div>

        <div>
          <label htmlFor="sale-destination" className={LABEL}>Destination</label>
          <input
            id="sale-destination"
            type="text"
            value={formData.destination}
            onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
            className={INPUT}
            placeholder="Elevator or buyer name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Bushels Sold"
            value={formData.bushels_sold}
            onChange={(v) => setFormData({ ...formData, bushels_sold: v })}
            placeholder="0"
            required
          />
          <NumberField
            label="Price per Bushel"
            prefix="$"
            value={formData.price_per_bushel}
            onChange={(v) => setFormData({ ...formData, price_per_bushel: v })}
            placeholder="0.00"
            required
          />
        </div>

        {revenue && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              Total Revenue: ${revenue}
            </span>
          </div>
        )}

        <div>
          <label htmlFor="sale-notes" className={LABEL}>Notes (Optional)</label>
          <textarea
            id="sale-notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className={INPUT}
            placeholder="Any notes about this sale..."
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
