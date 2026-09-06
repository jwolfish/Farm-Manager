import { describe, it, expect } from 'vitest';
import {
  computePlanNeed,
  sumSelectedAcres,
  buildPlanNote,
  type PlanCustomRates,
  type PlanField,
  type PlanProgram,
} from './fertilizerPlanMath';
import type { FertilizerProductMeta, FieldRate } from './fieldFertilizerRates';

/**
 * Every product any test names. The map is season-wide in production for a reason:
 * under replace-wholly a field may carry a product its program never had, so a map
 * built only from the chosen programs would drop that product's tonnage silently.
 */
const PRODUCT_LIST: FertilizerProductMeta[] = [
  { productId: 'potash', productName: 'Potash', unitType: 'ton', pricePerUnit: 450, density: null },
  { productId: 'dap', productName: 'DAP', unitType: 'ton', pricePerUnit: 700, density: null },
  { productId: 'urea', productName: 'Urea', unitType: 'ton', pricePerUnit: 600, density: null },
  { productId: 'starter', productName: '6-24-6', unitType: 'ton', pricePerUnit: 825, density: 11.1 },
  { productId: 's', productName: 'Mystery', unitType: 'ton', pricePerUnit: 100, density: null },
];
const PRODUCTS = new Map(PRODUCT_LIST.map((p) => [p.productId, p]));

/** "This season has no per-field rates" — a statement, not an omitted argument. */
const NO_CUSTOM: PlanCustomRates = { rates: [], products: PRODUCTS };

const withRates = (rates: FieldRate[]): PlanCustomRates => ({ rates, products: PRODUCTS });

const FIELDS: PlanField[] = [
  { id: 'f1', name: 'Home 80', acreage: 80 },
  { id: 'f2', name: 'Creek 60', acreage: 60 },
  { id: 'f3', name: 'North 40', acreage: 40 },
];

// Potash at 200 lb/ac and DAP at 150 lb/ac, both priced per ton.
const FALL_PK: PlanProgram = {
  id: 'p1',
  name: 'Fall P&K',
  items: [
    { productId: 'potash', productName: 'Potash', productUnit: 'ton', density: null, rate: 200, rateUnit: 'lbs' },
    { productId: 'dap', productName: 'DAP', productUnit: 'ton', density: null, rate: 150, rateUnit: 'lbs' },
  ],
};

const STARTER: PlanProgram = {
  id: 'p2',
  name: 'Starter',
  items: [
    { productId: 'potash', productName: 'Potash', productUnit: 'ton', density: null, rate: 50, rateUnit: 'lbs' },
  ],
};

const all = (ids: string[]) => new Set(ids);

