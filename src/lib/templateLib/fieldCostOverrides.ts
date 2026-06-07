import { supabase } from '../supabase';
import { Database, Json } from '../database.types';
import { ProgramReference } from './templateCrud';
import { calculateFieldTotalCost } from './templateCalculations';

type FieldCostOverride = Database['public']['Tables']['field_cost_overrides']['Row'];

export type OverrideValue = number | ProgramReference[];

export interface FieldCostValues {
  seed_cost_per_acre: number;
  fertilizer_cost_per_acre: number;
  chemical_cost_per_acre: number;
  tillage_cost_per_acre: number;
  planting_cost_per_acre: number;
  harvest_cost_per_acre: number;
  equipment_cost_per_acre: number;
  custom_services_cost_per_acre: number;
  labor_cost_per_acre: number;
  crop_insurance_cost_per_acre: number;
  drying_storage_cost_per_acre: number;
  hauling_cost_per_acre: number;
  other_expenses_per_acre: number;
  total_cost_per_acre: number;
  [key: string]: unknown;
}

export interface ResolvedFieldCosts {
  templateId: string | null;
  costs: FieldCostValues;
  overrides: Map<string, OverrideValue>;
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
  overrideValue: OverrideValue
): Promise<FieldCostOverride> {
  if (typeof overrideValue !== 'number' && !Array.isArray(overrideValue)) {
    throw new Error(`Invalid override value for "${costItemName}": must be a number or ProgramReference array.`);
  }
  const { data, error } = await supabase
    .from('field_cost_overrides')
    .upsert(
      { field_id: fieldId, cost_item_name: costItemName, override_value: overrideValue as unknown as Json },
      { onConflict: 'field_id,cost_item_name' }
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

export async function getResolvedFieldCosts(fieldId: string): Promise<ResolvedFieldCosts | null> {
  const { data: fieldCost, error } = await supabase
    .from('field_costs')
    .select('*')
    .eq('field_id', fieldId)
    .maybeSingle();

  if (error) throw error;
  if (!fieldCost) return null;

  const overrides = await getFieldOverrides(fieldId);
  const overrideMap = new Map<string, OverrideValue>(
    overrides.map((o) => [o.cost_item_name, o.override_value as unknown as OverrideValue])
  );

  const resolvedCosts = { ...fieldCost } as unknown as FieldCostValues;
  for (const [itemName, value] of overrideMap.entries()) {
    (resolvedCosts as Record<string, unknown>)[itemName] = value;
  }

  return {
    templateId: fieldCost.template_id,
    costs: resolvedCosts,
    overrides: overrideMap,
  };
}

export async function hasOverrides(fieldId: string): Promise<boolean> {
  const overrides = await getFieldOverrides(fieldId);
  return overrides.length > 0;
}

async function recalculateFieldTotal(fieldId: string): Promise<void> {
  const resolvedCosts = await getResolvedFieldCosts(fieldId);
  if (!resolvedCosts) return;

  const newTotal = calculateFieldTotalCost(resolvedCosts.costs);

  const { error } = await supabase
    .from('field_costs')
    .update({ total_cost_per_acre: newTotal })
    .eq('field_id', fieldId);

  if (error) throw error;
}
