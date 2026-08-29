import { describe, it, expect } from 'vitest';
import { buildInventoryQuantities, InventoryLineInput } from './inventoryMath';

const LINE_A: InventoryLineInput = {
  chemicalName: 'Roundup PowerMax',
  masterProductId: 'product-a',
  rateUnit: 'fl oz',
  totalNeeded: 256,
};

const LINE_B: InventoryLineInput = {
  chemicalName: 'Atrazine 4L',
  masterProductId: 'product-b',
  rateUnit: 'qt',
  totalNeeded: 8,
};

describe('buildInventoryQuantities', () => {
  it('converts each line into its own product stock unit', () => {
    const units = new Map([
      ['product-a', 'gal'],
      ['product-b', 'gal'],
    ]);

    const result = buildInventoryQuantities([LINE_A, LINE_B], units);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quantities).toEqual([
      { masterProductId: 'product-a', chemicalName: 'Roundup PowerMax', quantity: 2 },
      { masterProductId: 'product-b', chemicalName: 'Atrazine 4L', quantity: 2 },
    ]);
  });

  it('returns positive quantities so the caller owns the sign', () => {
    const units = new Map([['product-a', 'gal']]);
    const result = buildInventoryQuantities(
      [{ ...LINE_A, totalNeeded: -256 }],
      units
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quantities[0].quantity).toBe(2);
  });

  it('blocks the whole operation when any line cannot be converted', () => {
    const units = new Map([
      ['product-a', 'gal'],
      ['product-b', 'lbs'], // a liquid rate against a product held by weight
    ]);

    const result = buildInventoryQuantities([LINE_A, LINE_B], units);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    // The message must name the line and both units (WI-11 acceptance criterion).
    expect(result.problems[0]).toContain('Atrazine 4L');
    expect(result.problems[0]).toContain('qt');
    expect(result.problems[0]).toContain('lbs');
  });

  it('refuses rather than assuming a unit when the product could not be read', () => {
    // The old code fell back to the line's own rate unit here, which posts a
    // ledger entry in the wrong unit whenever the product lookup came up empty.
    const result = buildInventoryQuantities([LINE_A], new Map());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toContain('Roundup PowerMax');
  });

  it('reports every problem line, not just the first', () => {
    const result = buildInventoryQuantities([LINE_A, LINE_B], new Map());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
  });

  it('handles an empty line list', () => {
    const result = buildInventoryQuantities([], new Map());
    expect(result).toEqual({ ok: true, quantities: [] });
  });

  it('passes identical units straight through', () => {
    const units = new Map([['product-a', 'fl oz']]);
    const result = buildInventoryQuantities([LINE_A], units);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quantities[0].quantity).toBe(256);
  });
});
