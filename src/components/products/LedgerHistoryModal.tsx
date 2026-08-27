import { useEffect, useState } from 'react';
import { X, History, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type LedgerRow = Database['public']['Tables']['inventory_ledger_entries']['Row'];

interface Props {
  productName: string;
  masterProductId: string;
  currentOnHand: number;
  unitType: string;
  onClose: () => void;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  consumption: 'Consumption',
  manual_adjustment: 'Manual Adjustment',
  reversal: 'Reversal',
};

const SOURCE_LABELS: Record<string, string> = {
  shopping_list_line: 'Shopping List',
  work_order: 'Work Order',
  manual: 'Manual',
};

export function LedgerHistoryModal({
  productName,
  masterProductId,
  currentOnHand,
  unitType,
  onClose,
}: Props) {
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('inventory_ledger_entries')
          .select('*')
          .eq('master_product_id', masterProductId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setEntries(data || []);
      } catch (err) {
        console.error('Error loading ledger entries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [masterProductId]);

  let runningBalance = currentOnHand;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-gray-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Inventory History</h2>
              <p className="text-sm text-gray-600">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-600">
            Current on-hand:{' '}
            <span className="font-semibold text-gray-900">
              {currentOnHand.toLocaleString()} {unitType}
            </span>
          </p>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No inventory transactions recorded yet.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((entry) => {
                  const isPositive = entry.quantity_delta >= 0;
                  const balance = runningBalance;
                  runningBalance = runningBalance - entry.quantity_delta;
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {entry.source_type ? SOURCE_LABELS[entry.source_type] || entry.source_type : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            isPositive ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {isPositive ? '+' : ''}
                          {entry.quantity_delta.toLocaleString()} {unitType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap font-medium">
                        {balance.toLocaleString()} {unitType}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                        {entry.note || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