describe('computePlanNeed', () => {
  it('multiplies rate by acreage and converts into the product unit', () => {
    // 200 lb/ac x 80 ac = 16,000 lb = 8 ton
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1']), all(['p1']), NO_CUSTOM);
    expect(lines.find((l) => l.productId === 'potash')).toMatchObject({ total: 8, unit: 'ton' });
    // 150 x 80 = 12,000 lb = 6 ton
    expect(lines.find((l) => l.productId === 'dap')).toMatchObject({ total: 6, unit: 'ton' });
  });

  it('adds every selected field', () => {
    // 200 lb/ac over 80 + 60 + 40 = 180 ac = 36,000 lb = 18 ton
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1', 'f2', 'f3']), all(['p1']), NO_CUSTOM);
    expect(lines.find((l) => l.productId === 'potash')?.total).toBe(18);
  });

  it('adds a product that appears in two selected programs', () => {
    // Potash 200 + 50 = 250 lb/ac over 80 ac = 20,000 lb = 10 ton
    const lines = computePlanNeed(FIELDS, [FALL_PK, STARTER], all(['f1']), all(['p1', 'p2']), NO_CUSTOM);
    expect(lines.find((l) => l.productId === 'potash')?.total).toBe(10);
  });

  it('is empty when no field is selected', () => {
    expect(computePlanNeed(FIELDS, [FALL_PK], all([]), all(['p1']), NO_CUSTOM)).toEqual([]);
  });

  it('is empty when no program is selected', () => {
    expect(computePlanNeed(FIELDS, [FALL_PK], all(['f1']), all([]), NO_CUSTOM)).toEqual([]);
  });

  it('ignores a field with zero or negative acreage rather than producing zero need', () => {
    const odd: PlanField[] = [...FIELDS, { id: 'f4', name: 'Bad', acreage: 0 }];
    const lines = computePlanNeed(odd, [FALL_PK], all(['f1', 'f4']), all(['p1']), NO_CUSTOM);
    expect(lines.find((l) => l.productId === 'potash')?.total).toBe(8);
  });

  it('returns products in a stable alphabetical order', () => {
    // A re-run must not shuffle the lines the user is part-way through editing.
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1']), all(['p1']), NO_CUSTOM);
    expect(lines.map((l) => l.productName)).toEqual(['DAP', 'Potash']);
  });

  it('bridges a liquid through its density', () => {
    // 6-24-6 at 5.86 gal/ac over 100 ac = 586 gal x 11.1 lb/gal = 6504.6 lb
    const liquid: PlanProgram = {
      id: 'p3',
      name: 'Planter',
      items: [{ productId: 'starter', productName: '6-24-6', productUnit: 'ton', density: 11.1, rate: 5.86, rateUnit: 'gallon' }],
    };
    const oneHundred: PlanField[] = [{ id: 'x', name: 'X', acreage: 100 }];
    const lines = computePlanNeed(oneHundred, [liquid], all(['x']), all(['p3']), NO_CUSTOM);
    expect(lines[0].total).toBeCloseTo(6504.6 / 2000, 9);
    expect(lines[0].issues).toEqual([]);
  });

  it('flags a liquid with no density instead of guessing a tonnage', () => {
    // The loud failure guardrail 8 exists for: gallons cannot become tons
    // without a density, and a plausible wrong tonnage is worse than a flag.
    const noDensity: PlanProgram = {
      id: 'p4',
      name: 'Planter',
      items: [{ productId: 's', productName: 'Mystery', productUnit: 'ton', density: null, rate: 5, rateUnit: 'gallon' }],
    };
    const lines = computePlanNeed(FIELDS, [noDensity], all(['f1']), all(['p4']), NO_CUSTOM);
    expect(lines[0].total).toBe(0);
    expect(lines[0].issues.length).toBeGreaterThan(0);
  });

  /*
   * V-8. Before this the calculator walked each program's shared item list, so a
   * field with its own rates was ordered at the program's rate while its own page
   * costed it correctly — the calculator contradicting the field.
   */
  it('uses a field\'s own rates instead of the program\'s', () => {
    // Home 80 carries 250 lb/ac of Potash rather than the program's 200.
    // 250 x 80 = 20,000 lb = 10 ton, not 8.
    const custom = withRates([
      { fieldId: 'f1', programId: 'p1', productId: 'potash', rate: 250, rateUnit: 'lbs' },
    ]);
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1']), all(['p1']), custom);
    expect(lines.find((l) => l.productId === 'potash')?.total).toBe(10);
    // Replace-wholly: DAP was not in the field's list, so it contributes nothing.
    expect(lines.find((l) => l.productId === 'dap')).toBeUndefined();
  });

  it('leaves every other field on the program', () => {
    const custom = withRates([
      { fieldId: 'f1', programId: 'p1', productId: 'potash', rate: 250, rateUnit: 'lbs' },
    ]);
    // Home 80 at 250 = 10 ton; Creek 60 and North 40 still at 200 = 100 ac = 10 ton.
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1', 'f2', 'f3']), all(['p1']), custom);
    expect(lines.find((l) => l.productId === 'potash')?.total).toBe(20);
    // DAP only from the two uncustomised fields: 150 lb/ac x 100 ac = 7.5 ton.
    expect(lines.find((l) => l.productId === 'dap')?.total).toBe(7.5);
  });

  it('counts a product the program never had', () => {
    // The case replace-wholly exists for: this field gets Urea on the Fall pass
    // even though Fall P&K has none. A products map built from the chosen programs
    // would have dropped it without a word.
    const custom = withRates([
      { fieldId: 'f1', programId: 'p1', productId: 'urea', rate: 100, rateUnit: 'lbs' },
    ]);
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1']), all(['p1']), custom);
    expect(lines.find((l) => l.productId === 'urea')?.total).toBe(4); // 100 x 80 / 2000
    expect(lines.find((l) => l.productId === 'potash')).toBeUndefined();
  });

  it('applies rates only to the program they were entered for', () => {
    // A rate on the Fall pass must not leak into Starter.
    const custom = withRates([
      { fieldId: 'f1', programId: 'p1', productId: 'potash', rate: 250, rateUnit: 'lbs' },
    ]);
    const lines = computePlanNeed(FIELDS, [FALL_PK, STARTER], all(['f1']), all(['p2']), custom);
    // Starter's own 50 lb/ac x 80 ac = 2 ton, untouched.
    expect(lines.find((l) => l.productId === 'potash')?.total).toBe(2);
  });

  it('is identical to the program-only answer when no field has custom rates', () => {
    // The control: this change must be inert for every field that has not been
    // customised, which today is all but one of them.
    const withNone = computePlanNeed(FIELDS, [FALL_PK], all(['f1', 'f2']), all(['p1']), NO_CUSTOM);
    const withOther = computePlanNeed(FIELDS, [FALL_PK], all(['f1', 'f2']), all(['p1']),
      withRates([
        // A rate for a field that is not selected, and one for another program.
        { fieldId: 'f3', programId: 'p1', productId: 'potash', rate: 999, rateUnit: 'lbs' },
        { fieldId: 'f1', programId: 'p2', productId: 'potash', rate: 999, rateUnit: 'lbs' },
      ]));
    expect(withOther).toEqual(withNone);
  });

  it('reports a rate naming an unknown product rather than dropping it', () => {
    const custom: PlanCustomRates = {
      rates: [{ fieldId: 'f1', programId: 'p1', productId: 'ghost', rate: 10, rateUnit: 'lbs' }],
      products: PRODUCTS,
    };
    const lines = computePlanNeed(FIELDS, [FALL_PK], all(['f1']), all(['p1']), custom);
    expect(lines.every((l) => l.issues.some((i) => i.includes('ghost')))).toBe(true);
  });

  it('ignores fields and programs that are not selected', () => {
    const lines = computePlanNeed(FIELDS, [FALL_PK, STARTER], all(['f2']), all(['p2']), NO_CUSTOM);
    expect(lines).toHaveLength(1);
    // Potash 50 lb/ac x 60 ac = 3,000 lb = 1.5 ton
    expect(lines[0]).toMatchObject({ productName: 'Potash', total: 1.5 });
  });
});

