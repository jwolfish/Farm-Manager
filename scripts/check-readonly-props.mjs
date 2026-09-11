#!/usr/bin/env node
/*
 * The read-only prop check.
 *
 * WHY THIS EXISTS, because it looks like a trivial lint rule and is not.
 *
 * `App.tsx` hands `readOnly={activeRole === 'viewer'}` to a set of pages, and each page
 * has to hold up its end. Nothing inside a page is wrong when you read that page alone —
 * the defect only exists between two files, which is the shape this codebase keeps
 * producing (the cost math in two copies, `fetchSharedFarms` embedding through a foreign
 * key that points elsewhere, the `user_id` filter copy-pasted into seven files).
 *
 * That contract has broken three times, in two different ways:
 *
 *   1. The page never DECLARES the prop. `Fields` (10 Sep) and `Yields` (10 Sep, hours
 *      later) were both found this way. `tsc` reports it as a TS2322, so the baseline
 *      ratchet already catches a new one — that direction is covered and this script
 *      deliberately does not duplicate it.
 *
 *   2. The page DECLARES the prop and never binds it. `SalesTracking` sat like this:
 *      `readOnly?: boolean` in the interface, `{ seasonId }` in the destructure. Six
 *      commodity sections rendered full add / edit / delete for a viewer.
 *
 * Case 2 is invisible to every tool in this repo, and the reason is worth stating:
 * declaring the prop is exactly what silences `tsc` (the prop IS declared, so no
 * TS2322), and never binding it is what silences `eslint` (an interface member is not
 * an unused variable). It survived two sweeps of the baseline, not through carelessness
 * but because the instrument was blind. So it gets a check of its own.
 *
 * The rule: if a props type declares `readOnly`, the file must mention `readOnly`
 * somewhere other than that declaration. Deliberately generous — a destructure,
 * `props.readOnly`, or passing it to a child all count. A check that cries wolf gets
 * ignored, and the failure this is aimed at is the total one: declared, never read.
 *
 *   node scripts/check-readonly-props.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');

/** A props-type member: `readOnly?: boolean;` or `readOnly: boolean;` */
const DECLARATION = /^\s*readOnly\??\s*:\s*boolean\s*;?\s*$/;
const MENTIONS_READONLY = /\breadOnly\b/;

/** Paths normalise the same way on Windows and Linux so the output is comparable. */
function relPath(p) {
  return p.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/*
 * Comments are stripped before counting mentions. A file that declares the prop and then
 * only talks ABOUT it in a comment has not bound it, and must still fail — otherwise
 * documenting the defect would silence the check for it.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const offenders = [];
let declaring = 0;

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8');
  if (!MENTIONS_READONLY.test(source)) continue;

  const code = stripComments(source);
  const lines = code.split('\n');
  const declarations = lines.filter((line) => DECLARATION.test(line));
  if (declarations.length === 0) continue;

  declaring += 1;

  const otherMentions = lines.filter(
    (line) => MENTIONS_READONLY.test(line) && !DECLARATION.test(line),
  );

  /*
   * `readOnly` is also a real DOM attribute on <input>/<textarea>. A file whose only
   * other mention is `readOnly={...}` on a JSX intrinsic is still gating something, so
   * it passes — the check is aimed at the prop that is declared and never read at all.
   */
  if (otherMentions.length === 0) {
    offenders.push({
      file: relPath(file),
      line: lines.findIndex((line) => DECLARATION.test(line)) + 1,
    });
  }
}

console.log(`Read-only prop check: ${declaring} component file(s) declare a \`readOnly\` prop.`);

if (offenders.length > 0) {
  console.error('\nFAILED: a props type declares `readOnly` and nothing in the file reads it.');
  console.error('A viewer on a shared farm will see every control this component renders.\n');
  for (const { file, line } of offenders) {
    console.error(`  ${file}:${line}  declares \`readOnly\` and never binds it`);
  }
  console.error('\nDestructure it and gate the controls that write, e.g.');
  console.error('  export function Thing({ seasonId, readOnly = false }: ThingProps) {');
  console.error('  ...');
  console.error('  {!readOnly && <button onClick={handleDelete}>Delete</button>}');
  console.error('\nNeither `tsc` nor `eslint` can see this one — that is why the check exists.');
  process.exit(1);
}

console.log('OK: every declared `readOnly` prop is read.');
