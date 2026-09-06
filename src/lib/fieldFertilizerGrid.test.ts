import { describe, it, expect } from 'vitest';
import {
  buildRateGrid,
  changedRows,
  costGridRow,
  costProgramItself,
  gridRowToSavePayload,
  rowSignature,
  type GridFieldInput,
  type GridRow,
} from './fieldFertilizerGrid';
import type { FertilizerProductMeta, FieldRate, SeasonProgram } from './fieldFertilizerRates';

/*
 * V-6 — the bulk grid.
 *
 * The figures are the owner's real 2027 Corn Topdress N pass: Urea at 185 lb/ac priced by
 * the ton, AMS at 58 lb/ac, and Provant, a liquid quoted in quarts against a per-gallon
 * price. Provant is here on purpose — it is the row that exercises within-class conversion,
 * and a liquid with no density is what found the V-5 "Save was held hostage" defect.
 */

const UREA: FertilizerProductMeta = {
  productId: 'urea', productName: 'Urea', unitType: 'ton', pricePerUnit: 600, density: null,
};
const AMS: FertilizerProductMeta = {
  productId: 'ams', productName: 'AMS', unitType: 'ton', pricePerUnit: 450, density: null,
};
const PROVANT: FertilizerProductMeta = {
  productId: 'provant', productName: 'Provant Stability', unitType: 'gallon',
  pricePerUnit: 80, density: null,
};
const POTASH: FertilizerProductMeta = {
  productId: 'potash', productName: 'Potash', unitType: 'ton', pricePerUnit: 450, density: null,
};

const PRODUCTS = new Map<string, FertilizerProductMeta>([
  [UREA.productId, UREA], [AMS.productId, AMS],
  [PROVANT.productId, PROVANT], [POTASH.productId, POTASH],
]);

const TOPDRESS: SeasonProgram = {
  programId: 'topdress',
  programName: 'Corn Topdress N',
  applicationCost: 4,
  items: [
    { productId: 'urea', rate: 185, rateUnit: 'pound' },
    { productId: 'ams', rate: 58, rateUnit: 'pound' },
    { productId: 'provant', rate: 0.14, rateUnit: 'quart' },
  ],
};

const FIELDS: GridFieldInput[] = [
  { fieldId: 'f1', fieldName: 'Antioch Grade School', acreage: 24, applies: true, hasCostRow: true },
  { fieldId: 'f2', fieldName: 'Beck Road', acreage: 13, applies: true, hasCostRow: true },
  { fieldId: 'f3', fieldName: 'Gridley Big', acreage: 27, applies: false, hasCostRow: true },
  { fieldId: 'f4', fieldName: 'New Ground', acreage: 40, applies: true, hasCostRow: false },
];

