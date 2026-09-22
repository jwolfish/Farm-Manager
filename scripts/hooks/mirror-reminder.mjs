#!/usr/bin/env node
/*
 * PostToolUse hook — say so, the moment one copy of the cost math is edited.
 *
 * Guardrail 7: `convertUnits`, `calculateCostWithConversion`, `calculateFieldTotalCost`,
 * `applyFieldCostOverrides`, `refreshProgramCostInRefs` and both `recalculate*ProgramCost`
 * live in `src/lib/` and again in the edge function, which cannot import from `src/`.
 * The 31 Aug override defect was a fix that landed on one side only: nine real fields
 * carried a wrong total for six months, with no error anywhere.
 *
 * This is a REMINDER, not a gate, and that is deliberate. A one-sided edit is sometimes
 * correct — the client copy has callers the cascade does not — so blocking would be
 * wrong. `scripts/check-mirrored-math.mjs` is the gate; it runs in `npm run verify` and
 * in CI, and it can return "no". This just makes sure the second copy is remembered at
 * the moment of the edit rather than at the end of the session.
 *
 * Emits `additionalContext` and exits 0, so it never interrupts anything.
 */

import { readFileSync } from 'node:fs';

const EDGE = 'supabase/functions/process-cascade-task/index.ts';

const MIRRORED_SOURCES = new Map([
  ['src/lib/unitConversions.ts',
    'normalizeUnit, lookupUnit, convertUnits, unitClassOf, convertProductUnits, ' +
    'describeConversionFailure, calculateCostWithConversion'],
  ['src/lib/templateLib/templateCalculations.ts',
    'applyFieldCostOverrides, refreshProgramCostInRefs, calculateFieldTotalCost'],
  ['src/lib/templateLib/programCosts.ts',
    'recalculateFertilizerProgramCost, recalculateChemicalProgramCost'],
]);

function emit(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
  }));
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const path = (payload?.tool_input?.file_path ?? '').replace(/\\/g, '/');

for (const [source, symbols] of MIRRORED_SOURCES) {
  if (path.endsWith(source)) {
    emit(
      `Guardrail 7: ${source} holds cost math that is MIRRORED in the edge function ` +
      `(${EDGE}), which cannot import from src/. Mirrored here: ${symbols}. ` +
      'If the edit touched one of those, apply the same change to the edge copy, then ' +
      'run `npm run mirrors:update` and deploy with `npm run deploy:cascade`. ' +
      'The 31 Aug override defect was exactly a one-sided fix. ' +
      '`npm run mirrors` will tell you whether the two copies are still in step.'
    );
  }
}

if (path.endsWith(EDGE)) {
  emit(
    'Guardrail 7: the edge function holds cost math MIRRORED in src/lib/ — ' +
    'unitConversions.ts, templateLib/templateCalculations.ts and templateLib/programCosts.ts. ' +
    'If the edit touched any of those functions, apply the same change on the client side, ' +
    'then run `npm run mirrors:update`. This copy is also the one that actually runs the ' +
    'cascade, so it needs `npm run deploy:cascade` and a byte-for-byte verification ' +
    '(diff --strip-trailing-cr — the repo is CRLF and the download is LF).'
  );
}

process.exit(0);
