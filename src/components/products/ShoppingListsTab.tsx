import { useCallback, useEffect, useState } from 'react';
import { ShoppingCart, RefreshCw, Check, CreditCard as Edit2, DollarSign, Package, AlertTriangle, FileDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createShoppingList, FlaggedShoppingLine } from '../../lib/shoppingListGeneration';
import { useAuth } from '../../contexts/AuthContext';
import { useFarm } from '../../contexts/FarmContext';
import { Pagination } from '../Pagination';
import { MarkPurchasedModal } from './MarkPurchasedModal';
import { exportShoppingListPDF } from '../../lib/exports/shoppingListPdfExport';

type Category = 'chemical' | 'fertilizer' | 'seed';

interface ShoppingList {
  id: string;
  label: string;
  product_category: Category;
  created_at: string;
}

export interface ShoppingLine {
  id: string;
  shopping_list_id: string;
  master_product_id: string | null;
  product_name: string;
  product_category: Category;
  needed_quantity: number;
  on_hand_at_generation: number;
  adjusted_quantity: number | null;
  supplier: string | null;
  quoted_price_per_unit: number | null;
  purchased_quantity: number | null;
  purchased_price_per_unit: number | null;
  unit_type: string;
  status: 'needed' | 'quoted' | 'purchased';
  purchased_at: string | null;
}

interface Props {
  seasonId: string;
  readOnly?: boolean;
}

const PAGE_SIZE = 20;

const CATEGORY_LABELS: Record<Category, string> = {
  chemical: 'Chemical',
  fertilizer: 'Fertilizer',
  seed: 'Seed',
};

const STATUS_STYLES: Record<string, string> = {
  needed: 'bg-gray-100 text-gray-700',
  quoted: 'bg-blue-100 text-blue-700',
  purchased: 'bg-green-100 text-green-700',
};

