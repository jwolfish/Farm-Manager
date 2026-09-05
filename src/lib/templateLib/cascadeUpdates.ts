import { supabase } from '../supabase';
import { TransactionResult, logCascadeWarning } from '../transactionUtils';
import { getFieldsUsingTemplate, ProgramReference } from './templateCrud';
import {
  applyFieldCostOverrides,
  calculateFieldTotalCost,
  refreshProgramCostInRefs,
} from './templateCalculations';
import { recalculateFertilizerProgramCost, recalculateChemicalProgramCost } from './programCosts';
import { recalculateFieldTotal } from './fieldCostOverrides';
import { Database, Json } from '../database.types';

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

  /*
   * The VALUE is kept, not just the presence of a row.
   *
   * This map was previously `Map<string, boolean>` — enough to decide which columns to
   * skip writing, but not enough to total the field correctly, because an override does
   * not live in the field_costs column it names. See applyFieldCostOverrides.
   */
  const overridesByField = new Map<string, Map<string, unknown>>();
  for (const override of overridesResult.data || []) {
    if (!overridesByField.has(override.field_id)) {
      overridesByField.set(override.field_id, new Map());
    }
    overridesByField.get(override.field_id)!.set(override.cost_item_name, override.override_value);
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
      const overrideMap = overridesByField.get(fieldId) || new Map<string, unknown>();
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
        /*
         * The total must be computed from the RESOLVED costs — the template values with
         * the user's overrides laid over them — not from the raw columns.
         *
         * Without applyFieldCostOverrides this line reverted the total to the pure
         * template figure while every line item on screen still showed the override,
         * and no error was raised anywhere. It is the same rule recalculateFieldTotal
         * in fieldCostOverrides.ts already follows; the cascade simply never did.
         */
        updates.total_cost_per_acre = calculateFieldTotalCost(
          applyFieldCostOverrides({ ...currentFieldCost, ...updates }, overrideMap)
        );
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

/**
 * Refresh the frozen `cost_per_acre` inside program-shaped field overrides — V-0, defect 2.
 *
 * A field may carry its own program list in `field_cost_overrides` under
 * 'fertilizer_programs' / 'chemical_programs', as a ProgramReference[] with a cost baked
 * into each entry. `cascadeProgramUpdateInSeason` walked `cost_templates` and nothing else,
 * so those costs were a snapshot taken when the override was written: a price change moved
 * every template-driven field and left every overridden one stale, silently and in money.
 *
 * The array shape has no UI writer today and production holds zero rows of it, so this has
 * never fired. Per-field fertilizer rates write one for every custom-rated field, and a
 * fertilizer booking changes prices — which is exactly when this would have gone wrong.
 *
 * Reads fail loudly (WI-15): a swallowed error here is indistinguishable from "no field
 * overrides this program", which is the reading that leaves the money wrong.
 *
 * Mirrored in supabase/functions/process-cascade-task/index.ts — guardrail 7.
 */
async function refreshProgramOverridesInSeason(
  programId: string,
  programField: 'fertilizer_programs' | 'chemical_programs',
  seasonId: string,
  newCost: number,
  taskId?: string
): Promise<number> {
  const { data: fields, error: fieldsError } = await supabase
    .from('fields')
    .select('id')
    .eq('season_id', seasonId);

  if (fieldsError) {
    throw new Error(`Could not load fields for season ${seasonId}: ${fieldsError.message}`);
  }

  const fieldIds = (fields ?? []).map((f) => f.id);
  if (fieldIds.length === 0) return 0;

  const { data: overrides, error: overridesError } = await supabase
    .from('field_cost_overrides')
    .select('field_id, override_value')
    .eq('cost_item_name', programField)
    .in('field_id', fieldIds);

  if (overridesError) {
    throw new Error(`Could not load ${programField} overrides: ${overridesError.message}`);
  }

  let fieldsUpdated = 0;

  for (const override of overrides ?? []) {
    const refresh = refreshProgramCostInRefs(override.override_value, programId, newCost);
    if (!refresh || !refresh.changed) continue;

    const previous = (override.override_value as unknown as ProgramReference[]).find(
      (r) => r?.program_id === programId
    );

    const { error: writeError } = await supabase
      .from('field_cost_overrides')
      .update({ override_value: refresh.refs as unknown as Json })
      .eq('field_id', override.field_id)
      .eq('cost_item_name', programField);

    if (writeError) {
      throw new Error(
        `Could not refresh ${programField} override on field ${override.field_id}: ${writeError.message}`
      );
    }

    // The override moved, so the field's total must move with it. Doing this here rather
    // than leaving it to the template cascade covers a field whose override survives
    // without a template link.
    await recalculateFieldTotal(override.field_id);
    fieldsUpdated++;

    if (taskId) {
      await logCascadeWarning(
        taskId,
        `Refreshed ${programField} override on field ${override.field_id}: ` +
          `${Number(previous?.cost_per_acre ?? 0).toFixed(2)} → ${newCost.toFixed(2)}`
      );
    }
  }

  return fieldsUpdated;
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

    /*
     * Field overrides are refreshed BEFORE the template loop, so that the
     * cascadeTemplateUpdate below reads the new override values when it re-totals each
     * field rather than the snapshot it is replacing.
     *
     * Its count is deliberately NOT added to `fieldsUpdated`: an overridden field is
     * normally also a template field and would be counted twice. WI-15 removed a count
     * that reported work never done; inflating one is the same lie in the other
     * direction. The refreshes are recorded as task warnings instead.
     */
    await refreshProgramOverridesInSeason(programId, programField, seasonId, recalcResult.newCost, taskId);

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
