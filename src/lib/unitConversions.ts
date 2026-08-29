/**
 * Unit conversion — WI-11.
 *
 * Design notes, because the arithmetic here is deliberately fussy:
 *
 * 1. Conversion is TOTAL. Every call returns a discriminated result. There is no
 *    path that returns an unconverted amount dressed up as a converted one. The
 *    previous implementation returned the input unchanged whenever it could not
 *    find a factor, which silently corrupted costs, ledger deltas and shopping
 *    quantities.
 *
 * 2. Conversion goes through a base unit per class, not an N x N factor matrix.
 *    Base units are chosen so that every US customary factor is an exact integer
 *    below 2^53:
 *      - mass   base = nanogram,   1 oz    = 28_349_523_125 ng      (exact)
 *      - volume base = femtolitre, 1 fl oz = 29_573_529_562_500 fL  (exact)
 *    Because each factor is an exactly representable integer and IEEE-754
 *    division is correctly rounded, ratios such as lb->oz and gal->fl oz come
 *    out as exactly 16 and exactly 128. That is what keeps this rewrite
 *    byte-identical to the old lookup table for every pair the old table
 *    supported (see the golden table in the test suite).
 *
 * 3. Counting units are NOT interchangeable. A bag is not a seed and is not a
 *    generic unit — converting between them needs a per-product units_per_bag
 *    that this module does not have. Each therefore gets its own class so the
 *    attempt fails loudly instead of quietly returning a 1:1 answer.
 *
 * 4. Identity is always allowed, including for units this module does not
 *    recognise: converting "widget" to "widget" requires no conversion, so it
 *    succeeds. Only an actual cross-unit conversion can fail.
 */

export type ConversionFailureReason =
  | 'unknown-unit'
  | 'incompatible-class'
  | 'invalid-amount';

export type ConversionResult =
  | { ok: true; value: number }
  | { ok: false; reason: ConversionFailureReason; from: string; to: string };

export type ConversionFailure = Extract<ConversionResult, { ok: false }>;

type UnitClass = 'mass' | 'volume' | 'bag' | 'seed' | 'each';

interface UnitDefinition {
  unitClass: UnitClass;
  /** Size of one of this unit expressed in the class base unit. */
  factor: number;
}

/** 1 avoirdupois ounce in nanograms. Exact: 1 lb = 453.59237 g by definition. */
const OZ_IN_NG = 28349523125;
/** 1 US fluid ounce in femtolitres. Exact: 1 US gal = 3.785411784 L by definition. */
const FL_OZ_IN_FL = 29573529562500;
/** 1 acre-inch = 43560/12 cubic feet = 6272640/231 US gallons. Not an exact integer. */
const AC_IN_IN_FL = FL_OZ_IN_FL * 128 * (6272640 / 231);

const UNITS: Record<string, UnitDefinition> = {
  // ---- mass, base = nanogram -------------------------------------------
  oz: { unitClass: 'mass', factor: OZ_IN_NG },
  lb: { unitClass: 'mass', factor: OZ_IN_NG * 16 },
  ton: { unitClass: 'mass', factor: OZ_IN_NG * 32000 },
  mg: { unitClass: 'mass', factor: 1e6 },
  g: { unitClass: 'mass', factor: 1e9 },
  kg: { unitClass: 'mass', factor: 1e12 },

  // ---- volume, base = femtolitre ---------------------------------------
  'fl oz': { unitClass: 'volume', factor: FL_OZ_IN_FL },
  pt: { unitClass: 'volume', factor: FL_OZ_IN_FL * 16 },
  qt: { unitClass: 'volume', factor: FL_OZ_IN_FL * 32 },
  gal: { unitClass: 'volume', factor: FL_OZ_IN_FL * 128 },
  ml: { unitClass: 'volume', factor: 1e12 },
  l: { unitClass: 'volume', factor: 1e15 },
  'ac-in': { unitClass: 'volume', factor: AC_IN_IN_FL },

  // ---- counts, each isolated in its own class --------------------------
  bag: { unitClass: 'bag', factor: 1 },
  seed: { unitClass: 'seed', factor: 1 },
  each: { unitClass: 'each', factor: 1 },
};

/** Every spelling the app has stored, mapped to its canonical unit key. */
const ALIASES: Record<string, string> = {
  // mass
  oz: 'oz',
  ozs: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  'dry ounce': 'oz',
  'dry ounces': 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ton: 'ton',
  tons: 'ton',
  'short ton': 'ton',
  'short tons': 'ton',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',

  // volume
  'fl oz': 'fl oz',
  floz: 'fl oz',
  'fl. oz.': 'fl oz',
  'fl. oz': 'fl oz',
  'fl oz.': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  'liquid ounce': 'fl oz',
  'liquid ounces': 'fl oz',
  pt: 'pt',
  pts: 'pt',
  pint: 'pt',
  pints: 'pt',
  qt: 'qt',
  qts: 'qt',
  quart: 'qt',
  quarts: 'qt',
  gal: 'gal',
  gals: 'gal',
  gallon: 'gal',
  gallons: 'gal',
  ml: 'ml',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  'ac-in': 'ac-in',
  'ac in': 'ac-in',
  acin: 'ac-in',
  'acre-inch': 'ac-in',
  'acre inch': 'ac-in',
  'acre-inches': 'ac-in',
  'acre inches': 'ac-in',

  // counts
  bag: 'bag',
  bags: 'bag',
  seed: 'seed',
  seeds: 'seed',
  unit: 'each',
  units: 'each',
  each: 'each',
  ea: 'each',
  count: 'each',
};

