import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { queueCascadeTask } from '../../lib/backgroundTasks';
import { useAuth } from '../../contexts/AuthContext';
import { useFarm } from '../../contexts/FarmContext';
import type { ShoppingLine } from './ShoppingListsTab';

interface Props {
  line: ShoppingLine;
  seasonId: string;
  onClose: () => void;
  onComplete: () => void;
}

export function MarkPurchasedModal({ line, seasonId, onClose, onComplete }: Props) {
  const { user } = useAuth();
  const { activeFarmId, effectiveUserId } = useFarm();
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
    if (!user || !activeFarmId) return;

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

    try {
      // 1. Write inventory ledger entry (chemical and seed only)
      if (line.product_category !== 'fertilizer' && line.master_product_id) {
        if (isAlreadyPurchased && line.purchased_quantity != null) {
          // Reverse previous purchase entry
          await supabase.from('inventory_ledger_entries').insert({
            farm_id: activeFarmId,
            master_product_id: line.master_product_id,
            product_category: line.product_category,
            entry_type: 'reversal',
            quantity_delta: -line.purchased_quantity,
            source_type: 'shopping_list_line',
            source_id: line.id,
            note: 'Purchase edit reversal',
            created_by: user.id,
          });
        }
        // Write new purchase entry
        await supabase.from('inventory_ledger_entries').insert({
          farm_id: activeFarmId,
          master_product_id: line.master_product_id,
          product_category: line.product_category,
          entry_type: 'purchase',
          quantity_delta: qty,
          source_type: 'shopping_list_line',
          source_id: line.id,
          note: `Purchased from ${line.supplier || 'supplier'}`,
          created_by: user.id,
        });
      }

      // 2. Update the shopping list line
      const { error: lineErr } = await supabase
        .from('shopping_list_lines')
        .update({
          purchased_quantity: qty,
          purchased_price_per_unit: ppu,
          status: 'purchased',
          purchased_at: new Date().toISOString(),
        })
        .eq('id', line.id);

      if (lineErr) throw lineErr;

      // 3. Update season-scoped product price and trigger cascade
      const uid = effectiveUserId ?? user.id;
      if (line.product_category === 'chemical') {
        // Find the individual_chemicals row linked to this master product
        const { data: chemRow } = await supabase
          .from('individual_chemicals')
          .select('id')
          .eq('season_id', seasonId)
          .eq('user_id', uid)
          .eq('master_product_id', line.master_product_id)
          .maybeSingle();

        if (chemRow) {
          await supabase
            .from('individual_chemicals')
            .update({ price_per_unit: ppu })
            .eq('id', chemRow.id);
          await queueCascadeTask(user.id, seasonId, 'cascade_chemical_update', chemRow.id, 'chemical');
        }
      } else if (line.product_category === 'seed') {
        const { data: seedRow } = await supabase
          .from('seed_varieties')
          .select('id')
          .eq('season_id', seasonId)
          .eq('user_id', uid)
          .eq('master_product_id', line.master_product_id)
          .maybeSingle();

        if (seedRow) {
          await supabase
            .from('seed_varieties')
            .update({ price_per_bag: ppu })
            .eq('id', seedRow.id);
          await queueCascadeTask(user.id, seasonId, 'cascade_product_update', seedRow.id, 'product');
        }
      } else if (line.product_category === 'fertilizer') {
        // Fertilizer: find by name in this season since there's no master_product_id
        const { data: fertRow } = await supabase
          .from('fertilizer_products')
          .select('id')
          .eq('season_id', seasonId)
          .eq('user_id', uid)
          .eq('product_name', line.product_name)
          .maybeSingle();

        if (fertRow) {
          await supabase
            .from('fertilizer_products')
            .update({ price_per_unit: ppu })
            .eq('id', fertRow.id);
          await queueCascadeTask(user.id, seasonId, 'cascade_product_update', fertRow.id, 'product');
        }
      }

      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to mark as purchased.');
    } finally {
      setSaving(false);
    }
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
