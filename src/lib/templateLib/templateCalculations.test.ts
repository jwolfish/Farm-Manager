import { describe, it, expect } from 'vitest';
import { calculateTemplateCost, calculateFieldTotalCost } from './templateCalculations';
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
