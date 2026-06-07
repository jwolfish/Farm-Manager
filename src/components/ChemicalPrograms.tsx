import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FlaskConical, Plus, X, CreditCard as Edit2, Trash2 } from 'lucide-react';
import { calculateCostWithConversion } from '../lib/unitConversions';
import type { CropType } from '../lib/database.types';
import { queueCascadeTask } from '../lib/backgroundTasks';

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
  notes: string;
}

interface ChemicalProgram {
  id: string;
  season_id: string;
  user_id: string;
  program_name: string;
  crop_type: CropType;
  application_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  chemical_program_items: {
    id: string;
    chemical_id: string;
    application_rate: number;
    application_rate_unit: string | null;
    notes: string | null;
  }[];
  items?: {
    id: string;
    chemical_id: string;
    application_rate: number;
    application_rate_unit: string | null;
    notes: string | null;
  }[];
}

interface ChemicalProgramsProps {
  seasonId: string;
}

export function ChemicalPrograms({ seasonId }: ChemicalProgramsProps) {
  const { user } = useAuth();
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
  }, [seasonId, user?.id]);

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
            application_rate_unit,
            notes
          )
        `)
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .order('program_name');

      if (error) throw error;
      const normalizedData = (data || []).map(program => ({
        ...program,
        items: program.chemical_program_items,
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

      const program = programs.find((p) => p.id === programId);
      if (program) {
        program.items = data || [];
        setPrograms([...programs]);
      }
    } catch (error) {
      console.error('Error loading program items:', error);
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

    if (!program.items) {
      await loadProgramItems(program.id);
      const prog = programs.find(p => p.id === program.id);
      if (prog?.items) {
        setProgramItems(prog.items.map(item => ({
          chemical_id: item.chemical_id,
          application_rate: item.application_rate,
          application_rate_unit: item.application_rate_unit || '',
          notes: item.notes || '',
        })));
      }
    } else {
      setProgramItems(program.items.map(item => ({
        chemical_id: item.chemical_id,
        application_rate: item.application_rate,
        application_rate_unit: item.application_rate_unit || '',
        notes: item.notes || '',
      })));
    }

    setShowForm(true);
    setExpandedProgram(null);
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
        const { data: existingItems } = await supabase
          .from('chemical_program_items')
          .select('program_id, chemical_id, application_rate, application_rate_unit, notes')
          .eq('program_id', editingId);

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

        if (programItems.length > 0) {
          const items = programItems.map(item => ({
            program_id: editingId,
            chemical_id: item.chemical_id,
            application_rate: item.application_rate,
            application_rate_unit: item.application_rate_unit,
            notes: item.notes.trim() || null,
          }));

          const { error: itemsError } = await supabase
            .from('chemical_program_items')
            .insert(items);

          if (itemsError) {
            if (existingItems && existingItems.length > 0) {
              await supabase.from('chemical_program_items').insert(existingItems);
            }
            throw itemsError;
          }
        }
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

      if (!editingId && programItems.length > 0 && programId) {
        const items = programItems.map(item => ({
          program_id: programId,
          chemical_id: item.chemical_id,
          application_rate: item.application_rate,
          application_rate_unit: item.application_rate_unit,
          notes: item.notes.trim() || null,
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
          'chemical'
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
    if (!confirm('Are you sure you want to delete this program?')) return;
    try {
      const { error } = await supabase.from('chemical_programs').delete().eq('id', id);
      if (error) throw error;
      loadPrograms();
    } catch (error) {
      console.error('Error deleting chemical program:', error);
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

  const addProgramItem = () => {
    setProgramItems([
      ...programItems,
      { chemical_id: '', application_rate: 0, application_rate_unit: 'fl oz', notes: '' },
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

  const calculateProductCost = (program: ChemicalProgram): number => {
    if (!program.items || program.items.length === 0) return 0;

    return program.items.reduce((sum, item) => {
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
  };

  const calculateProgramCost = (program: ChemicalProgram): number => {
    return calculateProductCost(program) + (program.application_cost || 0);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">Chemical Programs</h2>
        </div>
        <button
          onClick={() => {
            if (showForm || editingId) {
              handleCancel();
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit' : 'New'} Chemical Program
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Chemicals in Program</label>
                <button
                  type="button"
                  onClick={addProgramItem}
                  className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Chemical
                </button>
              </div>

              {chemicals.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-yellow-800">No chemicals available. Add chemicals first.</p>
                </div>
              ) : programItems.length === 0 ? (
                <p className="text-sm text-gray-500">No chemicals added yet. Click "Add Chemical" to add products.</p>
              ) : (
                <div className="space-y-3">
                  {programItems.map((item, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <div className="flex-1 min-w-0">
                        <select
                          value={item.chemical_id}
                          onChange={(e) => handleChemicalChange(index, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          required
                        >
                          <option value="">Select chemical...</option>
                          {chemicals.map((chem) => (
                            <option key={chem.id} value={chem.id}>
                              {chem.chemical_name} - ${chem.price_per_unit}/{chem.unit_type}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateProgramItem(index, 'notes', e.target.value)}
                          className="mt-1.5 w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-600 placeholder-gray-400"
                          placeholder="Notes: adjuvant, timing, restrictions (printed on spray log)"
                        />
                      </div>
                      <div className="w-28 flex-shrink-0">
                        <input
                          type="number"
                          step="0.01"
                          value={item.application_rate || ''}
                          onChange={(e) =>
                            updateProgramItem(index, 'application_rate', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Rate"
                          required
                        />
                      </div>
                      <div className="w-28 flex-shrink-0">
                        <select
                          value={item.application_rate_unit}
                          onChange={(e) => updateProgramItem(index, 'application_rate_unit', e.target.value)}
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
                      <button
                        type="button"
                        onClick={() => removeProgramItem(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 mt-0.5"
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
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">No chemical programs yet. Create your first program to get started.</p>
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
                    <p className="text-sm text-gray-500 capitalize mt-0.5">{program.crop_type}</p>
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
                    <p className="text-sm text-gray-500">No chemicals in this program</p>
                  ) : (
                    <div className="space-y-2">
                      {program.items.map((item) => {
                        const chemical = chemicals.find(c => c.id === item.chemical_id);
                        const applicationUnit = item.application_rate_unit || chemical?.unit_type || '';
                        const cost = chemical ? calculateCostWithConversion(
                          item.application_rate,
                          applicationUnit,
                          chemical.price_per_unit,
                          chemical.unit_type
                        ) : 0;
                        return (
                          <div key={item.id} className="text-sm bg-white p-3 rounded border border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">
                                {chemical?.chemical_name || 'Unknown Chemical'}
                              </span>
                              <span className="text-gray-600">
                                {item.application_rate} {applicationUnit}/acre @ ${chemical?.price_per_unit}/{chemical?.unit_type} = ${cost.toFixed(2)}/acre
                              </span>
                            </div>
                            {item.notes && (
                              <p className="mt-1 text-xs text-gray-500 italic">{item.notes}</p>
                            )}
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
