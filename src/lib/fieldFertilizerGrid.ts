import {
  costResolvedItems,
  resolveFieldFertilizerItems,
  type FertilizerProductMeta,
  type FieldRate,
  type PlanSavePayload,
  type SeasonProgram,
} from './fieldFertilizerRates';

/**
 * The bulk rate grid — V-6 of Field-Level-Fertilizer-Rates-Design.md.
 *
 * WHAT THIS IS FOR
 *
 * §5.3: "Rows = fields, columns = products, one program at a time. Entering 17 fields one
 * modal at a time is the thing that would make this feature go unused; a soil-test
 * spreadsheet already looks like this grid."
 *
 * It is load bearing twice over, because §10.7 makes it the CSV import's review surface
 * too — the import parses and matches, then populates this same grid, and nothing is
 * written until the review is committed.
 *
 * PURE. No Supabase import, so the arithmetic is unit-tested directly and the component
 * built on it can be rendered in a browser with fixtures. Loading and saving live in
 * `fieldFertilizerGridCrud.ts`, the same split V-5 made for the single-field editor.
 *
 * ONE ARITHMETIC. Every cell resolves through `resolveFieldFertilizerItems` and every row
 * cost through `costResolvedItems` — the same functions the per-field editor, the field's
 * $/ac and (at V-8) the shopping list use. The grid differs in SCOPE, never in MATHS.
 */

/** One field as the grid needs it, before any editing. */
export interface GridFieldInput {
  fieldId: string;
  fieldName: string;
  acreage: number;
  /** Is this program in the field's effective program list — its override, else its template? */
  applies: boolean;
  /**
   * Does the field have a `field_costs` row at all?
   *
   * A field without one cannot be edited here, and that is not fussiness. Applying a cost
   * template calls `deleteAllOverrides`, which since 6 Sep also clears
   * `field_fertilizer_rates` — so rates entered on a field before it has a template would
   * be destroyed the moment one is assigned, and `recalculateFieldTotal` has nowhere to
   * write the total in the meantime. Better to say why than to accept work that will vanish.
   */
  hasCostRow: boolean;
}

export interface GridColumn {
  product: FertilizerProductMeta;
  /** The unit a value typed into this column is stored in. */
  rateUnit: string;
  /**
   * True when no program item names this product — the column exists only because some
   * field carries it custom. Under replace-wholly a field may hold a product the program
   * never had, so dropping the column would hide a real rate.
   */
  fieldOnly: boolean;
}

/** A cell's effective value. `rate: null` means this product is not applied on this field. */
export interface GridCell {
  rate: number | null;
  rateUnit: string;
}

export interface GridRow {
  fieldId: string;
  fieldName: string;
  acreage: number;
  applies: boolean;
  /** Does the field already carry its own rates for this pass? */
  isCustom: boolean;
  readOnly: boolean;
  /** Why the row cannot be edited, when `readOnly`. */
  readOnlyReason: string | null;
  cells: Record<string, GridCell>;
}

export interface RateGridModel {
  programId: string;
  programName: string;
  applicationCost: number;
  columns: GridColumn[];
  rows: GridRow[];
  /** Rates naming a product this season has no row for. Reported, never dropped. */
  issues: string[];
}

/**
 * Build the grid for one program across every field in the season.
 *
 * Column order is the program's own item order first — that is the order the owner sees
 * everywhere else — then any field-only product, by name, so the appended columns are
 * stable between loads rather than following whichever field happened to load first.
 */
export function buildRateGrid(
  program: SeasonProgram,
  fields: readonly GridFieldInput[],
  fieldRates: readonly FieldRate[],
  products: ReadonlyMap<string, FertilizerProductMeta>
): RateGridModel {
  const mine = fieldRates.filter((r) => r.programId === program.programId);
  const issues = new Set<string>();

  const columns: GridColumn[] = [];
  const seen = new Set<string>();

  for (const item of program.items) {
    const product = products.get(item.productId);
    if (!product) {
      issues.add(`the program names a product this season has no row for (${item.productId})`);
      continue;
    }
    seen.add(item.productId);
    columns.push({ product, rateUnit: item.rateUnit || product.unitType, fieldOnly: false });
  }

  const extras: GridColumn[] = [];
  for (const rate of mine) {
    if (seen.has(rate.productId)) continue;
    const product = products.get(rate.productId);
    if (!product) {
      issues.add(`a field rate names a product this season has no row for (${rate.productId})`);
      continue;
    }
    seen.add(rate.productId);
    extras.push({ product, rateUnit: rate.rateUnit || product.unitType, fieldOnly: true });
  }
  extras.sort((a, b) => a.product.productName.localeCompare(b.product.productName));
  columns.push(...extras);

  const rows: GridRow[] = fields.map((field) => {
    const resolved = resolveFieldFertilizerItems(
      field.fieldId, program.programId, program.items, mine, products
    );
    resolved.issues.forEach((i) => issues.add(i));

    const cells: Record<string, GridCell> = {};
    for (const column of columns) {
      cells[column.product.productId] = { rate: null, rateUnit: column.rateUnit };
    }
    for (const item of resolved.items) {
      cells[item.product.productId] = { rate: item.rate, rateUnit: item.rateUnit };
    }

    return {
      fieldId: field.fieldId,
      fieldName: field.fieldName,
      acreage: field.acreage,
      applies: field.applies,
      isCustom: resolved.isCustom,
      readOnly: !field.hasCostRow,
      // Short on purpose: it sits under every locked field name, and the full explanation
      // is given once beneath the table rather than repeated down the column.
      readOnlyReason: field.hasCostRow ? null : 'no cost template',
      cells,
    };
  });

  return {
    programId: program.programId,
    programName: program.programName,
    applicationCost: program.applicationCost,
    columns,
    rows,
    issues: [...issues],
  };
}

