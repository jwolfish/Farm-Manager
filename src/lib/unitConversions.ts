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

export function calculateCostWithConversion(
  applicationRate: number,
  applicationUnit: string,
  pricePerUnit: number,
  priceUnit: string
): number {
  const convertedRate = convertUnits(applicationUnit, priceUnit, applicationRate);
  return convertedRate * pricePerUnit;
}