describe('buildRateGrid', () => {
  it('gives every field a row and every program product a column', () => {
    const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
    expect(grid.rows.map((r) => r.fieldId)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(grid.columns.map((c) => c.product.productId)).toEqual(['urea', 'ams', 'provant']);
    expect(grid.issues).toEqual([]);
  });

  it('fills an inheriting row from the program, and marks it not custom', () => {
    const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
    const row = grid.rows[0];
    expect(row.isCustom).toBe(false);
    expect(row.cells.urea).toEqual({ rate: 185, rateUnit: 'pound' });
    expect(row.cells.provant).toEqual({ rate: 0.14, rateUnit: 'quart' });
  });

  it('replaces the whole row when a field carries any custom rate', () => {
    // Replace-wholly: this field's set is Urea alone, so AMS and Provant are NOT applied,
    // even though the program has them. That is the rule the whole feature turns on.
    const rates: FieldRate[] = [
      { fieldId: 'f1', programId: 'topdress', productId: 'urea', rate: 200, rateUnit: 'pound' },
    ];
    const grid = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    const row = grid.rows[0];
    expect(row.isCustom).toBe(true);
    expect(row.cells.urea.rate).toBe(200);
    expect(row.cells.ams.rate).toBeNull();
    expect(row.cells.provant.rate).toBeNull();
    // and the untouched field still inherits
    expect(grid.rows[1].isCustom).toBe(false);
    expect(grid.rows[1].cells.ams.rate).toBe(58);
  });

  it('adds a column for a product only one field carries, and flags it field-only', () => {
    const rates: FieldRate[] = [
      { fieldId: 'f2', programId: 'topdress', productId: 'urea', rate: 150, rateUnit: 'pound' },
      { fieldId: 'f2', programId: 'topdress', productId: 'potash', rate: 100, rateUnit: 'pound' },
    ];
    const grid = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    expect(grid.columns.map((c) => c.product.productId)).toEqual(['urea', 'ams', 'provant', 'potash']);
    expect(grid.columns[3].fieldOnly).toBe(true);
    expect(grid.columns[0].fieldOnly).toBe(false);
    expect(grid.rows[1].cells.potash.rate).toBe(100);
    // Every other field simply has no value in that column.
    expect(grid.rows[0].cells.potash.rate).toBeNull();
  });

  it('ignores rates belonging to another program', () => {
    const rates: FieldRate[] = [
      { fieldId: 'f1', programId: 'starter', productId: 'urea', rate: 999, rateUnit: 'pound' },
    ];
    const grid = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    expect(grid.rows[0].isCustom).toBe(false);
    expect(grid.rows[0].cells.urea.rate).toBe(185);
  });

  it('reports a rate naming an unknown product rather than dropping it', () => {
    const rates: FieldRate[] = [
      { fieldId: 'f1', programId: 'topdress', productId: 'ghost', rate: 5, rateUnit: 'pound' },
    ];
    const grid = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    expect(grid.issues.length).toBeGreaterThan(0);
    expect(grid.issues.join(' ')).toContain('ghost');
  });

  it('locks a field with no cost row, and says why', () => {
    const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
    const newGround = grid.rows[3];
    expect(newGround.readOnly).toBe(true);
    expect(newGround.readOnlyReason).toContain('cost template');
    expect(grid.rows[0].readOnly).toBe(false);
  });

  it('carries each field\'s applies flag through', () => {
    const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
    expect(grid.rows.map((r) => r.applies)).toEqual([true, true, false, true]);
  });
});

describe('costGridRow', () => {
  it('matches the program cost for an inheriting row', () => {
    const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
    // 185 lb = 0.0925 t x $600 = 55.50; 58 lb = 0.029 t x $450 = 13.05;
    // 0.14 qt = 0.035 gal x $80 = 2.80; plus $4 application = 75.35
    const cost = costGridRow(grid.rows[0], grid.columns, TOPDRESS.applicationCost);
    expect(cost.costPerAcre).toBeCloseTo(75.35, 10);
    expect(cost.unpricedItems).toEqual([]);
    expect(costProgramItself(TOPDRESS, PRODUCTS)).toBeCloseTo(75.35, 10);
  });

  it('costs a custom row from its own rates only', () => {
    const rates: FieldRate[] = [
      { fieldId: 'f1', programId: 'topdress', productId: 'urea', rate: 200, rateUnit: 'pound' },
    ];
    const grid = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    // 200 lb = 0.1 t x $600 = 60.00, plus $4 = 64.00. AMS and Provant contribute nothing.
    expect(costGridRow(grid.rows[0], grid.columns, 4).costPerAcre).toBeCloseTo(64, 10);
  });

  it('costs a row that does not apply at zero, application cost included', () => {
    const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
    expect(costGridRow(grid.rows[2], grid.columns, 4).costPerAcre).toBe(0);
  });

  it('reports an unconvertible product by name and undercounts rather than guessing', () => {
    // A liquid quoted by weight with no density: WI-11 says fail loudly, guardrail 8 says
    // mass and volume do not interconvert without one.
    const program: SeasonProgram = {
      ...TOPDRESS,
      items: [
        { productId: 'urea', rate: 185, rateUnit: 'pound' },
        { productId: 'provant', rate: 2, rateUnit: 'pound' },
      ],
    };
    const grid = buildRateGrid(program, FIELDS, [], PRODUCTS);
    const cost = costGridRow(grid.rows[0], grid.columns, 4);
    expect(cost.unpricedItems).toHaveLength(1);
    expect(cost.unpricedItems[0]).toContain('Provant Stability');
    expect(cost.costPerAcre).toBeCloseTo(59.5, 10); // Urea 55.50 + $4, Provant missing
  });
});

describe('rowSignature and changedRows', () => {
  const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);

  const edit = (row: GridRow, patch: Partial<GridRow>): GridRow => ({ ...row, ...patch });

  it('signs an inheriting row as the program regardless of the values it displays', () => {
    // The cells hold the program's numbers, but storing them would freeze this field
    // against a later program edit for no gain.
    expect(rowSignature(grid.rows[0], grid.columns)).toBe('program');
    expect(rowSignature(grid.rows[1], grid.columns)).toBe('program');
  });

  it('finds nothing changed when nothing was touched', () => {
    expect(changedRows(grid.rows, grid.rows, grid.columns)).toEqual([]);
  });

  it('finds a row that became custom', () => {
    const draft = grid.rows.map((r) =>
      r.fieldId === 'f1'
        ? edit(r, { isCustom: true, cells: { ...r.cells, urea: { rate: 200, rateUnit: 'pound' } } })
        : r
    );
    expect(changedRows(grid.rows, draft, grid.columns).map((r) => r.fieldId)).toEqual(['f1']);
  });

  it('finds a row switched off, and one switched on', () => {
    const draft = grid.rows.map((r) =>
      r.fieldId === 'f1' ? edit(r, { applies: false })
        : r.fieldId === 'f3' ? edit(r, { applies: true }) : r
    );
    expect(changedRows(grid.rows, draft, grid.columns).map((r) => r.fieldId)).toEqual(['f1', 'f3']);
  });

  it('never offers a locked row for saving, even if something changed it', () => {
    const draft = grid.rows.map((r) =>
      r.fieldId === 'f4' ? edit(r, { isCustom: true }) : r
    );
    expect(changedRows(grid.rows, draft, grid.columns)).toEqual([]);
  });

  it('sees a custom row reset back to the program', () => {
    const rates: FieldRate[] = [
      { fieldId: 'f1', programId: 'topdress', productId: 'urea', rate: 200, rateUnit: 'pound' },
    ];
    const withCustom = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    const draft = withCustom.rows.map((r) =>
      r.fieldId === 'f1' ? edit(r, { isCustom: false }) : r
    );
    expect(changedRows(withCustom.rows, draft, withCustom.columns).map((r) => r.fieldId))
      .toEqual(['f1']);
  });

  it('does not report a change when a value is retyped identically', () => {
    const rates: FieldRate[] = [
      { fieldId: 'f1', programId: 'topdress', productId: 'urea', rate: 200, rateUnit: 'pound' },
    ];
    const withCustom = buildRateGrid(TOPDRESS, FIELDS, rates, PRODUCTS);
    const draft = withCustom.rows.map((r) =>
      r.fieldId === 'f1'
        ? edit(r, { cells: { ...r.cells, urea: { rate: 200, rateUnit: 'pound' } } })
        : r
    );
    expect(changedRows(withCustom.rows, draft, withCustom.columns)).toEqual([]);
  });
});

