import { Database } from '../database.types';
import { ProgramReference } from './templateCrud';

type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];

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

/*
 * A field cost override lives in `field_cost_overrides`, NOT in the `field_costs`
 * column it names. `field_costs.hauling_cost_per_acre` holds the value inherited from
 * the template; `field_cost_overrides.override_value` holds what the user actually
 * typed, and `getResolvedFieldCosts` lays the second over the first for display.
 *
 * Anything that TOTALS a field must lay them over in the same way, or the total silently
 * reverts to the template figure while every individual line on screen still shows the
 * override. That is exactly what the cascade did, on nine real fields, for six months:
 * `calculateFieldTotalCost({ ...fieldCostRow, ...templateUpdates })` never consulted the
 * override table at all. Six fields were understated by ~$24/ac and three overstated by
 * $10-$20/ac, with nothing on screen to indicate it.
 *
 * Two shapes exist, because `OverrideValue = number | ProgramReference[]`:
 *   - a number keyed by its own column name  ('hauling_cost_per_acre': 70)
 *   - a program array keyed by the template's program field
 *     ('chemical_programs': [{program_id, cost_per_acre}, ...]), which resolves to the
 *     matching *_cost_per_acre column as a sum, the same way calculateTemplateCost
 *     treats the template's own program arrays.
 *
 * Mirrored in supabase/functions/process-cascade-task/index.ts — guardrail 7.
 */
const PROGRAM_OVERRIDE_TARGET: Record<string, string> = {
  fertilizer_programs: 'fertilizer_cost_per_acre',
  chemical_programs: 'chemical_cost_per_acre',
};

export function applyFieldCostOverrides(
  fieldCost: Record<string, unknown>,
  overrides: ReadonlyMap<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!overrides || overrides.size === 0) return { ...fieldCost };

  const resolved = { ...fieldCost };

  for (const [itemName, value] of overrides) {
    if (Array.isArray(value)) {
      const target = PROGRAM_OVERRIDE_TARGET[itemName];
      // An array under any other key has no cost column to land in. Ignoring it is
      // correct: inventing one would put a number into a total nobody can trace.
      if (!target) continue;
      resolved[target] = (value as Array<{ cost_per_acre?: number }>).reduce(
        (sum, p) => sum + Number(p?.cost_per_acre || 0),
        0
      );
      continue;
    }

    const numeric = Number(value);
    // A null, a blank, or anything non-numeric is not an override anyone can total.
    // Leave the template value standing rather than turning the field into NaN.
    if (value === null || value === '' || !Number.isFinite(numeric)) continue;

    resolved[itemName] = numeric;
  }

  return resolved;
}

export function calculateFieldTotalCost(fieldCost: Record<string, unknown>): number {
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
