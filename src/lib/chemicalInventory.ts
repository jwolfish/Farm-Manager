/**
 * WI-18 — the spray planner's on-hand lookup, as two maps rather than one.
 *
 * `fetchInventoryForChemicals` used to put every master product into ONE map under both
 * its id and its canonical name, and its by-name query did not filter on category. So a
 * seed and a chemical sharing a name wrote to the same key, and whichever row arrived last
 * decided what "on hand" the planner showed for the chemical. Ids and names are different
 * kinds of key; keeping them in separate maps means neither can shadow the other, and
 * `byName` only ever holds chemicals.
 */

export interface InventoryInfo {
  masterProductId: string;
  onHand: number;
  unitType: string;
}

export interface ChemicalInventory {
  byId: Map<string, InventoryInfo>;
  /** Chemicals only, keyed by `master_products.canonical_name`. */
  byName: Map<string, InventoryInfo>;
}

export function emptyChemicalInventory(): ChemicalInventory {
  return { byId: new Map(), byName: new Map() };
}

interface MasterProductRow {
  id: string;
  canonical_name: string;
  on_hand_quantity: number | null;
  unit_type: string;
  product_category: string;
}

/** Adds rows to the inventory. Every row is indexed by id; only chemicals by name. */
export function indexInventoryRows(inventory: ChemicalInventory, rows: MasterProductRow[]): void {
  for (const row of rows) {
    const entry: InventoryInfo = {
      masterProductId: row.id,
      onHand: Number(row.on_hand_quantity ?? 0),
      unitType: row.unit_type,
    };
    inventory.byId.set(row.id, entry);
    if (row.product_category === 'chemical') inventory.byName.set(row.canonical_name, entry);
  }
}

/** A linked product id wins; the name is the fallback for an unlinked line. */
export function lookupChemicalInventory(
  inventory: ChemicalInventory,
  masterProductId: string | null | undefined,
  chemicalName: string
): InventoryInfo | undefined {
  return (masterProductId ? inventory.byId.get(masterProductId) : undefined) ?? inventory.byName.get(chemicalName);
}