describe('gridRowToSavePayload', () => {
  const grid = buildRateGrid(TOPDRESS, FIELDS, [], PRODUCTS);
  const programCost = costProgramItself(TOPDRESS, PRODUCTS);

  it('sends an inheriting row as a reset — no rates, the program\'s own cost', () => {
    const payload = gridRowToSavePayload(grid.rows[0], 'topdress', grid.columns, 4, programCost);
    expect(payload).toEqual({
      fieldId: 'f1', fieldName: 'Antioch Grade School',
      programId: 'topdress', enabled: true, isCustom: false,
      costPerAcre: programCost, rates: [],
    });
  });

  it('sends a row that does not apply as a removal, with no cost demanded', () => {
    const payload = gridRowToSavePayload(grid.rows[2], 'topdress', grid.columns, 4, programCost);
    expect(payload.enabled).toBe(false);
    expect(payload.rates).toEqual([]);
  });

  it('names the field on every payload, because a bulk save writes many at once', () => {
    for (const row of grid.rows) {
      const payload = gridRowToSavePayload(row, 'topdress', grid.columns, 4, programCost);
      expect(payload.fieldId).toBe(row.fieldId);
      expect(payload.fieldName).toBe(row.fieldName);
      expect(payload.programId).toBe('topdress');
    }
  });

  it('sends a custom row as its own rates, in column order, with its own cost', () => {
    const row: GridRow = {
      ...grid.rows[0],
      isCustom: true,
      cells: {
        urea: { rate: 200, rateUnit: 'pound' },
        ams: { rate: null, rateUnit: 'pound' },
        provant: { rate: 0.2, rateUnit: 'quart' },
      },
    };
    const payload = gridRowToSavePayload(row, 'topdress', grid.columns, 4, programCost);
    expect(payload.isCustom).toBe(true);
    expect(payload.rates).toEqual([
      { productId: 'urea', rate: 200, unit: 'pound', sortOrder: 0 },
      { productId: 'provant', rate: 0.2, unit: 'quart', sortOrder: 2 },
    ]);
    // 0.1 t x 600 + 0.05 gal x 80 + 4 = 68.00
    expect(payload.costPerAcre).toBeCloseTo(68, 10);
  });

  it('drops an empty cell rather than storing a zero nobody typed', () => {
    const row: GridRow = {
      ...grid.rows[0],
      isCustom: true,
      cells: {
        urea: { rate: 185, rateUnit: 'pound' },
        ams: { rate: null, rateUnit: 'pound' },
        provant: { rate: null, rateUnit: 'quart' },
      },
    };
    const payload = gridRowToSavePayload(row, 'topdress', grid.columns, 4, programCost);
    expect(payload.rates.map((r) => r.productId)).toEqual(['urea']);
  });

  it('keeps an explicit zero, which is not the same as an empty cell', () => {
    // "None of this product on this field" is a real prescription, and it is what the
    // check constraint allows (rate >= 0) rather than requiring > 0.
    const row: GridRow = {
      ...grid.rows[0],
      isCustom: true,
      cells: {
        urea: { rate: 185, rateUnit: 'pound' },
        ams: { rate: 0, rateUnit: 'pound' },
        provant: { rate: null, rateUnit: 'quart' },
      },
    };
    const payload = gridRowToSavePayload(row, 'topdress', grid.columns, 4, programCost);
    expect(payload.rates.map((r) => r.productId)).toEqual(['urea', 'ams']);
    expect(payload.rates[1].rate).toBe(0);
  });
});
