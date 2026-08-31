import { describe, it, expect } from 'vitest';
import { applyFieldCostOverrides, calculateTemplateCost, calculateFieldTotalCost } from './templateCalculations';
import type { Database } from '../database.types';

type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];

/** Build a template row from a partial, as the calculators only read numbers. */
function template(overrides: Record<string, unknown>): CostTemplate {
  return overrides as unknown as CostTemplate;
}

describe('calculateTemplateCost', () => {
  it('sums program costs and every flat per-acre column', () => {
    const cost = calculateTemplateCost(
      template({
        fertilizer_programs: [{ program_id: 'f1', cost_per_acre: 40 }],
        chemical_programs: [
          { program_id: 'c1', cost_per_acre: 15 },
          { program_id: 'c2', cost_per_acre: 5 },
        ],
        tillage_cost_per_acre: 20,
        planting_cost_per_acre: 18,
        harvest_cost_per_acre: 30,
        equipment_cost_per_acre: 12,
        custom_services_cost_per_acre: 8,
        labor_cost_per_acre: 10,
        crop_insurance_cost_per_acre: 22,
        drying_storage_cost_per_acre: 14,
        hauling_cost_per_acre: 9,
        other_expenses_per_acre: 7,
      })
    );

    expect(cost).toBe(40 + 20 + 20 + 18 + 30 + 12 + 8 + 10 + 22 + 14 + 9 + 7);
  });

  it('returns zero for a template with nothing set', () => {
    expect(calculateTemplateCost(template({}))).toBe(0);
  });

  it('treats null columns as zero rather than producing NaN', () => {
    const cost = calculateTemplateCost(
      template({
        fertilizer_programs: null,
        chemical_programs: null,
        tillage_cost_per_acre: null,
        planting_cost_per_acre: 25,
        harvest_cost_per_acre: undefined,
      })
    );

    expect(cost).toBe(25);
  });

  it('ignores a program entry with no cost_per_acre', () => {
    const cost = calculateTemplateCost(
      template({
        chemical_programs: [{ program_id: 'c1' }, { program_id: 'c2', cost_per_acre: 11 }],
      })
    );

    expect(cost).toBe(11);
  });

  it('ignores a programs column that is not an array', () => {
    const cost = calculateTemplateCost(
      template({ chemical_programs: { program_id: 'c1', cost_per_acre: 99 }, labor_cost_per_acre: 4 })
    );

    expect(cost).toBe(4);
  });

  it('handles numeric columns arriving as strings from Postgres', () => {
    const cost = calculateTemplateCost(
      template({ tillage_cost_per_acre: '20.50', hauling_cost_per_acre: '4.50' })
    );

    expect(cost).toBe(25);
  });
});

describe('calculateFieldTotalCost', () => {
  it('sums every per-acre component', () => {
    const total = calculateFieldTotalCost({
      seed_cost_per_acre: 100,
      fertilizer_cost_per_acre: 40,
      chemical_cost_per_acre: 20,
      tillage_cost_per_acre: 20,
      planting_cost_per_acre: 18,
      harvest_cost_per_acre: 30,
      equipment_cost_per_acre: 12,
      custom_services_cost_per_acre: 8,
      labor_cost_per_acre: 10,
      crop_insurance_cost_per_acre: 22,
      drying_storage_cost_per_acre: 14,
      hauling_cost_per_acre: 9,
      other_expenses_per_acre: 7,
    });

    expect(total).toBe(310);
  });

  it('returns zero for an empty field cost row', () => {
    expect(calculateFieldTotalCost({})).toBe(0);
  });

  it('treats nulls and missing columns as zero', () => {
    const total = calculateFieldTotalCost({
      seed_cost_per_acre: null,
      fertilizer_cost_per_acre: 40,
      chemical_cost_per_acre: undefined,
    });

    expect(total).toBe(40);
  });

  it('does not let one bad column poison the total with NaN', () => {
    // Number('') is 0 and Number(null) is 0, so a blank column stays harmless.
    const total = calculateFieldTotalCost({ seed_cost_per_acre: '', fertilizer_cost_per_acre: 40 });
    expect(total).toBe(40);
  });
});

/*
 * These are the regression tests for the defect that ran undetected from February to
 * August 2026 on nine real fields: the cascade recomputed total_cost_per_acre from the
 * raw field_costs columns, never consulting field_cost_overrides, so the total reverted
 * to the pure template figure while every line item on screen still showed the override.
 *
 * The invariant, stated once: an override lives in field_cost_overrides.override_value,
 * NOT in the field_costs column it names. Any total must resolve the two.
 */
