import { supabase } from '../supabase';
import { getTemplate, ProgramReference } from './templateCrud';
import { calculateFieldTotalCost } from './templateCalculations';
import { deleteAllOverrides } from './fieldCostOverrides';

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
    errors: [],
  };

  const template = await getTemplate(templateId);
  if (!template) throw new Error('Template not found');

  const seedAssignmentMap = new Map(seedAssignments.map((sa) => [sa.fieldId, sa]));

  const { data: fieldsData } = await supabase
    .from('fields')
    .select('id, user_id')
    .in('id', fieldIds);

  const fieldOwnershipMap = new Map<string, string>(
    (fieldsData || []).map((f) => [f.id, f.user_id])
  );

  const fertilizerCost = Array.isArray(template.fertilizer_programs)
    ? (template.fertilizer_programs as ProgramReference[]).reduce((sum, p) => sum + (p.cost_per_acre || 0), 0)
    : 0;

  const chemicalCost = Array.isArray(template.chemical_programs)
    ? (template.chemical_programs as ProgramReference[]).reduce((sum, p) => sum + (p.cost_per_acre || 0), 0)
    : 0;

  const fieldCostUpserts: Record<string, unknown>[] = [];
  const deleteOverridePromises: Promise<void>[] = [];

  for (const fieldId of fieldIds) {
    try {
      const seedAssignment = seedAssignmentMap.get(fieldId);
      if (!seedAssignment) {
        result.errors.push({ fieldId, error: 'Missing seed variety assignment' });
        continue;
      }

      const fieldUserId = fieldOwnershipMap.get(fieldId);
      if (!fieldUserId) {
        result.errors.push({ fieldId, error: 'Field not found' });
        continue;
      }

      if (fieldUserId !== authenticatedUserId) {
        result.errors.push({ fieldId, error: 'Not authorized to modify this field' });
        continue;
      }

      const fieldCostData: Record<string, unknown> = {
        field_id: fieldId,
        user_id: fieldUserId,
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
        drying_storage_per_bushel: (template as Record<string, unknown>).drying_storage_per_bushel ?? null,
        drying_storage_cost_per_acre: template.drying_storage_cost_per_acre || 0,
        hauling_per_bushel: (template as Record<string, unknown>).hauling_per_bushel ?? null,
        hauling_cost_per_acre: template.hauling_cost_per_acre || 0,
        other_expenses_per_acre: template.other_expenses_per_acre || 0,
        total_cost_per_acre: 0,
      };
      fieldCostData.total_cost_per_acre = calculateFieldTotalCost(fieldCostData);
      fieldCostUpserts.push(fieldCostData);

      deleteOverridePromises.push(deleteAllOverrides(fieldId));
      result.appliedFields.push(fieldId);
    } catch (err) {
      result.errors.push({
        fieldId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  if (deleteOverridePromises.length > 0) await Promise.all(deleteOverridePromises);

  if (fieldCostUpserts.length > 0) {
    const { error } = await supabase
      .from('field_costs')
      .upsert(fieldCostUpserts as Parameters<typeof supabase.from>[0] extends never ? never : any[], { onConflict: 'field_id' });

    if (error) {
      for (const row of fieldCostUpserts) {
        result.appliedFields = result.appliedFields.filter((id) => id !== row.field_id);
        result.errors.push({ fieldId: row.field_id as string, error: error.message });
      }
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
