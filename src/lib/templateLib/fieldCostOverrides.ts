import { supabase } from '../supabase';
import { Database } from '../database.types';
import { ProgramReference } from './templateCrud';
import { calculateFieldTotalCost } from './templateCalculations';

type FieldCostOverride = Database['public']['Tables']['field_cost_overrides']['Row'];

export type OverrideValue = number | ProgramReference[];

export interface ResolvedFieldCosts {
  templateId: string | null;
  costs: Record<string, unknown>;
  overrides: Map<string, unknown>;
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
      { field_id: fieldId, cost_item_name: costItemName, override_value: overrideValue },
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
  const overrideMap = new Map(overrides.map((o) => [o.cost_item_name, o.override_value]));

  const resolvedCosts: Record<string, unknown> = { ...fieldCost };
  for (const [itemName, value] of overrideMap.entries()) {
    resolvedCosts[itemName] = value;
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
