import { describe, it, expect } from 'vitest';
import { allocateCropRevenue, RevenueAllocationField } from './fieldRevenueAllocation';

function total(map: Map<string, number>): number {
  return [...map.values()].reduce((s, v) => s + v, 0);
}

describe('allocateCropRevenue — WI-17', () => {
  it('the PRD case: 200 bu/ac and 0 bu/ac on equal acres — all revenue to the producer', () => {
    const r = allocateCropRevenue(100_000, [
      { fieldId: 'good', acreage: 100, yieldPerAcre: 200 },
      { fieldId: 'failed', acreage: 100, yieldPerAcre: 0 },
    ]);
    expect(r.basis).toBe('bushels');
    expect(r.revenueByField.get('good')).toBe(100_000);
    expect(r.revenueByField.get('failed')).toBe(0);
  });

  it('is NOT the old acreage split when yields differ', () => {
    const r = allocateCropRevenue(90_000, [
      { fieldId: 'a', acreage: 100, yieldPerAcre: 200 },
      { fieldId: 'b', acreage: 100, yieldPerAcre: 100 },
    ]);
    // Acreage would give 45,000 each; bushels give 2:1.
    expect(r.revenueByField.get('a')).toBeCloseTo(60_000, 6);
    expect(r.revenueByField.get('b')).toBeCloseTo(30_000, 6);
  });

  it('weights by bushels, so a small high-yield field is credited per acre above a large one', () => {
    const r = allocateCropRevenue(50_000, [
      { fieldId: 'small', acreage: 25, yieldPerAcre: 220 },
      { fieldId: 'big', acreage: 83, yieldPerAcre: 180 },
    ]);
    const perAcreSmall = r.revenueByField.get('small')! / 25;
    const perAcreBig = r.revenueByField.get('big')! / 83;
    expect(perAcreSmall / perAcreBig).toBeCloseTo(220 / 180, 9);
  });

  it('reconciles to recorded sales whatever the basis', () => {
    const cases: RevenueAllocationField[][] = [
      [{ fieldId: 'a', acreage: 83, yieldPerAcre: 204.3 }, { fieldId: 'b', acreage: 61, yieldPerAcre: 168 }],
      [{ fieldId: 'a', acreage: 83, yieldPerAcre: null }, { fieldId: 'b', acreage: 61, yieldPerAcre: null }],
      [{ fieldId: 'a', acreage: 83, yieldPerAcre: 190 }, { fieldId: 'b', acreage: 61, yieldPerAcre: null }],
    ];
    for (const fields of cases) {
      expect(total(allocateCropRevenue(123_456.78, fields).revenueByField)).toBeCloseTo(123_456.78, 6);
    }
  });

  it('a field with NO yield is credited at the crop average, never at zero, and is named', () => {
    const r = allocateCropRevenue(60_000, [
      { fieldId: 'a', acreage: 100, yieldPerAcre: 200 },
      { fieldId: 'b', acreage: 100, yieldPerAcre: 100 },
      { fieldId: 'unknown', acreage: 100, yieldPerAcre: null },
    ]);
    expect(r.imputedFieldIds).toEqual(['unknown']);
    // Average yield is 150, so weights are 20,000 / 10,000 / 15,000 bushels.
    expect(r.revenueByField.get('unknown')).toBeCloseTo(20_000, 6);
    expect(r.revenueByField.get('unknown')).toBeGreaterThan(0);
  });

  it('a harvested zero is a real zero, not a missing number', () => {
    const r = allocateCropRevenue(10_000, [
      { fieldId: 'a', acreage: 50, yieldPerAcre: 180 },
      { fieldId: 'hailed', acreage: 50, yieldPerAcre: 0 },
    ]);
    expect(r.imputedFieldIds).toEqual([]);
    expect(r.revenueByField.get('hailed')).toBe(0);
  });

  it('falls back to acreage when no field in the crop has a yield — the old behaviour, unchanged', () => {
    const r = allocateCropRevenue(40_000, [
      { fieldId: 'a', acreage: 30, yieldPerAcre: null },
      { fieldId: 'b', acreage: 10, yieldPerAcre: null },
    ]);
    expect(r.basis).toBe('acreage');
    expect(r.revenueByField.get('a')).toBe(30_000);
    expect(r.revenueByField.get('b')).toBe(10_000);
    expect(r.imputedFieldIds).toEqual([]);
  });

  it('falls back to acreage when every recorded yield is zero, rather than dividing by nothing', () => {
    const r = allocateCropRevenue(1_000, [
      { fieldId: 'a', acreage: 3, yieldPerAcre: 0 },
      { fieldId: 'b', acreage: 1, yieldPerAcre: 0 },
    ]);
    expect(r.basis).toBe('acreage');
    expect(r.revenueByField.get('a')).toBe(750);
  });

  it('a field with no acreage gets nothing and does not distort the rest', () => {
    const r = allocateCropRevenue(5_000, [
      { fieldId: 'a', acreage: 10, yieldPerAcre: 200 },
      { fieldId: 'zero', acreage: 0, yieldPerAcre: 200 },
    ]);
    expect(r.revenueByField.get('a')).toBe(5_000);
    expect(r.revenueByField.get('zero')).toBe(0);
  });

  it('ignores a non-finite yield rather than producing NaN money', () => {
    const r = allocateCropRevenue(2_000, [
      { fieldId: 'a', acreage: 10, yieldPerAcre: 200 },
      { fieldId: 'b', acreage: 10, yieldPerAcre: Number.NaN },
    ]);
    expect(Number.isNaN(r.revenueByField.get('b'))).toBe(false);
    expect(r.imputedFieldIds).toEqual(['b']);
    expect(total(r.revenueByField)).toBeCloseTo(2_000, 9);
  });

  it('with no fields returns an empty map rather than throwing', () => {
    const r = allocateCropRevenue(1_000, []);
    expect(r.revenueByField.size).toBe(0);
  });
});