/**
 * The program's own cells — what an inheriting row shows, and what *Reset to program*
 * restores a customised row to.
 *
 * Needed separately from the row's own cells because resetting a custom row must go back to
 * the PROGRAM's numbers, not to whatever that field was carrying when the grid loaded.
 */
export function programCells(
  program: SeasonProgram,
  columns: readonly GridColumn[]
): Record<string, GridCell> {
  const byProduct = new Map(program.items.map((i) => [i.productId, i]));
  const cells: Record<string, GridCell> = {};
  for (const column of columns) {
    const item = byProduct.get(column.product.productId);
    cells[column.product.productId] = item
      ? { rate: item.rate, rateUnit: item.rateUnit || column.product.unitType }
      : { rate: null, rateUnit: column.rateUnit };
  }
  return cells;
}

/**
 * Cost one grid row, in dollars per acre, through the one accumulator.
 *
 * A row that does not apply costs nothing — the pass is not run on that field at all, which
 * is §7.2's third case and the reason `applies` exists rather than an empty rate set.
 */
export function costGridRow(
  row: GridRow,
  columns: readonly GridColumn[],
  applicationCost: number
): { costPerAcre: number; unpricedItems: string[] } {
  if (!row.applies) return { costPerAcre: 0, unpricedItems: [] };

  const items = columns
    .filter((c) => {
      const cell = row.cells[c.product.productId];
      return cell && cell.rate !== null && Number.isFinite(cell.rate);
    })
    .map((c) => ({
      product: c.product,
      rate: row.cells[c.product.productId].rate as number,
      rateUnit: row.cells[c.product.productId].rateUnit,
      isCustom: row.isCustom,
    }));

  return costResolvedItems(items, applicationCost);
}

/**
 * A stable signature of what a row would SAVE.
 *
 * Used to decide which rows changed, so a grid save writes only the fields the owner
 * actually touched. Saving all 32 rows every time would be simpler and would also rewrite
 * `field_cost_overrides` for every field in the season on every visit — turning a read into
 * a write across the whole table that carries every custom-rated field's fertilizer money.
 *
 * An inheriting row signs as `program` regardless of what its cells display, because those
 * cells ARE the program's values and storing them would change nothing except to freeze
 * them against a later program edit.
 */
export function rowSignature(row: GridRow, columns: readonly GridColumn[]): string {
  if (!row.applies) return 'off';
  if (!row.isCustom) return 'program';
  const parts = columns
    .map((c) => {
      const cell = row.cells[c.product.productId];
      if (!cell || cell.rate === null || !Number.isFinite(cell.rate)) return null;
      return `${c.product.productId}:${cell.rate}:${cell.rateUnit}`;
    })
    .filter((p): p is string => p !== null);
  return `custom|${parts.join(',')}`;
}

/** The rows whose signature moved — the only ones a save needs to touch. */
export function changedRows(
  original: readonly GridRow[],
  draft: readonly GridRow[],
  columns: readonly GridColumn[]
): GridRow[] {
  const before = new Map(original.map((r) => [r.fieldId, rowSignature(r, columns)]));
  return draft.filter(
    (r) => !r.readOnly && before.get(r.fieldId) !== rowSignature(r, columns)
  );
}

/**
 * A row's save payload. The single-field editor's `PlanSavePayload` plus the field it is
 * for, because a grid save names many fields in one call and the RPC needs to be told which.
 */
export interface GridSavePayload extends PlanSavePayload {
  fieldId: string;
  fieldName: string;
}

/**
 * One row's RPC payload.
 *
 * `rates: []` on an applying row is the documented reset-to-program: the RPC clears that
 * pass's rows and takes the cost the caller supplies, so the field goes back to inheriting.
 * The caller therefore has to hand over the PROGRAM's cost on that path, not the row's,
 * which is why `programCostPerAcre` is a separate argument rather than derived here.
 */
export function gridRowToSavePayload(
  row: GridRow,
  programId: string,
  columns: readonly GridColumn[],
  applicationCost: number,
  programCostPerAcre: number
): GridSavePayload {
  const identity = { fieldId: row.fieldId, fieldName: row.fieldName, programId };

  if (!row.applies) {
    return { ...identity, enabled: false, isCustom: false, costPerAcre: 0, rates: [] };
  }

  if (!row.isCustom) {
    return {
      ...identity,
      enabled: true,
      isCustom: false,
      costPerAcre: programCostPerAcre,
      rates: [],
    };
  }

  const rates = columns
    .map((c, i) => {
      const cell = row.cells[c.product.productId];
      if (!cell || cell.rate === null || !Number.isFinite(cell.rate)) return null;
      return { productId: c.product.productId, rate: cell.rate, unit: cell.rateUnit, sortOrder: i };
    })
    .filter((r): r is { productId: string; rate: number; unit: string; sortOrder: number } => r !== null);

  return {
    ...identity,
    enabled: true,
    isCustom: true,
    costPerAcre: costGridRow(row, columns, applicationCost).costPerAcre,
    rates,
  };
}

/**
 * The program's own $/ac — what an inheriting row costs, and what a reset restores.
 *
 * Computed from the program's items rather than from any row, so it is right even when
 * every field on screen has been customised.
 */
export function costProgramItself(
  program: SeasonProgram,
  products: ReadonlyMap<string, FertilizerProductMeta>
): number {
  const resolved = resolveFieldFertilizerItems('', program.programId, program.items, [], products);
  return costResolvedItems(resolved.items, program.applicationCost).costPerAcre;
}
