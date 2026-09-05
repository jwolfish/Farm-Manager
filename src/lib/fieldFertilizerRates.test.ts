import { describe, it, expect } from 'vitest';
import {
  resolveFieldFertilizerItems,
  costResolvedItems,
  contributionsFromItems,
  rateFromTotal,
  totalFromRate,
  type FertilizerProductMeta,
  type FieldRate,
  type ProgramItemRate,
} from './fieldFertilizerRates';
import { accumulateNeed } from './shoppingListMath';

/*
 * Fixtures modelled on the real 2027 season: Potash and TSP priced by the ton and
 * applied in pounds, plus a liquid priced by the ton and applied in gallons, which
 * is the case that needs a density to cost at all.
 */
const POTASH: FertilizerProductMeta = {
  productId: 'potash', productName: 'Potash', unitType: 'ton', pricePerUnit: 450, density: null,
};
const TSP: FertilizerProductMeta = {
  productId: 'tsp', productName: 'TSP', unitType: 'ton', pricePerUnit: 825, density: null,
};
const LIQUID: FertilizerProductMeta = {
  productId: 'starter', productName: '6-24-6', unitType: 'ton', pricePerUnit: 725, density: 11.1,
};
const LIQUID_NO_DENSITY: FertilizerProductMeta = { ...LIQUID, density: null };

const products = new Map<string, FertilizerProductMeta>([
  ['potash', POTASH], ['tsp', TSP], ['starter', LIQUID],
]);

/** Corn Fall Fertilizer T&L: Potash 165 lb/ac + TSP 100 lb/ac. */
const fallPK: ProgramItemRate[] = [
  { productId: 'potash', rate: 165, rateUnit: 'lbs' },
  { productId: 'tsp', rate: 100, rateUnit: 'lbs' },
];

describe('resolveFieldFertilizerItems', () => {
  it('inherits the program when the field has no rates of its own', () => {
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, [], products);

    expect(r.isCustom).toBe(false);
    expect(r.items.map((i) => [i.product.productId, i.rate])).toEqual([
      ['potash', 165], ['tsp', 100],
    ]);
    expect(r.items.every((i) => i.isCustom)).toBe(false);
    expect(r.issues).toEqual([]);
  });

  it('replaces the whole list when the field has any rate of its own', () => {
    // The soil test moves P and K in opposite directions — the case a single
    // multiplier could never express.
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'potash', rate: 200, rateUnit: 'lbs' },
      { fieldId: 'home80', programId: 'fall', productId: 'tsp', rate: 60, rateUnit: 'lbs' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);

    expect(r.isCustom).toBe(true);
    expect(r.items.map((i) => [i.product.productId, i.rate])).toEqual([
      ['potash', 200], ['tsp', 60],
    ]);
    expect(r.items.every((i) => i.isCustom)).toBe(true);
  });

  it('a partial custom set drops the products it omits — replace-wholly, not merge', () => {
    /*
     * Home 80 got its Potash last year, so only TSP goes on. Under replace-wholly
     * the absent Potash row means "not applied". Under a merge it would have meant
     * "inherit 165 lb", which is the ambiguity §7.2 exists to remove.
     */
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'tsp', rate: 100, rateUnit: 'lbs' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);

    expect(r.items).toHaveLength(1);
    expect(r.items[0].product.productId).toBe('tsp');
  });

  it('lets a field carry a product the program never had', () => {
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'starter', rate: 4, rateUnit: 'gallon' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);

    expect(r.items).toHaveLength(1);
    expect(r.items[0].product.productId).toBe('starter');
  });

  it('ignores rates belonging to another field or another program', () => {
    const rates: FieldRate[] = [
      { fieldId: 'creek60', programId: 'fall', productId: 'potash', rate: 999, rateUnit: 'lbs' },
      { fieldId: 'home80', programId: 'topdress', productId: 'potash', rate: 888, rateUnit: 'lbs' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);

    expect(r.isCustom).toBe(false);
    expect(r.items.map((i) => i.rate)).toEqual([165, 100]);
  });

  it('reports a rate naming an unknown product rather than dropping it', () => {
    // A silently shorter list reads as a smaller plan.
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'ghost', rate: 100, rateUnit: 'lbs' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);

    expect(r.items).toEqual([]);
    expect(r.issues).toEqual(['no fertilizer product found for id ghost']);
  });

  it('falls back to the product unit when a rate unit is blank', () => {
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'potash', rate: 2, rateUnit: '' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);
    expect(r.items[0].rateUnit).toBe('ton');
  });

  it('a zero rate is a real rate, not an absence', () => {
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'potash', rate: 0, rateUnit: 'lbs' },
      { fieldId: 'home80', programId: 'fall', productId: 'tsp', rate: 100, rateUnit: 'lbs' },
    ];
    const r = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);

    expect(r.items).toHaveLength(2);
    expect(r.items[0].rate).toBe(0);
  });
});

