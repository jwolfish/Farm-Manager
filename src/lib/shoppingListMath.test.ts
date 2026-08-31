import { describe, it, expect } from 'vitest';
import { accumulateNeed, neededAfterOnHand, NeedContribution } from './shoppingListMath';

describe('accumulateNeed — WI-12 canonical accumulation', () => {
  it('converts each contribution before summing, not after', () => {
    // The acceptance criterion from the PRD: a chemical at 2 qt/ac on 100 ac in
    // one program and 16 fl oz/ac on 50 ac in another, held in gallons.
    // 200 qt = 50 gal, 800 fl oz = 6.25 gal, so the answer is 56.25 gal.
    // The old code summed 200 + 800 = 1000 and converted once as quarts.
    const contributions: NeedContribution[] = [
      { rate: 2, rateUnit: 'qt', acreage: 100 },
      { rate: 16, rateUnit: 'fl oz', acreage: 50 },
    ];

    const result = accumulateNeed(contributions, 'gal');

    expect(result.total).toBe(56.25);
    expect(result.unit).toBe('gal');
    expect(result.issues).toEqual([]);
  });

  it('is not fooled by the order the units are seen in', () => {
    const forwards = accumulateNeed(
      [
        { rate: 2, rateUnit: 'qt', acreage: 100 },
        { rate: 16, rateUnit: 'fl oz', acreage: 50 },
      ],
      'gal'
    );
    const backwards = accumulateNeed(
      [
        { rate: 16, rateUnit: 'fl oz', acreage: 50 },
        { rate: 2, rateUnit: 'qt', acreage: 100 },
      ],
      'gal'
    );

    expect(forwards.total).toBe(backwards.total);
  });

  it('falls back to the first contribution unit when there is no linked product', () => {
    const result = accumulateNeed(
      [
        { rate: 2, rateUnit: 'qt', acreage: 100 },
        { rate: 16, rateUnit: 'fl oz', acreage: 50 },
      ],
      null
    );

    // 200 qt + 800 fl oz = 200 qt + 25 qt = 225 qt.
    expect(result.total).toBe(225);
    expect(result.unit).toBe('qt');
    expect(result.issues).toEqual([]);
  });

  it('prefers the master product unit over the first rate unit', () => {
    const result = accumulateNeed([{ rate: 4, rateUnit: 'qt', acreage: 10 }], 'gal');
    expect(result.unit).toBe('gal');
    expect(result.total).toBe(10);
  });

  it('flags an unconvertible contribution and leaves it out of the total', () => {
    const result = accumulateNeed(
      [
        { rate: 2, rateUnit: 'qt', acreage: 100 },
        { rate: 3, rateUnit: 'lbs', acreage: 10 },
      ],
      'gal'
    );

    // The convertible half still counts, so the user sees a number...
    expect(result.total).toBe(50);
    // ...but it is explicitly marked as incomplete, naming both units.
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('lbs');
    expect(result.issues[0]).toContain('gal');
  });

  it('flags a contribution whose arithmetic is not a usable number', () => {
    const result = accumulateNeed([{ rate: NaN, rateUnit: 'gal', acreage: 10 }], 'gal');
    expect(result.total).toBe(0);
    expect(result.issues).toHaveLength(1);
  });

  it('handles an empty contribution list', () => {
    const result = accumulateNeed([], 'gal');
    expect(result).toEqual({ total: 0, unit: 'gal', issues: [] });
  });

  it('skips blank rate units when choosing a fallback', () => {
    const result = accumulateNeed(
      [
        { rate: 1, rateUnit: '', acreage: 10 },
        { rate: 2, rateUnit: 'gal', acreage: 10 },
      ],
      null
    );
    expect(result.unit).toBe('gal');
    // The blank-unit row cannot be converted into gallons, so it is flagged.
    expect(result.total).toBe(20);
    expect(result.issues).toHaveLength(1);
  });
});

describe('neededAfterOnHand', () => {
  it('subtracts stock on hand', () => {
    expect(neededAfterOnHand(56.25, 6.25)).toBe(50);
  });

  it('clamps to zero when there is more on hand than needed', () => {
    expect(neededAfterOnHand(10, 25)).toBe(0);
  });

  it('returns the full amount when nothing is on hand', () => {
    expect(neededAfterOnHand(10, 0)).toBe(10);
  });
});

describe('accumulateNeed — liquid fertilizer density (F-1)', () => {
  it('accumulates a gallon rate against a per-ton product when a density is given', () => {
    // 6-24-6 at 5.9 gal/ac over 100 ac, held in tons, at 11.1 lb/gal.
    // 590 gal x 11.1 = 6549 lb = 3.2745 ton.
    const result = accumulateNeed(
      [{ rate: 5.9, rateUnit: 'gallon', acreage: 100 }],
      'ton',
      11.1
    );
    expect(result.issues).toEqual([]);
    expect(result.unit).toBe('ton');
    expect(result.total).toBeCloseTo(3.2745, 9);
  });

  it('flags the same line rather than undercounting when the density is missing', () => {
    const result = accumulateNeed(
      [{ rate: 5.9, rateUnit: 'gallon', acreage: 100 }],
      'ton',
      null
    );
    expect(result.total).toBe(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('density');
  });

  it('leaves dry products alone when no density is passed', () => {
    // 200 lb/ac over 100 ac held in tons = 10 ton, unchanged by F-1.
    const result = accumulateNeed([{ rate: 200, rateUnit: 'pound', acreage: 100 }], 'ton');
    expect(result.issues).toEqual([]);
    expect(result.total).toBeCloseTo(10, 12);
  });
});

describe('accumulateNeed — repeated failures are reported once', () => {
  it('does not repeat the same reason once per field', () => {
    // Five fields of a liquid with no density: the reason is one fact about the
    // product, not five facts about the fields. Before this, the plan
    // calculator rendered the same sentence five times joined by semicolons.
    const contributions = [80, 60, 40, 158.4, 22].map((acreage) => ({
      rate: 20,
      rateUnit: 'gallon',
      acreage,
    }));
    const result = accumulateNeed(contributions, 'ton', null);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('density');
  });

  it('still reports genuinely different reasons separately', () => {
    const result = accumulateNeed(
      [
        { rate: 20, rateUnit: 'gallon', acreage: 80 },   // needs a density
        { rate: 5, rateUnit: 'jugs', acreage: 40 },      // unrecognised unit
      ],
      'ton',
      null
    );
    expect(result.issues).toHaveLength(2);
  });
});
