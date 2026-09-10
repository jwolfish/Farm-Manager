import { describe, it, expect } from 'vitest';
import {
  calculateSeedCostPerAcre,
  describeSeedCostIssue,
  type SeedVarietyCostInputs,
} from './seedCostMath';

const corn: SeedVarietyCostInputs = {
  productName: 'DKC 62-70',
  pricePerUnit: 320,
  unitsPerBag: 80000,
};

describe('calculateSeedCostPerAcre', () => {
  it('costs a normal corn population', () => {
    // 34,000 seeds/ac over an 80,000-seed bag is 0.425 bags, at $320 = $136.00/ac.
    const result = calculateSeedCostPerAcre(corn, 34000);
    expect(result).toEqual({ ok: true, bagsPerAcre: 0.425, costPerAcre: 136 });
  });

  it('costs a soybean population where a bag covers more than an acre', () => {
    const beans: SeedVarietyCostInputs = { pricePerUnit: 55, unitsPerBag: 140000 };
    const result = calculateSeedCostPerAcre(beans, 140000);
    expect(result).toEqual({ ok: true, bagsPerAcre: 1, costPerAcre: 55 });
  });

  it('is linear in the rate', () => {
    const one = calculateSeedCostPerAcre(corn, 30000);
    const two = calculateSeedCostPerAcre(corn, 60000);
    if (!one.ok || !two.ok) throw new Error('expected both to cost');
    expect(two.costPerAcre).toBeCloseTo(one.costPerAcre * 2, 10);
  });

  /*
   * The reason this module exists. The original returned 0 here, and $0.00/acre for seed
   * reads as an answer rather than as a failure — the exact class of plausible-wrong number
   * this codebase keeps deleting.
   */
  it('refuses rather than returning 0 when the variety has no seeds per bag', () => {
    expect(calculateSeedCostPerAcre({ pricePerUnit: 320, unitsPerBag: null }, 34000)).toEqual({
      ok: false,
      reason: 'no-units-per-bag',
    });
    expect(calculateSeedCostPerAcre({ pricePerUnit: 320, unitsPerBag: 0 }, 34000)).toEqual({
      ok: false,
      reason: 'no-units-per-bag',
    });
  });

  it('refuses a negative or non-finite units per bag', () => {
    expect(calculateSeedCostPerAcre({ pricePerUnit: 320, unitsPerBag: -80000 }, 34000).ok).toBe(false);
    expect(calculateSeedCostPerAcre({ pricePerUnit: 320, unitsPerBag: NaN }, 34000).ok).toBe(false);
  });

  it('refuses a missing rate, distinctly from a bad one', () => {
    expect(calculateSeedCostPerAcre(corn, null)).toEqual({ ok: false, reason: 'no-rate' });
    expect(calculateSeedCostPerAcre(corn, 0)).toEqual({ ok: false, reason: 'no-rate' });
    expect(calculateSeedCostPerAcre(corn, -1)).toEqual({ ok: false, reason: 'invalid-rate' });
    expect(calculateSeedCostPerAcre(corn, NaN)).toEqual({ ok: false, reason: 'invalid-rate' });
  });

  it('refuses a variety with no usable price', () => {
    expect(calculateSeedCostPerAcre({ pricePerUnit: NaN, unitsPerBag: 80000 }, 34000)).toEqual({
      ok: false,
      reason: 'no-price',
    });
    expect(calculateSeedCostPerAcre({ pricePerUnit: -5, unitsPerBag: 80000 }, 34000)).toEqual({
      ok: false,
      reason: 'no-price',
    });
  });

  it('honours a legitimate price of zero — free seed is not a failure', () => {
    const result = calculateSeedCostPerAcre({ pricePerUnit: 0, unitsPerBag: 80000 }, 34000);
    expect(result).toEqual({ ok: true, bagsPerAcre: 0.425, costPerAcre: 0 });
  });

  it('does not mutate its input', () => {
    const input: SeedVarietyCostInputs = { pricePerUnit: 320, unitsPerBag: 80000 };
    const before = { ...input };
    calculateSeedCostPerAcre(input, 34000);
    expect(input).toEqual(before);
  });
});

describe('describeSeedCostIssue', () => {
  it('names the fix, and the product where one is given', () => {
    expect(describeSeedCostIssue('no-units-per-bag', 'DKC 62-70')).toContain('DKC 62-70');
    expect(describeSeedCostIssue('no-units-per-bag', 'DKC 62-70')).toContain('seeds per bag');
    expect(describeSeedCostIssue('no-rate')).toBe('enter a seeding rate');
  });

  it('covers every reason', () => {
    const reasons = ['no-rate', 'invalid-rate', 'no-units-per-bag', 'no-price'] as const;
    for (const reason of reasons) {
      expect(describeSeedCostIssue(reason).length).toBeGreaterThan(0);
    }
  });
});
