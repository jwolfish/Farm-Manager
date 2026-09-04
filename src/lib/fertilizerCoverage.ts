import { supabase } from './supabase';
import { rollUpProduct, coveredByContracts } from './fertilizerContractMath';
import type { ContractRow, LoadLineRow } from './fertilizerContractMath';

/**
 * How much of each fertilizer product a season has already bought.
 *
 * The shopping list subtracts this before asking a supplier to quote. Chemicals
 * and seed have had their equivalent — `master_products.on_hand_quantity` — since
 * the lists were built; fertilizer has none, and correctly so (§9 of the contract
 * design: it goes on the ground, not into the shed). What it has instead is a
 * commitment at the plant, and until now nothing told the shopping list about it.
 *
 * ## Why this is its own module
 *
 * The natural home is `fertilizerContracts.ts`, but that file already imports
 * `computeFertilizerNeedByProduct` from `shoppingListGeneration.ts`, and the
 * shopping list is what needs this — so putting it there would be an import
 * cycle. This module imports only `supabase` and the pure rollup math, so there
 * is nothing to cycle with.
 *
 * ## Why it goes through `rollUpProduct`
 *
 * That function is the single owner of contract rollups, the way `accumulateNeed`
 * is the single owner of plan need. It already converts load lines into the
 * product's unit and excludes the ones it cannot, so re-deriving "delivered" here
 * would be a second implementation of arithmetic that must never diverge.
 *
 * Contracts need no conversion at all: a contract is denominated in its product's
 * own unit (F-3), which is also the unit the fertilizer shopping line is
 * expressed in.
 */

export interface ProductCoverage {
  /** Already bought, in the product's own unit. */
  covered: number;
  /**
   * Load lines that could not be converted and were therefore excluded. Coverage
   * is then an undercount, so the buy quantity is an overcount — the safe
   * direction, but the line must still say so.
   */
  issues: string[];
}

/**
 * Keyed by `fertilizer_products.id`.
 *
 * By id, not by name: `computeFertilizerNeedByProduct` returns `productId`, so
 * none of F-5's `matchFertilizerProductByName` fragility arises here.
 */
export type CoverageByProduct = Map<string, ProductCoverage>;

interface ProductShape {
  id: string;
  unit_type: string;
  density_lb_per_gal: number | null;
}

export async function loadFertilizerCoverage(seasonId: string): Promise<CoverageByProduct> {
  const [productsRes, contractsRes, loadsRes] = await Promise.all([
    supabase
      .from('fertilizer_products')
      .select('id, unit_type, density_lb_per_gal')
      .eq('season_id', seasonId),
    supabase
      .from('fertilizer_contracts')
      .select('id, fertilizer_product_id, kind, label, contracted_quantity, price_per_unit')
      .eq('season_id', seasonId),
    // Load lines carry no season_id of their own — they hang off the ticket.
    supabase
      .from('fertilizer_loads')
      .select('id, fertilizer_load_lines ( fertilizer_product_id, contract_id, quantity, unit_type )')
      .eq('season_id', seasonId),
  ]);

  /*
   * Thrown, never swallowed. A failed contract read that returned an empty map
   * would silently restore the old behaviour and shop for tonnage already
   * booked — "found nothing" and "never ran" must not look alike (WI-15).
   */
  if (productsRes.error) {
    throw new Error(`Could not read fertilizer products: ${productsRes.error.message}`);
  }
  if (contractsRes.error) {
    throw new Error(`Could not read fertilizer contracts: ${contractsRes.error.message}`);
  }
  if (loadsRes.error) {
    throw new Error(`Could not read fertilizer deliveries: ${loadsRes.error.message}`);
  }

  const products = (productsRes.data ?? []) as ProductShape[];

  const contractsByProduct = new Map<string, ContractRow[]>();
  for (const c of contractsRes.data ?? []) {
    const row: ContractRow = {
      id: c.id,
      kind: c.kind as 'contract' | 'spot',
      label: c.label,
      contractedQuantity: Number(c.contracted_quantity),
      pricePerUnit: c.price_per_unit === null ? null : Number(c.price_per_unit),
    };
    const bucket = contractsByProduct.get(c.fertilizer_product_id);
    if (bucket) bucket.push(row);
    else contractsByProduct.set(c.fertilizer_product_id, [row]);
  }

  const linesByProduct = new Map<string, LoadLineRow[]>();
  for (const load of loadsRes.data ?? []) {
    const lines = (load.fertilizer_load_lines ?? []) as Array<Record<string, unknown>>;
    for (const line of lines) {
      const productId = line.fertilizer_product_id as string;
      const row: LoadLineRow = {
        contractId: (line.contract_id as string | null) ?? null,
        quantity: Number(line.quantity),
        unitType: line.unit_type as string,
      };
      const bucket = linesByProduct.get(productId);
      if (bucket) bucket.push(row);
      else linesByProduct.set(productId, [row]);
    }
  }

  const coverage: CoverageByProduct = new Map();
  for (const product of products) {
    const contracts = contractsByProduct.get(product.id) ?? [];
    const lines = linesByProduct.get(product.id) ?? [];
    // Nothing booked and nothing delivered is not coverage of zero worth
    // recording — leaving it out keeps the map to products that actually matter.
    if (contracts.length === 0 && lines.length === 0) continue;

    const rollup = rollUpProduct(
      contracts,
      lines,
      product.unit_type,
      product.density_lb_per_gal === null ? null : Number(product.density_lb_per_gal)
    );

    coverage.set(product.id, {
      covered: coveredByContracts(rollup),
      issues: rollup.issues,
    });
  }

  return coverage;
}
