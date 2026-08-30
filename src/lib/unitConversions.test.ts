import { describe, it, expect } from 'vitest';
import {
  convertUnits,
  calculateCostWithConversion,
  describeConversionFailure,
  isKnownUnit,
  normalizeUnit,
  ConversionResult,
  convertProductUnits,
} from './unitConversions';

/** Unwrap a result the test expects to have succeeded. */
function value(result: ConversionResult): number {
  if (!result.ok) {
    throw new Error(`expected a successful conversion, got ${result.reason} (${result.from} -> ${result.to})`);
  }
  return result.value;
}

/**
 * Every pair the pre-WI-11 lookup table supported, with the exact factor it
 * used. The rewrite must reproduce these bit for bit — this is the golden file
 * that proves the base-unit refactor did not move any number that was already
 * correct. `toBe` is exact float equality, deliberately, not `toBeCloseTo`.
 */
const LEGACY_FACTORS: Array<[string, string, number]> = [
  // mass
  ['ton', 'pound', 2000], ['ton', 'lb', 2000], ['ton', 'lbs', 2000],
  ['ton', 'oz', 32000], ['ton', 'ounce', 32000],
  ['pound', 'ton', 1 / 2000], ['pound', 'lb', 1], ['pound', 'lbs', 1],
  ['pound', 'oz', 16], ['pound', 'ounce', 16],
  ['lb', 'ton', 1 / 2000], ['lb', 'pound', 1], ['lb', 'lbs', 1],
  ['lb', 'oz', 16], ['lb', 'ounce', 16],
  ['lbs', 'ton', 1 / 2000], ['lbs', 'pound', 1], ['lbs', 'lb', 1],
  ['lbs', 'oz', 16], ['lbs', 'ounce', 16],
  ['oz', 'ton', 1 / 32000], ['oz', 'pound', 1 / 16], ['oz', 'lb', 1 / 16],
  ['oz', 'lbs', 1 / 16], ['oz', 'ounce', 1],
  ['ounce', 'ton', 1 / 32000], ['ounce', 'pound', 1 / 16], ['ounce', 'lb', 1 / 16],
  ['ounce', 'lbs', 1 / 16], ['ounce', 'oz', 1],

  // volume
  ['gallon', 'gal', 1], ['gallon', 'pint', 8], ['gallon', 'pt', 8],
  ['gallon', 'quart', 4], ['gallon', 'qt', 4], ['gallon', 'fl oz', 128],
  ['gallon', 'fluid ounce', 128], ['gallon', 'liquid ounce', 128],
  ['gal', 'gallon', 1], ['gal', 'pint', 8], ['gal', 'pt', 8],
  ['gal', 'quart', 4], ['gal', 'qt', 4], ['gal', 'fl oz', 128],
  ['gal', 'fluid ounce', 128], ['gal', 'liquid ounce', 128],
  ['quart', 'gallon', 1 / 4], ['quart', 'gal', 1 / 4], ['quart', 'qt', 1],
  ['quart', 'pint', 2], ['quart', 'pt', 2], ['quart', 'fl oz', 32],
  ['quart', 'fluid ounce', 32], ['quart', 'liquid ounce', 32],
  ['qt', 'gallon', 1 / 4], ['qt', 'gal', 1 / 4], ['qt', 'quart', 1],
  ['qt', 'pint', 2], ['qt', 'pt', 2], ['qt', 'fl oz', 32],
  ['qt', 'fluid ounce', 32], ['qt', 'liquid ounce', 32],
  ['pint', 'gallon', 1 / 8], ['pint', 'gal', 1 / 8], ['pint', 'quart', 1 / 2],
  ['pint', 'qt', 1 / 2], ['pint', 'pt', 1], ['pint', 'fl oz', 16],
  ['pint', 'fluid ounce', 16], ['pint', 'liquid ounce', 16],
  ['pt', 'gallon', 1 / 8], ['pt', 'gal', 1 / 8], ['pt', 'quart', 1 / 2],
  ['pt', 'qt', 1 / 2], ['pt', 'pint', 1], ['pt', 'fl oz', 16],
  ['pt', 'fluid ounce', 16], ['pt', 'liquid ounce', 16],
  ['fl oz', 'gallon', 1 / 128], ['fl oz', 'gal', 1 / 128], ['fl oz', 'quart', 1 / 32],
  ['fl oz', 'qt', 1 / 32], ['fl oz', 'pint', 1 / 16], ['fl oz', 'pt', 1 / 16],
  ['fl oz', 'fluid ounce', 1], ['fl oz', 'liquid ounce', 1],
  ['fluid ounce', 'gallon', 1 / 128], ['fluid ounce', 'gal', 1 / 128],
  ['fluid ounce', 'quart', 1 / 32], ['fluid ounce', 'qt', 1 / 32],
  ['fluid ounce', 'pint', 1 / 16], ['fluid ounce', 'pt', 1 / 16],
  ['fluid ounce', 'fl oz', 1], ['fluid ounce', 'liquid ounce', 1],
  ['liquid ounce', 'gallon', 1 / 128], ['liquid ounce', 'gal', 1 / 128],
  ['liquid ounce', 'quart', 1 / 32], ['liquid ounce', 'qt', 1 / 32],
  ['liquid ounce', 'pint', 1 / 16], ['liquid ounce', 'pt', 1 / 16],
  ['liquid ounce', 'fl oz', 1], ['liquid ounce', 'fluid ounce', 1],
];

