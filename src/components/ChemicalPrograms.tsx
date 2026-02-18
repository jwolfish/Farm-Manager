import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { FlaskConical, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { calculateCostWithConversion } from '../lib/unitConversions';
import type { CropType } from '../lib/database.types';
import { queueCascadeTask } from '../lib/backgroundTasks';
import { cascadeProgramUpdateInSeason } from '../lib/templateUtils';

interface IndividualChemical {
  id: string;
  chemical_name: string;
  price_per_unit: number;
  unit_type: string;
  default_application_rate: number | null;
  default_application_rate_unit: string | null;
}

interface ProgramItem {
  chemical_id: string;
  application_rate: number;
  application_rate_unit: string;
}

interface ChemicalProgram {
  id: string;
  program_name: string;
  crop_type: CropType;
  application_cost: number;
  notes: string | null;
  chemical_program_items?: {
    id: string;
    chemical_id: string;
    application_rate: number;
    application_rate_unit: string;
  }[];
  items?: {
    id: string;
    chemical_id: string;
    application_rate: number;
    application_rate_unit: string;
  }[];
}

interface ChemicalProgramsProps {
  seasonId: string;
}

export function ChemicalPrograms({ seasonId }: ChemicalProgramsProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [programs, setPrograms] = useState<ChemicalProgram[]>([]);
  const [chemicals, setChemicals] = useState<IndividualChemical[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    program_name: '',
    crop_type: 'corn' as CropType,
    application_cost: '',
    notes: '',
  });

  const [programItems, setProgramItems] = useState<ProgramItem[]>([]);

  useEffect(() => {
    if (seasonId && user) {
      loadPrograms();
      loadChemicals();
    }
  }, [seasonId, user]);

  const loadPrograms = async () => {
    if (!seasonId || !user) return;

    try {
      const { data, error } = await supabase
        .from('chemical_programs')
        .select(`
          *,
          chemical_program_items (
            id,
            chemical_id,
            application_rate,
            application_rate_unit
          )
        `)
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .order('program_name');

      if (error) throw error;
      const normalizedData = (data || []).map(program => ({
        ...program,
        items: program.chemical_program_items
      }));
      setPrograms(normalizedData);
    } catch (error) {
      console.error('Error loading chemical programs:', error);
    }
  };

  const loadChemicals = async () => {
    if (!seasonId || !user) return;

    try {
      const { data, error } = await supabase
        .from('individual_chemicals')
        .select('*')
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .order('chemical_name');

      if (error) throw error;
      setChemicals(data || []);
    } catch (error) {
      console.error('Error loading chemicals:', error);
    }
  };

  const loadProgramItems = async (programId: string) => {
    try {
      const { data, error } = await supabase
        .from('chemical_program_items')
        .select('*')
        .eq('program_id', programId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading program items:', error);
      return [];
    }
  };

  const handleEdit = async (program: ChemicalProgram) => {
    setEditingId(program.id);
    setFormData({
      program_name: program.program_name,
      crop_type: program.crop_type,
      application_cost: program.application_cost.toString(),
      notes: program.notes || '',
    });

    const items = await loadProgramItems(program.id);
    setProgramItems(items.map(item => ({
      chemical_id: item.chemical_id,
      application_rate: item.application_rate,
      application_rate_unit: item.application_rate_unit || '',
    })));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const payload = {
        program_name: formData.program_name,
        crop_type: formData.crop_type,
        application_cost: parseFloat(formData.application_cost) || 0,
        notes: formData.notes || null,
      };

      const isUpdating = !!editingId;
      let programId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from('chemical_programs')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;

        const { error: deleteError } = await supabase
          .from('chemical_program_items')
          .delete()
          .eq('program_id', editingId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase
          .from('chemical_programs')
          .insert({
            season_id: seasonId,
            user_id: user.id,
            ...payload,
          })
          .select()
          .single();

        if (error) throw error;
        programId = data.id;
      }

      if (programItems.length > 0 && programId) {
        const items = programItems.map(item => ({
          program_id: programId,
          chemical_id: item.chemical_id,
          application_rate: item.application_rate,
          application_rate_unit: item.application_rate_unit,
        }));

        const { error: itemsError } = await supabase
          .from('chemical_program_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      setFormData({ program_name: '', crop_type: 'corn', application_cost: '', notes: '' });
      setProgramItems([]);
      setEditingId(null);
      setShowForm(false);
      loadPrograms();

      if (isUpdating && programId) {
        await queueCascadeTask(
          user.id,
          seasonId,
          'cascade_program_update',
          programId,
          'program',
          (ctx) => cascadeProgramUpdateInSeason(programId, 'chemical', seasonId, ctx.taskId)
        );
      }
    } catch (error) {
      console.error('Error saving chemical program:', error);
      alert('Error saving chemical program. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData({ program_name: '', crop_type: 'corn', application_cost: '', notes: '' });
    setProgramItems([]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this chemical program?')) return;
    try {
      const { error } = await supabase.from('chemical_programs').delete().eq('id', id);
      if (error) throw error;
      loadPrograms();
    } catch (error) {
      console.error('Error deleting chemical program:', error);
    }
  };

  const addProgramItem = () => {
    setProgramItems([
      ...programItems,
      { chemical_id: '', application_rate: 0, application_rate_unit: 'fl oz' },
    ]);
  };

  const updateProgramItem = (index: number, field: keyof ProgramItem, value: string | number) => {
    const updated = [...programItems];
    updated[index] = { ...updated[index], [field]: value };
    setProgramItems(updated);
  };

  const removeProgramItem = (index: number) => {
    setProgramItems(programItems.filter((_, i) => i !== index));
  };

  const calculateProgramCost = (program: ChemicalProgram): number => {
    if (!program.items || program.items.length === 0) return program.application_cost || 0;

    const productCosts = program.items.reduce((sum, item) => {
      const chemical = chemicals.find(c => c.id === item.chemical_id);
      if (!chemical) return sum;

      const applicationUnit = item.application_rate_unit || chemical.unit_type;
      const cost = calculateCostWithConversion(
        item.application_rate,
        applicationUnit,
        chemical.price_per_unit,
        chemical.unit_type
      );
      return sum + cost;
    }, 0);

    return productCosts + (program.application_cost || 0);
  };

  const handleChemicalChange = (index: number, chemicalId: string) => {
    const chemical = chemicals.find(c => c.id === chemicalId);
    const updated = [...programItems];
    updated[index] = {
      ...updated[index],
      chemical_id: chemicalId,
      application_rate: chemical?.default_application_rate || 0,
      application_rate_unit: chemical?.default_application_rate_unit || 'fl oz',
    };
    setProgramItems(updated);
  };

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Chemical Program
        </button>
      </div>

      {(showForm || editingId) && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit' : 'New'} Chemical Program
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Program Name</label>
                <input
                  type="text"
                  value={formData.program_name}
                  onChange={(e) => setFormData({ ...formData, program_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., Spring Pre-Emerge"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Crop Type</label>
                <select
                  value={formData.crop_type}
                  onChange={(e) => setFormData({ ...formData, crop_type: e.target.value as CropType })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="corn">Corn</option>
                  <option value="soybeans">Soybeans</option>
                  <option value="wheat">Wheat</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Application Cost ($/acre)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.application_cost}
                onChange={(e) => setFormData({ ...formData, application_cost: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                rows={2}
                placeholder="Optional notes"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Chemicals</label>
                <button
                  type="button"
                  onClick={addProgramItem}
                  className="flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Chemical
                </button>
              </div>

              {chemicals.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-yellow-800">
                    No chemicals available. Add chemicals first.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {programItems.map((item, index) => (
                    <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
                      <div className="flex-1">
                        <select
                          value={item.chemical_id}
                          onChange={(e) => handleChemicalChange(index, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          required
                        >
                          <option value="">Select chemical</option>
                          {chemicals.map((chem) => (
                            <option key={chem.id} value={chem.id}>
                              {chem.chemical_name} (${chem.price_per_unit}/{chem.unit_type})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          step="0.01"
                          value={item.application_rate}
                          onChange={(e) =>
                            updateProgramItem(index, 'application_rate', parseFloat(e.target.value) || 0)
                          }
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
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                {editingId ? 'Update' : 'Create'} Program
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {programs.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <FlaskConical className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No chemical programs yet</h3>
          <p className="text-gray-600">Create your first program to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => (
            <div key={program.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{program.program_name}</h3>
                    <p className="text-sm text-gray-600 capitalize mt-1">Crop: {program.crop_type}</p>
                    <p className="text-sm font-medium text-green-600 mt-1">
                      ${calculateProgramCost(program).toFixed(2)}/acre
                    </p>
                    {program.notes && (
                      <p className="text-sm text-gray-600 mt-2">{program.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedProgram(expandedProgram === program.id ? null : program.id)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      {expandedProgram === program.id ? 'Hide' : 'Show'} Details
                    </button>
                    <button
                      onClick={() => handleEdit(program)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(program.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expandedProgram === program.id && program.items && program.items.length > 0 && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Chemicals in this program:</h4>
                    <div className="space-y-2">
                      {program.items.map((item) => {
                        const chemical = chemicals.find(c => c.id === item.chemical_id);
                        if (!chemical) return null;

                        const applicationUnit = item.application_rate_unit || chemical.unit_type;
                        const cost = calculateCostWithConversion(
                          item.application_rate,
                          applicationUnit,
                          chemical.price_per_unit,
                          chemical.unit_type
                        );

                        return (
                          <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-900">{chemical.chemical_name}</p>
                              <p className="text-sm text-gray-600">
                                {item.application_rate} {applicationUnit}/acre
                              </p>
                            </div>
                            <p className="font-medium text-gray-900">${cost.toFixed(2)}/acre</p>
                          </div>
                        );
                      })}
                      {program.application_cost > 0 && (
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                          <p className="font-medium text-gray-900">Application Cost</p>
                          <p className="font-medium text-gray-900">${program.application_cost.toFixed(2)}/acre</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
