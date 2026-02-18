import { useState, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';
import type { CropType } from '../lib/database.types';

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

  const computedRevenue = () => {
    const bushels = parseFloat(formData.bushels_sold);
    const price = parseFloat(formData.price_per_bushel);
    if (!isNaN(bushels) && !isNaN(price) && bushels > 0 && price > 0) {
      return (bushels * price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const bushels = parseFloat(formData.bushels_sold);
    const price = parseFloat(formData.price_per_bushel);

    if (!formData.sale_date) {
      setError('Sale date is required');
      return;
    }
    if (!formData.delivery_month) {
      setError('Delivery month is required');
      return;
    }
    if (isNaN(bushels) || bushels <= 0) {
      setError('Enter a valid number of bushels');
      return;
    }
    if (isNaN(price) || price <= 0) {
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

  const revenue = computedRevenue();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {initialData ? 'Edit' : 'Add'} {cropLabels[cropType]} Sale
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sale Date
              </label>
              <input
                type="date"
                value={formData.sale_date}
                onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Month
              </label>
              <input
                type="month"
                value={formData.delivery_month}
                onChange={(e) => setFormData({ ...formData, delivery_month: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination
            </label>
            <input
              type="text"
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Elevator or buyer name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bushels Sold
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.bushels_sold}
                onChange={(e) => setFormData({ ...formData, bushels_sold: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Bushel
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500 font-medium">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.price_per_bushel}
                  onChange={(e) => setFormData({ ...formData, price_per_bushel: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Any notes about this sale..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : initialData ? 'Update Sale' : 'Add Sale'}
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
