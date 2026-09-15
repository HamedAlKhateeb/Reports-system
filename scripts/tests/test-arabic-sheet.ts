/**
 * ARABIC SHEET TEST SUITE — native RTL grid logic (no DOM needed).
 *
 * Verifies the pure parts of components/editor/grid/ArabicSheet.tsx:
 * 1. normalizeDigits (Arabic-Indic / Extended digits → Western).
 * 2. computeGridDisplay: literals, Arabic text passthrough, formulas,
 *    cross-cell refs, ranges, circular safety, error surfacing.
 */

import {
  normalizeDigits,
  computeGridDisplay,
} from '../../components/editor/grid/ArabicSheet';

let passed = 0;
let failed = 0;
function assert(c: boolean, msg: string) {
  if (c) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg}`); failed++; }
}
function eq(a: any, b: any, msg: string) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg} -> expected ${sb}, got ${sa}`); failed++; }
}

const cols = [
  { id: 'A', name: 'البند', width: 200 },
  { id: 'B', name: 'العدد', width: 110 },
  { id: 'C', name: 'الإجمالي', width: 140 },
];

async function run() {
  console.log('=== ARABIC SHEET TEST SUITE ===\n');

  // 1. digits
  eq(normalizeDigits('١٢٣'), '123', 'Arabic-Indic digits normalized');
  eq(normalizeDigits('۱۲۳'), '123', 'Extended digits normalized');
  eq(normalizeDigits('تقرير 123'), 'تقرير 123', 'mixed text untouched');

  // 2. literals + Arabic passthrough
  let d = computeGridDisplay(
    [
      { A: 'قلم', B: 5, C: '' },
      { A: 'هذا اختبار عربي', B: 'تقرير المشكلة رقم 123', C: 'ABC العربية 123' },
    ],
    cols
  );
  eq(d['A1'], 'قلم', 'Arabic literal passes through');
  eq(d['B1'], '5', 'number literal displays');
  eq(d['C1'], '', 'empty stays empty');
  eq(d['A2'], 'هذا اختبار عربي', 'sentence passes through');
  eq(d['B2'], 'تقرير المشكلة رقم 123', 'mixed Arabic+digits passes');
  eq(d['C2'], 'ABC العربية 123', 'mixed Latin+Arabic passes');

  // 3. formulas
  d = computeGridDisplay(
    [
      { A: 10, B: 20, C: '=A1+B1' },
      { A: 5, B: '=A2*2', C: '=SUM(A1:B2)' },
    ],
    cols
  );
  eq(d['C1'], '30', 'addition formula');
  eq(d['B2'], '10', 'cross-row ref');
  eq(d['C2'], '45', 'SUM range');

  // 4. Arabic-Indic digits inside formulas
  d = computeGridDisplay([{ A: '١٠', B: 5, C: '=A1+B1' }], cols);
  eq(d['C1'], '15', 'Arabic-Indic values compute');

  // 5. circular safety (must terminate, must flag)
  d = computeGridDisplay([{ A: '=B1', B: '=A1', C: 'x' }], cols);
  assert(
    d['A1'].includes('#') && d['B1'].includes('#'),
    `circular refs flagged (got ${d['A1']}/${d['B1']})`
  );
  eq(d['C1'], 'x', 'non-circular cell unaffected');

  // 6. bad refs surface errors, never throw
  d = computeGridDisplay([{ A: '=Z99+1', B: '', C: '' }], cols);
  assert(typeof d['A1'] === 'string', 'out-of-range formula yields a string');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
