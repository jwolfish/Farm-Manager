import { accumulateNeed, type NeedContribution } from './shoppingListMath';
import {
  contributionsFromItems,
  resolveFieldFertilizerItems,
  type FertilizerProductMeta,
  type FieldRate,
  type ProgramItemRate,
} from './fieldFertilizerRates';

/**
 * The plan calculator — F-6.
 *
 * "These fields, this program, how many tons do I order?" — the arithmetic the
 * owner was doing on a hand calculator, and the last piece of the fertilizer
 * feature.
 *
 * WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * This is the calculator half of the Spray Planner without the work-order half.
 * That distinction is the whole design: the Spray Planner has a status
 * lifecycle, apply/unapply and ledger writes because chemicals have a shed
 * balance to deduct from. Fertilizer has none — it goes on the ground — so only
 * the arithmetic is worth taking.
 *
 * SELECTED FIELDS x SELECTED PROGRAMS, not each field's assigned programs.
 * `computeFertilizerNeedByProduct` in `shoppingListGeneration.ts` answers a
 * different question — "what does the season plan say?" — by walking each
 * field's cost template. This one answers "what if I ran THIS program on THESE
 * fields?", which is strictly more capable and is what the Spray Planner's
 * selection model already trains the owner to expect.
 *
 * Both converge on `accumulateNeed`, so the two can differ in scope but never in
 * arithmetic. That is deliberate: F-4 extracted `computeFertilizerNeedByProduct`
 * precisely so the contracts tab and the shopping list could not disagree, and
 * a third implementation here would undo it.
 *
 * Pure, no Supabase import, so it is unit-tested directly.
 */

export interface PlanField {
  id: string;
  name: string;
  acreage: number;
}

export interface PlanProgramItem {
  productId: string;
  productName: string;
  /** The unit the product is priced in — what the answer comes back in. */
  productUnit: string;
  /** lb per gallon, for liquids. Null on a dry product; see guardrail 8. */
  density: number | null;
  rate: number;
  rateUnit: string;
}

export interface PlanProgram {
  id: string;
  name: string;
  items: PlanProgramItem[];
}

export interface PlanNeedLine {
  productId: string;
  productName: string;
  /** The product's own unit. A booking may only be written in this. */
  unit: string;
  total: number;
  /** Contributions that would not convert; `total` is an undercount. */
  issues: string[];
}

/** The season's per-field rates and the products they may name — V-8. */
export interface PlanCustomRates {
  rates: readonly FieldRate[];
  /**
   * Every fertilizer product in the season, not merely those the chosen programs
   * name. Under replace-wholly a field may carry a product its program never had,
   * and a map built from the programs alone would drop that product's tonnage
   * without saying so.
   */
  products: ReadonlyMap<string, FertilizerProductMeta>;
}

/**
 * Tonnage per product for a fields x programs selection.
 *
 * F-6 shipped this using each program's rates exactly as written, because
 * per-field rates did not exist. **V-8 makes it resolve per field**, so a field
 * carrying its own list for a pass contributes that list rather than the shared
 * one. Without it the calculator would contradict the field's own plan: Prairie
 * Stream 2's 2 ton of Rhizosorb would be ordered as the program's 1.4.
 *
 * `custom` is REQUIRED rather than optional. An optional argument here would let a
 * caller silently get the pre-V-8 answer, which is exactly how the shopping list
 * came to disagree with the field page for a day. Pass empty collections to mean
 * "this season has no custom rates" — that is a statement, not an omission.
 *
 * An explicitly selected field is calculated for even if that pass is not on its
 * program list, because the question this screen answers is "what if I ran THIS
 * program on THESE fields?". Its own rates still apply if it has any.
 */
