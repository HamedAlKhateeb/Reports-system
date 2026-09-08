/**
 * Central test runner: executes every suite in scripts/tests plus the
 * legacy regression script. Exits non-zero if any suite fails.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.join(__dirname, 'tests');

const suites = [];

// TypeScript suites (run via tsx)
if (existsSync(testsDir)) {
  const tsSuites = readdirSync(testsDir)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .sort()
    .map((f) => ({ name: f, cmd: ['npx', ['tsx', path.join('scripts/tests', f)]] }));
  suites.push(...tsSuites);
}

// Legacy regression suite (uses TS imports -> run through tsx)
const regression = path.join(__dirname, 'test-regression.mjs');
if (existsSync(regression)) {
  suites.push({ name: 'test-regression.mjs', cmd: ['npx', ['tsx', regression]] });
}

let failed = 0;
console.log('=== PROJECT TEST RUNNER ===\n');

for (const suite of suites) {
  console.log(`\n>>> Running ${suite.name}`);
  const res = spawnSync(suite.cmd[0], suite.cmd[1], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: path.join(__dirname, '..'),
  });
  if (res.status !== 0) {
    failed++;
    console.error(`\n>>> SUITE FAILED: ${suite.name}`);
  } else {
    console.log(`>>> SUITE PASSED: ${suite.name}`);
  }
}

console.log(`\n=== RUNNER SUMMARY: ${suites.length - failed}/${suites.length} suites passed ===`);
process.exit(failed > 0 ? 1 : 0);
