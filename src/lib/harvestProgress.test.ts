import { describe, it, expect } from 'vitest';
import {
  isHarvested,
  isHarvestedRow,
  localIsoDate,
  totalBushels,
  summariseHarvest,
  suggestedYield,
  type HarvestField,
  type HarvestYieldRow,
} from './harvestProgress';

const STAMP = '2026-10-04T15:22:00.000Z';

function row(partial: Partial<HarvestYieldRow> = {}): HarvestYieldRow {
  return {
    yieldBushelsPerAcre: null,
    estimatedYieldBushelsPerAcre: null,
    harvestedAt: null,
    harvestDate: null,
    moisturePercentage: null,
    ...partial,
  };
}

function field(partial: Partial<HarvestField> & { name: string }): HarvestField {
  return {
    fieldId: partial.name.toLowerCase().replace(/\s+/g, '-'),
    cropType: 'corn',
    acreage: 100,
    ...partial,
  };
}

describe('isHarvested', () => {
  it('is true only for a row carrying the stamp', () => {
    expect(isHarvested(row({ harvestedAt: STAMP }))).toBe(true);
  });

  it('is false for a missing row', () => {
    expect(isHarvested(undefined)).toBe(false);
    expect(isHarvested(null)).toBe(false);
  });

  // The 2026 wheat row as it stood before this feature: a harvest date and nothing else.
  // That field HAD been cut, and the date could not say so — there was nowhere to record a
  // harvest, and a date typed while planning is the same two characters. A date is not
  // evidence in either direction, which is the whole reason for the stamp.
  it('is false for a row with a harvest date and no stamp', () => {
    expect(isHarvested(row({ harvestDate: '2026-07-15', yieldBushelsPerAcre: 100 }))).toBe(false);
  });

  // All 30 of 2026's estimate rows carry a yield above zero and none has been harvested.
  it('is false for a row with an estimate above zero', () => {
    expect(isHarvested(row({ yieldBushelsPerAcre: 171.2 }))).toBe(false);
  });
});

describe('totalBushels', () => {
  it('multiplies the rate by the acreage', () => {
    expect(totalBushels(186, 83)).toBe(15438);
  });

  it('returns zero rather than NaN for a missing rate or a zero-acre field', () => {
    expect(totalBushels(null, 83)).toBe(0);
    expect(totalBushels(186, 0)).toBe(0);
    expect(totalBushels(Number.NaN, 83)).toBe(0);
  });
});

