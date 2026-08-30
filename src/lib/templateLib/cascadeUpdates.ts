import { supabase } from '../supabase';
import { TransactionResult, logCascadeWarning } from '../transactionUtils';
import { getFieldsUsingTemplate } from './templateCrud';
import { calculateFieldTotalCost } from './templateCalculations';
import { recalculateFertilizerProgramCost, recalculateChemicalProgramCost } from './programCosts';
import { Database } from '../database.types';

type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];

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
    errors: [],
  };

  if (fieldsUsingTemplate.length === 0) return result;

  const fieldIds = fieldsUsingTemplate.map((f) => f.field_id);

  const [overridesResult, fieldCostsResult] = await Promise.all([
    supabase.from('field_cost_overrides').select('*').in('field_id', fieldIds),
    supabase.from('field_costs').select('*').in('field_id', fieldIds),
  ]);

  // Both reads must succeed before anything is written.
  //
  // overridesResult is the ONLY thing stopping this cascade from overwriting a field's
  // manually-overridden costs. Treating a failed read as "no overrides" — which is what
  // `|| []` did below — silently replaced every override with the template value, with
  // no error anywhere. Refuse the whole cascade instead, on the same all-or-nothing
  // rule applyWorkOrder uses (WI-11): a partial cascade leaves plausible wrong numbers.
  if (overridesResult.error) {
    throw new Error(`Cascade aborted: could not load field cost overrides (${overridesResult.error.message})`);
  }
  if (fieldCostsResult.error) {
    throw new Error(`Cascade aborted: could not load field costs (${fieldCostsResult.error.message})`);
  }

  const overridesByField = new Map<string, Map<string, boolean>>();
  for (const override of overridesResult.data || []) {
    if (!overridesByField.has(override.field_id)) {
      overridesByField.set(override.field_id, new Map());
    }
    overridesByField.get(override.field_id)!.set(override.cost_item_name, true);
  }

  const fieldCostsByField = new Map<string, Record<string, unknown>>();
  for (const fc of fieldCostsResult.data || []) {
    fieldCostsByField.set(fc.field_id, fc as Record<string, unknown>);
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
    'other_expenses_per_acre',
  ];

  const fertilizerCost = Array.isArray(updatedTemplate.fertilizer_programs)
    ? (updatedTemplate.fertilizer_programs as Array<{ cost_per_acre: number }>).reduce((sum, p) => sum + (p.cost_per_acre || 0), 0)
    : 0;

  const chemicalCost = Array.isArray(updatedTemplate.chemical_programs)
    ? (updatedTemplate.chemical_programs as Array<{ cost_per_acre: number }>).reduce((sum, p) => sum + (p.cost_per_acre || 0), 0)
    : 0;

  const updatePromises: Promise<void>[] = [];

  for (const fieldData of fieldsUsingTemplate) {
    try {
      const fieldId = fieldData.field_id;
      const overrideMap = overridesByField.get(fieldId) || new Map<string, boolean>();
      const currentFieldCost = fieldCostsByField.get(fieldId);

      if (overrideMap.size > 0) {
        result.partiallyUpdatedFields++;
      } else {
        result.fullyUpdatedFields++;
      }

      const updates: Record<string, unknown> = {};

      if (!overrideMap.has('fertilizer_programs')) {
        updates.fertilizer_cost_per_acre = fertilizerCost;
      }
      if (!overrideMap.has('chemical_programs')) {
        updates.chemical_cost_per_acre = chemicalCost;
      }
      for (const field of costFields) {
        if (!overrideMap.has(field)) {
          updates[field] = (updatedTemplate as Record<string, unknown>)[field] || 0;
        }
      }

      if (currentFieldCost) {
        updates.total_cost_per_acre = calculateFieldTotalCost({ ...currentFieldCost, ...updates });
      }

      updatePromises.push(
        supabase
          .from('field_costs')
          .update(updates)
          .eq('field_id', fieldId)
          .then(({ error }) => {
            if (error) {
              result.errors.push({ fieldId, error: error.message });
            }
          })
      );
    } catch (err) {
      result.errors.push({
        fieldId: fieldData.field_id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  await Promise.all(updatePromises);
  return result;
}

export async function cascadeTemplateUpdateInSeason(
  templateId: string,
  seasonId: string,
  taskId?: string
): Promise<TransactionResult<{ fieldsUpdated: number }>> {
  try {
    const { data: template, error: templateError } = await supabase
      .from('cost_templates')
      .select('*')
      .eq('id', templateId)
      .eq('season_id', seasonId)
      .maybeSingle();

    // A failed read is not the same as "no such template". Dropping this error
    // reported a cascade that never ran as one that ran and found nothing to do.
    if (templateError) {
      return { success: false, error: `Could not load template ${templateId}: ${templateError.message}` };
    }

    if (!template) return { success: true, data: { fieldsUpdated: 0 } };

    const result = await cascadeTemplateUpdate(templateId, template);
    return {
      success: true,
      data: { fieldsUpdated: result.fullyUpdatedFields + result.partiallyUpdatedFields },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
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

    const { data: templates, error: templatesError } = await supabase
      .from('cost_templates')
      .select('id, ' + programField + ', season_id')
      .eq('season_id', seasonId);

    // As above: a failed read must not be reported as "no templates to update".
    if (templatesError) {
      return { success: false, error: `Could not load templates for season ${seasonId}: ${templatesError.message}` };
    }

    if (!templates) return { success: true, data: { templatesUpdated: 0, fieldsUpdated: 0 } };

    let storedProgramCost: number | undefined;
    for (const template of templates) {
      const programs = (template as Record<string, unknown>)[programField] as Array<{ program_id: string; cost_per_acre: number }> | null;
      if (!programs || !Array.isArray(programs)) continue;
      const ref = programs.find((p) => p.program_id === programId);
      if (ref && typeof ref.cost_per_acre === 'number') {
        storedProgramCost = ref.cost_per_acre;
        break;
      }
    }

    const recalcResult = programType === 'fertilizer'
      ? await recalculateFertilizerProgramCost(programId, seasonId, taskId, storedProgramCost)
      : await recalculateChemicalProgramCost(programId, seasonId, taskId, storedProgramCost);

    if (!recalcResult) return { success: true, data: { templatesUpdated: 0, fieldsUpdated: 0 } };

    for (const template of templates) {
      const programs = (template as Record<string, unknown>)[programField] as Array<{ program_id: string; cost_per_acre: number }> | null;
      if (!programs || !Array.isArray(programs)) continue;

      const programRef = programs.find((p) => p.program_id === programId);
      if (!programRef) continue;

      if ((template as Record<string, unknown>).season_id !== seasonId && taskId) {
        await logCascadeWarning(taskId, `Template ${template.id} is from different season`);
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

    return { success: true, data: { templatesUpdated, fieldsUpdated } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
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

    const { data: programs, error: programsError } = await supabase
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

    // Without this, a failed read looked identical to "no program uses this product",
    // and the price change silently failed to propagate.
    if (programsError) {
      return { success: false, error: `Could not load fertilizer programs for product ${productId}: ${programsError.message}` };
    }

    if (programs && programs.length > 0) {
      for (const program of programs) {
        const result = await recalculateFertilizerProgramCost(program.id, seasonId, taskId);
        if (result) {
          programsUpdated++;
          const cascadeResult = await cascadeProgramUpdateInSeason(program.id, 'fertilizer', seasonId, taskId);
          if (cascadeResult.success && cascadeResult.data) {
            templatesUpdated += cascadeResult.data.templatesUpdated;
            fieldsUpdated += cascadeResult.data.fieldsUpdated;
          }
        }
      }
    }

    return { success: true, data: { programsUpdated, templatesUpdated, fieldsUpdated } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
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

    const { data: programs, error: programsError } = await supabase
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

    // As with the fertilizer path: a failed read must not read as "nothing uses this".
    if (programsError) {
      return { success: false, error: `Could not load chemical programs for chemical ${chemicalId}: ${programsError.message}` };
    }

    if (programs && programs.length > 0) {
      for (const program of programs) {
        const result = await recalculateChemicalProgramCost(program.id, seasonId, taskId);
        if (result) {
          programsUpdated++;
          const cascadeResult = await cascadeProgramUpdateInSeason(program.id, 'chemical', seasonId, taskId);
          if (cascadeResult.success && cascadeResult.data) {
            templatesUpdated += cascadeResult.data.templatesUpdated;
            fieldsUpdated += cascadeResult.data.fieldsUpdated;
          }
        }
      }
    }

    return { success: true, data: { programsUpdated, templatesUpdated, fieldsUpdated } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
