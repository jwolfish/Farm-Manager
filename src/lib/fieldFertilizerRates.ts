import {
  calculateCostWithConversion,
  convertProductUnits,
  describeConversionFailure,
} from './unitConversions';
import type { NeedContribution } from './shoppingListMath';

/**
 * Per-field fertilizer rates — V-2 of Field-Level-Fertilizer-Rates-Design.md.
 *
 * WHAT THIS IS FOR
 *
 * A fertilizer program carries one rate per product, shared by every field the
 * program touches. Soil tests move those rates field by field, so a field may
 * carry its own list in `field_fertilizer_rates`.
 *
 * THE RULE, IN ONE SENTENCE: no custom rows for a (field, program) pair means
 * inherit the program exactly as today; ANY custom rows mean that set **is** the
 * field's item list for that pass.
 *
 * Replace-wholly rather than per-item merge, by the owner's decision (§7, question
 * 1). A merge has to explain what an absent row means and a replacement does not,
 * and replace-wholly is what lets a field carry a product the program never had.
 *
 * Note what absence does NOT mean. Per §7.2, "this field gets none of this pass
 * this year" is not an empty custom set — an empty set is indistinguishable from
 * never having touched it. That case removes the program from the field's program
 * list instead, which is a different mechanism entirely.
 *
 * Pure, no Supabase import, so it is unit-tested directly — the same discipline as
 * `shoppingListMath`, `fertilizerContractMath` and `fertilizerPlanMath`. Every
 * consumer (the field's $/ac, the shopping list, the Contracts tab, the plan
 * calculator) resolves through here, so they may differ in SCOPE but never in
 * ARITHMETIC.
 */

export interface FertilizerProductMeta {
  productId: string;
  productName: string;
  /** The unit the product is priced in — a booking may only be written in this. */
  unitType: string;
  pricePerUnit: number;
  /** lb per gallon for a liquid; null on a dry product. See guardrail 8. */
  density: number | null;
}

/** One product's rate inside a program, as `fertilizer_program_items` holds it. */
export interface ProgramItemRate {
  productId: string;
  rate: number;
  rateUnit: string;
}

/** One row of `field_fertilizer_rates`. */
export interface FieldRate {
  fieldId: string;
  programId: string;
  productId: string;
  rate: number;
  rateUnit: string;
}

export interface ResolvedItem {
  product: FertilizerProductMeta;
  rate: number;
  rateUnit: string;
  /** True when this rate came from the field rather than the program. */
  isCustom: boolean;
}

export interface ResolvedItems {
  items: ResolvedItem[];
  /** True when this field replaced the program's list for this pass. */
  isCustom: boolean;
  /**
   * One entry per rate that names a product we have no metadata for. Such a rate
   * cannot be costed or ordered, so it is reported rather than dropped — a
   * silently shorter list reads as a smaller plan, which is the quiet kind of
   * wrong this codebase keeps removing.
   */
  issues: string[];
}

/**
 * The effective item list for one field's run of one program.
 *
 * @param products metadata by product id. A rate naming a product absent from
 *   this map is reported in `issues` rather than silently skipped.
 */
export function resolveFieldFertilizerItems(
  fieldId: string,
  programId: string,
  programItems: readonly ProgramItemRate[],
  fieldRates: readonly FieldRate[],
  products: ReadonlyMap<string, FertilizerProductMeta>
): ResolvedItems {
  const custom = fieldRates.filter(
    (r) => r.fieldId === fieldId && r.programId === programId
  );

  const source: ProgramItemRate[] = custom.length > 0
    ? custom.map((r) => ({ productId: r.productId, rate: r.rate, rateUnit: r.rateUnit }))
    : programItems.map((i) => ({ productId: i.productId, rate: i.rate, rateUnit: i.rateUnit }));

  const isCustom = custom.length > 0;
  const items: ResolvedItem[] = [];
  const issues = new Set<string>();

  for (const entry of source) {
    const product = products.get(entry.productId);
    if (!product) {
      issues.add(`no fertilizer product found for id ${entry.productId}`);
      continue;
    }
    items.push({
      product,
      rate: entry.rate,
      // A blank rate unit falls back to the product's own unit, matching the
      // fallback computePlanNeed already uses.
      rateUnit: entry.rateUnit || product.unitType,
      isCustom,
    });
  }

  return { items, isCustom, issues: [...issues] };
}

