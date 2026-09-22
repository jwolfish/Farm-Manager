#!/usr/bin/env node
/*
 * Guardrail 7 — the cost math exists TWICE and must not drift.
 *
 * `convertUnits`, `calculateCostWithConversion`, `calculateFieldTotalCost`,
 * `applyFieldCostOverrides` and the rest are implemented in `src/lib/` AND again in
 * `supabase/functions/process-cascade-task/index.ts`, which cannot import from `src/`.
 * Every sync so far has been done by hand and every one has been correct, which is
 * precisely why one eventually will not be. The 31 Aug override defect is what a
 * one-sided fix looks like: nine real fields carried a wrong total for six months
 * because a fix landed on the client copy and not on the copy that actually runs.
 *
 * WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It does NOT compare the two bodies against each other. They are legitimately
 * different text — the edge copy takes `fc` where the client takes `fieldCost`, has no
 * imports, and inlines its types. A textual diff between the sides would cry wolf on
 * every run, and a check that cries wolf gets ignored, which is worse than no check.
 *
 * It fingerprints each side SEPARATELY against a committed manifest, exactly the way
 * `check-baselines.mjs` compares error sets rather than counts. So it answers one
 * question and answers it without false positives:
 *
 *     "Did somebody change one copy without acknowledging the other?"
 *
 * A legitimate two-sided change updates both fingerprints and is waved through by
 * `npm run mirrors:update`. A one-sided change fails, names the symbol and the side,
 * and says where its twin lives. That is the whole mechanism: it cannot verify the two
 * are semantically equal — nothing can, short of WI-27 deleting one of them — but it
 * makes the divergence impossible to commit silently.
 *
 * Comments and whitespace are stripped before hashing, so re-wrapping a line or
 * editing a comment does not fail the build. A changed constant, operator or branch
 * does.
 *
 * Usage:  node scripts/check-mirrored-math.mjs           (check — exits 1 on drift)
 *         node scripts/check-mirrored-math.mjs --update  (re-record the manifest)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'baselines/mirrors.json');
const EDGE = 'supabase/functions/process-cascade-task/index.ts';

/*
 * The twelve symbols that exist on both sides, as measured on 21 Sep 2026.
 *
 * Adding one here is how a new piece of duplicated math gets protected. Removing one
 * should only ever happen because WI-27 deleted a copy for real — not because the
 * check became inconvenient.
 */
const MIRRORS = [
  // The unit conversion table and everything built directly on it.
  { symbol: 'normalizeUnit', src: 'src/lib/unitConversions.ts' },
  { symbol: 'lookupUnit', src: 'src/lib/unitConversions.ts' },
  { symbol: 'convertUnits', src: 'src/lib/unitConversions.ts' },
  { symbol: 'unitClassOf', src: 'src/lib/unitConversions.ts' },
  { symbol: 'convertProductUnits', src: 'src/lib/unitConversions.ts' },
  { symbol: 'describeConversionFailure', src: 'src/lib/unitConversions.ts' },
  { symbol: 'calculateCostWithConversion', src: 'src/lib/unitConversions.ts' },

  // The field-total math. `applyFieldCostOverrides` is the 31 Aug fix itself.
  { symbol: 'applyFieldCostOverrides', src: 'src/lib/templateLib/templateCalculations.ts' },
  { symbol: 'refreshProgramCostInRefs', src: 'src/lib/templateLib/templateCalculations.ts' },
  { symbol: 'calculateFieldTotalCost', src: 'src/lib/templateLib/templateCalculations.ts' },

  // Program costs, which is what a price change actually moves.
  { symbol: 'recalculateFertilizerProgramCost', src: 'src/lib/templateLib/programCosts.ts' },
  { symbol: 'recalculateChemicalProgramCost', src: 'src/lib/templateLib/programCosts.ts' },
];

/*
 * Read a file with CRs stripped.
 *
 * The repo is CRLF (git core.autocrlf=true) and anything downloaded from Supabase is
 * LF. That difference has made a byte-identical edge function deploy look wholly
 * rewritten more than once; there is no reason to let it reach a hash here.
 */
function read(rel) {
  const path = resolve(ROOT, rel);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').replace(/\r/g, '');
}

/*
 * Pull one function's source out of a file by brace matching from its declaration.
 *
 * Deliberately a small scanner rather than a regex: a regex that tries to match a
 * function body stops at the first `}` inside it, which for `convertUnits` is about
 * four lines in. It tracks strings, template literals and comments so a brace inside
 * one of those does not end the function early.
 *
 * Returns null when the symbol is absent — which is itself a failure, because a symbol
 * that has been renamed on one side only is a drift, not an exemption.
 */
