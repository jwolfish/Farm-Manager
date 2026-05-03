export function convertUnits(
  fromUnit: string,
  toUnit: string,
  amount: number
): number {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();

  if (from === to) {
    return amount;
  }

  const conversionFactors: { [key: string]: { [key: string]: number } } = {
    ton: {
      pound: 2000,
      lb: 2000,
      lbs: 2000,
      oz: 32000,
      ounce: 32000,
    },
    pound: {
      ton: 1 / 2000,
      lb: 1,
      lbs: 1,
      oz: 16,
      ounce: 16,
    },
    lb: {
      ton: 1 / 2000,
      pound: 1,
      lbs: 1,
      oz: 16,
      ounce: 16,
    },
    lbs: {
      ton: 1 / 2000,
      pound: 1,
      lb: 1,
      oz: 16,
      ounce: 16,
    },
    oz: {
      ton: 1 / 32000,
      pound: 1 / 16,
      lb: 1 / 16,
      lbs: 1 / 16,
      ounce: 1,
    },
    ounce: {
      ton: 1 / 32000,
      pound: 1 / 16,
      lb: 1 / 16,
      lbs: 1 / 16,
      oz: 1,
    },
    gallon: {
      gal: 1,
      pint: 8,
      pt: 8,
      quart: 4,
      qt: 4,
      'fl oz': 128,
      'fluid ounce': 128,
      'liquid ounce': 128,
    },
    gal: {
      gallon: 1,
      pint: 8,
      pt: 8,
      quart: 4,
      qt: 4,
      'fl oz': 128,
      'fluid ounce': 128,
      'liquid ounce': 128,
    },
    quart: {
      gallon: 1 / 4,
      gal: 1 / 4,
      qt: 1,
      pint: 2,
      pt: 2,
      'fl oz': 32,
      'fluid ounce': 32,
      'liquid ounce': 32,
    },
    qt: {
      gallon: 1 / 4,
      gal: 1 / 4,
      quart: 1,
      pint: 2,
      pt: 2,
      'fl oz': 32,
      'fluid ounce': 32,
      'liquid ounce': 32,
    },
    pint: {
      gallon: 1 / 8,
      gal: 1 / 8,
      quart: 1 / 2,
      qt: 1 / 2,
      pt: 1,
      'fl oz': 16,
      'fluid ounce': 16,
      'liquid ounce': 16,
    },
    pt: {
      gallon: 1 / 8,
      gal: 1 / 8,
      quart: 1 / 2,
      qt: 1 / 2,
      pint: 1,
      'fl oz': 16,
      'fluid ounce': 16,
      'liquid ounce': 16,
    },
    'fl oz': {
      gallon: 1 / 128,
      gal: 1 / 128,
      quart: 1 / 32,
      qt: 1 / 32,
      pint: 1 / 16,
      pt: 1 / 16,
      'fluid ounce': 1,
      'liquid ounce': 1,
    },
    'fluid ounce': {
      gallon: 1 / 128,
      gal: 1 / 128,
      quart: 1 / 32,
      qt: 1 / 32,
      pint: 1 / 16,
      pt: 1 / 16,
      'fl oz': 1,
      'liquid ounce': 1,
    },
    'liquid ounce': {
      gallon: 1 / 128,
      gal: 1 / 128,
      quart: 1 / 32,
      qt: 1 / 32,
      pint: 1 / 16,
      pt: 1 / 16,
      'fl oz': 1,
      'fluid ounce': 1,
    },
  };

  if (conversionFactors[from] && conversionFactors[from][to]) {
    return amount * conversionFactors[from][to];
  }

  return amount;
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

export function calculateCostWithConversion(
  applicationRate: number,
  applicationUnit: string,
  pricePerUnit: number,
  priceUnit: string
): number {
  const convertedRate = convertUnits(applicationUnit, priceUnit, applicationRate);
  return convertedRate * pricePerUnit;
}