export interface ProgramCost {
  /** Product cost per acre plus the program's application cost. */
  costPerAcre: number;
  /**
   * Items whose rate unit would not convert into the unit the product is priced
   * in. They contribute nothing, so a non-empty list means `costPerAcre` is an
   * undercount rather than a total — the WI-11 rule.
   */
  unpricedItems: string[];
}

/**
 * Cost one field's run of one program, in dollars per acre.
 *
 * `applicationCost` is per PASS, not per product, which is why the program keeps
 * its meaning even when every rate inside it has been replaced.
 */
export function costResolvedItems(
  items: readonly ResolvedItem[],
  applicationCost: number
): ProgramCost {
  let costPerAcre = 0;
  // A Set, for the same reason accumulateNeed uses one: an unconvertible product
  // fails identically on every item that names it, and the count was never the
  // information.
  const unpricedItems = new Set<string>();

  for (const item of items) {
    const cost = calculateCostWithConversion(
      item.rate,
      item.rateUnit,
      item.product.pricePerUnit,
      item.product.unitType,
      item.product.density
    );

    if (!cost.ok) {
      unpricedItems.add(`${item.product.productName}: ${describeConversionFailure(cost)}`);
      continue;
    }

    costPerAcre += cost.value;
  }

  const application = Number(applicationCost);
  return {
    costPerAcre: costPerAcre + (Number.isFinite(application) ? application : 0),
    unpricedItems: [...unpricedItems],
  };
}

/**
 * Turn one field's resolved items into per-product contributions for
 * `accumulateNeed`.
 *
 * This is the seam that keeps the shopping list and the plan calculator on the
 * same arithmetic as the field's cost: they all resolve items here, then hand the
 * contributions to the one accumulator. They may differ in which fields and
 * programs they walk; they cannot differ in what a rate means.
 */
export function contributionsFromItems(
  items: readonly ResolvedItem[],
  acreage: number,
  into: Map<string, NeedContribution[]> = new Map()
): Map<string, NeedContribution[]> {
  for (const item of items) {
    const list = into.get(item.product.productId) ?? [];
    list.push({ rate: item.rate, rateUnit: item.rateUnit, acreage });
    into.set(item.product.productId, list);
  }
  return into;
}

/**
 * The rate that stores a total the user typed — §7.1.
 *
 * Entry is by total tons because that is what a VR prescription reports, but the
 * RATE is what gets stored, because the rate is what must survive an acreage
 * change. Store the total instead and a re-measured field silently becomes a
 * different prescription.
 *
 * Returns null rather than a wrong number when the acreage cannot divide.
 */
export function rateFromTotal(total: number, acreage: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(acreage)) return null;
  if (acreage <= 0) return null;
  return total / acreage;
}

/** The display total for a stored rate. The inverse of `rateFromTotal`. */
export function totalFromRate(rate: number, acreage: number): number | null {
  if (!Number.isFinite(rate) || !Number.isFinite(acreage)) return null;
  if (acreage < 0) return null;
  return rate * acreage;
}

/*
 * The editor's view of a field's fertilizer plan — V-5.
 *
 * Defined here rather than in the component so the data layer can build one without
 * importing a `.tsx`, and so the assembly below can be unit-tested.
 */
export interface PlanEditorRow {
  product: FertilizerProductMeta;
  rate: number;
  rateUnit: string;
}

export interface PlanEditorProgram {
  programId: string;
  programName: string;
  applicationCost: number;
  /** Is this pass in the field's program list at all? */
  enabled: boolean;
  /** Does the field already carry its own rates for this pass? */
  isCustom: boolean;
  /** The effective rows — the field's own if custom, else the program's. */
  rows: PlanEditorRow[];
  /** The program's own rows, for "Reset to program". */
  programRows: PlanEditorRow[];
}

