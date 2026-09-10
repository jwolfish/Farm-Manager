/**
 * Seed cost per acre — the one implementation.
 *
 * This arithmetic existed once, as a private `calculateSeedCost` inside
 * `SeedVarietyAssignment.tsx`, reachable only from the template wizard. U-1 adds a second
 * caller (the per-field seed editor), and two copies of the number that becomes
 * `field_costs.seed_cost_per_acre` is precisely the shape guardrail 7 is about. So it is
 * extracted here, pure and tested, and the wizard was rewired onto it rather than left
 * holding its own copy.
 *
 * THE RESULT TYPE IS THE CHANGE WORTH NOTING. The original returned `0` when
 * `units_per_bag` was missing or zero — a silent, plausible, wrong number, and $0/acre for
 * seed reads as a real answer rather than as a failure. It follows WI-11's `ConversionResult`
 * instead: a caller that cannot compute a cost has to say so. The wizard still SAVES 0 in
 * that case, so its stored behaviour is unchanged; it now shows why.
 */

export interface SeedVarietyCostInputs {
  /** Price for one unit — a bag, normally. */
  pricePerUnit: number;
  /** Seeds in a bag. Null or zero on a variety nobody has finished setting up. */
  unitsPerBag: number | null;
  /** For the message only. */
  productName?: string;
}

export type SeedCostResult =
  | { ok: true; costPerAcre: number; bagsPerAcre: number }
  | { ok: false; reason: SeedCostIssue };

export type SeedCostIssue = 'no-rate' | 'invalid-rate' | 'no-units-per-bag' | 'no-price';

/**
 * Cost per acre from a seeding rate in seeds/acre.
 *
 * `bagsPerAcre = rate / units_per_bag`, `cost = bags × price`. A rate of exactly 0 is
 * refused as `no-rate` rather than costed at $0: planting nothing is expressed by leaving
 * the field unassigned, not by a zero rate, and the two must not look alike.
 */
export function calculateSeedCostPerAcre(
  variety: SeedVarietyCostInputs,
  seedingRate: number | null
): SeedCostResult {
  if (seedingRate === null) return { ok: false, reason: 'no-rate' };
  if (!Number.isFinite(seedingRate) || seedingRate <= 0) {
    return { ok: false, reason: seedingRate === 0 ? 'no-rate' : 'invalid-rate' };
  }

  const unitsPerBag = variety.unitsPerBag;
  if (unitsPerBag === null || !Number.isFinite(unitsPerBag) || unitsPerBag <= 0) {
    return { ok: false, reason: 'no-units-per-bag' };
  }

  const price = variety.pricePerUnit;
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, reason: 'no-price' };
  }

  const bagsPerAcre = seedingRate / unitsPerBag;
  return { ok: true, bagsPerAcre, costPerAcre: bagsPerAcre * price };
}

/**
 * A sentence naming the fix, in the WI-11 style — never a bare "invalid".
 *
 * The product name is included where the caller has it, because the wizard shows several
 * fields at once and "a variety" is not enough to act on.
 */
export function describeSeedCostIssue(reason: SeedCostIssue, productName?: string): string {
  const name = productName ? `${productName}: ` : '';
  switch (reason) {
    case 'no-rate':
      return `${name}enter a seeding rate`;
    case 'invalid-rate':
      return `${name}the seeding rate must be a positive number`;
    case 'no-units-per-bag':
      return `${name}set seeds per bag on this variety in Products → Seeds before it can be costed`;
    case 'no-price':
      return `${name}set a price on this variety in Products → Seeds before it can be costed`;
  }
}
