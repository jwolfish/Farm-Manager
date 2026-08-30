import { convertProductUnits, describeConversionFailure } from './unitConversions';

/**
 * Fertilizer contract rollup — F-4.
 *
 * Pure, no Supabase import, so it can be unit-tested directly the way
 * `shoppingListMath.ts` is. Everything the Contracts tab shows is derived here;
 * nothing below is stored.
 *
 * Two conversion rules, and the asymmetry is deliberate:
 *
 *   Contracts  are always denominated in their product's own unit, so they need
 *              no conversion at all. That is what keeps the blended price exact
 *              and keeps a third copy of the unit table out of Postgres (F-3).
 *
 *   Load lines may arrive in any convertible unit — 500 lb picked up in the
 *              spreader against a per-ton booking — so each is converted on the
 *              way in. A line that cannot convert is EXCLUDED and named in
 *              `issues`, never folded in at face value (the WI-11 rule).
 */

export interface ContractRow {
  id: string;
  kind: 'contract' | 'spot';
  label: string | null;
  contractedQuantity: number;
  /** Null when the booking exists but the price is not settled yet. */
  pricePerUnit: number | null;
}

export interface LoadLineRow {
  /** Null when the delivery was not attributed to a booking. */
  contractId: string | null;
  quantity: number;
  unitType: string;
}

export interface ContractRollup extends ContractRow {
  /** Delivered against this booking, in the product's unit. */
  delivered: number;
  /** Contracted minus delivered. Negative when over-taken, which is allowed. */
  remaining: number;
}

export interface ProductRollup {
  contracted: number;
  delivered: number;
  remaining: number;
  /**
   * Weighted by CONTRACTED quantity, so it is meaningful before anything is
   * delivered. Null when no contract carries a price yet.
   */
  blendedPrice: number | null;
  /**
   * Weighted by DELIVERED quantity — truer late in the season, when a booking
   * has been under- or over-taken. Null before any priced delivery.
   */
  deliveredWeightedPrice: number | null;
  /** Delivered tonnage not attributed to any booking. */
  unattributedDelivered: number;
  contracts: ContractRollup[];
  /** One entry per load line that could not be converted. */
  issues: string[];
}

/** Money to cents, so display and comparison agree with the database trigger. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * @param productUnit the product's `unit_type` — the unit everything is
 *   expressed in.
 * @param densityLbPerGal per the three-case convention on `convertProductUnits`:
 *   pass `product.density_lb_per_gal ?? null` for fertilizer.
 */
export function rollUpProduct(
  contracts: ContractRow[],
  loadLines: LoadLineRow[],
  productUnit: string,
  densityLbPerGal?: number | null
): ProductRollup {
  const issues: string[] = [];
  const deliveredByContract = new Map<string, number>();
  let delivered = 0;
  let unattributedDelivered = 0;

  for (const line of loadLines) {
    const converted = convertProductUnits(
      line.unitType,
      productUnit,
      line.quantity,
      densityLbPerGal
    );
    if (!converted.ok) {
      // Excluded rather than counted at face value: a wrong tonnage is worse
      // than a visibly incomplete one.
      issues.push(
        `${line.quantity} ${line.unitType} — ${describeConversionFailure(converted)}`
      );
      continue;
    }

    delivered += converted.value;
    if (line.contractId === null) {
      unattributedDelivered += converted.value;
    } else {
      deliveredByContract.set(
        line.contractId,
        (deliveredByContract.get(line.contractId) ?? 0) + converted.value
      );
    }
  }

  let contracted = 0;
  let pricedQty = 0;
  let pricedValue = 0;
  let deliveredPricedQty = 0;
  let deliveredPricedValue = 0;

  const rolled: ContractRollup[] = contracts.map((c) => {
    contracted += c.contractedQuantity;
    const del = deliveredByContract.get(c.id) ?? 0;

    if (c.pricePerUnit !== null) {
      // An unpriced booking counts as tonnage but must not drag the blend
      // toward zero, so it contributes to neither sum here.
      pricedQty += c.contractedQuantity;
      pricedValue += c.contractedQuantity * c.pricePerUnit;
      deliveredPricedQty += del;
      deliveredPricedValue += del * c.pricePerUnit;
    }

    return { ...c, delivered: del, remaining: c.contractedQuantity - del };
  });

  return {
    contracted,
    delivered,
    remaining: contracted - delivered,
    blendedPrice: pricedQty > 0 ? round2(pricedValue / pricedQty) : null,
    deliveredWeightedPrice:
      deliveredPricedQty > 0 ? round2(deliveredPricedValue / deliveredPricedQty) : null,
    unattributedDelivered,
    contracts: rolled,
    issues,
  };
}

export interface SeasonTotals {
  deliveryFees: number;
  loadCount: number;
}

/**
 * Delivery fees are charged per truck and are totalled on their own. They are
 * deliberately NOT folded into field costs — the owner wants to know the number,
 * not to have it silently change cost per acre.
 */
export function sumSeasonTotals(loads: Array<{ deliveryFee: number }>): SeasonTotals {
  let deliveryFees = 0;
  for (const load of loads) {
    if (Number.isFinite(load.deliveryFee)) deliveryFees += load.deliveryFee;
  }
  return { deliveryFees: round2(deliveryFees), loadCount: loads.length };
}