export function ShoppingListsTab({ seasonId, readOnly = false }: Props) {
  const { user } = useAuth();
  const { activeFarmId, effectiveUserId, activeFarm } = useFarm();
  const [category, setCategory] = useState<Category>('chemical');
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [lines, setLines] = useState<ShoppingLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flaggedLines, setFlaggedLines] = useState<FlaggedShoppingLine[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ adjusted_quantity: string; supplier: string; quoted_price_per_unit: string }>({ adjusted_quantity: '', supplier: '', quoted_price_per_unit: '' });
  const [purchaseTarget, setPurchaseTarget] = useState<ShoppingLine | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [seasonName, setSeasonName] = useState('');

  const farmId = activeFarmId;
  const farmName = activeFarm?.farmName ?? undefined;
  const userId = effectiveUserId ?? user?.id ?? null;

  const loadLists = useCallback(async () => {
    if (!farmId || !seasonId) return;
    const { data } = await supabase
      .from('shopping_lists')
      .select('id, label, product_category, created_at')
      .eq('farm_id', farmId)
      .eq('season_id', seasonId)
      .eq('product_category', category)
      .order('created_at', { ascending: false });
    setLists((data as ShoppingList[]) ?? []);
    if (data && data.length > 0 && !selectedListId) {
      setSelectedListId(data[0].id);
    }
  }, [farmId, seasonId, category, selectedListId]);

  const loadLines = useCallback(async () => {
    if (!selectedListId) { setLines([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('shopping_list_lines')
      .select('*')
      .eq('shopping_list_id', selectedListId)
      .order('product_name');
    setLines((data as ShoppingLine[]) ?? []);
    setLoading(false);
  }, [selectedListId]);

  useEffect(() => {
    setSelectedListId(null);
    setLines([]);
    setCurrentPage(1);
  }, [category]);

  useEffect(() => { loadLists(); }, [loadLists]);

  useEffect(() => {
    if (!seasonId) return;
    supabase.from('seasons').select('name, year').eq('id', seasonId).maybeSingle().then(({ data }) => {
      if (data) setSeasonName(`${data.name} (${data.year})`);
    });
  }, [seasonId]);
  useEffect(() => { loadLines(); }, [loadLines]);

  const handleGenerate = async () => {
    if (!farmId || !userId) return;
    setGenerating(true);
    setError(null);
    setFlaggedLines([]);
    // No user id: the generators read through RLS and scope by season_id, and the
    // insert does not stamp one. The !userId guard above stays as an auth check.
    const result = await createShoppingList(farmId, seasonId, category);
    if ('error' in result) {
      setError(result.error);
    } else {
      setSelectedListId(result.listId);
      setFlaggedLines(result.flaggedLines);
      await loadLists();
    }
    setGenerating(false);
  };

  const startEdit = (line: ShoppingLine) => {
    setEditingLineId(line.id);
    setEditValues({
      adjusted_quantity: String(line.adjusted_quantity ?? line.needed_quantity),
      supplier: line.supplier ?? '',
      quoted_price_per_unit: line.quoted_price_per_unit != null ? String(line.quoted_price_per_unit) : '',
    });
  };

  const saveEdit = async (lineId: string) => {
    const adjusted = parseFloat(editValues.adjusted_quantity);
    const quoted = editValues.quoted_price_per_unit ? parseFloat(editValues.quoted_price_per_unit) : null;
    const supplier = editValues.supplier.trim() || null;

    const newStatus = quoted != null && supplier ? 'quoted' : 'needed';

    const { error: err } = await supabase
      .from('shopping_list_lines')
      .update({
        adjusted_quantity: isFinite(adjusted) ? adjusted : null,
        supplier,
        quoted_price_per_unit: quoted != null && isFinite(quoted) ? quoted : null,
        status: newStatus,
      })
      .eq('id', lineId);

    if (!err) {
      setEditingLineId(null);
      await loadLines();
    }
  };

  const handlePurchaseComplete = async () => {
    setPurchaseTarget(null);
    await loadLines();
  };

  const totalPages = Math.ceil(lines.length / PAGE_SIZE);
  const paginatedLines = lines.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const summaryStats = {
    total: lines.length,
    needed: lines.filter((l) => l.status === 'needed').length,
    quoted: lines.filter((l) => l.status === 'quoted').length,
    purchased: lines.filter((l) => l.status === 'purchased').length,
    estimatedCost: lines.reduce((sum, l) => {
      const qty = l.adjusted_quantity ?? l.needed_quantity;
      const price = l.purchased_price_per_unit ?? l.quoted_price_per_unit ?? 0;
      return sum + qty * price;
    }, 0),
  };

  return (
    <div>
      {/* Category selector */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          {(['chemical', 'fertilizer', 'seed'] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                category === cat
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {lines.length > 0 && (
            <button
              onClick={() => {
                const selectedList = lists.find((l) => l.id === selectedListId);
                exportShoppingListPDF(lines, selectedList?.label ?? '', seasonName, farmName);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <FileDown className="w-4 h-4" />
              Export PDF
            </button>
          )}
          {!readOnly && (
            <button
              onClick={handleGenerate}
              disabled={generating || !farmId}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
              Generate {CATEGORY_LABELS[category]} List
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <span>{error}</span>
        </div>
      )}

      {flaggedLines.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
          <div>
            <p className="font-semibold mb-1">
              Some quantities are incomplete — check these before ordering.
            </p>
            <ul className="space-y-0.5">
              {flaggedLines.map((line) => (
                <li key={line.productName}>
                  <span className="font-medium">{line.productName}</span>: {line.issues.join('; ')}
                </li>
              ))}
            </ul>
            <p className="mt-1.5">
              The quantity shown for these products leaves out the programs listed above.
            </p>
          </div>
        </div>
      )}

      {/* List selector if multiple exist */}
      {lists.length > 1 && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Select List</label>
          <select
            value={selectedListId ?? ''}
            onChange={(e) => { setSelectedListId(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Summary stats */}
      {lines.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 font-medium">Total Items</p>
            <p className="text-xl font-bold text-gray-900">{summaryStats.total}</p>
          </div>
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-600 font-medium">Quoted</p>
            <p className="text-xl font-bold text-blue-800">{summaryStats.quoted}</p>
          </div>
          <div className="bg-green-50 rounded-xl px-4 py-3">
            <p className="text-xs text-green-600 font-medium">Purchased</p>
            <p className="text-xl font-bold text-green-800">{summaryStats.purchased}</p>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 font-medium">Est. Total Cost</p>
            <p className="text-xl font-bold text-gray-900">
              ${summaryStats.estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Lines table */}
      {!selectedListId && lists.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No shopping lists yet</h3>
          <p className="text-gray-600">
            Generate a {CATEGORY_LABELS[category].toLowerCase()} shopping list from your crop plan to see what you need to buy.
          </p>
        </div>
      ) : lines.length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>This list has no items.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Needed</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Order Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quoted $/Unit</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  {!readOnly && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedLines.map((line) => {
                  const isEditing = editingLineId === line.id;
                  return (
                    <tr key={line.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{line.product_name}</div>
                        {line.on_hand_at_generation > 0 && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            On hand at gen: {line.on_hand_at_generation.toLocaleString()} {line.unit_type}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {line.needed_quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} {line.unit_type}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.adjusted_quantity}
                            onChange={(e) => setEditValues({ ...editValues, adjusted_quantity: e.target.value })}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        ) : (
                          <span className="font-medium text-gray-900">
                            {(line.adjusted_quantity ?? line.needed_quantity).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.supplier}
                            onChange={(e) => setEditValues({ ...editValues, supplier: e.target.value })}
                            placeholder="Supplier name"
                            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        ) : (
                          <span className="text-gray-700">{line.supplier || <span className="text-gray-300">--</span>}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.quoted_price_per_unit}
                            onChange={(e) => setEditValues({ ...editValues, quoted_price_per_unit: e.target.value })}
                            placeholder="0.00"
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        ) : line.purchased_price_per_unit != null ? (
                          <span className="font-medium text-green-700">
                            ${line.purchased_price_per_unit.toFixed(2)}
                          </span>
                        ) : line.quoted_price_per_unit != null ? (
                          <span className="text-gray-900">${line.quoted_price_per_unit.toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-300">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[line.status]}`}>
                          {line.status}
                        </span>
                        {line.purchased_at && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {new Date(line.purchased_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(line.id)}
                                  className="text-green-600 hover:text-green-700 text-xs font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingLineId(null)}
                                  className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(line)}
                                  className="text-blue-600 hover:text-blue-700"
                                  title="Edit quote"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {line.status !== 'purchased' ? (
                                  <button
                                    onClick={() => setPurchaseTarget(line)}
                                    className="text-green-600 hover:text-green-700"
                                    title="Mark purchased"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setPurchaseTarget(line)}
                                    className="text-gray-500 hover:text-gray-700"
                                    title="Edit purchase"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {lines.length > PAGE_SIZE && (
            <div className="px-4 pb-4">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalCount={lines.length} pageSize={PAGE_SIZE} />
            </div>
          )}
        </div>
      )}

      {purchaseTarget && (
        <MarkPurchasedModal
          line={purchaseTarget}
          seasonId={seasonId}
          onClose={() => setPurchaseTarget(null)}
          onComplete={handlePurchaseComplete}
        />
      )}
    </div>
  );
}
