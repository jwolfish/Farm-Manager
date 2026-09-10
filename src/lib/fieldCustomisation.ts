/**
 * What a field would lose, said by name — U-2.
 *
 * A field's custom state lives in TWO tables: `field_cost_overrides` holds the numbers and
 * the program list, `field_fertilizer_rates` holds the rates behind a program-shaped
 * override. `deleteAllOverrides` clears both, and it is called by BOTH
 * `unlinkFieldFromTemplate` and every template application — so unlinking a field, or
 * re-applying its template to change one thing, silently destroys the per-field
 * prescription that V-5 and V-6 exist to capture.
 *
 * The screens said "any custom overrides will be removed" and "cost data will be
 * preserved". The first is vague and the second is, for this purpose, false. This module
 * turns both into a count and a list of names.
 *
 * Pure on purpose, so the wording is testable and the warning can be rendered without
 * credentials. The reads live in `fieldCustomisationCrud.ts`.
 */

export interface FieldCustomisation {
  fieldId: string;
  fieldName: string;
  /** Rows in `field_cost_overrides` — numeric and program-shaped alike. */
  overrideCount: number;
  /** Rows in `field_fertilizer_rates`. */
  rateCount: number;
}

export function hasCustomisation(field: FieldCustomisation): boolean {
  return field.overrideCount > 0 || field.rateCount > 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 custom fertilizer rates and 1 cost override" — the inventory for one field. */
export function describeFieldCustomisation(field: FieldCustomisation): string {
  const parts: string[] = [];
  if (field.rateCount > 0) parts.push(plural(field.rateCount, 'custom fertilizer rate', 'custom fertilizer rates'));
  if (field.overrideCount > 0) parts.push(plural(field.overrideCount, 'cost override', 'cost overrides'));
  return parts.join(' and ');
}

/** How many names to spell out before falling back to "and N more". */
const NAME_LIMIT = 4;

/**
 * The whole warning, or null when there is nothing to warn about.
 *
 * Null rather than an empty string, so a caller cannot render a warning box round nothing —
 * a confirmation that always warns is one nobody reads, which is how the existing vague
 * copy came to be ignored.
 */
export function describeCustomisationLoss(
  fields: readonly FieldCustomisation[]
): string | null {
  const affected = fields.filter(hasCustomisation);
  if (affected.length === 0) return null;

  if (affected.length === 1) {
    const only = affected[0];
    return `${only.fieldName} has ${describeFieldCustomisation(only)}. This will delete ${
      only.rateCount > 0 && only.overrideCount > 0 ? 'both' : 'it'
    }.`;
  }

  const named = affected.slice(0, NAME_LIMIT).map((f) => `${f.fieldName} (${describeFieldCustomisation(f)})`);
  const remaining = affected.length - named.length;
  const list = remaining > 0 ? `${named.join(', ')}, and ${remaining} more` : named.join(', ');

  return `${affected.length} of ${fields.length} fields carry custom values that this will delete: ${list}.`;
}

/**
 * A short label for a button or a badge — "3 custom values" — where the full sentence will
 * not fit. Counts the two tables together, because to the person deciding they are one
 * thing: work they typed that is about to disappear.
 */
export function countCustomValues(fields: readonly FieldCustomisation[]): number {
  return fields.reduce((sum, f) => sum + f.overrideCount + f.rateCount, 0);
}