const MASS_UNITS = ['oz', 'ounce', 'lb', 'lbs', 'pound', 'ton', 'mg', 'g', 'kg'];
const VOLUME_UNITS = [
  'fl oz', 'fluid ounce', 'liquid ounce', 'pt', 'pint', 'qt', 'quart',
  'gal', 'gallon', 'ml', 'l', 'ac-in',
];

describe('convertUnits — golden table against the pre-WI-11 behaviour', () => {
  it.each(LEGACY_FACTORS)('%s -> %s is exactly %d', (from, to, factor) => {
    expect(value(convertUnits(from, to, 1))).toBe(factor);
  });

  it('scales linearly, exactly, for the pairs the app actually uses', () => {
    // Every from->to pair present in the production database as of Round 3.
    expect(value(convertUnits('fl oz', 'gal', 128))).toBe(1);
    expect(value(convertUnits('pt', 'gal', 8))).toBe(1);
    expect(value(convertUnits('pt', 'gallon', 8))).toBe(1);
    expect(value(convertUnits('qt', 'gal', 4))).toBe(1);
    expect(value(convertUnits('gal', 'gal', 3))).toBe(3);
    expect(value(convertUnits('lbs', 'lbs', 3))).toBe(3);
    expect(value(convertUnits('pound', 'ton', 2000))).toBe(1);
    expect(value(convertUnits('quart', 'gallon', 4))).toBe(1);
    expect(value(convertUnits('gallon', 'gallon', 3))).toBe(3);
  });
});

describe('convertUnits — the PRD acceptance criteria', () => {
  it('refuses a weight-to-volume conversion instead of returning the input', () => {
    const result = convertUnits('lb', 'gal', 5);
    expect(result).toEqual({ ok: false, reason: 'incompatible-class', from: 'lb', to: 'gal' });
  });

  it('converts quarts to fluid ounces', () => {
    expect(convertUnits('qt', 'fl oz', 2)).toEqual({ ok: true, value: 64 });
  });

  it.each([...MASS_UNITS.map((u) => ['mass', u] as const), ...VOLUME_UNITS.map((u) => ['volume', u] as const)])(
    'round-trips %s unit "%s" to within 1e-9',
    (unitClass, unit) => {
      const partners = unitClass === 'mass' ? MASS_UNITS : VOLUME_UNITS;
      for (const partner of partners) {
        const there = convertUnits(unit, partner, 7.5);
        expect(there.ok).toBe(true);
        const back = convertUnits(partner, unit, value(there));
        expect(back.ok).toBe(true);
        expect(Math.abs(value(back) - 7.5)).toBeLessThan(1e-9);
      }
    }
  );
});

