import { describe, it, expect } from 'vitest';
import {
  rollUpProduct,
  sumSeasonTotals,
  type ContractRow,
  type LoadLineRow,
} from './fertilizerContractMath';

const FALL: ContractRow = { id: 'c1', kind: 'contract', label: 'Fall', contractedQuantity: 60, pricePerUnit: 550 };
const JAN: ContractRow  = { id: 'c2', kind: 'contract', label: 'January', contractedQuantity: 20, pricePerUnit: 580 };
const SPOT: ContractRow = { id: 'c3', kind: 'spot', label: 'June spot', contractedQuantity: 8, pricePerUnit: 640 };

describe('rollUpProduct — the drawdown', () => {
  it('is contracted minus delivered', () => {
    const lines: LoadLineRow[] = [
      { contractId: 'c1', quantity: 24, unitType: 'ton' },
      { contractId: 'c1', quantity: 10, unitType: 'ton' },
    ];
    const r = rollUpProduct([FALL, JAN], lines, 'ton');
    expect(r.contracted).toBe(80);
    expect(r.delivered).toBe(34);
    expect(r.remaining).toBe(46);
  });

  it('reports remaining per booking, not just per product', () => {
    const lines: LoadLineRow[] = [{ contractId: 'c1', quantity: 34, unitType: 'ton' }];
    const r = rollUpProduct([FALL, JAN], lines, 'ton');
    expect(r.contracts.find((c) => c.id === 'c1')).toMatchObject({ delivered: 34, remaining: 26 });
    expect(r.contracts.find((c) => c.id === 'c2')).toMatchObject({ delivered: 0, remaining: 20 });
  });

  it('allows over-delivery and reports it as negative', () => {
    const lines: LoadLineRow[] = [{ contractId: 'c1', quantity: 70, unitType: 'ton' }];
    const r = rollUpProduct([FALL], lines, 'ton');
    // Buying above contract is normal; the app must not argue with it.
    expect(r.remaining).toBe(-10);
    expect(r.contracts[0].remaining).toBe(-10);
  });

  it('converts a load entered in another unit', () => {
    // 500 lb picked up in the spreader against a per-ton booking.
    const lines: LoadLineRow[] = [{ contractId: 'c1', quantity: 500, unitType: 'lbs' }];
    const r = rollUpProduct([FALL], lines, 'ton');
    expect(r.delivered).toBeCloseTo(0.25, 12);
  });

  it('counts a delivery with no booking, and says so separately', () => {
    const lines: LoadLineRow[] = [
      { contractId: 'c1', quantity: 10, unitType: 'ton' },
      { contractId: null, quantity: 4, unitType: 'ton' },
    ];
    const r = rollUpProduct([FALL], lines, 'ton');
    expect(r.delivered).toBe(14);
    expect(r.unattributedDelivered).toBe(4);
    expect(r.contracts[0].delivered).toBe(10);
  });

  it('excludes an unconvertible line and names it rather than counting it', () => {
    const lines: LoadLineRow[] = [
      { contractId: 'c1', quantity: 10, unitType: 'ton' },
      { contractId: 'c1', quantity: 5, unitType: 'gal' }, // no density given
    ];
    const r = rollUpProduct([FALL], lines, 'ton');
    expect(r.delivered).toBe(10);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain('gal');
  });

  it('converts a liquid load when the product carries a density', () => {
    const liquid: ContractRow = { ...FALL, contractedQuantity: 10 };
    const lines: LoadLineRow[] = [{ contractId: 'c1', quantity: 100, unitType: 'gal' }];
    // 100 gal x 11.1 lb/gal = 1110 lb = 0.555 ton
    const r = rollUpProduct([liquid], lines, 'ton', 11.1);
    expect(r.issues).toEqual([]);
    expect(r.delivered).toBeCloseTo(0.555, 9);
  });
});

describe('rollUpProduct — the blended price', () => {
  it('matches the worked example', () => {
    // 60t@550 + 20t@580 + 8t@640 over 88 t = 565.00
    const r = rollUpProduct([FALL, JAN, SPOT], [], 'ton');
    expect(r.blendedPrice).toBe(565);
  });

  it('treats a spot buy as just another contract', () => {
    const asContract = { ...SPOT, kind: 'contract' as const };
    expect(rollUpProduct([FALL, JAN, asContract], [], 'ton').blendedPrice)
      .toBe(rollUpProduct([FALL, JAN, SPOT], [], 'ton').blendedPrice);
  });

  it('excludes an unpriced booking from the average but counts its tonnage', () => {
    const unpriced: ContractRow = { id: 'c9', kind: 'contract', label: 'TBD', contractedQuantity: 100, pricePerUnit: null };
    const r = rollUpProduct([FALL, JAN, unpriced], [], 'ton');
    // Without the exclusion, 100 t at "zero" would drag 557.50 down to ~247.
    expect(r.blendedPrice).toBe(557.5);
    expect(r.contracted).toBe(180);
  });

  it('is null when nothing is priced yet', () => {
    const unpriced: ContractRow = { id: 'c9', kind: 'contract', label: 'TBD', contractedQuantity: 100, pricePerUnit: null };
    const r = rollUpProduct([unpriced], [], 'ton');
    expect(r.blendedPrice).toBeNull();
  });

  it('weights the delivered figure by what actually arrived', () => {
    // 50 t taken against the $550 booking, all 20 t against the $580 one.
    const lines: LoadLineRow[] = [
      { contractId: 'c1', quantity: 50, unitType: 'ton' },
      { contractId: 'c2', quantity: 20, unitType: 'ton' },
    ];
    const r = rollUpProduct([FALL, JAN], lines, 'ton');
    expect(r.blendedPrice).toBe(557.5);                       // contracted-weighted
    expect(r.deliveredWeightedPrice).toBe(558.57);            // (50*550+20*580)/70
  });

  it('has no delivered-weighted price before any priced delivery', () => {
    expect(rollUpProduct([FALL, JAN], [], 'ton').deliveredWeightedPrice).toBeNull();
  });

  it('rounds to cents so it agrees with the database trigger', () => {
    const a: ContractRow = { id: 'a', kind: 'contract', label: null, contractedQuantity: 3, pricePerUnit: 100 };
    const b: ContractRow = { id: 'b', kind: 'contract', label: null, contractedQuantity: 7, pricePerUnit: 111.11 };
    const r = rollUpProduct([a, b], [], 'ton');
    expect(r.blendedPrice).toBe(107.78);
  });
});

describe('sumSeasonTotals', () => {
  it('totals delivery fees and counts the loads', () => {
    const r = sumSeasonTotals([{ deliveryFee: 125 }, { deliveryFee: 250.5 }, { deliveryFee: 0 }]);
    expect(r.deliveryFees).toBe(375.5);
    expect(r.loadCount).toBe(3);
  });

  it('ignores a non-finite fee rather than producing NaN', () => {
    const r = sumSeasonTotals([{ deliveryFee: 125 }, { deliveryFee: NaN }]);
    expect(r.deliveryFees).toBe(125);
    expect(r.loadCount).toBe(2);
  });
});
