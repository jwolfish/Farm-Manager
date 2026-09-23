import { describe, it, expect } from 'vitest';
import { emptyChemicalInventory, indexInventoryRows, lookupChemicalInventory } from './chemicalInventory';

const chem = { id: 'c1', canonical_name: 'Atrazine', on_hand_quantity: 12, unit_type: 'gal', product_category: 'chemical' };
const seed = { id: 's1', canonical_name: 'Atrazine', on_hand_quantity: 400, unit_type: 'bag', product_category: 'seed' };

describe('chemical inventory lookup — WI-18', () => {
  it('a seed sharing a chemical\'s name does not replace it, whichever arrives last', () => {
    for (const rows of [[chem, seed], [seed, chem]]) {
      const inv = emptyChemicalInventory();
      indexInventoryRows(inv, rows);
      expect(lookupChemicalInventory(inv, null, 'Atrazine')).toEqual({ masterProductId: 'c1', onHand: 12, unitType: 'gal' });
    }
  });

  it('both products stay reachable by their own id', () => {
    const inv = emptyChemicalInventory();
    indexInventoryRows(inv, [chem, seed]);
    expect(lookupChemicalInventory(inv, 'c1', 'x')?.onHand).toBe(12);
    expect(lookupChemicalInventory(inv, 's1', 'x')?.onHand).toBe(400);
  });

  it('a linked id wins over a name that points elsewhere', () => {
    const other = { ...chem, id: 'c2', canonical_name: 'Roundup', on_hand_quantity: 3 };
    const inv = emptyChemicalInventory();
    indexInventoryRows(inv, [chem, other]);
    expect(lookupChemicalInventory(inv, 'c2', 'Atrazine')?.masterProductId).toBe('c2');
  });

  it('falls back to the name for an unlinked line, and to nothing when neither matches', () => {
    const inv = emptyChemicalInventory();
    indexInventoryRows(inv, [chem]);
    expect(lookupChemicalInventory(inv, undefined, 'Atrazine')?.masterProductId).toBe('c1');
    expect(lookupChemicalInventory(inv, 'missing', 'Nope')).toBeUndefined();
  });

  it('a null on-hand reads as 0 stock, as before', () => {
    const inv = emptyChemicalInventory();
    indexInventoryRows(inv, [{ ...chem, on_hand_quantity: null }]);
    expect(lookupChemicalInventory(inv, 'c1', '')?.onHand).toBe(0);
  });
});