describe('convertUnits — failure modes', () => {
  it('reports an unknown unit rather than guessing', () => {
    expect(convertUnits('jugs', 'gal', 4)).toEqual({
      ok: false, reason: 'unknown-unit', from: 'jugs', to: 'gal',
    });
    expect(convertUnits('gal', 'jugs', 4)).toEqual({
      ok: false, reason: 'unknown-unit', from: 'gal', to: 'jugs',
    });
  });

  it('rejects a non-finite amount', () => {
    expect(convertUnits('gal', 'qt', NaN).ok).toBe(false);
    expect(convertUnits('gal', 'qt', Infinity).ok).toBe(false);
    expect(convertUnits('gal', 'qt', -Infinity).ok).toBe(false);
  });

  it('treats zero as a real amount, not as a missing one', () => {
    // The old truthiness guard (`if (factors[from]?.[to])`) would have dropped
    // a legitimate zero factor. Zero amounts must convert cleanly.
    expect(convertUnits('gal', 'qt', 0)).toEqual({ ok: true, value: 0 });
  });

  it('will not silently equate counting units', () => {
    expect(convertUnits('bag', 'seed', 10).ok).toBe(false);
    expect(convertUnits('bag', 'unit', 10).ok).toBe(false);
    expect(convertUnits('seed', 'each', 10).ok).toBe(false);
  });

  it('allows identity even for units it does not recognise', () => {
    // No conversion is being performed, so there is nothing to get wrong.
    expect(convertUnits('jug', 'jug', 4)).toEqual({ ok: true, value: 4 });
    expect(convertUnits('JUG', '  jug ', 4)).toEqual({ ok: true, value: 4 });
  });
});

describe('convertUnits — aliases and normalisation', () => {
  it('normalises case, padding and repeated whitespace', () => {
    expect(normalizeUnit('  FL   OZ  ')).toBe('fl oz');
    expect(value(convertUnits('  GALLONS ', 'Qt', 1))).toBe(4);
  });

  it.each([
    ['lb', 'lbs'], ['lb', 'pound'], ['lb', 'pounds'],
    ['gal', 'gallon'], ['gal', 'gallons'],
    ['fl oz', 'floz'], ['fl oz', 'fluid ounces'], ['fl oz', 'fl. oz.'],
    ['bag', 'bags'], ['qt', 'quarts'], ['pt', 'pints'],
  ])('treats %s and %s as the same unit', (a, b) => {
    expect(value(convertUnits(a, b, 3))).toBe(3);
  });

  it('accepts the units the PRD called out as missing', () => {
    for (const unit of ['l', 'kg', 'ml', 'bag', 'unit', 'seed', 'ac-in']) {
      expect(isKnownUnit(unit)).toBe(true);
    }
  });

  it('converts metric to US customary', () => {
    // 1 US gallon is exactly 3.785411784 L by definition.
    expect(value(convertUnits('l', 'gal', 3.785411784))).toBeCloseTo(1, 12);
    // 1 lb is exactly 453.59237 g by definition.
    expect(value(convertUnits('g', 'lb', 453.59237))).toBeCloseTo(1, 12);
    expect(value(convertUnits('kg', 'g', 2))).toBeCloseTo(2000, 9);
    expect(value(convertUnits('ml', 'l', 1500))).toBeCloseTo(1.5, 12);
  });

  it('converts acre-inches to gallons', () => {
    // 1 acre-inch = 3630 cubic feet = 27154.285714... US gallons.
    expect(value(convertUnits('ac-in', 'gal', 1))).toBeCloseTo(27154.2857142857, 6);
  });
});

describe('calculateCostWithConversion', () => {
  it('prices a rate given in a different unit from the product', () => {
    // 32 fl oz/ac of a product priced at $64/gal = 0.25 gal/ac = $16.00/ac.
    expect(calculateCostWithConversion(32, 'fl oz', 64, 'gal')).toEqual({ ok: true, value: 16 });
  });

  it('propagates the conversion failure rather than producing a number', () => {
    const result = calculateCostWithConversion(5, 'lb', 10, 'gal');
    expect(result).toEqual({ ok: false, reason: 'incompatible-class', from: 'lb', to: 'gal' });
  });

  it('rejects a non-finite price', () => {
    expect(calculateCostWithConversion(5, 'gal', NaN, 'gal').ok).toBe(false);
  });
});

describe('describeConversionFailure', () => {
  it('names both units so the user can fix the data', () => {
    const failure = convertUnits('fl oz', 'lbs', 1);
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    const message = describeConversionFailure(failure);
    expect(message).toContain('fl oz');
    expect(message).toContain('lb');
  });
});

