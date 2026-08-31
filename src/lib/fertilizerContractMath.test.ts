import { describe, it, expect } from 'vitest';
import {
  rollUpProduct,
  sumSeasonTotals,
  planLineDraw,
  sumContractCommitment,
  matchFertilizerProductByName,
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

describe('planLineDraw — the partial-draw case', () => {
  // The owner's own example: a 24-ton semi against a booking with 20.35 t left.
  it('splits a semi across a booking and a spot buy', () => {
    const p = planLineDraw(24, 'ton', 'ton', 20.35);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.overDraws).toBe(true);
    expect(p.split).toEqual({
      onContractInLineUnit: 20.35,
      onSpotInLineUnit: 3.65,
      onSpotInProductUnit: 3.65,
    });
  });

  it('the two halves add back to exactly what was typed', () => {
    const p = planLineDraw(24, 'ton', 'ton', 20.35);
    if (!p.ok || !p.split) throw new Error('expected a split');
    expect(p.split.onContractInLineUnit + p.split.onSpotInLineUnit).toBe(24);
  });

  it('does not fire when the load exactly fills the booking', () => {
    const p = planLineDraw(20, 'ton', 'ton', 20);
    expect(p).toMatchObject({ ok: true, overDraws: false, split: null });
  });

  it('does not fire when the load is under the booking', () => {
    const p = planLineDraw(10, 'ton', 'ton', 20);
    expect(p).toMatchObject({ ok: true, overDraws: false, split: null });
  });

  it('reports no over-draw when no booking is chosen', () => {
    const p = planLineDraw(24, 'ton', 'ton', null);
    expect(p).toMatchObject({ ok: true, quantityInProductUnit: 24, remaining: null, overDraws: false, split: null });
  });

  it('over-draws with nothing to keep on a fully-taken booking, and offers no split', () => {
    // remaining 0: the whole line is a spot buy. A "split" of 0 and 24 would be
    // a worse thing to show than "book all of it".
    const p = planLineDraw(24, 'ton', 'ton', 0);
    expect(p).toMatchObject({ ok: true, overDraws: true, split: null });
  });

  it('splits a line entered in another unit, in that unit', () => {
    // 4000 lb against a per-ton booking with 1 ton left.
    const p = planLineDraw(4000, 'lbs', 'ton', 1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.quantityInProductUnit).toBe(2);
    expect(p.split).toEqual({
      onContractInLineUnit: 2000,
      onSpotInLineUnit: 2000,
      onSpotInProductUnit: 1,
    });
  });

  it('bridges gallons to tons through a density', () => {
    // 11.1 lb/gal: 100 gal = 1110 lb = 0.555 ton.
    const p = planLineDraw(100, 'gallon', 'ton', 0.5, 11.1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.quantityInProductUnit).toBeCloseTo(0.555, 10);
    expect(p.overDraws).toBe(true);
    expect(p.split?.onSpotInProductUnit).toBeCloseTo(0.055, 10);
  });

  it('refuses rather than guessing when a liquid has no density', () => {
    const p = planLineDraw(100, 'gallon', 'ton', 50, null);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.message).toMatch(/density/i);
  });

  it('refuses an unrecognised unit', () => {
    const p = planLineDraw(10, 'jugs', 'ton', 5);
    expect(p.ok).toBe(false);
  });

  it('does not offer a split for float dust', () => {
    // A converted quantity a hair over the remaining is not an over-draw.
    const p = planLineDraw(24 + 1e-12, 'ton', 'ton', 24);
    expect(p).toMatchObject({ ok: true, overDraws: false });
  });
});

describe('sumContractCommitment — the one total that may cross products', () => {
  it('totals quantity x price in money', () => {
    // The owner's live Potash: 12t@495 + 2t@550 + 50t@505
    const r = sumContractCommitment([
      { contractedQuantity: 12, pricePerUnit: 495 },
      { contractedQuantity: 2, pricePerUnit: 550 },
      { contractedQuantity: 50, pricePerUnit: 505 },
    ]);
    expect(r.committed).toBe(32290);
    expect(r.unpricedContracts).toBe(0);
  });

  it('adds across products sold in different units, because dollars are dollars', () => {
    // 20 ton of a dry product and 500 gallons of a liquid. Summing the
    // QUANTITIES would be meaningless; summing the money is not.
    const r = sumContractCommitment([
      { contractedQuantity: 20, pricePerUnit: 500 },
      { contractedQuantity: 500, pricePerUnit: 3.25 },
    ]);
    expect(r.committed).toBe(11625);
  });

  it('excludes an unpriced booking and counts it, so the total reads as a floor', () => {
    const r = sumContractCommitment([
      { contractedQuantity: 10, pricePerUnit: 100 },
      { contractedQuantity: 40, pricePerUnit: null },
    ]);
    // Not 1000 + 0: an unpriced booking does not cost nothing, it is unknown.
    expect(r.committed).toBe(1000);
    expect(r.unpricedContracts).toBe(1);
  });

  it('is zero with no contracts, and reports nothing unpriced', () => {
    expect(sumContractCommitment([])).toEqual({ committed: 0, unpricedContracts: 0 });
  });

  it('is zero when every booking is unpriced', () => {
    const r = sumContractCommitment([
      { contractedQuantity: 10, pricePerUnit: null },
      { contractedQuantity: 20, pricePerUnit: null },
    ]);
    expect(r).toEqual({ committed: 0, unpricedContracts: 2 });
  });

  it('rounds to cents', () => {
    const r = sumContractCommitment([{ contractedQuantity: 3, pricePerUnit: 10.005 }]);
    expect(r.committed).toBe(30.02);
  });

  it('ignores a non-finite value rather than producing NaN', () => {
    const r = sumContractCommitment([
      { contractedQuantity: 10, pricePerUnit: 100 },
      { contractedQuantity: Infinity, pricePerUnit: 5 },
    ]);
    expect(r.committed).toBe(1000);
  });
});

describe('matchFertilizerProductByName — the shopping-list handoff', () => {
  const products = [
    { id: 'p1', product_name: 'Urea' },
    { id: 'p2', product_name: 'Potash' },
    { id: 'p3', product_name: '6-24-6 Starter' },
  ];

  it('matches the obvious case', () => {
    expect(matchFertilizerProductByName(products, 'Urea')?.id).toBe('p1');
  });

  it('tolerates case and surrounding whitespace', () => {
    expect(matchFertilizerProductByName(products, '  urea ')?.id).toBe('p1');
    expect(matchFertilizerProductByName(products, 'POTASH')?.id).toBe('p2');
  });

  it('prefers an exact match over a case-variant', () => {
    // Two products differing only in case must still resolve to the one
    // actually named, rather than to whichever happens to come first.
    const tricky = [
      { id: 'lower', product_name: 'urea' },
      { id: 'proper', product_name: 'Urea' },
    ];
    expect(matchFertilizerProductByName(tricky, 'Urea')?.id).toBe('proper');
    expect(matchFertilizerProductByName(tricky, 'urea')?.id).toBe('lower');
  });

  it('returns null rather than guessing when the product is gone', () => {
    // The rename case. Null is what lets the caller say so out loud, instead of
    // reporting a purchase that changed no price -- the old record_purchase bug.
    expect(matchFertilizerProductByName(products, 'Urea 46-0-0')).toBeNull();
  });

  it('returns null for a blank name rather than matching anything', () => {
    expect(matchFertilizerProductByName(products, '   ')).toBeNull();
  });

  it('handles an empty product list', () => {
    expect(matchFertilizerProductByName([], 'Urea')).toBeNull();
  });
});
