/**
 * Re-pointing a cost template's programs when the template is copied into another season
 * or another farm — extracted so the answer can be tested, per the `accumulateNeed` /
 * `resolveAppLoadPresentation` pattern.
 *
 * WHY THIS EXISTS AT ALL. `cost_templates.fertilizer_programs` and `.chemical_programs`
 * are JSON arrays of `{program_id, cost_per_acre}` — a foreign key held by value, plus a
 * frozen cost. Copying that row verbatim into another farm leaves the ids pointing at the
 * SOURCE farm's programs, which is the LOG-10 defect (a `master_product_id` carried across
 * a farm boundary) in a new column. It would be invisible, too: `calculateTemplateCost`
 * sums the snapshot without resolving a single id, so the template shows a plausible total
 * and applies real money to fields, while `cascadeProgramUpdateInSeason` loads templates
 * `.eq('season_id', seasonId)` and therefore never sees it again. A price change on either
 * farm would move nothing. The cost would be frozen at the moment of the copy, forever.
 *
 * THE RULE, which covers both reasons anyone copies a template:
 *   use the destination's program of that NAME if one exists, otherwise it is unresolved
 *   and the caller must say so by name.
 * The caller builds `destinationIdsByName` AFTER importing any programs selected in the
 * same run, so a program that came along in this import and a program that was already
 * there resolve through one map and cannot disagree. Copying into an empty farm therefore
 * resolves everything through the freshly imported programs; copying into a farm that is
 * already set up reuses what is there and creates no duplicates.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: carry the source's `cost_per_acre` across. A program
 * costs what it costs on the farm it now lives on — different prices, possibly different
 * products. The caller re-derives each cost with `recalculate*ProgramCost` against the
 * destination season. Copying the snapshot would reintroduce the frozen cost by hand.
 */

/**
 * One entry of a template's program array, as stored.
 *
 * A `type` rather than an `interface` on purpose: these are written back into a `Json`
 * column, and only a type alias gets the implicit index signature that makes it assignable
 * to `Json`. An interface here fails to compile at the insert.
 */
export type ProgramRef = {
  program_id: string;
  cost_per_acre: number;
};

/** A source ref successfully re-pointed at a destination program. */
export interface ResolvedProgramRef {
  /** The DESTINATION program's id — never the source's. */
  programId: string;
  /** The program name both sides agreed on, for reporting and for the preview. */
  name: string;
}

export interface TemplateProgramResolution {
  resolved: ResolvedProgramRef[];
  /**
   * What could not be placed, described once each and in source order. A template that
   * silently dropped a program would be an understated cost per acre with nothing on
   * screen to say so — the WI-15 lie in its quiet direction.
   */
  unresolved: string[];
}

/**
 * Look a name up in the destination, exact match beating a case-insensitive one so two
 * programs differing only in case still resolve to the one actually named. Mirrors
 * `matchFertilizerProductByName` (F-5) rather than inventing a second matching rule.
 */
function findByName(
  destinationIdsByName: ReadonlyMap<string, string>,
  name: string
): string | null {
  const exact = destinationIdsByName.get(name);
  if (exact !== undefined) return exact;

  const wanted = name.trim().toLowerCase();
  if (wanted === '') return null;
  for (const [candidate, id] of destinationIdsByName) {
    if (candidate.trim().toLowerCase() === wanted) return id;
  }
  return null;
}

/**
 * Re-point one template program array at the destination season.
 *
 * @param rawRefs             the Json column as stored, which may be anything
 * @param sourceNamesById     source program id -> its name, from the season being copied
 * @param destinationIdsByName destination program name -> its id, read AFTER any programs
 *                            selected in this same import have been written
 */
export function resolveTemplateProgramRefs(
  rawRefs: unknown,
  sourceNamesById: ReadonlyMap<string, string>,
  destinationIdsByName: ReadonlyMap<string, string>
): TemplateProgramResolution {
  // A Json column is `unknown` and has been iterated as an array twice in this codebase
  // when it was not one (V-8, WI-19). An empty or absent list is legitimate: a soybean
  // template really does reference no fertilizer programs.
  if (!Array.isArray(rawRefs)) return { resolved: [], unresolved: [] };

  const resolved: ResolvedProgramRef[] = [];
  const seenDestinationIds = new Set<string>();
  // Distinct failures, reported once each rather than once per occurrence — the `Set` the
  // F-6 plan calculator needed when five fields produced five identical sentences.
  const unresolved = new Set<string>();

  for (const entry of rawRefs) {
    const programId =
      entry && typeof entry === 'object' && typeof (entry as ProgramRef).program_id === 'string'
        ? (entry as ProgramRef).program_id
        : null;

    if (!programId) {
      unresolved.add('an unrecognised program entry');
      continue;
    }

    const name = sourceNamesById.get(programId);
    if (name === undefined) {
      // The template references a program that no longer exists in the source season.
      unresolved.add(`a program that no longer exists (${programId})`);
      continue;
    }

    const destinationId = findByName(destinationIdsByName, name);
    if (destinationId === null) {
      unresolved.add(name);
      continue;
    }

    // Two source refs landing on one destination program would double-count its cost.
    if (seenDestinationIds.has(destinationId)) continue;
    seenDestinationIds.add(destinationId);

    resolved.push({ programId: destinationId, name });
  }

  return { resolved, unresolved: [...unresolved] };
}

/**
 * Build the destination lookup, keeping the FIRST program of a given name.
 *
 * Nothing stops a season holding two programs with the same name, and which one a cost
 * template points at decides real money. First-wins over a caller-ordered list is at least
 * deterministic, and `ambiguous` names the collision so the caller can report it rather
 * than letting the choice pass unremarked.
 */
export function indexProgramsByName(
  programs: readonly { id: string; program_name: string }[]
): { byName: Map<string, string>; ambiguous: string[] } {
  const byName = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const program of programs) {
    if (byName.has(program.program_name)) {
      ambiguous.add(program.program_name);
      continue;
    }
    byName.set(program.program_name, program.id);
  }

  return { byName, ambiguous: [...ambiguous] };
}