describe('convertProductUnits — density bridge (F-1)', () => {
  const DENSITY_6_24_6 = 11.1; // lb per US gallon

  it('passes non-bridging conversions straight through', () => {
    expect(convertProductUnits('qt', 'fl oz', 2, DENSITY_6_24_6)).toEqual({ ok: true, value: 64 });
    expect(convertProductUnits('lb', 'oz', 1, DENSITY_6_24_6)).toEqual({ ok: true, value: 16 });
  });

  it('is identical to convertUnits when no density argument is given', () => {
    // The three-case convention: undefined means "this product has no concept
    // of density" (a chemical), so a mass/volume pair stays a category error.
    // Do not collapse this into the null case.
    expect(convertProductUnits('lb', 'gal', 5)).toEqual({
      ok: false, reason: 'incompatible-class', from: 'lb', to: 'gal',
    });
  });

  it('reports needs-density when a density applies but is not set', () => {
    expect(convertProductUnits('gal', 'ton', 5, null)).toEqual({
      ok: false, reason: 'needs-density', from: 'gal', to: 'ton',
    });
  });

  it('treats a zero, negative or non-finite density as missing', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const result = convertProductUnits('gal', 'ton', 5, bad);
      expect(result).toEqual({ ok: false, reason: 'needs-density', from: 'gal', to: 'ton' });
    }
  });

  it('bridges volume to mass', () => {
    expect(value(convertProductUnits('gal', 'lb', 1, DENSITY_6_24_6))).toBeCloseTo(11.1, 12);
    // The real check: 4 gal/ac of 6-24-6 is the 44 lb/ac that was entered by
    // hand for the 2025 season. If this drifts, the density is not being used.
    expect(value(convertProductUnits('gal', 'lb', 4, DENSITY_6_24_6))).toBeCloseTo(44.4, 12);
  });

  it('bridges mass to volume', () => {
    expect(value(convertProductUnits('lb', 'gal', 11.1, DENSITY_6_24_6))).toBeCloseTo(1, 12);
    expect(value(convertProductUnits('ton', 'gal', 1, DENSITY_6_24_6))).toBeCloseTo(2000 / 11.1, 9);
  });

  it('bridges through units other than lb and gal on either side', () => {
    // 1 qt = 0.25 gal -> 2.775 lb -> 44.4 oz
    expect(value(convertProductUnits('qt', 'oz', 1, DENSITY_6_24_6))).toBeCloseTo(44.4, 9);
  });

  it('round-trips within 1e-9', () => {
    for (const amount of [0.1, 1, 5.9, 250]) {
      const there = convertProductUnits('gal', 'ton', amount, DENSITY_6_24_6);
      expect(there.ok).toBe(true);
      if (!there.ok) return;
      const back = convertProductUnits('ton', 'gal', there.value, DENSITY_6_24_6);
      expect(Math.abs(value(back) - amount)).toBeLessThan(1e-9);
    }
  });

  it('does not bridge classes that a density cannot join', () => {
    // A density says nothing about bags or seeds, so these stay errors even
    // when one is supplied.
    expect(convertProductUnits('bag', 'seed', 1, DENSITY_6_24_6)).toEqual({
      ok: false, reason: 'incompatible-class', from: 'bag', to: 'seed',
    });
  });

  it('leaves unknown units and bad amounts as their own failures', () => {
    expect(convertProductUnits('widget', 'gal', 1, DENSITY_6_24_6).ok).toBe(false);
    expect((convertProductUnits('widget', 'gal', 1, DENSITY_6_24_6) as { reason: string }).reason)
      .toBe('unknown-unit');
    expect((convertProductUnits('gal', 'ton', NaN, DENSITY_6_24_6) as { reason: string }).reason)
      .toBe('invalid-amount');
  });

  it('costs a liquid bought by the ton and applied in gallons', () => {
    // 5.9 gal/ac x 11.1 lb/gal = 65.49 lb = 0.032745 ton, at $725/ton.
    const cost = calculateCostWithConversion(5.9, 'gal', 725, 'ton', DENSITY_6_24_6);
    expect(cost.ok).toBe(true);
    expect(value(cost)).toBeCloseTo(0.032745 * 725, 9);
  });

  it('refuses to cost the same item when the density is missing', () => {
    const cost = calculateCostWithConversion(5.9, 'gal', 725, 'ton', null);
    expect(cost).toEqual({ ok: false, reason: 'needs-density', from: 'gal', to: 'ton' });
  });

  it('names the fix in the failure message', () => {
    const failure = convertProductUnits('gal', 'ton', 1, null);
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(describeConversionFailure(failure)).toContain('density');
  });
});