export interface PlanSavePayload {
  programId: string;
  enabled: boolean;
  isCustom: boolean;
  costPerAcre: number;
  rates: Array<{ productId: string; rate: number; unit: string; sortOrder: number }>;
}

/** One season program as the loader reads it. */
export interface SeasonProgram {
  programId: string;
  programName: string;
  applicationCost: number;
  items: ProgramItemRate[];
}

/**
 * Assemble the editor's model for one field.
 *
 * `enabledProgramIds` is the field's effective program list — its override array if it has
 * one, else the template's. Every season program is returned, so a pass can be switched
 * back on as well as off; the ones not in the list simply arrive unchecked.
 */
export function buildPlanPrograms(
  fieldId: string,
  seasonPrograms: readonly SeasonProgram[],
  fieldRates: readonly FieldRate[],
  products: ReadonlyMap<string, FertilizerProductMeta>,
  enabledProgramIds: ReadonlySet<string>
): PlanEditorProgram[] {
  return seasonPrograms.map((program) => {
    const resolved = resolveFieldFertilizerItems(
      fieldId, program.programId, program.items, fieldRates, products
    );
    const programOnly = resolveFieldFertilizerItems(
      fieldId, program.programId, program.items, [], products
    );
    return {
      programId: program.programId,
      programName: program.programName,
      applicationCost: program.applicationCost,
      enabled: enabledProgramIds.has(program.programId),
      isCustom: resolved.isCustom,
      rows: resolved.items.map((i) => ({ product: i.product, rate: i.rate, rateUnit: i.rateUnit })),
      programRows: programOnly.items.map((i) => ({
        product: i.product, rate: i.rate, rateUnit: i.rateUnit,
      })),
    };
  });
}

/*
 * The unit-aware pair the editor actually uses — V-5.
 *
 * The owner enters a TOTAL, in the product's own unit ("8.2 ton of Potash on Home 80"),
 * because that is what a VR prescription reports. The stored value is a RATE in the rate's
 * unit (lb/ac), because the rate is what must survive an acreage change (§7.1).
 *
 * So there are two steps, and both can fail: a unit conversion between the product's unit
 * and the rate's, which needs a density when one side is a volume and the other a mass, and
 * a division by acreage. Failing loudly is the F-5 rule — the form must name the product it
 * could not convert rather than quietly showing nothing.
 */
export type FieldTotalResult =
  | { ok: true; value: number }
  | { ok: false; issue: string };

/** Total in the product's unit → rate per acre in `rateUnit`. */
export function rateFromFieldTotal(
  total: number,
  productUnit: string,
  rateUnit: string,
  acreage: number,
  density: number | null
): FieldTotalResult {
  if (!Number.isFinite(total)) return { ok: false, issue: 'the total is not a number' };
  if (!Number.isFinite(acreage) || acreage <= 0) {
    return { ok: false, issue: 'this field has no acreage, so a total cannot become a rate' };
  }
  const converted = convertProductUnits(productUnit, rateUnit, total, density);
  if (!converted.ok) return { ok: false, issue: describeConversionFailure(converted) };
  return { ok: true, value: converted.value / acreage };
}

/** Rate per acre in `rateUnit` → total in the product's unit. The inverse. */
export function fieldTotalFromRate(
  rate: number,
  rateUnit: string,
  productUnit: string,
  acreage: number,
  density: number | null
): FieldTotalResult {
  if (!Number.isFinite(rate)) return { ok: false, issue: 'the rate is not a number' };
  if (!Number.isFinite(acreage) || acreage < 0) {
    return { ok: false, issue: 'this field has no acreage' };
  }
  const converted = convertProductUnits(rateUnit, productUnit, rate * acreage, density);
  if (!converted.ok) return { ok: false, issue: describeConversionFailure(converted) };
  return { ok: true, value: converted.value };
}
