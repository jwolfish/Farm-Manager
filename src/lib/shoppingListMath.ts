import { convertProductUnits, describeConversionFailure } from './unitConversions';

/**
 * Pure accumulation for shopping-list generation — WI-12.
 *
 * Kept free of Supabase imports so it can be unit-tested directly. The old code
 * added every program's raw quantity into one running total and converted once
 * at the end using whichever unit happened to be seen first, so a chemical
 * applied at 2 qt/ac in one program and 16 fl oz/ac in another produced a total
 * that was neither. Here the canonical unit is resolved up front and each
 * contribution is converted on the way in.
 */

export interface NeedContribution {
  /** Application rate, per acre, in `rateUnit`. */
  rate: number;
  rateUnit: string;
  acreage: number;
}

export interface AccumulatedNeed {
  /** Running total expressed in `unit`. Excludes any contribution that failed. */
  total: number;
  /** The canonical unit the total is expressed in. */
  unit: string;
  /**
   * One entry per contribution that could not be converted. A non-empty list
   * means `total` is an undercount and the line must be flagged to the user
   * rather than presented as a purchase quantity.
   */
  issues: string[];
}

/**
 * Accumulate per-acre contributions into a single total.
 *
 * @param contributions every program/field pairing that needs this product
 * @param preferredUnit the linked master product's unit_type, when there is
 *   one. Falls back to the first contribution's rate unit.
 * @param densityLbPerGal per the three-case convention on
 *   `convertProductUnits`: omit for chemicals and seed, pass
 *   `product.density_lb_per_gal ?? null` for fertilizer. A liquid fertilizer
 *   applied in gallons and bought by the ton needs it to accumulate at all.
 */
export function accumulateNeed(
  contributions: NeedContribution[],
  preferredUnit: string | null,
  densityLbPerGal?: number | null
): AccumulatedNeed {
  const firstRateUnit = contributions.find((c) => c.rateUnit !== '')?.rateUnit ?? '';
  const unit = preferredUnit != null && preferredUnit !== '' ? preferredUnit : firstRateUnit;

  let total = 0;
  const issues: string[] = [];

  for (const contribution of contributions) {
    const amount = contribution.rate * contribution.acreage;

    if (!Number.isFinite(amount)) {
      issues.push(
        `${contribution.rate} ${contribution.rateUnit}/ac over ${contribution.acreage} ac is not a usable number`
      );
      continue;
    }

    const converted = convertProductUnits(
      contribution.rateUnit,
      unit,
      amount,
      densityLbPerGal
    );
    if (!converted.ok) {
      issues.push(describeConversionFailure(converted));
      continue;
    }

    total += converted.value;
  }

  return { total, unit, issues };
}

/** Purchase quantity after subtracting stock on hand, never below zero. */
export function neededAfterOnHand(total: number, onHand: number): number {
  return Math.max(0, total - onHand);
}
