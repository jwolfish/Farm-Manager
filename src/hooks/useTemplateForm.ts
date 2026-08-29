import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import {
  createTemplate,
  updateTemplate,
  cascadeTemplateUpdate,
  type TemplateWithStats,
  type ProgramReference,
} from '../lib/templateUtils';
import { calculateCostWithConversion } from '../lib/unitConversions';

export interface FertilizerProgram {
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

export interface ChemicalProgram {
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

export interface TemplateFormPayload {
  user_id: string;
  season_id: string;
  name: string;
  description: string | null;
  fertilizer_programs: ProgramReference[];
  chemical_programs: ProgramReference[];
  tillage_cost_per_acre: number;
  planting_cost_per_acre: number;
  harvest_cost_per_acre: number;
  equipment_cost_per_acre: number;
  custom_services_cost_per_acre: number;
  labor_cost_per_acre: number;
  crop_insurance_cost_per_acre: number;
  other_expenses_per_acre: number;
  drying_storage_cost_per_acre: number;
  hauling_cost_per_acre: number;
}

type FormData = {
  name: string;
  description: string;
  tillage_cost_per_acre: string;
  planting_cost_per_acre: string;
  harvest_cost_per_acre: string;
  equipment_cost_per_acre: string;
  custom_services_cost_per_acre: string;
  labor_cost_per_acre: string;
  crop_insurance_cost_per_acre: string;
  other_expenses_per_acre: string;
  drying_storage_cost_per_acre: string;
  hauling_cost_per_acre: string;
};

export function useTemplateForm(
  seasonId: string,
  template: TemplateWithStats | null | undefined,
  onClose: () => void,
  onSuccess: () => void,
) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fertilizerPrograms, setFertilizerPrograms] = useState<FertilizerProgram[]>([]);
  const [chemicalPrograms, setChemicalPrograms] = useState<ChemicalProgram[]>([]);
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [pendingTemplateData, setPendingTemplateData] = useState<TemplateFormPayload | null>(null);

  const [formData, setFormData] = useState<FormData>({
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
    hauling_cost_per_acre: '0',
  });