/** Lowercase, trim, and collapse runs of whitespace. */
export function normalizeUnit(unit: string): string {
  return String(unit ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function lookupUnit(normalized: string): UnitDefinition | null {
  const canonical = ALIASES[normalized];
  if (canonical === undefined) return null;
  return UNITS[canonical] ?? null;
}

/** True when this module can convert the given unit to others in its class. */
export function isKnownUnit(unit: string): boolean {
  return lookupUnit(normalizeUnit(unit)) !== null;
}

export function convertUnits(
  fromUnit: string,
  toUnit: string,
  amount: number
): ConversionResult {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { ok: false, reason: 'invalid-amount', from, to };
  }

  // Identity needs no conversion, so it succeeds even for unrecognised units.
  if (from === to) {
    return { ok: true, value: amount };
  }

  const fromDef = lookupUnit(from);
  const toDef = lookupUnit(to);

  if (fromDef === null || toDef === null) {
    return { ok: false, reason: 'unknown-unit', from, to };
  }

  if (fromDef.unitClass !== toDef.unitClass) {
    return { ok: false, reason: 'incompatible-class', from, to };
  }

  return { ok: true, value: amount * (fromDef.factor / toDef.factor) };
}

/** A sentence fit to show a user, naming both units. */
export function describeConversionFailure(failure: ConversionFailure): string {
  const from = failure.from || '(blank)';
  const to = failure.to || '(blank)';
  switch (failure.reason) {
    case 'incompatible-class':
      return `cannot convert ${from} to ${to} — those measure different things`;
    case 'unknown-unit':
      return `cannot convert ${from} to ${to} — unrecognised unit`;
    case 'invalid-amount':
      return `cannot convert ${from} to ${to} — the amount is not a number`;
  }
}

/**
 * Cost of one acre's application, with the rate converted into the unit the
 * product is priced in. Fails rather than guessing when the units do not meet.
 */
export function calculateCostWithConversion(
  applicationRate: number,
  applicationUnit: string,
  pricePerUnit: number,
  priceUnit: string
): ConversionResult {
  if (typeof pricePerUnit !== 'number' || !Number.isFinite(pricePerUnit)) {
    return {
      ok: false,
      reason: 'invalid-amount',
      from: normalizeUnit(applicationUnit),
      to: normalizeUnit(priceUnit),
    };
  }

  const converted = convertUnits(applicationUnit, priceUnit, applicationRate);
  if (!converted.ok) return converted;

  return { ok: true, value: converted.value * pricePerUnit };
}

const LIQUID_UNITS = new Set(['fl oz', 'fluid ounce', 'liquid ounce', 'pt', 'pint', 'qt', 'quart', 'gal', 'gallon']);
const DRY_UNITS = new Set(['oz', 'ounce', 'lb', 'lbs', 'pound', 'ton']);

export function toBestPracticalUnit(totalAmount: number, unit: string): { value: number; unit: string; display: string } {
  const u = unit.toLowerCase().trim();

  if (LIQUID_UNITS.has(u)) {
    // Convert everything to fl oz first
    let flOz = totalAmount;
    if (u === 'gal' || u === 'gallon') flOz = totalAmount * 128;
    else if (u === 'qt' || u === 'quart') flOz = totalAmount * 32;
    else if (u === 'pt' || u === 'pint') flOz = totalAmount * 16;

    if (flOz >= 128) {
      const val = flOz / 128;
      return { value: val, unit: 'gal', display: `${val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} gal` };
    } else if (flOz >= 32) {
      const val = flOz / 32;
      return { value: val, unit: 'qt', display: `${val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} qt` };
    } else if (flOz >= 16) {
      const val = flOz / 16;
      return { value: val, unit: 'pt', display: `${val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} pt` };
    } else {
      return { value: flOz, unit: 'fl oz', display: `${flOz.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} fl oz` };
    }
  }

  if (DRY_UNITS.has(u)) {
    // Convert everything to oz first
    let oz = totalAmount;
    if (u === 'lb' || u === 'lbs' || u === 'pound') oz = totalAmount * 16;
    else if (u === 'ton') oz = totalAmount * 32000;

    if (oz >= 32000) {
      const val = oz / 32000;
      return { value: val, unit: 'ton', display: `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ton` };
    } else if (oz >= 16) {
      const val = oz / 16;
      return { value: val, unit: 'lbs', display: `${val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} lbs` };
    } else {
      return { value: oz, unit: 'oz', display: `${oz.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} oz` };
    }
  }

  // Unknown unit — return as-is
  return {
    value: totalAmount,
    unit,
    display: `${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${unit}`,
  };
}
