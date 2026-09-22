#!/usr/bin/env node
/*
 * PreToolUse hook — refuse a hand edit to anything in `baselines/`.
 *
 * Those files are the ratchet's memory. `check-baselines.mjs` fails only on an entry
 * that is not in them, so editing one by hand does not fix a problem — it deletes the
 * record that a problem exists, and the next run goes green. That is the one failure
 * mode the whole ratchet cannot detect, because it IS the detector.
 *
 * The legitimate route is `npm run baselines:update` (or `npm run mirrors:update`),
 * run deliberately, committed alongside the change it describes, and — when it records
 * a NEW problem rather than a fixed one — argued for in the commit message. Both write
 * these files with node, not with the Edit tool, so neither is affected by this hook.
 *
 * Exit 2 is the documented "block and tell Claude why" code; stderr is what it reads.
 */

import { readFileSync } from 'node:fs';

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // Never block over a hook that could not read its own input.
}

const path = payload?.tool_input?.file_path ?? '';
const normalized = path.replace(/\\/g, '/');

if (!/(^|\/)baselines\/[^/]+$/.test(normalized)) process.exit(0);

console.error(
  `Refused: ${normalized} is a committed baseline, not an ordinary file.\n\n` +
  'Editing it by hand erases the record that a problem exists, and the ratchet then\n' +
  'reports green. Regenerate it instead:\n\n' +
  '  baselines/tsc.txt, baselines/eslint.txt  ->  npm run baselines:update\n' +
  '  baselines/mirrors.json                   ->  npm run mirrors:update\n\n' +
  'Commit the result with the change it describes. If it records a NEW problem rather\n' +
  'than a fixed one, say why in the commit message — CLAUDE.md requires that argument.'
);
process.exit(2);