export function computePlanNeed(
  fields: PlanField[],
  programs: PlanProgram[],
  selectedFieldIds: ReadonlySet<string>,
  selectedProgramIds: ReadonlySet<string>,
  custom: PlanCustomRates
): PlanNeedLine[] {
  const chosenFields = fields.filter((f) => selectedFieldIds.has(f.id));
  const chosenPrograms = programs.filter((p) => selectedProgramIds.has(p.id));
  if (chosenFields.length === 0 || chosenPrograms.length === 0) return [];

  const meta = new Map<string, FertilizerProductMeta>();
  const contributions = new Map<string, NeedContribution[]>();
  const resolveIssues = new Set<string>();

  for (const field of chosenFields) {
    const acreage = Number(field.acreage);
    if (!Number.isFinite(acreage) || acreage <= 0) continue;

    for (const program of chosenPrograms) {
      const programItems: ProgramItemRate[] = program.items.map((i) => ({
        productId: i.productId,
        rate: i.rate,
        rateUnit: i.rateUnit || i.productUnit,
      }));

      // The one resolver — the same call the field's own cost, the V-6 grid and
      // the shopping list make. They differ in scope; they cannot differ in maths.
      const resolved = resolveFieldFertilizerItems(
        field.id, program.id, programItems, custom.rates, custom.products
      );
      resolved.issues.forEach((i) => resolveIssues.add(i));

      for (const item of resolved.items) {
        if (!meta.has(item.product.productId)) meta.set(item.product.productId, item.product);
      }
      contributionsFromItems(resolved.items, acreage, contributions);
    }
  }

  const lines: PlanNeedLine[] = [];
  for (const product of meta.values()) {
    // Same accumulator the shopping list uses: each contribution converted into
    // the product's own unit on the way in, never summed raw across units.
    const accumulated = accumulateNeed(
      contributions.get(product.productId) ?? [],
      product.unitType,
      product.density
    );
    lines.push({
      productId: product.productId,
      productName: product.productName,
      unit: accumulated.unit,
      total: accumulated.total,
      issues: [...accumulated.issues, ...resolveIssues],
    });
  }

  // Alphabetical, so the same selection always produces the same order and a
  // re-run does not shuffle the lines the user is editing.
  return lines.sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Total acres in the selection — the sanity check before ordering a semi. */
export function sumSelectedAcres(
  fields: PlanField[],
  selectedFieldIds: ReadonlySet<string>
): number {
  let total = 0;
  for (const field of fields) {
    if (!selectedFieldIds.has(field.id)) continue;
    const acreage = Number(field.acreage);
    if (Number.isFinite(acreage)) total += acreage;
  }
  return Math.round(total * 100) / 100;
}

/** Beyond this many field names the note stops being readable at a glance. */
const NOTE_FIELD_LIMIT = 8;

/**
 * The plain-language memo the calculator writes into the ticket's notes:
 *
 *     Ordered for: Home 80, Creek 60 — Fall P&K
 *
 * Deliberately a MEMO rather than structured data. The owner reorders fields and
 * changes rates once product is in the truck, so a structured "applied to"
 * record would be wrong often enough that nothing later could tell the true rows
 * from the stale ones. A sentence is honest about being a note.
 */
export function buildPlanNote(
  fields: PlanField[],
  programs: PlanProgram[],
  selectedFieldIds: ReadonlySet<string>,
  selectedProgramIds: ReadonlySet<string>
): string {
  const fieldNames = fields.filter((f) => selectedFieldIds.has(f.id)).map((f) => f.name);
  const programNames = programs.filter((p) => selectedProgramIds.has(p.id)).map((p) => p.name);
  if (fieldNames.length === 0) return '';

  const shown = fieldNames.slice(0, NOTE_FIELD_LIMIT).join(', ');
  const hidden = fieldNames.length - NOTE_FIELD_LIMIT;
  const fieldPart = hidden > 0 ? `${shown} +${hidden} more` : shown;

  return programNames.length > 0
    ? `Ordered for: ${fieldPart} — ${programNames.join(', ')}`
    : `Ordered for: ${fieldPart}`;
}
