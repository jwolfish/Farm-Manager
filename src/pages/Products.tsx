import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Plus, Edit2, Trash2, Package, Droplet, FlaskConical, Layers } from 'lucide-react';
import type { CropType } from '../lib/database.types';
import { FertilizerPrograms } from '../components/FertilizerPrograms';
import { ChemicalPrograms } from '../components/ChemicalPrograms';
import { calculateCostWithConversion } from '../lib/unitConversions';
import { queueCascadeTask } from '../lib/backgroundTasks';
import { cascadeProductUpdateInSeason, cascadeChemicalUpdateInSeason } from '../lib/templateUtils';

interface ProductsProps {
  seasonId: string | null;
}

type ProductType = 'seeds' | 'fertilizers' | 'chemicals' | 'programs';

interface SeedVariety {
  id: string;
  product_name: string;
  crop_type: CropType;
  price_per_unit: number;
  unit_type: string;
  standard_seeding_rate: number | null;
  units_per_bag: number | null;
}

interface FertilizerProduct {
  id: string;
  product_name: string;
  price_per_unit: number;
  unit_type: string;
  application_rate: number | null;
  application_rate_unit: string | null;
  notes: string | null;
}

interface IndividualChemical {
  id: string;
  chemical_name: string;
  price_per_unit: number;
  unit_type: string;
  default_application_rate: number | null;
  default_application_rate_unit: string | null;
}

interface ChemicalProgram {
  id: string;
  program_name: string;
  crop_type: CropType;
  application_cost: number;
  notes: string | null;
  items?: Array<{
    id: string;
    chemical_id: string;
    application_rate: number;
    application_rate_unit: string | null;
    individual_chemicals: IndividualChemical;
  }>;
}

export function Products({ seasonId }: ProductsProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ProductType>('seeds');
  const [programType, setProgramType] = useState<'fertilizer' | 'chemical'>('fertilizer');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [seeds, setSeeds] = useState<SeedVariety[]>([]);
  const [fertilizers, setFertilizers] = useState<FertilizerProduct[]>([]);
  const [chemicals, setChemicals] = useState<IndividualChemical[]>([]);
  const [programs, setPrograms] = useState<ChemicalProgram[]>([]);

  useEffect(() => {
    if (seasonId && user) {
      loadProducts();
    }
  }, [seasonId, user, activeTab]);

  const loadProducts = async () => {
    if (!seasonId || !user) return;

    setLoading(true);
    try {
      if (activeTab === 'seeds') {
        const { data } = await supabase
          .from('seed_varieties')
          .select('*')
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('product_name');
        setSeeds(data || []);
      } else if (activeTab === 'fertilizers') {
        const { data } = await supabase
          .from('fertilizer_products')
          .select('*')
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('product_name');
        setFertilizers(data || []);
      } else if (activeTab === 'chemicals') {
        const { data } = await supabase
          .from('individual_chemicals')
          .select('*')
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('chemical_name');
        setChemicals(data || []);
      } else if (activeTab === 'programs') {
        const { data } = await supabase
          .from('chemical_programs')
          .select(`
            *,
            chemical_program_items (
              id,
              chemical_id,
              application_rate,
              individual_chemicals (*)
            )
          `)
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('program_name');
        setPrograms(data || []);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'seeds' as ProductType, name: 'Seed Varieties', icon: Package },
    { id: 'fertilizers' as ProductType, name: 'Fertilizers', icon: Droplet },
    { id: 'chemicals' as ProductType, name: 'Chemicals', icon: FlaskConical },
    { id: 'programs' as ProductType, name: 'Application Programs', icon: Layers },
  ];

  if (!seasonId) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">Please create or select a season to manage products</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Product Master Lists</h1>
        <p className="text-gray-600 mt-2">Manage your reusable product libraries</p>
      </div>

      <div className="mb-6 flex items-center gap-2 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowForm(false);
              }}
              className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {activeTab !== 'programs' && (
        <div className="mb-6">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add {activeTab === 'seeds' ? 'Seed Variety' : activeTab === 'fertilizers' ? 'Fertilizer' : 'Chemical'}
          </button>
        </div>
      )}

      {activeTab === 'seeds' && <SeedsList seeds={seeds} seasonId={seasonId} onReload={loadProducts} showForm={showForm} onHideForm={() => setShowForm(false)} />}
      {activeTab === 'fertilizers' && <FertilizersList fertilizers={fertilizers} seasonId={seasonId} onReload={loadProducts} showForm={showForm} onHideForm={() => setShowForm(false)} />}
      {activeTab === 'chemicals' && <ChemicalsList chemicals={chemicals} seasonId={seasonId} onReload={loadProducts} showForm={showForm} onHideForm={() => setShowForm(false)} />}
      {activeTab === 'programs' && (
        <div className="space-y-6">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setProgramType('fertilizer')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                programType === 'fertilizer'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Fertilizer Programs
            </button>
            <button
              onClick={() => setProgramType('chemical')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                programType === 'chemical'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Chemical Programs
            </button>
          </div>

          {programType === 'fertilizer' && seasonId && <FertilizerPrograms seasonId={seasonId} />}
          {programType === 'chemical' && seasonId && <ChemicalPrograms seasonId={seasonId} />}
        </div>
      )}
    </div>
  );
}

