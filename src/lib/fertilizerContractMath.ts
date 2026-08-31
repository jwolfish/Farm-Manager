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

/** Quantities to 4dp, so a split does not read back as 3.6500000000000004. */
function roundQty(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export interface DrawSplit {
  /** Stays on the booking, in the LINE's unit — the number the user retypes. */
  onContractInLineUnit: number;
  /** Spills onto a new spot buy, in the LINE's unit. */
  onSpotInLineUnit: number;
  /**
   * The same spill in the PRODUCT's unit. A contract is denominated in its
   * product's own unit (F-3), so this is what the new spot buy is booked for.
   */
  onSpotInProductUnit: number;
}

export type DrawPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      /** The line quantity in the product's unit — what the rollup will count. */
      quantityInProductUnit: number;
      /** Left on the chosen booking before this line. Null when none is chosen. */
      remaining: number | null;
      /** The line draws more than the booking has left. */
      overDraws: boolean;
      /**
       * How to divide the line. Null when there is nothing to divide, or when
       * the booking has nothing left at all — then the whole line is a spot buy
       * and there is no "split" to offer.
       */
      split: DrawSplit | null;
    };

/**
 * Does this load line draw more than its booking has left, and if so, where
 * does the remainder go? — F-4a.
 *
 * The owner's case: a 24-ton semi against a booking with 20.35 t left. The
 * schema already allows the truthful answer, because a load line is per-product
 * *per booking* and nothing stops two lines for the same product on one ticket.
 * So it is two lines — and that is better than one number, because those tons
 * genuinely cost different money and the blended price should say so.
 *
 * The split is returned in the LINE's unit because that is what the user typed
 * and will now see divided in two, and again in the PRODUCT's unit because that
 * is the only unit a contract may be written in.
 *
 * `remaining` is `null` when no booking is selected: there is then nothing to
 * over-draw, so this reports the converted quantity and nothing else.
 */
export function planLineDraw(
  quantity: number,
  lineUnit: string,
  productUnit: string,
  remaining: number | null,
  densityLbPerGal?: number | null
): DrawPlan {
  const converted = convertProductUnits(lineUnit, productUnit, quantity, densityLbPerGal);
  if (!converted.ok) {
    return { ok: false, message: describeConversionFailure(converted) };
  }

  const quantityInProductUnit = converted.value;
  if (remaining === null) {
    return { ok: true, quantityInProductUnit, remaining: null, overDraws: false, split: null };
  }

  // A hair of tolerance: a converted 24.000000000000004 against 24 remaining is
  // not an over-draw, and offering to spill 4e-15 tons onto a spot buy would be
  // absurd.
  const overDraws = quantityInProductUnit - remaining > 1e-6;
  if (!overDraws || remaining <= 0) {
    // remaining <= 0 is a real over-draw with nothing to keep on the booking.
    // The caller offers "book all of it" rather than a split.
    return { ok: true, quantityInProductUnit, remaining, overDraws, split: null };
  }

  // Express what fits back in the line's unit, so the two lines add up to what
  // the user typed rather than to a converted approximation of it.
  const fits = convertProductUnits(productUnit, lineUnit, remaining, densityLbPerGal);
  if (!fits.ok) {
    return { ok: true, quantityInProductUnit, remaining, overDraws, split: null };
  }

  const onContractInLineUnit = roundQty(fits.value);
  const onSpotInLineUnit = roundQty(quantity - onContractInLineUnit);
  if (onContractInLineUnit <= 0 || onSpotInLineUnit <= 0) {
    return { ok: true, quantityInProductUnit, remaining, overDraws, split: null };
  }

  return {
    ok: true,
    quantityInProductUnit,
    remaining,
    overDraws,
    split: {
      onContractInLineUnit,
      onSpotInLineUnit,
      onSpotInProductUnit: roundQty(quantityInProductUnit - remaining),
    },
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
