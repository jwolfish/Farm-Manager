import { supabase } from './supabase';
import type { FieldCustomisation } from './fieldCustomisation';

/**
 * Count what each field would lose — U-2, the reading half of `fieldCustomisation.ts`.
 *
 * Both tables are counted for the same set of fields in one round trip each. Reading only
 * `field_cost_overrides` would clear a field that carries rates and no override, which is
 * exactly the two-table mistake this feature has already made three times in both
 * directions.
 *
 * A failed read THROWS. Returning empty counts would present a field with three rates as
 * having nothing to lose, and the warning would then be a confirmation dialog reassuring
 * someone on their way to deleting the thing it exists to protect.
 */
export async function loadFieldCustomisations(
  fields: readonly { id: string; name: string }[]
): Promise<FieldCustomisation[]> {
  if (fields.length === 0) return [];

  const ids = fields.map((f) => f.id);

  const [overrideRes, rateRes] = await Promise.all([
    supabase.from('field_cost_overrides').select('field_id').in('field_id', ids),
    supabase.from('field_fertilizer_rates').select('field_id').in('field_id', ids),
  ]);

  if (overrideRes.error) {
    throw new Error(`Could not check custom values: ${overrideRes.error.message}`);
  }
  if (rateRes.error) {
    throw new Error(`Could not check custom fertilizer rates: ${rateRes.error.message}`);
  }

  const overrideCounts = new Map<string, number>();
  for (const row of overrideRes.data ?? []) {
    overrideCounts.set(row.field_id, (overrideCounts.get(row.field_id) ?? 0) + 1);
  }

  const rateCounts = new Map<string, number>();
  for (const row of rateRes.data ?? []) {
    rateCounts.set(row.field_id, (rateCounts.get(row.field_id) ?? 0) + 1);
  }

  return fields.map((f) => ({
    fieldId: f.id,
    fieldName: f.name,
    overrideCount: overrideCounts.get(f.id) ?? 0,
    rateCount: rateCounts.get(f.id) ?? 0,
  }));
}
