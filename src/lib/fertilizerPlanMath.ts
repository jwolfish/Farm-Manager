import { accumulateNeed, type NeedContribution } from './shoppingListMath';

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

/**
 * Tonnage per product for a fields x programs selection.
 *
 * Rates are used exactly as the program writes them — per the owner's decision,
 * the calculator does not offer per-field rate overrides. What you edit is the
 * resulting tonnage, which covers the common case (the plan said 23.4, the truck
 * brought 24) without building the largest chunk of UI in the feature.
 */
export function computePlanNeed(
  fields: PlanField[],
  programs: PlanProgram[],
  selectedFieldIds: ReadonlySet<string>,
  selectedProgramIds: ReadonlySet<string>
): PlanNeedLine[] {
  const chosenFields = fields.filter((f) => selectedFieldIds.has(f.id));
  const chosenPrograms = programs.filter((p) => selectedProgramIds.has(p.id));
  if (chosenFields.length === 0 || chosenPrograms.length === 0) return [];

  const meta = new Map<string, PlanProgramItem>();
  const contributions = new Map<string, NeedContribution[]>();

  for (const field of chosenFields) {
    const acreage = Number(field.acreage);
    if (!Number.isFinite(acreage) || acreage <= 0) continue;

    for (const program of chosenPrograms) {
      for (const item of program.items) {
        if (!meta.has(item.productId)) {
          meta.set(item.productId, item);
          contributions.set(item.productId, []);
        }
        contributions.get(item.productId)!.push({
          rate: item.rate,
          rateUnit: item.rateUnit || item.productUnit,
          acreage,
        });
      }
    }
  }

  const lines: PlanNeedLine[] = [];
  for (const item of meta.values()) {
    // Same accumulator the shopping list uses: each contribution converted into
    // the product's own unit on the way in, never summed raw across units.
    const accumulated = accumulateNeed(
      contributions.get(item.productId) ?? [],
      item.productUnit,
      item.density
    );
    lines.push({
      productId: item.productId,
      productName: item.productName,
      unit: accumulated.unit,
      total: accumulated.total,
      issues: accumulated.issues,
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