  const [selectedFertilizerPrograms, setSelectedFertilizerPrograms] = useState<Set<string>>(new Set());
  const [selectedChemicalPrograms, setSelectedChemicalPrograms] = useState<Set<string>>(new Set());

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
        hauling_cost_per_acre: String(template.hauling_cost_per_acre || 0),
      });

      if (Array.isArray(template.fertilizer_programs)) {
        const ids = (template.fertilizer_programs as ProgramReference[]).map(p => p.program_id);
        setSelectedFertilizerPrograms(new Set(ids));
      }

      if (Array.isArray(template.chemical_programs)) {
        const ids = (template.chemical_programs as ProgramReference[]).map(p => p.program_id);
        setSelectedChemicalPrograms(new Set(ids));
      }
    }
  }, [template]);

  const loadPrograms = useCallback(async () => {
    if (!seasonId || !user) return;
    try {
      const [fertRes, chemRes] = await Promise.all([
        supabase
          .from('fertilizer_programs')
          .select(`
            id, program_name, application_cost,
            fertilizer_program_items (
              id, application_rate, application_rate_unit,
              fertilizer_products ( id, product_name, price_per_unit, unit_type )
            )
          `)
          .eq('season_id', seasonId)
          .order('program_name'),
        supabase
          .from('chemical_programs')
          .select(`
            id, program_name, application_cost, crop_type,
            chemical_program_items (
              id, application_rate, application_rate_unit,
              individual_chemicals ( id, chemical_name, price_per_unit, unit_type )
            )
          `)
          .eq('season_id', seasonId)
          .order('program_name'),
      ]);

      if (fertRes.data) {
        setFertilizerPrograms(fertRes.data.map(p => ({ ...p, items: p.fertilizer_program_items })) as FertilizerProgram[]);
      }
      if (chemRes.data) {
        setChemicalPrograms(chemRes.data.map(p => ({ ...p, items: p.chemical_program_items })) as ChemicalProgram[]);
      }
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  }, [seasonId, user]);

  useEffect(() => {
    if (seasonId && user) loadPrograms();
  }, [seasonId, user, loadPrograms]);

  const toggleFertilizerProgram = (id: string) => {
    setSelectedFertilizerPrograms(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleChemicalProgram = (id: string) => {
    setSelectedChemicalPrograms(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const calculateFertilizerProgramCost = (program: FertilizerProgram): number => {
    if (!program.items || program.items.length === 0) return program.application_cost || 0;
    const productCosts = program.items.reduce((sum, item) => {
      const cost = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        item.fertilizer_products.price_per_unit,
        item.fertilizer_products.unit_type,
      );
      // Unconvertible units contribute nothing rather than a wrong number.
      return cost.ok ? sum + cost.value : sum;
    }, 0);
    return productCosts + (program.application_cost || 0);
  };

  const calculateChemicalProgramCost = (program: ChemicalProgram): number => {
    if (!program.items || program.items.length === 0) return program.application_cost || 0;
    const productCosts = program.items.reduce((sum, item) => {
      const applicationUnit = item.application_rate_unit || item.individual_chemicals.unit_type;
      const cost = calculateCostWithConversion(
        item.application_rate,
        applicationUnit,
        item.individual_chemicals.price_per_unit,
        item.individual_chemicals.unit_type,
      );
      // Unconvertible units contribute nothing rather than a wrong number.
      return cost.ok ? sum + cost.value : sum;
    }, 0);
    return productCosts + (program.application_cost || 0);
  };

  const calculateTotalCost = (): number => {
    let total = 0;
    selectedFertilizerPrograms.forEach(id => {
      const p = fertilizerPrograms.find(p => p.id === id);
      if (p) total += calculateFertilizerProgramCost(p);
    });
    selectedChemicalPrograms.forEach(id => {
      const p = chemicalPrograms.find(p => p.id === id);
      if (p) total += calculateChemicalProgramCost(p);
    });
    const costKeys = [
      'tillage_cost_per_acre', 'planting_cost_per_acre', 'harvest_cost_per_acre',
      'equipment_cost_per_acre', 'custom_services_cost_per_acre', 'labor_cost_per_acre',
      'crop_insurance_cost_per_acre', 'other_expenses_per_acre', 'drying_storage_cost_per_acre',
      'hauling_cost_per_acre',
    ] as const;
    costKeys.forEach(key => { total += parseFloat(formData[key]) || 0; });
    return total;
  };

  const buildPayload = (): TemplateFormPayload | null => {
    if (!user) return null;
    return {
      user_id: user.id,
      season_id: seasonId,
      name: formData.name,
      description: formData.description || null,
      fertilizer_programs: Array.from(selectedFertilizerPrograms).map(id => {
        const p = fertilizerPrograms.find(p => p.id === id);
        return { program_id: id, cost_per_acre: p ? calculateFertilizerProgramCost(p) : 0 };
      }),
      chemical_programs: Array.from(selectedChemicalPrograms).map(id => {
        const p = chemicalPrograms.find(p => p.id === id);
        return { program_id: id, cost_per_acre: p ? calculateChemicalProgramCost(p) : 0 };
      }),
      tillage_cost_per_acre: parseFloat(formData.tillage_cost_per_acre) || 0,
      planting_cost_per_acre: parseFloat(formData.planting_cost_per_acre) || 0,
      harvest_cost_per_acre: parseFloat(formData.harvest_cost_per_acre) || 0,
      equipment_cost_per_acre: parseFloat(formData.equipment_cost_per_acre) || 0,
      custom_services_cost_per_acre: parseFloat(formData.custom_services_cost_per_acre) || 0,
      labor_cost_per_acre: parseFloat(formData.labor_cost_per_acre) || 0,
      crop_insurance_cost_per_acre: parseFloat(formData.crop_insurance_cost_per_acre) || 0,
      other_expenses_per_acre: parseFloat(formData.other_expenses_per_acre) || 0,
      drying_storage_cost_per_acre: parseFloat(formData.drying_storage_cost_per_acre) || 0,
      hauling_cost_per_acre: parseFloat(formData.hauling_cost_per_acre) || 0,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const costKeys = [
      'tillage_cost_per_acre', 'planting_cost_per_acre', 'harvest_cost_per_acre',
      'equipment_cost_per_acre', 'custom_services_cost_per_acre', 'labor_cost_per_acre',
      'crop_insurance_cost_per_acre', 'other_expenses_per_acre', 'drying_storage_cost_per_acre',
      'hauling_cost_per_acre',
    ] as const;

    for (const key of costKeys) {
      const val = parseFloat(formData[key]);
      if (!isFinite(val) || val < 0) {
        const label = key.replace(/_/g, ' ').replace(' per acre', '').replace(/\b\w/g, c => c.toUpperCase());
        setFormError(`${label} must be a number of 0 or greater.`);
        return;
      }
    }

    const payload = buildPayload();
    if (!payload) return;

    if (template?.id && template.fields_using_count && template.fields_using_count > 0) {
      setPendingTemplateData(payload);
      setShowCascadeModal(true);
    } else {
      await saveTemplate(payload);
    }
  };

  const saveTemplate = async (payload: TemplateFormPayload) => {
    if (!user) return;
    setLoading(true);
    try {
      if (template?.id) {
        await updateTemplate(template.id, payload);
      } else {
        await createTemplate(payload);
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
      addNotification('Failed to save template. Please try again.', 'error');
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
        addNotification(`Template updated, but ${result.errors.length} field(s) had errors updating.`, 'warning');
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error cascading template update:', error);
      addNotification('Failed to update template. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCascadeCancel = () => {
    setShowCascadeModal(false);
    setPendingTemplateData(null);
  };

  return {
    loading,
    formError,
    formData,
    setFormData,
    fertilizerPrograms,
    chemicalPrograms,
    selectedFertilizerPrograms,
    selectedChemicalPrograms,
    showCascadeModal,
    toggleFertilizerProgram,
    toggleChemicalProgram,
    calculateFertilizerProgramCost,
    calculateChemicalProgramCost,
    calculateTotalCost,
    handleSubmit,
    handleCascadeConfirm,
    handleCascadeCancel,
  };
}