function SeedsList({ seeds, seasonId, onReload, showForm, onHideForm }: { seeds: SeedVariety[]; seasonId: string; onReload: () => void; showForm: boolean; onHideForm: () => void }) {
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_name: '',
    crop_type: 'corn' as CropType,
    price_per_unit: '',
    unit_type: 'bag',
    standard_seeding_rate: '',
    units_per_bag: '',
  });

  const getDefaultUnitsPerBag = (cropType: CropType) => {
    switch (cropType) {
      case 'corn':
        return '80000';
      case 'soybeans':
        return '140000';
      case 'wheat':
        return '50';
      default:
        return '';
    }
  };

  const getSeedingRateLabel = (cropType: CropType) => {
    if (cropType === 'wheat') {
      return 'Seeding Rate (lbs/acre)';
    }
    return 'Seeding Rate (seeds/acre)';
  };

  const getUnitsPerBagLabel = (cropType: CropType) => {
    if (cropType === 'wheat') {
      return 'Pounds per Bag';
    }
    return 'Seeds per Bag';
  };

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

    try {
      const payload = {
        product_name: formData.product_name,
        crop_type: formData.crop_type,
        price_per_unit: parseFloat(formData.price_per_unit),
        unit_type: formData.unit_type,
        standard_seeding_rate: formData.standard_seeding_rate ? parseFloat(formData.standard_seeding_rate) : null,
        units_per_bag: formData.units_per_bag ? parseFloat(formData.units_per_bag) : null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('seed_varieties')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('seed_varieties').insert({
          season_id: seasonId,
          user_id: user.id,
          ...payload,
        });
        if (error) throw error;
      }

      setFormData({ product_name: '', crop_type: 'corn', price_per_unit: '', unit_type: 'bag', standard_seeding_rate: '', units_per_bag: '' });
      setEditingId(null);
      onHideForm();
      onReload();
    } catch (error) {
      console.error('Error saving seed:', error);
      alert('Error saving seed variety. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData({ product_name: '', crop_type: 'corn', price_per_unit: '', unit_type: 'bag', standard_seeding_rate: '', units_per_bag: '' });
    setEditingId(null);
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
      alert('Error deleting seed variety. Please try again.');
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
                    setFormData({
                      ...formData,
                      crop_type: newCropType,
                      units_per_bag: getDefaultUnitsPerBag(newCropType)
                    });
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
                  type="number"
                  step="0.01"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{getUnitsPerBagLabel(formData.crop_type)}</label>
                <input
                  type="number"
                  step="0.01"
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
                type="number"
                step="0.01"
                value={formData.standard_seeding_rate}
                onChange={(e) => setFormData({ ...formData, standard_seeding_rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={formData.crop_type === 'wheat' ? '90' : '32000'}
              />
            </div>
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
              {seeds.map((seed) => (
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
                      <button
                        onClick={() => handleEdit(seed)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(seed.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FertilizersList({ fertilizers, seasonId, onReload, showForm, onHideForm }: { fertilizers: FertilizerProduct[]; seasonId: string; onReload: () => void; showForm: boolean; onHideForm: () => void }) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_name: '',
    price_per_unit: '',
    unit_type: 'gallon',
    application_rate: '',
    application_rate_unit: 'gallon',
    notes: '',
  });

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

    try {
      const payload = {
        product_name: formData.product_name,
        price_per_unit: parseFloat(formData.price_per_unit),
        unit_type: formData.unit_type,
        application_rate: formData.application_rate ? parseFloat(formData.application_rate) : null,
        application_rate_unit: formData.application_rate_unit || null,
        notes: formData.notes || null,
      };

      const isUpdating = !!editingId;
      const productId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from('fertilizer_products')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fertilizer_products').insert({
          season_id: seasonId,
          user_id: user.id,
          ...payload,
        });
        if (error) throw error;
      }

      setFormData({ product_name: '', price_per_unit: '', unit_type: 'gallon', application_rate: '', application_rate_unit: 'gallon', notes: '' });
      setEditingId(null);
      onHideForm();
      onReload();

      if (isUpdating && productId) {
        await queueCascadeTask(
          user.id,
          seasonId,
          'cascade_product_update',
          productId,
          'product',
          (ctx) => cascadeProductUpdateInSeason(productId, 'fertilizer', seasonId, ctx.taskId)
        );
      }
    } catch (error) {
      console.error('Error saving fertilizer:', error);
      alert('Error saving fertilizer product. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData({ product_name: '', price_per_unit: '', unit_type: 'gallon', application_rate: '', application_rate_unit: 'gallon', notes: '' });
    setEditingId(null);
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
                  type="number"
                  step="0.01"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  required
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
                  type="number"
                  step="0.01"
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
              {fertilizers.map((fert) => (
                <tr key={fert.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{fert.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${fert.price_per_unit.toFixed(2)}/{fert.unit_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {fert.application_rate ? `${fert.application_rate} ${fert.application_rate_unit || ''}/acre` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{fert.notes || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleEdit(fert)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(fert.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChemicalsList({ chemicals, seasonId, onReload, showForm, onHideForm }: { chemicals: IndividualChemical[]; seasonId: string; onReload: () => void; showForm: boolean; onHideForm: () => void }) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    chemical_name: '',
    price_per_unit: '',
    unit_type: 'gal',
    default_application_rate: '',
    default_application_rate_unit: 'fl oz',
  });

  const handleEdit = (chemical: IndividualChemical) => {
    setEditingId(chemical.id);
    setFormData({
      chemical_name: chemical.chemical_name,
      price_per_unit: chemical.price_per_unit.toString(),
      unit_type: chemical.unit_type,
      default_application_rate: chemical.default_application_rate?.toString() || '',
      default_application_rate_unit: chemical.default_application_rate_unit || 'fl oz',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const payload = {
        chemical_name: formData.chemical_name,
        price_per_unit: parseFloat(formData.price_per_unit),
        unit_type: formData.unit_type,
        default_application_rate: formData.default_application_rate ? parseFloat(formData.default_application_rate) : null,
        default_application_rate_unit: formData.default_application_rate ? formData.default_application_rate_unit : null,
      };

      const isUpdating = !!editingId;
      const chemicalId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from('individual_chemicals')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('individual_chemicals').insert({
          season_id: seasonId,
          user_id: user.id,
          ...payload,
        });
        if (error) throw error;
      }

      setFormData({ chemical_name: '', price_per_unit: '', unit_type: 'gal', default_application_rate: '', default_application_rate_unit: 'fl oz' });
      setEditingId(null);
      onHideForm();
      onReload();

      if (isUpdating && chemicalId) {
        await queueCascadeTask(
          user.id,
          seasonId,
          'cascade_chemical_update',
          chemicalId,
          'chemical',
          (ctx) => cascadeChemicalUpdateInSeason(chemicalId, seasonId, ctx.taskId)
        );
      }
    } catch (error) {
      console.error('Error saving chemical:', error);
      alert('Error saving chemical. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData({ chemical_name: '', crop_type: 'corn', price_per_unit: '', unit_type: 'gal', default_application_rate: '', default_application_rate_unit: 'fl oz' });
    setEditingId(null);
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
                  type="number"
                  step="0.01"
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
                  type="number"
                  step="0.01"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price/Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default Rate</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chemicals.map((chem) => (
                <tr key={chem.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{chem.chemical_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${chem.price_per_unit.toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{chem.unit_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {chem.default_application_rate
                      ? `${chem.default_application_rate} ${chem.default_application_rate_unit}`
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleEdit(chem)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(chem.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

