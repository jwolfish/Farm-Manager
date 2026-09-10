import { describe, it, expect } from 'vitest';
import {
  countCustomValues,
  describeCustomisationLoss,
  describeFieldCustomisation,
  hasCustomisation,
  type FieldCustomisation,
} from './fieldCustomisation';

const clean = (name: string): FieldCustomisation => ({
  fieldId: name,
  fieldName: name,
  overrideCount: 0,
  rateCount: 0,
});

const withCustom = (
  name: string,
  overrideCount: number,
  rateCount: number
): FieldCustomisation => ({ fieldId: name, fieldName: name, overrideCount, rateCount });

describe('hasCustomisation', () => {
  it('is false only when both tables are empty for the field', () => {
    expect(hasCustomisation(clean('Adkins'))).toBe(false);
    expect(hasCustomisation(withCustom('Adkins', 1, 0))).toBe(true);
    expect(hasCustomisation(withCustom('Adkins', 0, 1))).toBe(true);
  });

  /*
   * The whole point of the module. A field can carry rates with no overrides, or overrides
   * with no rates, and a check that looked at one table would clear a field that is about
   * to lose the other — which is the same defect in the same two tables that showed 185
   * where 200 was stored, and left orphaned rates after a reset.
   */
  it('catches a field with rates but no overrides', () => {
    expect(describeCustomisationLoss([withCustom('Prairie Stream 2', 0, 2)])).toContain(
      'Prairie Stream 2'
    );
  });
});

describe('describeFieldCustomisation', () => {
  it('names both tables, singular and plural', () => {
    expect(describeFieldCustomisation(withCustom('x', 1, 3))).toBe(
      '3 custom fertilizer rates and 1 cost override'
    );
    expect(describeFieldCustomisation(withCustom('x', 2, 1))).toBe(
      '1 custom fertilizer rate and 2 cost overrides'
    );
  });

  it('omits the table that is empty', () => {
    expect(describeFieldCustomisation(withCustom('x', 0, 2))).toBe('2 custom fertilizer rates');
    expect(describeFieldCustomisation(withCustom('x', 2, 0))).toBe('2 cost overrides');
  });
});

describe('describeCustomisationLoss', () => {
  it('returns null when nothing is at risk, so no box is rendered', () => {
    expect(describeCustomisationLoss([])).toBeNull();
    expect(describeCustomisationLoss([clean('Adkins'), clean('Umek')])).toBeNull();
  });

  it('names the single field and what it loses', () => {
    expect(describeCustomisationLoss([withCustom('Adkins', 1, 3)])).toBe(
      'Adkins has 3 custom fertilizer rates and 1 cost override. This will delete both.'
    );
    expect(describeCustomisationLoss([withCustom('Umek', 1, 0)])).toBe(
      'Umek has 1 cost override. This will delete it.'
    );
  });

  it('counts affected against the total selected, not against itself', () => {
    const message = describeCustomisationLoss([
      withCustom('Adkins', 1, 0),
      withCustom('Umek', 1, 0),
      clean('Beck Road'),
      clean('Antioch'),
    ]);
    expect(message).toContain('2 of 4 fields');
    expect(message).toContain('Adkins');
    expect(message).toContain('Umek');
    expect(message).not.toContain('Beck Road');
  });

  it('stops naming after four and says how many more', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => withCustom(n, 1, 0));
    const message = describeCustomisationLoss(many)!;
    expect(message).toContain('and 2 more');
    expect(message).not.toContain('e (');
  });

  it('does not say "more" when exactly the limit is named', () => {
    const four = ['a', 'b', 'c', 'd'].map((n) => withCustom(n, 1, 0));
    expect(describeCustomisationLoss(four)).not.toContain('more');
  });
});

describe('countCustomValues', () => {
  it('adds both tables across every field', () => {
    expect(countCustomValues([withCustom('a', 1, 3), withCustom('b', 2, 0), clean('c')])).toBe(6);
  });
});
