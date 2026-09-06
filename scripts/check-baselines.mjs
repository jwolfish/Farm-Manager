#!/usr/bin/env node
/*
 * WI-21 — the ratchet.
 *
 * `tsc` reports 69 errors and `eslint` reports 107/28 on a healthy tree, so CI cannot
 * simply require a zero exit. It requires that nothing NEW appears: the committed
 * baselines hold the known set, and this script fails only on an entry that is not in
 * them. Removing an entry is always allowed and prints a note to re-run with --update.
 *
 * Sets, not counts, because the status doc has said from Round 3 onward that "counts are
 * not evidence" — one error fixed and one introduced leaves the total unchanged. Line and
 * column are stripped for the same reason: adding a line above an error must not read as
 * a new error.
 *
 *   node scripts/check-baselines.mjs            check (CI does this)
 *   node scripts/check-baselines.mjs --update   rewrite the baselines after real work
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_DIR = resolve(ROOT, 'baselines');
const UPDATE = process.argv.includes('--update');

/** Run a command that is EXPECTED to exit non-zero, and hand back its stdout regardless. */
function runAllowingFailure(command) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.stdout === undefined && err.stderr) {
      throw new Error(`${command} produced no stdout. stderr:\n${err.stderr}`);
    }
    return err.stdout ?? '';
  }
}

/*
 * Baselines are generated on Windows and checked on Linux, so a path must normalise to
 * the same string on both or every entry reads as new on the first CI run.
 */
function relPath(p) {
  return p.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '').replace(/^\.\//, '');
}

function collectTsc() {
  const out = runAllowingFailure('npx tsc --noEmit -p tsconfig.app.json');
  const entries = [];
  for (const line of out.split(/\r?\n/)) {
    // Continuation lines are indented detail belonging to the entry above.
    const m = /^(\S[^(]*)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line);
    if (m) entries.push(`${relPath(m[1])} | ${m[2]} | ${m[3].trim()}`);
  }
  return entries;
}

function collectEslint() {
  const out = runAllowingFailure('npx eslint . -f json');
  const start = out.indexOf('[');
  if (start === -1) throw new Error(`eslint produced no JSON. Output was:\n${out.slice(0, 2000)}`);
  const results = JSON.parse(out.slice(start));
  const entries = [];
  for (const file of results) {
    for (const msg of file.messages) {
      const severity = msg.severity === 2 ? 'error' : 'warning';
      entries.push(`${relPath(file.filePath)} | ${severity} | ${msg.ruleId ?? '(none)'} | ${msg.message}`);
    }
  }
  return entries;
}

/** Multiset comparison — five identical entries in one file must not collapse to one. */
function compare(current, baseline) {
  const count = (list) => {
    const m = new Map();
    for (const e of list) m.set(e, (m.get(e) ?? 0) + 1);
    return m;
  };
  const cur = count(current);
  const base = count(baseline);
  const added = [];
  const removed = [];
  for (const [entry, n] of cur) {
    const extra = n - (base.get(entry) ?? 0);
    for (let i = 0; i < extra; i++) added.push(entry);
  }
  for (const [entry, n] of base) {
    const gone = n - (cur.get(entry) ?? 0);
    for (let i = 0; i < gone; i++) removed.push(entry);
  }
  return { added, removed };
}

function readBaseline(name) {
  const path = resolve(BASELINE_DIR, name);
  if (!existsSync(path)) {
    console.error(`Missing baseline ${name}. Create it with: node scripts/check-baselines.mjs --update`);
    process.exit(1);
  }
  return readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
}

function writeBaseline(name, entries) {
  if (!existsSync(BASELINE_DIR)) mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(resolve(BASELINE_DIR, name), `${[...entries].sort().join('\n')}\n`, 'utf8');
}

const checks = [
  { name: 'TypeScript', file: 'tsc.txt', collect: collectTsc },
  { name: 'ESLint', file: 'eslint.txt', collect: collectEslint },
];

let failed = false;
const summary = [];

for (const check of checks) {
  process.stdout.write(`Running ${check.name}... `);
  const current = check.collect();
  console.log(`${current.length} entries`);

  if (UPDATE) {
    writeBaseline(check.file, current);
    console.log(`  baseline written: baselines/${check.file}`);
    continue;
  }

  const { added, removed } = compare(current, readBaseline(check.file));

  if (added.length > 0) {
    failed = true;
    console.log(`\n  ${check.name}: ${added.length} NEW problem(s) not in the baseline:\n`);
    for (const e of added) console.log(`    + ${e}`);
    console.log('');
  }
  if (removed.length > 0) {
    console.log(`  ${check.name}: ${removed.length} baseline entr(ies) no longer reported — nice.`);
    console.log('    Re-run with --update and commit baselines/ to lock the improvement in.');
  }
  if (added.length === 0 && removed.length === 0) {
    console.log(`  ${check.name}: unchanged (${current.length}).`);
  }
  summary.push(`${check.name}: ${current.length} (${added.length} new, ${removed.length} fixed)`);
}

if (UPDATE) {
  console.log('\nBaselines updated. Review the diff before committing.');
  process.exit(0);
}

console.log(`\n${summary.join(' · ')}`);

if (failed) {
  console.error('\nFAILED: new problems were introduced.');
  console.error('Fix them, or if they are genuinely acceptable, run');
  console.error('  node scripts/check-baselines.mjs --update');
  console.error('and say in the commit message why the baseline moved the wrong way.');
  process.exit(1);
}

console.log('OK: no new problems.');
