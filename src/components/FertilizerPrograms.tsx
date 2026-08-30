import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Package, Plus, X, CreditCard as Edit2, Trash2 } from 'lucide-react';
import { calculateCostWithConversion, describeConversionFailure } from '../lib/unitConversions';
import { queueCascadeTask } from '../lib/backgroundTasks';

interface FertilizerProduct {
  id: string;
  product_name: string;
  price_per_unit: number;
  unit_type: string;
}

interface ProgramItem {
  fertilizer_product_id: string;
  application_rate: number;
  application_rate_unit: string;
}

interface FertilizerProgram {
  id: string;
  program_name: string;
  application_cost: number;
  notes: string | null;
  fertilizer_program_items?: {
    id: string;
    fertilizer_product_id: string;
    application_rate: number;
    application_rate_unit: string;
  }[];
  items?: {
    id: string;
    fertilizer_product_id: string;
    application_rate: number;
    application_rate_unit: string;
  }[];
}

interface FertilizerProgramsProps {
  seasonId: string;
}

export function FertilizerPrograms({ seasonId }: FertilizerProgramsProps) {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<FertilizerProgram[]>([]);
  const [products, setProducts] = useState<FertilizerProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    program_name: '',
    application_cost: '',
    notes: '',
  });

  const [programItems, setProgramItems] = useState<ProgramItem[]>([]);

  useEffect(() => {
    if (seasonId && user) {
      loadPrograms();
      loadProducts();
    }
  }, [seasonId, user?.id]);

  const loadPrograms = async () => {
    if (!seasonId || !user) return;

    try {
      const { data, error } = await supabase
        .from('fertilizer_programs')
        .select(`
          *,
          fertilizer_program_items (
            id,
            fertilizer_product_id,
            application_rate,
            application_rate_unit
          )
        `)
        .eq('season_id', seasonId)
        .order('program_name');

      if (error) throw error;
      const normalizedData = (data || []).map(program => ({
        ...program,
        items: program.fertilizer_program_items
      }));
      setPrograms(normalizedData);
    } catch (error) {
      console.error('Error loading fertilizer programs:', error);
    }
  };

  const loadProducts = async () => {
    if (!seasonId || !user) return;

    try {
      const { data, error } = await supabase
        .from('fertilizer_products')
        .select('*')
        .eq('season_id', seasonId)
        .order('product_name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading fertilizer products:', error);
    }
  };

  const loadProgramItems = async (programId: string) => {
    try {
      const { data, error } = await supabase
        .from('fertilizer_program_items')
        .select('*')
        .eq('program_id', programId);

      if (error) throw error;

      const program = programs.find((p) => p.id === programId);
      if (program) {
        program.items = data || [];
        setPrograms([...programs]);
      }
    } catch (error) {
      console.error('Error loading program items:', error);
    }
  };

  const addProgramItem = () => {
    setProgramItems([
      ...programItems,
      { fertilizer_product_id: '', application_rate: 0, application_rate_unit: 'gallon' },
    ]);
  };

  const removeProgramItem = (index: number) => {
    setProgramItems(programItems.filter((_, i) => i !== index));
  };

  const updateProgramItem = (index: number, field: keyof ProgramItem, value: string | number) => {
    const updated = [...programItems];
    updated[index] = { ...updated[index], [field]: value };
    setProgramItems(updated);
  };

  const handleEdit = async (program: FertilizerProgram) => {
    setEditingId(program.id);
    setFormData({
      program_name: program.program_name,
      application_cost: program.application_cost.toString(),
      notes: program.notes || '',
    });

    if (!program.items) {
      await loadProgramItems(program.id);
      const prog = programs.find(p => p.id === program.id);
      if (prog?.items) {
        setProgramItems(prog.items.map(item => ({
          fertilizer_product_id: item.fertilizer_product_id,
          application_rate: item.application_rate,
          application_rate_unit: item.application_rate_unit,
        })));
      }
    } else {
      setProgramItems(program.items.map(item => ({
        fertilizer_product_id: item.fertilizer_product_id,
        application_rate: item.application_rate,
        application_rate_unit: item.application_rate_unit,
      })));
    }

    setShowForm(true);
    setExpandedProgram(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const isUpdating = !!editingId;
      const programId = editingId;

      if (editingId) {
        const { error: programError } = await supabase
          .from('fertilizer_programs')
          .update({
            program_name: formData.program_name,
            application_cost: parseFloat(formData.application_cost),
            notes: formData.notes || null,
          })
          .eq('id', editingId);

        if (programError) throw programError;

        const { error: deleteError } = await supabase
          .from('fertilizer_program_items')
          .delete()
          .eq('program_id', editingId);

        if (deleteError) throw deleteError;

        if (programItems.length > 0) {
          const items = programItems.map((item) => ({
            program_id: editingId,
            fertilizer_product_id: item.fertilizer_product_id,
            application_rate: item.application_rate,
            application_rate_unit: item.application_rate_unit,
          }));

          const { error: itemsError } = await supabase.from('fertilizer_program_items').insert(items);
          if (itemsError) throw itemsError;
        }
      } else {
        const { data: program, error: programError } = await supabase
          .from('fertilizer_programs')
          .insert({
            season_id: seasonId,
            user_id: user.id,
            program_name: formData.program_name,
            application_cost: parseFloat(formData.application_cost),
            notes: formData.notes || null,
          })
          .select()
          .single();

        if (programError) throw programError;

        if (programItems.length > 0) {
          const items = programItems.map((item) => ({
            program_id: program.id,
            fertilizer_product_id: item.fertilizer_product_id,
            application_rate: item.application_rate,
            application_rate_unit: item.application_rate_unit,
          }));

          const { error: itemsError } = await supabase.from('fertilizer_program_items').insert(items);
          if (itemsError) throw itemsError;
        }
      }

      setFormData({ program_name: '', application_cost: '', notes: '' });
      setProgramItems([]);
      setShowForm(false);
      setEditingId(null);
      loadPrograms();

      if (isUpdating && programId) {
        await queueCascadeTask(
          user.id,
          seasonId,
          'cascade_program_update',
          programId,
          'program',
          'fertilizer'
        );
      }
    } catch (error) {
      console.error('Error saving fertilizer program:', error);
      alert('Error saving fertilizer program. Please try again.');
    }
  };

  const handleDelete = async (programId: string) => {
    if (!confirm('Are you sure you want to delete this program?')) return;

    try {
      const { error } = await supabase.from('fertilizer_programs').delete().eq('id', programId);

      if (error) throw error;
      loadPrograms();
    } catch (error) {
      console.error('Error deleting program:', error);
      alert('Error deleting program. Please try again.');
    }
  };

  const toggleExpand = async (programId: string) => {
    if (expandedProgram === programId) {
      setExpandedProgram(null);
    } else {
      setExpandedProgram(programId);
      const program = programs.find((p) => p.id === programId);
      if (program && !program.items) {
        await loadProgramItems(programId);
      }
    }
  };

  const calculateProgramCost = (program: FertilizerProgram): number => {
    return calculateProductCost(program) + program.application_cost;
  };

  const calculateProductCost = (program: FertilizerProgram): number => {
    if (!program.items) return 0;

    return program.items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.fertilizer_product_id);
      if (!product) return sum;

      const cost = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        product.price_per_unit,
        product.unit_type
      );
      // An item whose units cannot meet contributes nothing; the per-item row
      // below says so rather than folding a wrong number into the total.
      if (!cost.ok) return sum;
      return sum + cost.value;
    }, 0);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">Fertilizer Programs</h2>
        </div>
        <button
          onClick={() => {
            if (showForm || editingId) {
              setShowForm(false);
              setEditingId(null);
              setFormData({ program_name: '', application_cost: '', notes: '' });
              setProgramItems([]);
            } else {
              setShowForm(true);
            }
          }}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm || editingId ? 'Cancel' : 'New Program'}
        </button>
      </div>

      {(showForm || editingId) && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Edit' : 'New'} Fertilizer Program</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Program Name</label>
                <input
                  type="text"
                  value={formData.program_name}
                  onChange={(e) => setFormData({ ...formData, program_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., Spring Pre-Plant, Sidedress"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Application Cost ($/acre)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.application_cost}
                  onChange={(e) => setFormData({ ...formData, application_cost: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
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

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Fertilizers in Program</label>
                <button
                  type="button"
                  onClick={addProgramItem}
                  className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Fertilizer
                </button>
              </div>

              {programItems.length === 0 ? (
                <p className="text-sm text-gray-500">No fertilizers added yet. Click "Add Fertilizer" to add products.</p>
              ) : (
                <div className="space-y-3">
                  {programItems.map((item, index) => (
                    <div key={index} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <select
                          value={item.fertilizer_product_id}
                          onChange={(e) => updateProgramItem(index, 'fertilizer_product_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          required
                        >
                          <option value="">Select fertilizer...</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.product_name} - ${product.price_per_unit}/{product.unit_type}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          step="0.01"
                          value={item.application_rate || ''}
                          onChange={(e) => updateProgramItem(index, 'application_rate', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Rate"
                          required
                        />
                      </div>
                      <div className="w-32">
                        <select
                          value={item.application_rate_unit}
                          onChange={(e) => updateProgramItem(index, 'application_rate_unit', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="gallon">Gallon</option>
                          <option value="quart">Quart</option>
                          <option value="pound">Pound</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProgramItem(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                {editingId ? 'Update' : 'Create'} Program
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ program_name: '', application_cost: '', notes: '' });
                  setProgramItems([]);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {programs.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">No fertilizer programs yet. Create your first program to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programs.map((program) => (
            <div key={program.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(program.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{program.program_name}</h3>
                    {program.notes && <p className="text-sm text-gray-600 mt-1">{program.notes}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Product Cost</p>
                      <p className="text-base font-semibold text-gray-900">${calculateProductCost(program).toFixed(2)}/acre</p>
                      <p className="text-sm text-gray-600 mt-1">Application Cost</p>
                      <p className="text-base font-semibold text-gray-900">${program.application_cost.toFixed(2)}/acre</p>
                      <p className="text-sm text-gray-600 mt-2 font-medium">Total Cost</p>
                      <p className="text-xl font-bold text-green-600">${calculateProgramCost(program).toFixed(2)}/acre</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(program);
                        }}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(program.id);
                        }}
                        className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {expandedProgram === program.id && program.items && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Program Contents:</h4>
                  {program.items.length === 0 ? (
                    <p className="text-sm text-gray-500">No fertilizers in this program</p>
                  ) : (
                    <div className="space-y-2">
                      {program.items.map((item) => {
                        const product = products.find((p) => p.id === item.fertilizer_product_id);
                        const cost = product ? calculateCostWithConversion(
                          item.application_rate,
                          item.application_rate_unit,
                          product.price_per_unit,
                          product.unit_type
                        ) : null;
                        let costLabel = '';
                        if (cost !== null && cost.ok) {
                          costLabel = ` = $${cost.value.toFixed(2)}/acre`;
                        } else if (cost !== null) {
                          costLabel = ` — not costed: ${describeConversionFailure(cost)}`;
                        }
                        return (
                          <div key={item.id} className="flex items-center justify-between text-sm bg-white p-3 rounded border border-gray-200">
                            <span className="font-medium text-gray-900">
                              {product?.product_name || 'Unknown Product'}
                            </span>
                            <span className={cost !== null && !cost.ok ? 'text-red-600' : 'text-gray-600'}>
                              {item.application_rate} {item.application_rate_unit}/acre @ ${product?.price_per_unit}/{product?.unit_type}
                              {costLabel}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t border-gray-300">
                        <span>Total Cost per Acre:</span>
                        <span className="text-green-600">${calculateProgramCost(program).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
