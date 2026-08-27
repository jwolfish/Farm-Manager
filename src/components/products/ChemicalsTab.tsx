import { useState } from 'react';
import { FlaskConical, Plus, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Pagination } from '../Pagination';
import { queueCascadeTask } from '../../lib/backgroundTasks';
import { InventoryAdjustModal } from './InventoryAdjustModal';
import { LedgerHistoryModal } from './LedgerHistoryModal';

const PAGE_SIZE = 25;

export interface IndividualChemical {
  id: string;
  chemical_name: string;
  price_per_unit: number;
  unit_type: string;
  default_application_rate: number | null;
  default_application_rate_unit: string | null;
  epa_reg_number: string | null;
  master_product_id: string | null;
  on_hand_quantity?: number | null;
  master_unit_type?: string | null;
}

interface Props {
  chemicals: IndividualChemical[];
  seasonId: string;
  onReload: () => void;
  showForm: boolean;
  onHideForm: () => void;
  readOnly?: boolean;
}

const defaultForm = { chemical_name: '', price_per_unit: '', unit_type: 'gal', default_application_rate: '', default_application_rate_unit: 'fl oz', epa_reg_number: '' };

export function ChemicalsTab({ chemicals, seasonId, onReload, showForm, onHideForm, readOnly = false }: Props) {
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState(defaultForm);
  const [adjustTarget, setAdjustTarget] = useState<IndividualChemical | null>(null);
  const [historyTarget, setHistoryTarget] = useState<IndividualChemical | null>(null);

  const totalPages = Math.ceil(chemicals.length / PAGE_SIZE);
  const paginatedChemicals = chemicals.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleEdit = (chemical: IndividualChemical) => {
    setEditingId(chemical.id);
    setFormData({
      chemical_name: chemical.chemical_name,
      price_per_unit: chemical.price_per_unit.toString(),
      unit_type: chemical.unit_type,
      default_application_rate: chemical.default_application_rate?.toString() || '',
      default_application_rate_unit: chemical.default_application_rate_unit || 'fl oz',
      epa_reg_number: chemical.epa_reg_number || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const price = parseFloat(formData.price_per_unit);
    if (!isFinite(price) || price <= 0) { setFormError('Price per unit must be a number greater than 0.'); return; }
    const appRate = formData.default_application_rate ? parseFloat(formData.default_application_rate) : null;
    if (appRate !== null && (!isFinite(appRate) || appRate <= 0)) { setFormError('Application rate must be a number greater than 0.'); return; }

    try {
      const payload = {
        chemical_name: formData.chemical_name,
        price_per_unit: price,
        unit_type: formData.unit_type,
        default_application_rate: appRate,
        default_application_rate_unit: appRate !== null ? formData.default_application_rate_unit : null,
        epa_reg_number: formData.epa_reg_number.trim() || null,
      };

      const isUpdating = !!editingId;
      const chemicalId = editingId;

      if (editingId) {
        const { error } = await supabase.from('individual_chemicals').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('individual_chemicals').insert({ season_id: seasonId, user_id: user.id, ...payload });
        if (error) throw error;
      }

      setFormData(defaultForm);
      setEditingId(null);
      setFormError(null);
      onHideForm();
      onReload();

      if (isUpdating && chemicalId) {
        await queueCascadeTask(user.id, seasonId, 'cascade_chemical_update', chemicalId, 'chemical');
      }
    } catch (error) {
      console.error('Error saving chemical:', error);
      setFormError('Error saving chemical. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData(defaultForm);
    setEditingId(null);
    setFormError(null);
    onHideForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this chemical?')) return;
    try {
      const { error } = await supabase.from('individual_chemicals').delete().eq('id', id);
      if (error) throw error;
      onReload();
    } catch (error) {
      console.error('Error deleting chemical:', error);
    }
  };

  return (
    <div>
      {(showForm || editingId) && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Edit' : 'New'} Chemical</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chemical Name</label>
              <input
                type="text"
                value={formData.chemical_name}
                onChange={(e) => setFormData({ ...formData, chemical_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., Atrazine, Glyphosate"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price per Unit ($)</label>
                <input
                  type="number" step="0.01"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit Type</label>
                <select
                  value={formData.unit_type}
                  onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="gal">Gallons</option>
                  <option value="qt">Quarts</option>
                  <option value="pt">Pints</option>
                  <option value="fl oz">Liquid Ounces</option>
                  <option value="lbs">Pounds</option>
                  <option value="oz">Dry Ounces</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Application Rate (optional)</label>
                <input
                  type="number" step="0.01"
                  value={formData.default_application_rate}
                  onChange={(e) => setFormData({ ...formData, default_application_rate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., 16"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Application Rate Unit</label>
                <select
                  value={formData.default_application_rate_unit}
                  onChange={(e) => setFormData({ ...formData, default_application_rate_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="gal">Gallons</option>
                  <option value="qt">Quarts</option>
                  <option value="pt">Pints</option>
                  <option value="fl oz">Liquid Ounces</option>
                  <option value="lbs">Pounds</option>
                  <option value="oz">Dry Ounces</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">EPA Registration # <span className="text-gray-400 font-normal">(optional — printed on spray logs)</span></label>
              <input
                type="text"
                value={formData.epa_reg_number}
                onChange={(e) => setFormData({ ...formData, epa_reg_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., 432-1547"
              />
            </div>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
            )}
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                {editingId ? 'Update' : 'Add'} Chemical
              </button>
              <button type="button" onClick={handleCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {chemicals.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <FlaskConical className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No chemicals yet</h3>
          <p className="text-gray-600">Add your first chemical to build programs</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chemical Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">EPA Reg. #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price/Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">On Hand</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedChemicals.map((chem) => (
                <tr key={chem.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{chem.chemical_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{chem.epa_reg_number || <span className="text-gray-300">—</span>}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${chem.price_per_unit.toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{chem.unit_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {chem.default_application_rate ? `${chem.default_application_rate} ${chem.default_application_rate_unit}` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {chem.master_product_id && chem.on_hand_quantity != null ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setHistoryTarget(chem)}
                          className={`font-medium hover:underline ${chem.on_hand_quantity < 0 ? 'text-red-600' : 'text-gray-900'}`}
                          title="View inventory history"
                        >
                          {chem.on_hand_quantity.toLocaleString()} {chem.master_unit_type || chem.unit_type}
                        </button>
                        {!readOnly && (
                          <>
                            <button
                              onClick={() => setAdjustTarget(chem)}
                              className="text-gray-400 hover:text-green-600"
                              title="Adjust inventory"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setAdjustTarget(chem)}
                              className="text-gray-400 hover:text-red-600"
                              title="Adjust inventory"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleEdit(chem)} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Edit</button>
                      <button onClick={() => handleDelete(chem.id)} className="text-red-600 hover:text-red-700 text-sm font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {chemicals.length > PAGE_SIZE && (
            <div className="px-6 pb-4">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalCount={chemicals.length} pageSize={PAGE_SIZE} />
            </div>
          )}
        </div>
      )}

      {adjustTarget && adjustTarget.master_product_id && (
        <InventoryAdjustModal
          productName={adjustTarget.chemical_name}
          masterProductId={adjustTarget.master_product_id}
          productCategory="chemical"
          currentOnHand={adjustTarget.on_hand_quantity ?? 0}
          unitType={adjustTarget.master_unit_type || adjustTarget.unit_type}
          onClose={() => setAdjustTarget(null)}
          onSaved={() => { setAdjustTarget(null); onReload(); }}
        />
      )}

      {historyTarget && historyTarget.master_product_id && (
        <LedgerHistoryModal
          productName={historyTarget.chemical_name}
          masterProductId={historyTarget.master_product_id}
          currentOnHand={historyTarget.on_hand_quantity ?? 0}
          unitType={historyTarget.master_unit_type || historyTarget.unit_type}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
