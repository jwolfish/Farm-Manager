import { describe, it, expect } from 'vitest';
import {
  resolveTemplateProgramRefs,
  indexProgramsByName,
  type ProgramRef,
} from './costTemplateImport';

/**
 * The real shape, from production on 20 Sep 2026. T & L Doolittle Farms 2027 and
 * Doolittle Farm Family 2027 hold the same five fertilizer programs by name, and the
 * destination's copies are byte-identical in items and application cost — which is why
 * reusing them is right and importing a second set would only create duplicates.
 */
const SOURCE_FERT = new Map([
  ['tl-fall', 'Fall Fertilizer'],
  ['tl-starter', 'Corn Starter'],
  ['tl-topdress', 'Corn Topdress N'],
]);

const DEST_FERT = new Map([
  ['Fall Fertilizer', 'dff-fall'],
  ['Corn Starter', 'dff-starter'],
  ['Corn Topdress N', 'dff-topdress'],
  ['Fall Wheat', 'dff-fall-wheat'],
]);

const ref = (program_id: string, cost_per_acre = 39.46): ProgramRef => ({ program_id, cost_per_acre });

describe('resolveTemplateProgramRefs — the 2027 case, destination already set up', () => {
  it('re-points every ref at the destination program of the same name', () => {
    const r = resolveTemplateProgramRefs([ref('tl-fall'), ref('tl-starter')], SOURCE_FERT, DEST_FERT);
    expect(r.resolved).toEqual([
      { programId: 'dff-fall', name: 'Fall Fertilizer' },
      { programId: 'dff-starter', name: 'Corn Starter' },
    ]);
    expect(r.unresolved).toEqual([]);
  });

  /*
   * THE DEFECT THIS FUNCTION EXISTS TO PREVENT. Copying the row verbatim leaves the
   * source farm's ids in the destination's template. `calculateTemplateCost` never
   * resolves an id, so it would look right; `cascadeProgramUpdateInSeason` filters
   * templates by season, so it would never update again. A permanently frozen cost.
   */
  it('NEVER returns a source program id', () => {
    const r = resolveTemplateProgramRefs([ref('tl-fall'), ref('tl-topdress')], SOURCE_FERT, DEST_FERT);
    const ids = r.resolved.map((x) => x.programId);
    expect(ids).not.toContain('tl-fall');
    expect(ids).not.toContain('tl-topdress');
    for (const id of ids) expect([...DEST_FERT.values()]).toContain(id);
  });

  /*
   * And it must not carry the source's snapshot cost either — the resolution deliberately
   * returns no cost at all, so the caller cannot accidentally copy one. A program costs
   * what it costs on the farm it now lives on.
   */
  it('returns no cost, so the source snapshot cannot be carried across', () => {
    const r = resolveTemplateProgramRefs([ref('tl-fall', 999.99)], SOURCE_FERT, DEST_FERT);
    expect(r.resolved[0]).not.toHaveProperty('cost_per_acre');
    expect(JSON.stringify(r.resolved)).not.toContain('999.99');
  });
});

describe('resolveTemplateProgramRefs — the 2026 case, destination empty', () => {
  /*
   * Doolittle Farm Family's 2026 season holds 0 programs. Before anything is imported
   * nothing matches, which is why the caller reads the destination AFTER importing the
   * programs selected in the same run.
   */
  it('resolves nothing against an empty destination, and names what is missing', () => {
    const r = resolveTemplateProgramRefs([ref('tl-fall'), ref('tl-starter')], SOURCE_FERT, new Map());
    expect(r.resolved).toEqual([]);
    expect(r.unresolved).toEqual(['Fall Fertilizer', 'Corn Starter']);
  });

  it('resolves everything once those programs have been imported', () => {
    const freshlyImported = new Map([
      ['Fall Fertilizer', 'new-fall'],
      ['Corn Starter', 'new-starter'],
    ]);
    const r = resolveTemplateProgramRefs([ref('tl-fall'), ref('tl-starter')], SOURCE_FERT, freshlyImported);
    expect(r.resolved.map((x) => x.programId)).toEqual(['new-fall', 'new-starter']);
    expect(r.unresolved).toEqual([]);
  });
});