describe('applyFieldCostOverrides', () => {
  it('lays a numeric override over the template value in its own column', () => {
    const resolved = applyFieldCostOverrides(
      { hauling_cost_per_acre: 80, tillage_cost_per_acre: 20 },
      new Map<string, unknown>([['hauling_cost_per_acre', 70]])
    );
    expect(resolved.hauling_cost_per_acre).toBe(70);
    // Untouched columns must survive intact.
    expect(resolved.tillage_cost_per_acre).toBe(20);
  });

  it('does not mutate the row it is given', () => {
    const base = { hauling_cost_per_acre: 80 };
    applyFieldCostOverrides(base, new Map<string, unknown>([['hauling_cost_per_acre', 70]]));
    expect(base.hauling_cost_per_acre).toBe(80);
  });

  it('returns a copy when there are no overrides', () => {
    const base = { hauling_cost_per_acre: 80 };
    const resolved = applyFieldCostOverrides(base, new Map());
    expect(resolved).toEqual(base);
    expect(resolved).not.toBe(base);
  });

  it('handles a null or undefined override map', () => {
    expect(applyFieldCostOverrides({ a: 1 }, null)).toEqual({ a: 1 });
    expect(applyFieldCostOverrides({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it('accepts a numeric string, because override_value is jsonb', () => {
    const resolved = applyFieldCostOverrides(
      { hauling_cost_per_acre: 80 },
      new Map<string, unknown>([['hauling_cost_per_acre', '70']])
    );
    expect(resolved.hauling_cost_per_acre).toBe(70);
  });

  it('leaves the template value standing for a non-numeric override', () => {
    // Never turn a field cost into NaN. A junk override is not an override.
    for (const junk of [null, '', 'abc', undefined, {}]) {
      const resolved = applyFieldCostOverrides(
        { hauling_cost_per_acre: 80 },
        new Map<string, unknown>([['hauling_cost_per_acre', junk]])
      );
      expect(resolved.hauling_cost_per_acre).toBe(80);
    }
  });

  it('accepts a legitimate zero override', () => {
    // The truthiness trap: 0 is a real answer, not a missing one.
    const resolved = applyFieldCostOverrides(
      { hauling_cost_per_acre: 80 },
      new Map<string, unknown>([['hauling_cost_per_acre', 0]])
    );
    expect(resolved.hauling_cost_per_acre).toBe(0);
  });

  it('resolves a program-array override to the matching cost column as a sum', () => {
    const resolved = applyFieldCostOverrides(
      { chemical_cost_per_acre: 80.52 },
      new Map<string, unknown>([
        ['chemical_programs', [{ program_id: 'c1', cost_per_acre: 60 }, { program_id: 'c2', cost_per_acre: 45 }]],
      ])
    );
    expect(resolved.chemical_cost_per_acre).toBe(105);
  });

  it('ignores an array override under a key with no cost column', () => {
    const resolved = applyFieldCostOverrides(
      { chemical_cost_per_acre: 80.52 },
      new Map<string, unknown>([['something_else', [{ cost_per_acre: 999 }]]])
    );
    expect(resolved.chemical_cost_per_acre).toBe(80.52);
    expect(resolved.something_else).toBeUndefined();
  });
});

describe('cascade totalling — the nine-field regression', () => {
  /*
   * Reproduces the exact production shapes. Both directions matter: the chemical
   * overrides made the total too LOW, the hauling overrides made it too HIGH, which is
   * why "the total looked plausible" was never evidence of anything.
   */
  it('Home West of Bins: an override above the template raises the total', () => {
    const fieldCostRow = { chemical_cost_per_acre: 80.52, seed_cost_per_acre: 609 };
    const overrides = new Map<string, unknown>([['chemical_cost_per_acre', 105]]);

    const wrong = calculateFieldTotalCost(fieldCostRow);
    const right = calculateFieldTotalCost(applyFieldCostOverrides(fieldCostRow, overrides));

    expect(wrong).toBeCloseTo(689.52, 2);
    expect(right).toBeCloseTo(714, 2);
    expect(right - wrong).toBeCloseTo(24.48, 2);
  });

  it('Umek: an override below the template lowers the total', () => {
    const fieldCostRow = { hauling_cost_per_acre: 80, seed_cost_per_acre: 603.72 };
    const overrides = new Map<string, unknown>([['hauling_cost_per_acre', 60]]);

    const wrong = calculateFieldTotalCost(fieldCostRow);
    const right = calculateFieldTotalCost(applyFieldCostOverrides(fieldCostRow, overrides));

    expect(wrong).toBeCloseTo(683.72, 2);
    expect(right).toBeCloseTo(663.72, 2);
    expect(right - wrong).toBeCloseTo(-20, 2);
  });

  it('a field with no overrides totals identically either way', () => {
    // The fix must be inert for the overwhelming majority of fields.
    const fieldCostRow = {
      seed_cost_per_acre: 100, fertilizer_cost_per_acre: 40, chemical_cost_per_acre: 80.52,
      tillage_cost_per_acre: 20, hauling_cost_per_acre: 80,
    };
    expect(calculateFieldTotalCost(applyFieldCostOverrides(fieldCostRow, new Map())))
      .toBe(calculateFieldTotalCost(fieldCostRow));
  });

  it('applying the template on top of an override still honours the override', () => {
    // This is the cascade's actual shape: row, then template updates, then resolve.
    const currentFieldCost = { chemical_cost_per_acre: 80.52, hauling_cost_per_acre: 80, seed_cost_per_acre: 500 };
    const templateUpdates = { chemical_cost_per_acre: 92.10, hauling_cost_per_acre: 85 };
    const overrides = new Map<string, unknown>([['hauling_cost_per_acre', 70]]);

    const total = calculateFieldTotalCost(
      applyFieldCostOverrides({ ...currentFieldCost, ...templateUpdates }, overrides)
    );

    // Chemical follows the template's new 92.10; hauling holds the user's 70.
    expect(total).toBeCloseTo(500 + 92.10 + 70, 2);
  });
});