describe('sumSelectedAcres', () => {
  it('totals the selected fields only', () => {
    expect(sumSelectedAcres(FIELDS, all(['f1', 'f2']))).toBe(140);
  });

  it('is zero with nothing selected', () => {
    expect(sumSelectedAcres(FIELDS, all([]))).toBe(0);
  });

  it('ignores a non-finite acreage rather than producing NaN', () => {
    const odd: PlanField[] = [{ id: 'a', name: 'A', acreage: 10 }, { id: 'b', name: 'B', acreage: NaN }];
    expect(sumSelectedAcres(odd, all(['a', 'b']))).toBe(10);
  });
});

describe('buildPlanNote', () => {
  it('matches the format the design specifies', () => {
    const note = buildPlanNote(FIELDS, [FALL_PK], all(['f1', 'f2']), all(['p1']));
    expect(note).toBe('Ordered for: Home 80, Creek 60 — Fall P&K');
  });

  it('lists several programs', () => {
    const note = buildPlanNote(FIELDS, [FALL_PK, STARTER], all(['f1']), all(['p1', 'p2']));
    expect(note).toBe('Ordered for: Home 80 — Fall P&K, Starter');
  });

  it('omits the dash when no program is named', () => {
    expect(buildPlanNote(FIELDS, [FALL_PK], all(['f1']), all([]))).toBe('Ordered for: Home 80');
  });

  it('is empty when nothing is selected, so no empty memo is stamped', () => {
    expect(buildPlanNote(FIELDS, [FALL_PK], all([]), all(['p1']))).toBe('');
  });

  it('truncates a long field list rather than filling the load list with names', () => {
    const many: PlanField[] = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}`, name: `Field ${i}`, acreage: 10,
    }));
    const note = buildPlanNote(many, [FALL_PK], all(many.map((f) => f.id)), all(['p1']));
    expect(note).toContain('+4 more');
    expect(note).toContain('Field 0');
    expect(note).not.toContain('Field 11');
  });
});