describe('resolveTemplateProgramRefs — what it refuses to guess', () => {
  it('reports a program the destination does not have, by name', () => {
    const r = resolveTemplateProgramRefs(
      [ref('tl-fall'), ref('tl-starter')],
      SOURCE_FERT,
      new Map([['Fall Fertilizer', 'dff-fall']])
    );
    expect(r.resolved.map((x) => x.name)).toEqual(['Fall Fertilizer']);
    expect(r.unresolved).toEqual(['Corn Starter']);
  });

  it('reports each distinct failure once, not once per occurrence', () => {
    const r = resolveTemplateProgramRefs(
      [ref('tl-starter'), ref('tl-starter'), ref('tl-starter')],
      SOURCE_FERT,
      new Map()
    );
    expect(r.unresolved).toEqual(['Corn Starter']);
  });

  it('reports a ref whose source program has been deleted', () => {
    const r = resolveTemplateProgramRefs([ref('gone')], SOURCE_FERT, DEST_FERT);
    expect(r.resolved).toEqual([]);
    expect(r.unresolved).toEqual(['a program that no longer exists (gone)']);
  });

  it('does not double-count when two refs land on one destination program', () => {
    const twoNamesOneTarget = new Map([
      ['Fall Fertilizer', 'dff-fall'],
      ['Corn Starter', 'dff-fall'],
    ]);
    const r = resolveTemplateProgramRefs(
      [ref('tl-fall'), ref('tl-starter')],
      SOURCE_FERT,
      twoNamesOneTarget
    );
    expect(r.resolved).toEqual([{ programId: 'dff-fall', name: 'Fall Fertilizer' }]);
  });
});

describe('resolveTemplateProgramRefs — the Json column is not to be trusted', () => {
  it('treats a non-array as an empty list rather than iterating it', () => {
    for (const junk of [null, undefined, {}, 'fertilizer_programs', 42]) {
      expect(resolveTemplateProgramRefs(junk, SOURCE_FERT, DEST_FERT)).toEqual({
        resolved: [],
        unresolved: [],
      });
    }
  });

  it('is empty and quiet for a template that genuinely references no programs', () => {
    // Soybean Standard really does carry 0 fertilizer refs.
    expect(resolveTemplateProgramRefs([], SOURCE_FERT, DEST_FERT)).toEqual({
      resolved: [],
      unresolved: [],
    });
  });

  it('reports a malformed entry instead of skipping it silently', () => {
    const r = resolveTemplateProgramRefs(
      [ref('tl-fall'), { cost_per_acre: 12 }, null, 'nope'],
      SOURCE_FERT,
      DEST_FERT
    );
    expect(r.resolved.map((x) => x.name)).toEqual(['Fall Fertilizer']);
    expect(r.unresolved).toEqual(['an unrecognised program entry']);
  });
});

describe('resolveTemplateProgramRefs — name matching', () => {
  it('tolerates case and surrounding whitespace', () => {
    const source = new Map([['p1', '  corn starter ']]);
    const r = resolveTemplateProgramRefs([ref('p1')], source, DEST_FERT);
    expect(r.resolved).toEqual([{ programId: 'dff-starter', name: '  corn starter ' }]);
  });

  it('prefers an exact match over a case-variant', () => {
    const dest = new Map([
      ['corn starter', 'lower'],
      ['Corn Starter', 'exact'],
    ]);
    const r = resolveTemplateProgramRefs([ref('tl-starter')], SOURCE_FERT, dest);
    expect(r.resolved[0].programId).toBe('exact');
  });

  it('does not match a blank name to a blank-named program', () => {
    const source = new Map([['p1', '   ']]);
    const r = resolveTemplateProgramRefs([ref('p1')], source, new Map([['other', 'x']]));
    expect(r.resolved).toEqual([]);
    expect(r.unresolved).toEqual(['   ']);
  });
});

describe('indexProgramsByName', () => {
  it('indexes by name', () => {
    const { byName, ambiguous } = indexProgramsByName([
      { id: 'a', program_name: 'Fall Fertilizer' },
      { id: 'b', program_name: 'Corn Starter' },
    ]);
    expect(byName.get('Fall Fertilizer')).toBe('a');
    expect(byName.get('Corn Starter')).toBe('b');
    expect(ambiguous).toEqual([]);
  });

  it('keeps the first of a repeated name and reports the collision', () => {
    const { byName, ambiguous } = indexProgramsByName([
      { id: 'first', program_name: 'Corn Post' },
      { id: 'second', program_name: 'Corn Post' },
    ]);
    expect(byName.get('Corn Post')).toBe('first');
    expect(ambiguous).toEqual(['Corn Post']);
  });

  it('reports a name colliding three ways only once', () => {
    const { ambiguous } = indexProgramsByName([
      { id: '1', program_name: 'Corn Post' },
      { id: '2', program_name: 'Corn Post' },
      { id: '3', program_name: 'Corn Post' },
    ]);
    expect(ambiguous).toEqual(['Corn Post']);
  });
});
