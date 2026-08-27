import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFarm } from '../../contexts/FarmContext';

interface Props {
  productName: string;
  masterProductId: string;
  productCategory: 'chemical' | 'seed';
  currentOnHand: number;
  unitType: string;
  onClose: () => void;
  onSaved: () => void;
}

export function InventoryAdjustModal({
  productName,
  masterProductId,
  productCategory,
  currentOnHand,
  unitType,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const { activeFarmId } = useFarm();
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeFarmId) return;
    setError(null);

    const qty = parseFloat(quantity);
    if (!isFinite(qty) || qty <= 0) {
      setError('Quantity must be a number greater than 0.');
      return;
    }

    const delta = direction === 'add' ? qty : -qty;

    setSaving(true);
    try {
      const { error: insertError } = await supabase
        .from('inventory_ledger_entries')
        .insert({
          farm_id: activeFarmId,
          master_product_id: masterProductId,
          product_category: productCategory,
          entry_type: 'manual_adjustment',
          quantity_delta: delta,
          source_type: 'manual',
          note: note.trim() || null,
          created_by: user.id,
        });

      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      console.error('Error saving inventory adjustment:', err);
      setError('Failed to save adjustment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Adjust Inventory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-900">{productName}</p>
          <p className="text-sm text-gray-600 mt-1">
            Current on-hand: <span className="font-medium">{currentOnHand.toLocaleString()} {unitType}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Direction</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('add')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                  direction === 'add'
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Plus className="w-4 h-4" />
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => setDirection('remove')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                  direction === 'remove'
                    ? 'border-red-600 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Minus className="w-4 h-4" />
                Remove Stock
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity ({unitType})
            </label>
            <input
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="0.00"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="e.g., Found 2 gallons on the shelf"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Adjustment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
