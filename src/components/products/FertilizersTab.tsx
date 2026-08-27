import { useState } from 'react';
import { Droplet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFarm } from '../../contexts/FarmContext';
import { Pagination } from '../Pagination';
import { queueCascadeTask } from '../../lib/backgroundTasks';

const PAGE_SIZE = 25;

export interface FertilizerProduct {
  id: string;
  product_name: string;
  price_per_unit: number;
  unit_type: string;
  application_rate: number | null;
  application_rate_unit: string | null;
  notes: string | null;
  master_product_id: string | null;
}

interface Props {
  fertilizers: FertilizerProduct[];
  seasonId: string;
  onReload: () => void;
  showForm: boolean;
  onHideForm: () => void;
}

const defaultForm = { product_name: '', price_per_unit: '', unit_type: 'gallon', application_rate: '', application_rate_unit: 'gallon', notes: '' };

export function FertilizersTab({ fertilizers, seasonId, onReload, showForm, onHideForm }: Props) {
  const { user } = useAuth();
  const { activeFarmId } = useFarm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState(defaultForm);

  const totalPages = Math.ceil(fertilizers.length / PAGE_SIZE);
  const paginatedFertilizers = fertilizers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleEdit = (fertilizer: FertilizerProduct) => {
    setEditingId(fertilizer.id);
    setFormData({
      product_name: fertilizer.product_name,
      price_per_unit: fertilizer.price_per_unit.toString(),
      unit_type: fertilizer.unit_type,
      application_rate: fertilizer.application_rate?.toString() || '',
      application_rate_unit: fertilizer.application_rate_unit || 'gallon',
      notes: fertilizer.notes || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const price = parseFloat(formData.price_per_unit);
    if (!isFinite(price) || price <= 0) { setFormError('Price per unit must be a number greater than 0.'); return; }
    const appRate = formData.application_rate ? parseFloat(formData.application_rate) : null;
    if (appRate !== null && (!isFinite(appRate) || appRate <= 0)) { setFormError('Application rate must be a number greater than 0.'); return; }

    try {
      const payload = {
        product_name: formData.product_name,
        price_per_unit: price,
        unit_type: formData.unit_type,
        application_rate: appRate,
        application_rate_unit: formData.application_rate_unit || null,
        notes: formData.notes || null,
      };

      const isUpdating = !!editingId;
      const productId = editingId;

      if (editingId) {
        const { error } = await supabase.from('fertilizer_products').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        let masterProductId: string | null = null;
        if (activeFarmId) {
          const { data: mpData } = await supabase
            .from('master_products')
            .upsert(
              {
                farm_id: activeFarmId,
                product_category: 'fertilizer',
                canonical_name: formData.product_name,
                unit_type: formData.unit_type,
              },
              { onConflict: 'farm_id,product_category,canonical_name' }
            )
            .select('id')
            .single();
          if (mpData) masterProductId = mpData.id;
        }

        const { error } = await supabase.from('fertilizer_products').insert({
          season_id: seasonId,
          user_id: user.id,
          master_product_id: masterProductId,
          ...payload,
        });
        if (error) throw error;
      }

      setFormData(defaultForm);
      setEditingId(null);
      setFormError(null);
      onHideForm();
      onReload();

      if (isUpdating && productId) {
        await queueCascadeTask(user.id, seasonId, 'cascade_product_update', productId, 'product');
      }
    } catch (error) {
      console.error('Error saving fertilizer:', error);
      setFormError('Error saving fertilizer product. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData(defaultForm);
    setEditingId(null);
    setFormError(null);
    onHideForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this fertilizer product?')) return;
    try {
      const { error } = await supabase.from('fertilizer_products').delete().eq('id', id);
      if (error) throw error;
      onReload();
    } catch (error) {
      console.error('Error deleting fertilizer:', error);
    }
  };

  return (
    <div>
      {(showForm || editingId) && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Edit' : 'New'} Fertilizer Product</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
              <input
                type="text"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., Anhydrous Ammonia, 28% UAN"
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
                  placeholder="0.00" required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price Unit</label>
                <select
                  value={formData.unit_type}
                  onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="gallon">Gallon</option>
                  <option value="ton">Ton</option>
                  <option value="pound">Pound</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Application Rate (optional)</label>
                <input
                  type="number" step="0.01"
                  value={formData.application_rate}
                  onChange={(e) => setFormData({ ...formData, application_rate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Application Rate Unit</label>
                <select
                  value={formData.application_rate_unit}
                  onChange={(e) => setFormData({ ...formData, application_rate_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="gallon">Gallon</option>
                  <option value="quart">Quart</option>
                  <option value="pound">Pound</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Additional information"
              />
            </div>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
            )}
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                {editingId ? 'Update' : 'Add'} Fertilizer
              </button>
              <button type="button" onClick={handleCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {fertilizers.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Droplet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No fertilizer products yet</h3>
          <p className="text-gray-600">Add your first fertilizer product to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedFertilizers.map((fert) => (
                <tr key={fert.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{fert.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${fert.price_per_unit.toFixed(2)}/{fert.unit_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {fert.application_rate ? `${fert.application_rate} ${fert.application_rate_unit || ''}/acre` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{fert.notes || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleEdit(fert)} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Edit</button>
                      <button onClick={() => handleDelete(fert.id)} className="text-red-600 hover:text-red-700 text-sm font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fertilizers.length > PAGE_SIZE && (
            <div className="px-6 pb-4">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalCount={fertilizers.length} pageSize={PAGE_SIZE} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
