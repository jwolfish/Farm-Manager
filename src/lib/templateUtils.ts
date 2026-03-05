import { supabase } from './supabase';
import { Database } from './database.types';

type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];
type CostTemplateInsert = Database['public']['Tables']['cost_templates']['Insert'];
type CostTemplateUpdate = Database['public']['Tables']['cost_templates']['Update'];
type FieldCostOverride = Database['public']['Tables']['field_cost_overrides']['Row'];

export interface ProgramReference {
  program_id: string;
  cost_per_acre: number;
}

export interface TemplateWithStats extends CostTemplate {
  fields_using_count?: number;
  total_cost_per_acre?: number;
}

export async function getTemplates(seasonId: string): Promise<TemplateWithStats[]> {
  const { data, error } = await supabase
    .from('cost_templates')
    .select('*')
    .eq('season_id', seasonId)
    .order('name');

  if (error) throw error;

  const templatesWithStats = await Promise.all(
    (data || []).map(async (template) => {
      const fieldsCount = await getFieldsUsingTemplate(template.id);
      const totalCost = calculateTemplateCost(template);

      return {
        ...template,
        fields_using_count: fieldsCount.length,
        total_cost_per_acre: totalCost
      };
    })
  );

  return templatesWithStats;
}

export async function getTemplate(templateId: string): Promise<TemplateWithStats | null> {
  const { data, error } = await supabase
    .from('cost_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const fieldsCount = await getFieldsUsingTemplate(templateId);
  const totalCost = calculateTemplateCost(data);

  return {
    ...data,
    fields_using_count: fieldsCount.length,
    total_cost_per_acre: totalCost
  };
}

export async function createTemplate(template: CostTemplateInsert): Promise<CostTemplate> {
  const { data, error } = await supabase
    .from('cost_templates')
    .insert(template)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTemplate(
  templateId: string,
  updates: CostTemplateUpdate
): Promise<CostTemplate> {
  const { data, error } = await supabase
    .from('cost_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('cost_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;
}

export async function getFieldsUsingTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('field_costs')
    .select(`
      field_id,
      fields (
        id,
        name,
        acreage,
        crop_type
      )
    `)
    .eq('template_id', templateId);

  if (error) throw error;
  return data || [];
}

export function calculateTemplateCost(template: CostTemplate): number {
  const fertilizerCost = Array.isArray(template.fertilizer_programs)
    ? (template.fertilizer_programs as ProgramReference[]).reduce(
        (sum, p) => sum + (p.cost_per_acre || 0),
        0
      )
    : 0;

  const chemicalCost = Array.isArray(template.chemical_programs)
    ? (template.chemical_programs as ProgramReference[]).reduce(
        (sum, p) => sum + (p.cost_per_acre || 0),
        0
      )
    : 0;

  return (
    fertilizerCost +
    chemicalCost +
    Number(template.tillage_cost_per_acre || 0) +
    Number(template.planting_cost_per_acre || 0) +
    Number(template.harvest_cost_per_acre || 0) +
    Number(template.equipment_cost_per_acre || 0) +
    Number(template.custom_services_cost_per_acre || 0) +
    Number(template.labor_cost_per_acre || 0) +
    Number(template.crop_insurance_cost_per_acre || 0) +
    Number(template.drying_storage_cost_per_acre || 0) +
    Number(template.hauling_cost_per_acre || 0) +
    Number(template.other_expenses_per_acre || 0)
  );
}

export async function getFieldOverrides(fieldId: string): Promise<FieldCostOverride[]> {
  const { data, error } = await supabase
    .from('field_cost_overrides')
    .select('*')
    .eq('field_id', fieldId);

  if (error) throw error;
  return data || [];
}

export async function createOrUpdateOverride(
  fieldId: string,
  costItemName: string,
  overrideValue: any
): Promise<FieldCostOverride> {
  const { data, error } = await supabase
    .from('field_cost_overrides')
    .upsert(
      {
        field_id: fieldId,
        cost_item_name: costItemName,
        override_value: overrideValue
      },
      {
        onConflict: 'field_id,cost_item_name'
      }
    )
    .select()
    .single();

  if (error) throw error;

  await recalculateFieldTotal(fieldId);

  return data;
}

export async function deleteOverride(fieldId: string, costItemName: string): Promise<void> {
  const { error } = await supabase
    .from('field_cost_overrides')
    .delete()
    .eq('field_id', fieldId)
    .eq('cost_item_name', costItemName);

  if (error) throw error;

  await recalculateFieldTotal(fieldId);
}

export async function deleteAllOverrides(fieldId: string): Promise<void> {
  const { error } = await supabase
    .from('field_cost_overrides')
    .delete()
    .eq('field_id', fieldId);

  if (error) throw error;

  await recalculateFieldTotal(fieldId);
}

export async function unlinkFieldFromTemplate(fieldId: string): Promise<void> {
  const { data: fieldCost, error: fetchError } = await supabase
    .from('field_costs')
    .select('*')
    .eq('field_id', fieldId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!fieldCost) return;

  await deleteAllOverrides(fieldId);

  const { error: updateError } = await supabase
    .from('field_costs')
    .update({ template_id: null })
    .eq('field_id', fieldId);

  if (updateError) throw updateError;
}

export interface CascadeUpdateResult {
  templateId: string;
  totalFields: number;
  fullyUpdatedFields: number;
  partiallyUpdatedFields: number;
  errors: Array<{ fieldId: string; error: string }>;
}

export async function cascadeTemplateUpdate(
  templateId: string,
  updatedTemplate: CostTemplate
): Promise<CascadeUpdateResult> {
  const fieldsUsingTemplate = await getFieldsUsingTemplate(templateId);

  const result: CascadeUpdateResult = {
    templateId,
    totalFields: fieldsUsingTemplate.length,
    fullyUpdatedFields: 0,
    partiallyUpdatedFields: 0,
    errors: []
  };

  for (const fieldData of fieldsUsingTemplate) {
    try {
      const fieldId = fieldData.field_id;
      const overrides = await getFieldOverrides(fieldId);

      const hasOverrides = overrides.length > 0;

      if (hasOverrides) {
        result.partiallyUpdatedFields++;
      } else {
        result.fullyUpdatedFields++;
      }

      const overrideMap = new Map(
        overrides.map(o => [o.cost_item_name, true])
      );

      const updates: any = {};

      if (!overrideMap.has('fertilizer_programs')) {
        updates.fertilizer_cost_per_acre = Array.isArray(updatedTemplate.fertilizer_programs)
          ? (updatedTemplate.fertilizer_programs as ProgramReference[]).reduce(
              (sum, p) => sum + (p.cost_per_acre || 0),
              0
            )
          : 0;
      }

      if (!overrideMap.has('chemical_programs')) {
        updates.chemical_cost_per_acre = Array.isArray(updatedTemplate.chemical_programs)
          ? (updatedTemplate.chemical_programs as ProgramReference[]).reduce(
              (sum, p) => sum + (p.cost_per_acre || 0),
              0
            )
          : 0;
      }

      const costFields = [
        'tillage_cost_per_acre',
        'planting_cost_per_acre',
        'harvest_cost_per_acre',
        'equipment_cost_per_acre',
        'custom_services_cost_per_acre',
        'labor_cost_per_acre',
        'crop_insurance_cost_per_acre',
        'drying_storage_cost_per_acre',
        'hauling_cost_per_acre',
        'other_expenses_per_acre'
      ];

      for (const field of costFields) {
        if (!overrideMap.has(field)) {
          updates[field] = updatedTemplate[field as keyof CostTemplate] || 0;
        }
      }

      const { data: currentFieldCost } = await supabase
        .from('field_costs')
        .select('*')
        .eq('field_id', fieldId)
        .maybeSingle();

      if (currentFieldCost) {
        const totalCost = calculateFieldTotalCost({
          ...currentFieldCost,
          ...updates
        });
        updates.total_cost_per_acre = totalCost;
      }

      const { error } = await supabase
        .from('field_costs')
        .update(updates)
        .eq('field_id', fieldId);

      if (error) {
        result.errors.push({
          fieldId,
          error: error.message
        });
      }
    } catch (err) {
      result.errors.push({
        fieldId: fieldData.field_id,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  return result;
}

function calculateFieldTotalCost(fieldCost: any): number {
  return (
    Number(fieldCost.seed_cost_per_acre || 0) +
    Number(fieldCost.fertilizer_cost_per_acre || 0) +
    Number(fieldCost.chemical_cost_per_acre || 0) +
    Number(fieldCost.tillage_cost_per_acre || 0) +
    Number(fieldCost.planting_cost_per_acre || 0) +
    Number(fieldCost.harvest_cost_per_acre || 0) +
    Number(fieldCost.equipment_cost_per_acre || 0) +
    Number(fieldCost.custom_services_cost_per_acre || 0) +
    Number(fieldCost.labor_cost_per_acre || 0) +
    Number(fieldCost.crop_insurance_cost_per_acre || 0) +
    Number(fieldCost.drying_storage_cost_per_acre || 0) +
    Number(fieldCost.hauling_cost_per_acre || 0) +
    Number(fieldCost.other_expenses_per_acre || 0)
  );
}

export interface SeedVarietyAssignment {
  fieldId: string;
  seedVarietyId: string;
  seedingRateOverride?: number;
  seedCostPerAcre: number;
}

export interface ApplyTemplateResult {
  success: boolean;
  appliedFields: string[];
  errors: Array<{ fieldId: string; error: string }>;
}

export async function applyTemplateToFields(
  templateId: string,
  fieldIds: string[],
  seedAssignments: SeedVarietyAssignment[],
  authenticatedUserId: string
): Promise<ApplyTemplateResult> {
  const result: ApplyTemplateResult = {
    success: true,
    appliedFields: [],
    errors: []
  };

  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('Template not found');
  }

  const seedAssignmentMap = new Map(
    seedAssignments.map(sa => [sa.fieldId, sa])
  );

  for (const fieldId of fieldIds) {
    try {
      const seedAssignment = seedAssignmentMap.get(fieldId);
      if (!seedAssignment) {
        result.errors.push({
          fieldId,
          error: 'Missing seed variety assignment'
        });
        continue;
      }

      const { data: field } = await supabase
        .from('fields')
        .select('user_id')
        .eq('id', fieldId)
        .maybeSingle();

      if (!field) {
        result.errors.push({
          fieldId,
          error: 'Field not found'
        });
        continue;
      }

      if (field.user_id !== authenticatedUserId) {
        result.errors.push({
          fieldId,
          error: 'Not authorized to modify this field'
        });
        continue;
      }

      const fertilizerCost = Array.isArray(template.fertilizer_programs)
        ? (template.fertilizer_programs as ProgramReference[]).reduce(
            (sum, p) => sum + (p.cost_per_acre || 0),
            0
          )
        : 0;

      const chemicalCost = Array.isArray(template.chemical_programs)
        ? (template.chemical_programs as ProgramReference[]).reduce(
            (sum, p) => sum + (p.cost_per_acre || 0),
            0
          )
        : 0;

      const fieldCostData = {
        field_id: fieldId,
        user_id: field.user_id,
        template_id: templateId,
        seed_variety_id: seedAssignment.seedVarietyId,
        seeding_rate_override: seedAssignment.seedingRateOverride || null,
        seed_cost_per_acre: seedAssignment.seedCostPerAcre,
        fertilizer_cost_per_acre: fertilizerCost,
        chemical_cost_per_acre: chemicalCost,
        tillage_cost_per_acre: template.tillage_cost_per_acre || 0,
        planting_cost_per_acre: template.planting_cost_per_acre || 0,
        harvest_cost_per_acre: template.harvest_cost_per_acre || 0,
        equipment_cost_per_acre: template.equipment_cost_per_acre || 0,
        custom_services_cost_per_acre: template.custom_services_cost_per_acre || 0,
        labor_cost_per_acre: template.labor_cost_per_acre || 0,
        crop_insurance_cost_per_acre: template.crop_insurance_cost_per_acre || 0,
        drying_storage_per_bushel: template.drying_storage_per_bushel,
        drying_storage_cost_per_acre: template.drying_storage_cost_per_acre || 0,
        hauling_per_bushel: template.hauling_per_bushel,
        hauling_cost_per_acre: template.hauling_cost_per_acre || 0,
        other_expenses_per_acre: template.other_expenses_per_acre || 0,
        total_cost_per_acre: 0
      };

      fieldCostData.total_cost_per_acre = calculateFieldTotalCost(fieldCostData);

      await deleteAllOverrides(fieldId);

      const { error } = await supabase
        .from('field_costs')
        .upsert(fieldCostData, {
          onConflict: 'field_id'
        });

      if (error) {
        result.errors.push({
          fieldId,
          error: error.message
        });
      } else {
        result.appliedFields.push(fieldId);
      }
    } catch (err) {
      result.errors.push({
        fieldId,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

export interface ResolvedFieldCosts {
  templateId: string | null;
  costs: any;
  overrides: Map<string, any>;
}

export async function getResolvedFieldCosts(fieldId: string): Promise<ResolvedFieldCosts | null> {
  const { data: fieldCost, error } = await supabase
    .from('field_costs')
    .select('*')
    .eq('field_id', fieldId)
    .maybeSingle();

  if (error) throw error;
  if (!fieldCost) return null;

  const overrides = await getFieldOverrides(fieldId);
  const overrideMap = new Map(
    overrides.map(o => [o.cost_item_name, o.override_value])
  );

  const resolvedCosts = { ...fieldCost };

  for (const [itemName, value] of overrideMap.entries()) {
    resolvedCosts[itemName] = value;
  }

  return {
    templateId: fieldCost.template_id,
    costs: resolvedCosts,
    overrides: overrideMap
  };
}

export async function hasOverrides(fieldId: string): Promise<boolean> {
  const overrides = await getFieldOverrides(fieldId);
  return overrides.length > 0;
}

async function recalculateFieldTotal(fieldId: string): Promise<void> {
  const resolvedCosts = await getResolvedFieldCosts(fieldId);
  if (!resolvedCosts) return;

  const costs = resolvedCosts.costs;
  const newTotal = calculateFieldTotalCost(costs);

  const { error } = await supabase
    .from('field_costs')
    .update({ total_cost_per_acre: newTotal })
    .eq('field_id', fieldId);

  if (error) throw error;
}

import { calculateCostWithConversion } from './unitConversions';
import { TransactionResult, logCascadeWarning } from './transactionUtils';
import { updateTaskProgress } from './backgroundTasks';

export interface RecalculateProgramResult {
  programId: string;
  oldCost: number;
  newCost: number;
  changed: boolean;
}

export async function recalculateFertilizerProgramCost(
  programId: string,
  seasonId: string,
  taskId?: string
): Promise<RecalculateProgramResult | null> {
  try {
    const { data: program, error: programError } = await supabase
      .from('fertilizer_programs')
      .select('id, application_cost, season_id')
      .eq('id', programId)
      .maybeSingle();

    if (programError || !program) {
      console.error('Program not found:', programId);
      return null;
    }

    if (program.season_id !== seasonId && taskId) {
      await logCascadeWarning(
        taskId,
        `Program ${programId} is from different season (${program.season_id} vs ${seasonId})`
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from('fertilizer_program_items')
      .select(`
        id,
        application_rate,
        application_rate_unit,
        fertilizer_products (
          id,
          price_per_unit,
          unit_type,
          season_id
        )
      `)
      .eq('program_id', programId);

    if (itemsError) {
      console.error('Error fetching program items:', itemsError);
      return null;
    }

    let totalCostPerAcre = 0;

    for (const item of items || []) {
      const product = (item as any).fertilizer_products;
      if (!product) continue;

      if (product.season_id !== seasonId && taskId) {
        await logCascadeWarning(
          taskId,
          `Product ${product.id} in program ${programId} is from different season`
        );
      }

      const costPerAcre = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        product.price_per_unit,
        product.unit_type
      );

      totalCostPerAcre += costPerAcre;
    }

    const totalWithApplication = totalCostPerAcre + (program.application_cost || 0);
    const changed = Math.abs(totalWithApplication - totalCostPerAcre) > 0.01;

    return {
      programId,
      oldCost: totalCostPerAcre,
      newCost: totalWithApplication,
      changed
    };
  } catch (err) {
    console.error('Error recalculating fertilizer program cost:', err);
    return null;
  }
}

export async function recalculateChemicalProgramCost(
  programId: string,
  seasonId: string,
  taskId?: string
): Promise<RecalculateProgramResult | null> {
  try {
    const { data: program, error: programError } = await supabase
      .from('chemical_programs')
      .select('id, application_cost, season_id')
      .eq('id', programId)
      .maybeSingle();

    if (programError || !program) {
      console.error('Program not found:', programId);
      return null;
    }

    if (program.season_id !== seasonId && taskId) {
      await logCascadeWarning(
        taskId,
        `Program ${programId} is from different season (${program.season_id} vs ${seasonId})`
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from('chemical_program_items')
      .select(`
        id,
        application_rate,
        application_rate_unit,
        individual_chemicals (
          id,
          price_per_unit,
          unit_type,
          season_id
        )
      `)
      .eq('program_id', programId);

    if (itemsError) {
      console.error('Error fetching program items:', itemsError);
      return null;
    }

    let totalCostPerAcre = 0;

    for (const item of items || []) {
      const chemical = (item as any).individual_chemicals;
      if (!chemical) continue;

      if (chemical.season_id !== seasonId && taskId) {
        await logCascadeWarning(
          taskId,
          `Chemical ${chemical.id} in program ${programId} is from different season`
        );
      }

      const costPerAcre = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        chemical.price_per_unit,
        chemical.unit_type
      );

      totalCostPerAcre += costPerAcre;
    }

    const totalWithApplication = totalCostPerAcre + (program.application_cost || 0);
    const changed = Math.abs(totalWithApplication - totalCostPerAcre) > 0.01;

    return {
      programId,
      oldCost: totalCostPerAcre,
      newCost: totalWithApplication,
      changed
    };
  } catch (err) {
    console.error('Error recalculating chemical program cost:', err);
    return null;
  }
}

export async function cascadeProductUpdateInSeason(
  productId: string,
  productType: 'fertilizer',
  seasonId: string,
  taskId?: string
): Promise<TransactionResult<{ programsUpdated: number; templatesUpdated: number; fieldsUpdated: number }>> {
  try {
    let programsUpdated = 0;
    let templatesUpdated = 0;
    let fieldsUpdated = 0;

    const { data: programs } = await supabase
      .from('fertilizer_programs')
      .select(`
        id,
        season_id,
        fertilizer_program_items!inner (
          fertilizer_product_id
        )
      `)
      .eq('fertilizer_program_items.fertilizer_product_id', productId)
      .eq('season_id', seasonId);

    if (programs && programs.length > 0) {
      for (const program of programs) {
        const result = await recalculateFertilizerProgramCost(program.id, seasonId, taskId);
        if (result) {
          programsUpdated++;
          const cascadeResult = await cascadeProgramUpdateInSeason(
            program.id,
            'fertilizer',
            seasonId,
            taskId
          );
          if (cascadeResult.success && cascadeResult.data) {
            templatesUpdated += cascadeResult.data.templatesUpdated;
            fieldsUpdated += cascadeResult.data.fieldsUpdated;
          }
        }
      }
    }

    if (taskId) {
      await updateTaskProgress(taskId, {
        programsUpdated,
        templatesUpdated,
        fieldsUpdated,
        warnings: []
      });
    }

    return {
      success: true,
      data: { programsUpdated, templatesUpdated, fieldsUpdated }
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

export async function cascadeChemicalUpdateInSeason(
  chemicalId: string,
  seasonId: string,
  taskId?: string
): Promise<TransactionResult<{ programsUpdated: number; templatesUpdated: number; fieldsUpdated: number }>> {
  try {
    let programsUpdated = 0;
    let templatesUpdated = 0;
    let fieldsUpdated = 0;

    const { data: programs } = await supabase
      .from('chemical_programs')
      .select(`
        id,
        season_id,
        chemical_program_items!inner (
          chemical_id
        )
      `)
      .eq('chemical_program_items.chemical_id', chemicalId)
      .eq('season_id', seasonId);

    if (programs && programs.length > 0) {
      for (const program of programs) {
        const result = await recalculateChemicalProgramCost(program.id, seasonId, taskId);
        if (result) {
          programsUpdated++;
          const cascadeResult = await cascadeProgramUpdateInSeason(
            program.id,
            'chemical',
            seasonId,
            taskId
          );
          if (cascadeResult.success && cascadeResult.data) {
            templatesUpdated += cascadeResult.data.templatesUpdated;
            fieldsUpdated += cascadeResult.data.fieldsUpdated;
          }
        }
      }
    }

    if (taskId) {
      await updateTaskProgress(taskId, {
        programsUpdated,
        templatesUpdated,
        fieldsUpdated,
        warnings: []
      });
    }

    return {
      success: true,
      data: { programsUpdated, templatesUpdated, fieldsUpdated }
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

export async function cascadeProgramUpdateInSeason(
  programId: string,
  programType: 'fertilizer' | 'chemical',
  seasonId: string,
  taskId?: string
): Promise<TransactionResult<{ templatesUpdated: number; fieldsUpdated: number }>> {
  try {
    let templatesUpdated = 0;
    let fieldsUpdated = 0;

    const programField = programType === 'fertilizer' ? 'fertilizer_programs' : 'chemical_programs';

    const { data: templates } = await supabase
      .from('cost_templates')
      .select('id, ' + programField + ', season_id')
      .eq('season_id', seasonId);

    if (!templates) {
      return { success: true, data: { templatesUpdated: 0, fieldsUpdated: 0 } };
    }

    const recalcResult = programType === 'fertilizer'
      ? await recalculateFertilizerProgramCost(programId, seasonId, taskId)
      : await recalculateChemicalProgramCost(programId, seasonId, taskId);

    if (!recalcResult) {
      return { success: true, data: { templatesUpdated: 0, fieldsUpdated: 0 } };
    }

    for (const template of templates) {
      const programs = template[programField] as any[];
      if (!programs || !Array.isArray(programs)) continue;

      const programRef = programs.find((p: any) => p.program_id === programId);
      if (!programRef) continue;

      if (template.season_id !== seasonId && taskId) {
        await logCascadeWarning(
          taskId,
          `Template ${template.id} is from different season`
        );
        continue;
      }

      programRef.cost_per_acre = recalcResult.newCost;

      const { error } = await supabase
        .from('cost_templates')
        .update({ [programField]: programs })
        .eq('id', template.id);

      if (!error) {
        templatesUpdated++;

        const cascadeResult = await cascadeTemplateUpdateInSeason(template.id, seasonId, taskId);
        if (cascadeResult.success && cascadeResult.data) {
          fieldsUpdated += cascadeResult.data.fieldsUpdated;
        }
      }
    }

    if (taskId) {
      await updateTaskProgress(taskId, {
        programsUpdated: 0,
        templatesUpdated,
        fieldsUpdated,
        warnings: []
      });
    }

    return {
      success: true,
      data: { templatesUpdated, fieldsUpdated }
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

export async function cascadeTemplateUpdateInSeason(
  templateId: string,
  seasonId: string,
  taskId?: string
): Promise<TransactionResult<{ fieldsUpdated: number }>> {
  try {
    const { data: template } = await supabase
      .from('cost_templates')
      .select('*')
      .eq('id', templateId)
      .eq('season_id', seasonId)
      .maybeSingle();

    if (!template) {
      return { success: true, data: { fieldsUpdated: 0 } };
    }

    const result = await cascadeTemplateUpdate(templateId, template);

    return {
      success: true,
      data: { fieldsUpdated: result.fullyUpdatedFields + result.partiallyUpdatedFields }
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}