describe('costResolvedItems', () => {
  it('costs the program rate, application cost included', () => {
    const { items } = resolveFieldFertilizerItems('home80', 'fall', fallPK, [], products);
    const { costPerAcre, unpricedItems } = costResolvedItems(items, 4);

    // 165 lb = 0.0825 ton x $450 = $37.125; 100 lb = 0.05 ton x $825 = $41.25
    expect(costPerAcre).toBeCloseTo(37.125 + 41.25 + 4, 6);
    expect(unpricedItems).toEqual([]);
  });

  it('a custom rate changes the field cost, which is the point of the feature', () => {
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'potash', rate: 200, rateUnit: 'lbs' },
      { fieldId: 'home80', programId: 'fall', productId: 'tsp', rate: 60, rateUnit: 'lbs' },
    ];
    const flat = costResolvedItems(
      resolveFieldFertilizerItems('home80', 'fall', fallPK, [], products).items, 4
    );
    const custom = costResolvedItems(
      resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products).items, 4
    );

    // 200 lb = 0.1 ton x $450 = $45; 60 lb = 0.03 ton x $825 = $24.75
    expect(custom.costPerAcre).toBeCloseTo(45 + 24.75 + 4, 6);
    expect(custom.costPerAcre).not.toBeCloseTo(flat.costPerAcre, 6);
  });

  it('bridges a liquid through its density', () => {
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'starter', rate: 4, rateUnit: 'gallon' },
    ];
    const { items } = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products);
    const { costPerAcre, unpricedItems } = costResolvedItems(items, 0);

    // 4 gal x 11.1 lb/gal = 44.4 lb = 0.0222 ton x $725
    expect(costPerAcre).toBeCloseTo(0.0222 * 725, 6);
    expect(unpricedItems).toEqual([]);
  });

  it('reports a liquid with no density instead of costing it wrong', () => {
    const noDensity = new Map(products);
    noDensity.set('starter', LIQUID_NO_DENSITY);
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'starter', rate: 4, rateUnit: 'gallon' },
    ];
    const { items } = resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, noDensity);
    const { costPerAcre, unpricedItems } = costResolvedItems(items, 4);

    expect(unpricedItems).toHaveLength(1);
    expect(unpricedItems[0]).toContain('6-24-6');
    expect(unpricedItems[0]).toContain('density');
    // The application cost still lands; only the product contributes nothing.
    expect(costPerAcre).toBe(4);
  });

  it('an unconvertible product is reported once, not once per item', () => {
    const noDensity = new Map(products);
    noDensity.set('starter', LIQUID_NO_DENSITY);
    const items = [
      { product: LIQUID_NO_DENSITY, rate: 4, rateUnit: 'gallon', isCustom: true },
      { product: LIQUID_NO_DENSITY, rate: 5, rateUnit: 'gallon', isCustom: true },
    ];
    expect(costResolvedItems(items, 0).unpricedItems).toHaveLength(1);
  });

  it('survives a non-numeric application cost rather than returning NaN', () => {
    const { items } = resolveFieldFertilizerItems('home80', 'fall', fallPK, [], products);
    const { costPerAcre } = costResolvedItems(items, NaN);
    expect(Number.isFinite(costPerAcre)).toBe(true);
    expect(costPerAcre).toBeCloseTo(37.125 + 41.25, 6);
  });
});

describe('contributionsFromItems into accumulateNeed', () => {
  it('a custom-rated field and a flat field accumulate into one tonnage', () => {
    /*
     * The end-to-end shape the shopping list needs: Home 80 at 200 lb/ac over
     * 80 ac, Creek 60 inheriting 165 lb/ac over 60 ac.
     *   80 x 200 = 16,000 lb = 8 ton
     *   60 x 165 =  9,900 lb = 4.95 ton
     */
    const rates: FieldRate[] = [
      { fieldId: 'home80', programId: 'fall', productId: 'potash', rate: 200, rateUnit: 'lbs' },
    ];

    const contributions = new Map();
    contributionsFromItems(
      resolveFieldFertilizerItems('home80', 'fall', fallPK, rates, products).items,
      80, contributions
    );
    contributionsFromItems(
      resolveFieldFertilizerItems('creek60', 'fall', fallPK, rates, products).items,
      60, contributions
    );

    const potash = accumulateNeed(contributions.get('potash')!, 'ton', null);
    expect(potash.total).toBeCloseTo(12.95, 6);
    expect(potash.unit).toBe('ton');
    expect(potash.issues).toEqual([]);

    // Home 80's custom set dropped TSP; only Creek 60 contributes it.
    const tsp = accumulateNeed(contributions.get('tsp')!, 'ton', null);
    expect(tsp.total).toBeCloseTo(3, 6);
  });

  it('is identical to the program-only path when no field has custom rates', () => {
    // The feature must be inert for a farm that flat-rates everything.
    const withRates = new Map();
    contributionsFromItems(
      resolveFieldFertilizerItems('home80', 'fall', fallPK, [], products).items, 80, withRates
    );
    expect(accumulateNeed(withRates.get('potash')!, 'ton', null).total).toBeCloseTo(6.6, 6);
  });
});

describe('rateFromTotal / totalFromRate — the §7.1 round trip', () => {
  it('8.2 ton over 43 ac round-trips through the stored rate', () => {
    // The rate is stored, not the total, because the rate is what must survive an
    // acreage change. This is the same assertion the V-1 migration rehearsal made
    // against the real numeric column.
    const rate = rateFromTotal(8.2 * 2000, 43)!;
    expect(rate).toBeCloseTo(381.3953488372093, 10);
    expect(totalFromRate(rate, 43)! / 2000).toBeCloseTo(8.2, 10);
  });

  it('a changed acreage moves the total, not the rate', () => {
    // 400 lb/ac is 400 lb/ac whether the field is re-measured or split.
    const rate = rateFromTotal(8.2 * 2000, 41)!;
    expect(rate).toBeCloseTo(400, 10);
    expect(totalFromRate(rate, 45)!).toBeCloseTo(18000, 6);
  });

  it('refuses to divide by zero or a nonsense acreage', () => {
    expect(rateFromTotal(100, 0)).toBeNull();
    expect(rateFromTotal(100, -5)).toBeNull();
    expect(rateFromTotal(100, NaN)).toBeNull();
    expect(rateFromTotal(NaN, 40)).toBeNull();
  });

  it('a zero total is a real answer, not a refusal', () => {
    expect(rateFromTotal(0, 40)).toBe(0);
    expect(totalFromRate(0, 40)).toBe(0);
  });
});
