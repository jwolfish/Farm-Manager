/**
 * WI-17 — how a crop's recorded sales are split between the fields that grew it.
 *
 * Sales are recorded per crop, not per field, so a field-level revenue figure is always
 * an allocation. It used to be by ACREAGE alone, which credited a field that yielded
 * nothing with the same revenue per acre as the best field on the farm. The PRD's test
 * case: two 100-acre corn fields at 200 and 0 bu/ac — all of the revenue belongs to the
 * first, and acreage gave each half.
 *
 * The rule, in order:
 *
 *   1. Weight each field by its bushels — `yield_bushels_per_acre × acreage`. That column
 *      is "the best number available" (Harvest-Tracker-Design §4.1): the actual once a
 *      field is cut, the estimate while it stands. So mid-harvest this blends the two,
 *      exactly as cost per bushel on the dashboard does.
 *   2. A field with NO yield on record is credited at the crop's average yield per acre,
 *      never at zero. Reading a missing number as zero is the WI-15 lie in its quiet
 *      direction, and the harvest tracker refuses to do it for the same reason. It is
 *      reported in `imputedFieldIds` so a screen can say so.
 *   3. If no field in the crop has a usable yield — or every recorded yield is zero —
 *      fall back to acreage, which is what this code always did.
 *
 * Whatever the basis, the shares sum to `totalRevenue` (to float precision), so the
 * field-level report still reconciles to recorded sales.
 */

export interface RevenueAllocationField {
  fieldId: string;
  acreage: number;
  /** `field_yields.yield_bushels_per_acre`, or null when the field has no yield row. */
  yieldPerAcre: number | null;
}

export type RevenueAllocationBasis = 'bushels' | 'acreage';

export interface RevenueAllocation {
  basis: RevenueAllocationBasis;
  /** Dollars credited to each field. Fields with no acreage get 0. */
  revenueByField: Map<string, number>;
  /** Fields credited at the crop's average yield because they have none of their own. */
  imputedFieldIds: string[];
}

function usableAcreage(field: RevenueAllocationField): number {
  return Number.isFinite(field.acreage) && field.acreage > 0 ? field.acreage : 0;
}

function hasYield(field: RevenueAllocationField): field is RevenueAllocationField & { yieldPerAcre: number } {
  return field.yieldPerAcre !== null && Number.isFinite(field.yieldPerAcre) && field.yieldPerAcre >= 0;
}

export function allocateCropRevenue(
  totalRevenue: number,
  fields: RevenueAllocationField[]
): RevenueAllocation {
  let knownBushels = 0;
  let knownAcres = 0;
  for (const field of fields) {
    const acres = usableAcreage(field);
    if (acres > 0 && hasYield(field)) {
      knownBushels += field.yieldPerAcre * acres;
      knownAcres += acres;
    }
  }

  const byBushels = knownBushels > 0;
  const averageYield = byBushels ? knownBushels / knownAcres : 0;
  const imputedFieldIds: string[] = [];

  const weights = fields.map((field) => {
    const acres = usableAcreage(field);
    if (!byBushels) return acres;
    if (acres === 0) return 0;
    if (hasYield(field)) return field.yieldPerAcre * acres;
    imputedFieldIds.push(field.fieldId);
    return averageYield * acres;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const revenueByField = new Map<string, number>();
  fields.forEach((field, i) => {
    revenueByField.set(field.fieldId, totalWeight > 0 ? (totalRevenue * weights[i]) / totalWeight : 0);
  });

  return { basis: byBushels ? 'bushels' : 'acreage', revenueByField, imputedFieldIds };
}

/** Shown under the field-level revenue reports, so the rule is stated where it is used. */
export const REVENUE_ALLOCATION_NOTE =
  'Where a crop has recorded sales, its revenue is split between fields by bushels — ' +
  'yield per acre × acres, using the actual where a field is harvested and the estimate ' +
  'where it is not. A field with no yield on record is credited at the crop average; ' +
  'with no yields on record at all, revenue is split by acres.';
