import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { queueCascadeTask, type TaskType, type CascadeTaskData } from '../../lib/backgroundTasks';
import { convertUnits, describeConversionFailure } from '../../lib/unitConversions';
import { useAuth } from '../../contexts/AuthContext';
import type { ShoppingLine } from './ShoppingListsTab';

/** What `record_purchase` hands back so the client can queue the cascade. */
interface CascadeTarget {
  task_type: TaskType;
  entity_id: string;
  entity_type: CascadeTaskData['entityType'];
  season_id: string;
}

interface Props {
  line: ShoppingLine;
  /**
   * Retained for the caller's convenience. `record_purchase` resolves the
   * season from the line's own shopping list, so it is no longer passed in.
   */
  seasonId: string;
  onClose: () => void;
  onComplete: () => void;
}

export function MarkPurchasedModal({ line, onClose, onComplete }: Props) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(
    String(line.purchased_quantity ?? line.adjusted_quantity ?? line.needed_quantity)
  );
  const [price, setPrice] = useState(
    String(line.purchased_price_per_unit ?? line.quoted_price_per_unit ?? '')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAlreadyPurchased = line.status === 'purchased';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const qty = parseFloat(quantity);
    const ppu = parseFloat(price);

    if (!isFinite(qty) || qty <= 0) {
      setError('Quantity must be a number greater than 0.');
      return;
    }
    if (!isFinite(ppu) || ppu <= 0) {
      setError('Price per unit must be a number greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);

    // The ledger is kept in the product's own stock unit. Convert here, using
    // the single client implementation, and refuse rather than post a wrong
    // quantity (WI-11). Usually a no-op: generation stamps the line with the
    // master product's unit.
    let stockQuantity = qty;
    if (line.master_product_id) {
      const { data: product, error: productErr } = await supabase
        .from('master_products')
        .select('unit_type')
        .eq('id', line.master_product_id)
        .maybeSingle();

      if (productErr || !product) {
        setError('Could not read the inventory product. Nothing was changed.');
        setSaving(false);
        return;
      }

      const converted = convertUnits(line.unit_type, product.unit_type, qty);
      if (!converted.ok) {
        setError(`Cannot record this purchase — ${describeConversionFailure(converted)}.`);
        setSaving(false);
        return;
      }
      stockQuantity = converted.value;
    }

    // One RPC, one transaction: reversal of any earlier purchase for this line,
    // the new purchase, the line update and the season price (WI-10).
    const { data, error: rpcErr } = await supabase.rpc('record_purchase', {
      p_line_id: line.id,
      p_quantity: qty,
      p_price_per_unit: ppu,
      p_quantity_stock_units: stockQuantity,
    });

    if (rpcErr) {
      // The modal stays open so the entry is not lost.
      setError(rpcErr.message || 'Failed to mark as purchased. Nothing was changed.');
      setSaving(false);
      return;
    }

    // Only once the write has committed do we queue the recalculation.
    const cascade = (data as { cascade: CascadeTarget | null } | null)?.cascade ?? null;
    if (cascade && user) {
      try {
        await queueCascadeTask(
          user.id,
          cascade.season_id,
          cascade.task_type,
          cascade.entity_id,
          cascade.entity_type
        );
      } catch (err) {
        // The purchase is saved; only the recalculation failed to queue.
        console.error('Failed to queue cascade after purchase:', err);
      }
    }

    setSaving(false);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isAlreadyPurchased ? 'Edit Purchase' : 'Mark as Purchased'}
            </h3>
            <p className="text-sm text-gray-500">{line.product_name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchased Quantity ({line.unit_type})
            </label>
            <input
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Adjust if the final order quantity differs (e.g. full drums, bags).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchased Price per {line.unit_type} ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              This price will update the product's cost across your crop plan.
            </p>
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
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : isAlreadyPurchased ? 'Update Purchase' : 'Confirm Purchase'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