function extractFunction(source, symbol) {
  const decl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${symbol}\\s*[<(]`);
  const found = decl.exec(source);
  if (!found) return null;

  const start = found.index + found[0].length - 1;

  // Walk forward to the opening brace of the body, then match braces to its close.
  let i = start;
  let depth = 0;
  let started = false;
  let inLine = false;
  let inBlock = false;
  let quote = null;

  for (; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i++; }
      continue;
    }
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }

    if (c === '{') { depth++; started = true; continue; }
    if (c === '}') {
      depth--;
      if (started && depth === 0) return source.slice(found.index, i + 1);
    }
  }
  return null;
}

/*
 * Strip comments and collapse whitespace, so prose and formatting do not fail a build.
 *
 * What survives is the code: identifiers, literals, operators and structure. Editing
 * the long comment above `convertUnits` is free; changing 28349523125 to 28349523000
 * is not.
 */
function fingerprint(fnSource) {
  const stripped = fnSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(stripped).digest('hex').slice(0, 16);
}

function collect() {
  const edgeSource = read(EDGE);
  if (edgeSource === null) {
    console.error(`Mirror check: cannot read ${EDGE}`);
    process.exit(1);
  }

  const sources = new Map();
  const current = {};
  const missing = [];

  for (const { symbol, src } of MIRRORS) {
    if (!sources.has(src)) {
      const text = read(src);
      if (text === null) {
        console.error(`Mirror check: cannot read ${src}`);
        process.exit(1);
      }
      sources.set(src, text);
    }

    const clientFn = extractFunction(sources.get(src), symbol);
    const edgeFn = extractFunction(edgeSource, symbol);

    if (!clientFn) missing.push(`${symbol} — not found in ${src}`);
    if (!edgeFn) missing.push(`${symbol} — not found in ${EDGE}`);
    if (!clientFn || !edgeFn) continue;

    current[symbol] = {
      src,
      client: fingerprint(clientFn),
      edge: fingerprint(edgeFn),
    };
  }

  return { current, missing };
}

const updating = process.argv.includes('--update');
const { current, missing } = collect();

/*
 * A missing symbol is a hard failure in both modes, including --update.
 *
 * Renaming or deleting one copy is exactly the drift this exists to catch, so it must
 * not be recordable as the new normal by running the update command. If a copy really
 * is gone for good, the entry comes out of MIRRORS above, in a commit that says why.
 */
if (missing.length > 0) {
  console.error('\nMirror check FAILED — a mirrored function is missing:\n');
  for (const m of missing) console.error(`  ${m}`);
  console.error(
    '\nOne copy has been renamed or deleted. Both copies move together or neither does' +
    '\n(CLAUDE.md guardrail 7). If a copy is genuinely gone, remove its entry from' +
    '\nMIRRORS in scripts/check-mirrored-math.mjs and say why in the commit message.\n'
  );
  process.exit(1);
}

if (updating) {
  writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  console.log(`Mirror manifest updated — ${Object.keys(current).length} functions recorded.`);
  console.log('Commit baselines/mirrors.json alongside the change it describes.');
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.error(
    '\nMirror check: baselines/mirrors.json does not exist.' +
    '\nRun `npm run mirrors:update` once to record the current state, and commit it.\n'
  );
  process.exit(1);
}

const recorded = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const drifted = [];

for (const [symbol, now] of Object.entries(current)) {
  const was = recorded[symbol];
  if (!was) {
    drifted.push({ symbol, src: now.src, sides: ['new'], now, was: null });
    continue;
  }
  const sides = [];
  if (was.client !== now.client) sides.push('client');
  if (was.edge !== now.edge) sides.push('edge function');
  if (sides.length > 0) drifted.push({ symbol, src: now.src, sides, now, was });
}

for (const symbol of Object.keys(recorded)) {
  if (!(symbol in current)) {
    console.error(`Mirror check: ${symbol} is in the manifest but no longer in MIRRORS.`);
    console.error('Run `npm run mirrors:update` if that removal was deliberate.\n');
    process.exit(1);
  }
}

if (drifted.length === 0) {
  console.log(`Mirror check passed — ${Object.keys(current).length} functions, both copies unchanged.`);
  process.exit(0);
}

/*
 * The interesting case, and the reason the two sides are reported separately: a change
 * to ONE side is the defect; a change to BOTH is ordinary work that needs recording.
 */
const oneSided = drifted.filter((d) => d.sides.length === 1 && d.sides[0] !== 'new');
const bothSides = drifted.filter((d) => d.sides.length === 2);
const added = drifted.filter((d) => d.sides[0] === 'new');

console.error('\nMirror check FAILED — the duplicated cost math has moved.\n');

if (oneSided.length > 0) {
  console.error('  CHANGED ON ONE SIDE ONLY — this is the guardrail 7 defect:\n');
  for (const d of oneSided) {
    const other = d.sides[0] === 'client' ? EDGE : d.src;
    console.error(`    ${d.symbol}`);
    console.error(`      changed in : ${d.sides[0] === 'client' ? d.src : EDGE}`);
    console.error(`      NOT changed: ${other}`);
    console.error('');
  }
  console.error(
    '  Apply the same change to the other copy, then run `npm run mirrors:update`.' +
    '\n  If the change genuinely belongs on one side only, say so in the commit message' +
    '\n  and run the update anyway — but be certain: the 31 Aug override defect was' +
    '\n  exactly this, and it cost nine fields six months of wrong totals.\n'
  );
}

if (bothSides.length > 0) {
  console.error('  Changed on both sides (probably fine — record it):\n');
  for (const d of bothSides) console.error(`    ${d.symbol}`);
  console.error('\n  Run `npm run mirrors:update` and commit baselines/mirrors.json.\n');
}

if (added.length > 0) {
  console.error('  New to the manifest:\n');
  for (const d of added) console.error(`    ${d.symbol}`);
  console.error('\n  Run `npm run mirrors:update`.\n');
}

process.exit(1);
