import { convertUnits, describeConversionFailure } from './unitConversions';

/**
 * Pure conversion of work-order lines into inventory quantities — WI-11.
 *
 * Kept free of Supabase imports so it can be unit-tested directly.
 *
 * This is all-or-nothing on purpose. A work order is one operation: posting
 * some of its lines and skipping the rest would leave on-hand quantities that
 * look plausible and are wrong. If any line cannot be expressed in its
 * product's stock unit, the caller must refuse the whole apply and tell the
 * user which line and which units.
 */

export interface InventoryLineInput {
  chemicalName: string;
  masterProductId: string;
  rateUnit: string;
  totalNeeded: number;
}

export interface InventoryQuantity {
  masterProductId: string;
  chemicalName: string;
  /** Always positive. The caller applies the sign for consumption vs reversal. */
  quantity: number;
}

export type InventoryQuantityResult =
  | { ok: true; quantities: InventoryQuantity[] }
  | { ok: false; problems: string[] };

/**
 * @param lines the work-order lines that carry a master_product_id
 * @param productUnits master_product_id -> that product's stock unit_type
 */
export function buildInventoryQuantities(
  lines: InventoryLineInput[],
  productUnits: Map<string, string>
): InventoryQuantityResult {
  const quantities: InventoryQuantity[] = [];
  const problems: string[] = [];

  for (const line of lines) {
    const stockUnit = productUnits.get(line.masterProductId);

    if (stockUnit === undefined) {
      problems.push(
        `${line.chemicalName}: the inventory product could not be read, so its stock unit is unknown`
      );
      continue;
    }

    const converted = convertUnits(line.rateUnit, stockUnit, line.totalNeeded);
    if (!converted.ok) {
      problems.push(`${line.chemicalName}: ${describeConversionFailure(converted)}`);
      continue;
    }

    quantities.push({
      masterProductId: line.masterProductId,
      chemicalName: line.chemicalName,
      quantity: Math.abs(converted.value),
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, quantities };
}
