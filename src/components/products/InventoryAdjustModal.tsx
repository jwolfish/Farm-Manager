import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFarm } from '../../contexts/FarmContext';
import { parseNumberField } from '../../lib/mathUtils';
import { NumberField } from '../NumberField';

interface Props {
  productName: string;
  masterProductId: string;
  productCategory: 'chemical' | 'seed';
  currentOnHand: number;
  unitType: string;
  onClose: () => void;
  onSaved: () => void;
}

const FORM_ID = 'inventory-adjust-form';

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

    // Text box now, so commas are typeable — see MarkPurchasedModal for the why.
    const qty = parseNumberField(quantity) ?? NaN;
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
    <ResponsiveModal
      open
      onClose={onClose}
      title="Adjust Inventory"
      footer={
        <div className="space-y-3">
          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              form={FORM_ID}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Adjustment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      }
    >
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm font-medium text-gray-900">{productName}</p>
        <p className="text-sm text-gray-600 mt-1">
          Current on-hand: <span className="font-medium">{currentOnHand.toLocaleString()} {unitType}</span>
        </p>
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4 pb-4">
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">Direction</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={direction === 'add'}
              onClick={() => setDirection('add')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
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
              aria-pressed={direction === 'remove'}
              onClick={() => setDirection('remove')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
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

        {/* MOB-4. autoFocus is preserved deliberately — see NumberField's prop. */}
        <NumberField
          label={`Quantity (${unitType})`}
          value={quantity}
          onChange={setQuantity}
          suffix={unitType}
          placeholder="0.00"
          required
          autoFocus
        />

        <div>
          <label htmlFor="inventory-adjust-note" className="block text-sm font-medium text-gray-700 mb-2">
            Note <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="inventory-adjust-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="e.g., Found 2 gallons on the shelf"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