describe('summariseHarvest', () => {
  it('measures progress in acres, not in fields', () => {
    // One 300-acre field off, three 20-acre fields standing: 3 of 4 fields to go, but the
    // crop is 83 % harvested. Counting fields would report 25 %.
    const [corn] = summariseHarvest([
      field({ name: 'Big', acreage: 300, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 200 }) }),
      field({ name: 'Small 1', acreage: 20, yieldRow: row({ estimatedYieldBushelsPerAcre: 180 }) }),
      field({ name: 'Small 2', acreage: 20, yieldRow: row({ estimatedYieldBushelsPerAcre: 180 }) }),
      field({ name: 'Small 3', acreage: 20, yieldRow: row({ estimatedYieldBushelsPerAcre: 180 }) }),
    ]);

    expect(corn.fieldsHarvested).toBe(1);
    expect(corn.fieldsToGo).toBe(3);
    expect(corn.acresHarvested).toBe(300);
    expect(corn.acresToGo).toBe(60);
    expect(corn.fractionHarvested).toBeCloseTo(0.8333, 4);
    expect(corn.bushelsHarvested).toBe(60000);
    expect(corn.bushelsToGo).toBe(10800);
  });

  it('never sums bushels across crops — one row per crop, and no total', () => {
    const summary = summariseHarvest([
      field({ name: 'Corn A', cropType: 'corn', acreage: 100, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 200 }) }),
      field({ name: 'Bean A', cropType: 'soybeans', acreage: 100, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 55 }) }),
    ]);

    expect(summary.map(s => s.cropType)).toEqual(['corn', 'soybeans']);
    expect(summary[0].bushelsHarvested).toBe(20000);
    expect(summary[1].bushelsHarvested).toBe(5500);
    // Nothing in the returned shape invites a cross-crop addition.
    expect(summary).toHaveLength(2);
  });

  it('returns crops in a stable order and omits crops with no fields', () => {
    const summary = summariseHarvest([
      field({ name: 'Bean', cropType: 'soybeans' }),
      field({ name: 'Corn', cropType: 'corn' }),
    ]);
    expect(summary.map(s => s.cropType)).toEqual(['corn', 'soybeans']);
  });

  it('counts and names unharvested fields with no estimate rather than reading them as zero', () => {
    // 2027's shape: fields exist, no yield rows at all.
    const [corn] = summariseHarvest([
      field({ name: 'Adkins', acreage: 40, yieldRow: row({ estimatedYieldBushelsPerAcre: 180 }) }),
      field({ name: 'Umek', acreage: 34 }),
      field({ name: 'Townline Road', acreage: 40, yieldRow: row() }),
    ]);

    expect(corn.bushelsToGo).toBe(7200);
    expect(corn.unestimated).toEqual({ count: 2, acres: 74, fieldNames: ['Umek', 'Townline Road'] });
  });

  it('counts a harvested field that made nothing', () => {
    // Hailed out: harvested, zero in the bin. Not the same as unentered, and the acres are
    // off the to-go figure either way.
    const [corn] = summariseHarvest([
      field({ name: 'Drowned', acreage: 50, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 0, estimatedYieldBushelsPerAcre: 180 }) }),
      field({ name: 'Standing', acreage: 50, yieldRow: row({ estimatedYieldBushelsPerAcre: 180 }) }),
    ]);

    expect(corn.fieldsHarvested).toBe(1);
    expect(corn.acresHarvested).toBe(50);
    expect(corn.bushelsHarvested).toBe(0);
    expect(corn.avgYieldHarvested).toBe(0);
    expect(corn.actualVsEstimate).toBe(-9000);
  });

  it('compares a harvested field against its OWN estimate', () => {
    const [corn] = summariseHarvest([
      field({ name: 'Beat it', acreage: 100, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 200, estimatedYieldBushelsPerAcre: 180 }) }),
      // A standing field with a wildly different estimate must not move the comparison.
      field({ name: 'Standing', acreage: 100, yieldRow: row({ estimatedYieldBushelsPerAcre: 40 }) }),
    ]);

    expect(corn.actualVsEstimate).toBe(2000);
  });

  it('reports no comparison when no harvested field carried an estimate', () => {
    const [corn] = summariseHarvest([
      field({ name: 'New ground', yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 150 }) }),
    ]);
    expect(corn.actualVsEstimate).toBeNull();
    expect(corn.bushelsHarvested).toBe(15000);
  });

  it('weights moisture by bushels and says how many fields it averaged', () => {
    // 20,000 bu at 22 % and 5,000 bu at 15 % is 20.6 %, not the 18.5 % a flat mean gives.
    const [corn] = summariseHarvest([
      field({ name: 'Wet', acreage: 100, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 200, moisturePercentage: 22 }) }),
      field({ name: 'Dry', acreage: 25, yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 200, moisturePercentage: 15 }) }),
    ]);

    expect(corn.avgMoisture?.percentage).toBeCloseTo(20.6, 6);
    expect(corn.avgMoisture?.recordedOn).toBe(2);
  });

  it('reports no moisture at all rather than a zero when none was recorded', () => {
    const [corn] = summariseHarvest([
      field({ name: 'A', yieldRow: row({ harvestedAt: STAMP, yieldBushelsPerAcre: 200 }) }),
    ]);
    expect(corn.avgMoisture).toBeNull();
  });

  it('is inert on a season where nothing has been harvested', () => {
    // 2026 as it stands today: 30 estimate rows, one of them carrying a stray harvest date.
    const [corn] = summariseHarvest([
      field({ name: 'A', acreage: 83, yieldRow: row({ estimatedYieldBushelsPerAcre: 171.2, yieldBushelsPerAcre: 171.2, harvestDate: '2026-07-15' }) }),
      field({ name: 'B', acreage: 17, yieldRow: row({ estimatedYieldBushelsPerAcre: 171.2, yieldBushelsPerAcre: 171.2 }) }),
    ]);

    expect(corn.fieldsHarvested).toBe(0);
    expect(corn.fractionHarvested).toBe(0);
    expect(corn.bushelsHarvested).toBe(0);
    expect(corn.bushelsToGo).toBeCloseTo(17120, 6);
    expect(corn.avgYieldHarvested).toBeNull();
  });

  it('does not divide by zero on a crop with no acreage', () => {
    const [corn] = summariseHarvest([field({ name: 'Placeholder', acreage: 0 })]);
    expect(corn.fractionHarvested).toBe(0);
    expect(corn.avgYieldHarvested).toBeNull();
    expect(Number.isNaN(corn.bushelsToGo)).toBe(false);
  });

  it('returns nothing for a season with no fields', () => {
    expect(summariseHarvest([])).toEqual([]);
  });
});

describe('suggestedYield', () => {
  it('offers the field\'s own estimate before harvest', () => {
    expect(suggestedYield(row({ estimatedYieldBushelsPerAcre: 180 }))).toBe(180);
  });

  it('offers what was entered when re-opening a harvested field', () => {
    expect(suggestedYield(row({ harvestedAt: STAMP, yieldBushelsPerAcre: 204, estimatedYieldBushelsPerAcre: 180 }))).toBe(204);
  });

  it('offers nothing rather than a crop average when the field has no estimate', () => {
    expect(suggestedYield(row())).toBeNull();
    expect(suggestedYield(undefined)).toBeNull();
  });
});

describe('isHarvestedRow', () => {
  // The Yields screen holds rows in the database's own shape. Two spellings, one body —
  // a private copy of this predicate on that screen is what rule 1 exists to prevent.
  it('reads the snake_case column and agrees with isHarvested', () => {
    expect(isHarvestedRow({ harvested_at: STAMP })).toBe(true);
    expect(isHarvestedRow({ harvested_at: null })).toBe(false);
    expect(isHarvestedRow(undefined)).toBe(false);
    expect(isHarvestedRow({})).toBe(false);
    expect(isHarvestedRow({ harvested_at: STAMP })).toBe(isHarvested(row({ harvestedAt: STAMP })));
  });
});

describe('localIsoDate', () => {
  it('reports the LOCAL day, not the UTC one', () => {
    // 9pm on 4 October in a timezone behind UTC is already 5 October in UTC. The sheet must
    // default to the 4th — the day the field was actually cut.
    const evening = new Date(2026, 9, 4, 21, 30);
    expect(localIsoDate(evening)).toBe('2026-10-04');
  });

  it('reports a zero-padded date', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});
