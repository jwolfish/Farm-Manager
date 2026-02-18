import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X } from 'lucide-react';
import {
  createTemplate,
  updateTemplate,
  cascadeTemplateUpdate,
  type TemplateWithStats,
  type ProgramReference
} from '../lib/templateUtils';
import { calculateCostWithConversion } from '../lib/unitConversions';
import { CascadeUpdateModal } from './CascadeUpdateModal';

interface TemplateFormProps {
  seasonId: string;
  template?: TemplateWithStats | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FertilizerProgram {
  id: string;
  program_name: string;
  application_cost: number;
  items?: {
    id: string;
    application_rate: number;
    application_rate_unit: string;
    fertilizer_products: {
      id: string;
      product_name: string;
      price_per_unit: number;
      unit_type: string;
    };
  }[];
}

interface ChemicalProgram {
  id: string;
  program_name: string;
  application_cost: number;
  crop_type: string;
  items?: {
    id: string;
    application_rate: number;
    application_rate_unit: string | null;
    individual_chemicals: {
      id: string;
      chemical_name: string;
      price_per_unit: number;
      unit_type: string;
    };
  }[];
}

export function TemplateForm({ seasonId, template, onClose, onSuccess }: TemplateFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fertilizerPrograms, setFertilizerPrograms] = useState<FertilizerProgram[]>([]);
  const [chemicalPrograms, setChemicalPrograms] = useState<ChemicalProgram[]>([]);
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [pendingTemplateData, setPendingTemplateData] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tillage_cost_per_acre: '0',
    planting_cost_per_acre: '0',
    harvest_cost_per_acre: '0',
    equipment_cost_per_acre: '0',
    custom_services_cost_per_acre: '0',
    labor_cost_per_acre: '0',
    crop_insurance_cost_per_acre: '0',
    other_expenses_per_acre: '0',
    drying_storage_cost_per_acre: '0',
    hauling_cost_per_acre: '0'
  });

  const [selectedFertilizerPrograms, setSelectedFertilizerPrograms] = useState<Set<string>>(new Set());
  const [selectedChemicalPrograms, setSelectedChemicalPrograms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (seasonId && user) {
      loadPrograms();
    }
  }, [seasonId, user]);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        tillage_cost_per_acre: String(template.tillage_cost_per_acre || 0),
        planting_cost_per_acre: String(template.planting_cost_per_acre || 0),
        harvest_cost_per_acre: String(template.harvest_cost_per_acre || 0),
        equipment_cost_per_acre: String(template.equipment_cost_per_acre || 0),
        custom_services_cost_per_acre: String(template.custom_services_cost_per_acre || 0),
        labor_cost_per_acre: String(template.labor_cost_per_acre || 0),
        crop_insurance_cost_per_acre: String(template.crop_insurance_cost_per_acre || 0),
        other_expenses_per_acre: String(template.other_expenses_per_acre || 0),
        drying_storage_cost_per_acre: String(template.drying_storage_cost_per_acre || 0),
        hauling_cost_per_acre: String(template.hauling_cost_per_acre || 0)
      });

      if (Array.isArray(template.fertilizer_programs)) {
        const programIds = (template.fertilizer_programs as ProgramReference[]).map(p => p.program_id);
        setSelectedFertilizerPrograms(new Set(programIds));
      }

      if (Array.isArray(template.chemical_programs)) {
        const programIds = (template.chemical_programs as ProgramReference[]).map(p => p.program_id);
        setSelectedChemicalPrograms(new Set(programIds));
      }
    }
  }, [template]);

  const loadPrograms = async () => {
    if (!seasonId || !user) return;

    try {
      const [fertRes, chemRes] = await Promise.all([
        supabase
          .from('fertilizer_programs')
          .select(`
            id,
            program_name,
            application_cost,
            fertilizer_program_items (
              id,
              application_rate,
              application_rate_unit,
              fertilizer_products (
                id,
                product_name,
                price_per_unit,
                unit_type
              )
            )
          `)
          .eq('season_id', seasonId)
          .order('program_name'),
        supabase
          .from('chemical_programs')
          .select(`
            id,
            program_name,
            application_cost,
            crop_type,
            chemical_program_items (
              id,
              application_rate,
              application_rate_unit,
              individual_chemicals (
                id,
                chemical_name,
                price_per_unit,
                unit_type
              )
            )
          `)
          .eq('season_id', seasonId)
          .order('program_name')
      ]);

      if (fertRes.data) {
        const normalizedFert = fertRes.data.map(prog => ({
          ...prog,
          items: prog.fertilizer_program_items
        }));
        setFertilizerPrograms(normalizedFert as FertilizerProgram[]);
      }

      if (chemRes.data) {
        const normalizedChem = chemRes.data.map(prog => ({
          ...prog,
          items: prog.chemical_program_items
        }));
        setChemicalPrograms(normalizedChem as ChemicalProgram[]);
      }
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  };

  const toggleFertilizerProgram = (programId: string) => {
    const newSet = new Set(selectedFertilizerPrograms);
    if (newSet.has(programId)) {
      newSet.delete(programId);
    } else {
      newSet.add(programId);
    }
    setSelectedFertilizerPrograms(newSet);
  };

  const toggleChemicalProgram = (programId: string) => {
    const newSet = new Set(selectedChemicalPrograms);
    if (newSet.has(programId)) {
      newSet.delete(programId);
    } else {
      newSet.add(programId);
    }
    setSelectedChemicalPrograms(newSet);
  };

  const calculateFertilizerProgramCost = (program: FertilizerProgram): number => {
    if (!program.items || program.items.length === 0) {
      return program.application_cost || 0;
    }

    const productCosts = program.items.reduce((sum, item) => {
      const product = item.fertilizer_products;
      const cost = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        product.price_per_unit,
        product.unit_type
      );
      return sum + cost;
    }, 0);

    return productCosts + (program.application_cost || 0);
  };

  const calculateChemicalProgramCost = (program: ChemicalProgram): number => {
    if (!program.items || program.items.length === 0) {
      return program.application_cost || 0;
    }

    const productCosts = program.items.reduce((sum, item) => {
      const chemical = item.individual_chemicals;
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

  const calculateTotalCost = () => {
    let total = 0;

    selectedFertilizerPrograms.forEach(id => {
      const program = fertilizerPrograms.find(p => p.id === id);
      if (program) total += calculateFertilizerProgramCost(program);
    });

    selectedChemicalPrograms.forEach(id => {
      const program = chemicalPrograms.find(p => p.id === id);
      if (program) total += calculateChemicalProgramCost(program);
    });

    Object.keys(formData).forEach(key => {
      if (key.endsWith('_per_acre') && key !== 'name' && key !== 'description') {
        total += parseFloat(formData[key as keyof typeof formData] as string) || 0;
      }
    });

    return total;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const fertilizerProgramsData: ProgramReference[] = Array.from(selectedFertilizerPrograms).map(id => {
      const program = fertilizerPrograms.find(p => p.id === id);
      return {
        program_id: id,
        cost_per_acre: program ? calculateFertilizerProgramCost(program) : 0
      };
    });

    const chemicalProgramsData: ProgramReference[] = Array.from(selectedChemicalPrograms).map(id => {
      const program = chemicalPrograms.find(p => p.id === id);
      return {
        program_id: id,
        cost_per_acre: program ? calculateChemicalProgramCost(program) : 0
      };
    });

    const templateData = {
      user_id: user.id,
      season_id: seasonId,
      name: formData.name,
      description: formData.description || null,
      fertilizer_programs: fertilizerProgramsData,
      chemical_programs: chemicalProgramsData,
      tillage_cost_per_acre: parseFloat(formData.tillage_cost_per_acre) || 0,
      planting_cost_per_acre: parseFloat(formData.planting_cost_per_acre) || 0,
      harvest_cost_per_acre: parseFloat(formData.harvest_cost_per_acre) || 0,
      equipment_cost_per_acre: parseFloat(formData.equipment_cost_per_acre) || 0,
      custom_services_cost_per_acre: parseFloat(formData.custom_services_cost_per_acre) || 0,
      labor_cost_per_acre: parseFloat(formData.labor_cost_per_acre) || 0,
      crop_insurance_cost_per_acre: parseFloat(formData.crop_insurance_cost_per_acre) || 0,
      other_expenses_per_acre: parseFloat(formData.other_expenses_per_acre) || 0,
      drying_storage_cost_per_acre: parseFloat(formData.drying_storage_cost_per_acre) || 0,
      hauling_cost_per_acre: parseFloat(formData.hauling_cost_per_acre) || 0
    };

    if (template?.id && template.fields_using_count && template.fields_using_count > 0) {
      setPendingTemplateData(templateData);
      setShowCascadeModal(true);
    } else {
      await saveTemplate(templateData);
    }
  };

  const saveTemplate = async (templateData: any) => {
    if (!user) return;

    setLoading(true);
    try {
      if (template?.id) {
        await updateTemplate(template.id, templateData);
      } else {
        await createTemplate(templateData);
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCascadeConfirm = async () => {
    if (!template?.id || !pendingTemplateData) return;

    setLoading(true);
    try {
      const updatedTemplate = await updateTemplate(template.id, pendingTemplateData);
      const result = await cascadeTemplateUpdate(template.id, updatedTemplate);

      setShowCascadeModal(false);
      setPendingTemplateData(null);

      if (result.errors.length > 0) {
        alert(`Template updated successfully!\n\nHowever, ${result.errors.length} field(s) had errors:\n${result.errors.map(e => e.error).join('\n')}`);
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error cascading template update:', error);
      alert('Failed to update template. Please try again.');
    } finally {
      setLoading(false);
    }

    return {
      templateId: template.id,
      totalFields: 0,
      fullyUpdatedFields: 0,
      partiallyUpdatedFields: 0,
      errors: []
    };
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Template Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
                placeholder="e.g., 2026 Corn - Standard"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                rows={2}
                placeholder="Optional description for this template"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Fertilizer Programs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fertilizerPrograms.map((program) => (
                <label
                  key={program.id}
                  className="flex items-center p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFertilizerPrograms.has(program.id)}
                    onChange={() => toggleFertilizerProgram(program.id)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="ml-3 flex-1 text-sm text-neutral-900">{program.program_name}</span>
                  <span className="text-sm text-neutral-600">
                    ${calculateFertilizerProgramCost(program).toFixed(2)}/ac
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Chemical Programs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {chemicalPrograms.map((program) => (
                <label
                  key={program.id}
                  className="flex items-center p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedChemicalPrograms.has(program.id)}
                    onChange={() => toggleChemicalProgram(program.id)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="ml-3 flex-1 text-sm text-neutral-900">{program.program_name}</span>
                  <span className="text-sm text-neutral-600">
                    ${calculateChemicalProgramCost(program).toFixed(2)}/ac
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Operational Costs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'tillage_cost_per_acre', label: 'Tillage' },
                { key: 'planting_cost_per_acre', label: 'Planting' },
                { key: 'harvest_cost_per_acre', label: 'Harvest' },
                { key: 'equipment_cost_per_acre', label: 'Equipment' },
                { key: 'custom_services_cost_per_acre', label: 'Custom Services' },
                { key: 'labor_cost_per_acre', label: 'Labor' },
                { key: 'crop_insurance_cost_per_acre', label: 'Crop Insurance' },
                { key: 'other_expenses_per_acre', label: 'Other Expenses' },
                { key: 'drying_storage_cost_per_acre', label: 'Drying/Storage' },
                { key: 'hauling_cost_per_acre', label: 'Hauling' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    {label} ($/acre)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData[key as keyof typeof formData]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-6 flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-600">Total Cost per Acre</div>
              <div className="text-2xl font-bold text-neutral-900">
                ${calculateTotalCost().toFixed(2)}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Saving...' : (template ? 'Update Template' : 'Create Template')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showCascadeModal && template && (
        <CascadeUpdateModal
          templateId={template.id}
          templateName={template.name}
          onConfirm={handleCascadeConfirm}
          onCancel={() => {
            setShowCascadeModal(false);
            setPendingTemplateData(null);
          }}
        />
      )}
    </div>
  );
}
