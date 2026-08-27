import { useState } from 'react';
import { Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Pagination } from '../Pagination';
import type { CropType } from '../../lib/database.types';

const PAGE_SIZE = 25;

export interface SeedVariety {
  id: string;
  product_name: string;
  crop_type: CropType;
  price_per_unit: number;
  unit_type: string;
  standard_seeding_rate: number | null;
  units_per_bag: number | null;
  master_product_id: string | null;
}

interface Props {
  seeds: SeedVariety[];
  seasonId: string;
  onReload: () => void;
  showForm: boolean;
  onHideForm: () => void;
}

function getDefaultUnitsPerBag(cropType: CropType): string {
  switch (cropType) {
    case 'corn': return '80000';
    case 'soybeans': return '140000';
    case 'wheat': return '50';
    default: return '';
  }
}

function getSeedingRateLabel(cropType: CropType): string {
  return cropType === 'wheat' ? 'Seeding Rate (lbs/acre)' : 'Seeding Rate (seeds/acre)';
}

function getUnitsPerBagLabel(cropType: CropType): string {
  return cropType === 'wheat' ? 'Pounds per Bag' : 'Seeds per Bag';
}

const defaultForm = { product_name: '', crop_type: 'corn' as CropType, price_per_unit: '', unit_type: 'bag', standard_seeding_rate: '', units_per_bag: '' };

export function SeedsTab({ seeds, seasonId, onReload, showForm, onHideForm }: Props) {
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState(defaultForm);

  const totalPages = Math.ceil(seeds.length / PAGE_SIZE);
  const paginatedSeeds = seeds.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleEdit = (seed: SeedVariety) => {
    setEditingId(seed.id);
    setFormData({
      product_name: seed.product_name,
      crop_type: seed.crop_type,
      price_per_unit: seed.price_per_unit.toString(),
      unit_type: seed.unit_type,
      standard_seeding_rate: seed.standard_seeding_rate?.toString() || '',
      units_per_bag: seed.units_per_bag?.toString() || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const price = parseFloat(formData.price_per_unit);
    if (!isFinite(price) || price <= 0) { setFormError('Price per bag must be a number greater than 0.'); return; }
    const unitsPerBag = formData.units_per_bag ? parseFloat(formData.units_per_bag) : null;
    if (unitsPerBag !== null && (!isFinite(unitsPerBag) || unitsPerBag <= 0)) { setFormError('Units per bag must be a number greater than 0.'); return; }
    const seedingRate = formData.standard_seeding_rate ? parseFloat(formData.standard_seeding_rate) : null;
    if (seedingRate !== null && (!isFinite(seedingRate) || seedingRate <= 0)) { setFormError('Seeding rate must be a number greater than 0.'); return; }

    try {
      const payload = {
        product_name: formData.product_name,
        crop_type: formData.crop_type,
        price_per_unit: price,
        unit_type: formData.unit_type,
        standard_seeding_rate: seedingRate,
        units_per_bag: unitsPerBag,
      };

      if (editingId) {
        const { error } = await supabase.from('seed_varieties').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('seed_varieties').insert({ season_id: seasonId, user_id: user.id, ...payload });
        if (error) throw error;
      }

      setFormData(defaultForm);
      setEditingId(null);
      setFormError(null);
      onHideForm();
      onReload();
    } catch (error) {
      console.error('Error saving seed:', error);
      setFormError('Error saving seed variety. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData(defaultForm);
    setEditingId(null);
    setFormError(null);
    onHideForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this seed variety?')) return;
    try {
      const { error } = await supabase.from('seed_varieties').delete().eq('id', id);
      if (error) throw error;
      onReload();
    } catch (error) {
      console.error('Error deleting seed:', error);
    }
  };

  return (
    <div>
      {(showForm || editingId) && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Edit' : 'New'} Seed Variety</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
                <input
                  type="text"
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., Dekalb DKC65-10"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Crop Type</label>
                <select
                  value={formData.crop_type}
                  onChange={(e) => {
                    const newCropType = e.target.value as CropType;
                    setFormData({ ...formData, crop_type: newCropType, units_per_bag: getDefaultUnitsPerBag(newCropType) });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="corn">Corn</option>
                  <option value="soybeans">Soybeans</option>
                  <option value="wheat">Wheat</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price per Bag ($)</label>
                <input
                  type="number" step="0.01"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00" required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{getUnitsPerBagLabel(formData.crop_type)}</label>
                <input
                  type="number" step="0.01"
                  value={formData.units_per_bag}
                  onChange={(e) => setFormData({ ...formData, units_per_bag: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder={getDefaultUnitsPerBag(formData.crop_type)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{getSeedingRateLabel(formData.crop_type)}</label>
              <input
                type="number" step="0.01"
                value={formData.standard_seeding_rate}
                onChange={(e) => setFormData({ ...formData, standard_seeding_rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={formData.crop_type === 'wheat' ? '90' : '32000'}
              />
            </div>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
            )}
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                {editingId ? 'Update' : 'Add'} Seed Variety
              </button>
              <button type="button" onClick={handleCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {seeds.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No seed varieties yet</h3>
          <p className="text-gray-600">Add your first seed variety to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Crop</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price/Bag</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units/Bag</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seeding Rate</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedSeeds.map((seed) => (
                <tr key={seed.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{seed.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">{seed.crop_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${seed.price_per_unit.toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {seed.units_per_bag ? `${seed.units_per_bag.toLocaleString()}${seed.crop_type === 'wheat' ? ' lbs' : ' seeds'}` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {seed.standard_seeding_rate ? `${seed.standard_seeding_rate.toLocaleString()}${seed.crop_type === 'wheat' ? ' lbs' : ' seeds'}/acre` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleEdit(seed)} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Edit</button>
                      <button onClick={() => handleDelete(seed.id)} className="text-red-600 hover:text-red-700 text-sm font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {seeds.length > PAGE_SIZE && (
            <div className="px-6 pb-4">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalCount={seeds.length} pageSize={PAGE_SIZE} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
