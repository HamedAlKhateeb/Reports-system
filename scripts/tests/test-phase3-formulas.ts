/**
 * PHASE 3 (TABLES & EXPORT) MANDATORY TEST SUITE
 *
 * - B9:  merge coverage is point-in-rect (A1:C3 interior cells skipped).
 * - B10: remap/adjust never rewrite digit function names (LOG10); unary
 *        minus propagates error sentinels; legacy suspects are flagged.
 * - B11: formatCellDisplay is the single display formatter.
 * - B14: Smart Table column cap (26) truncates with explicit warnings.
 * - B15: Smart import preserves merges (clamped); lossy conversions warn.
 */

import {
  evaluateFormula,
  adjustFormula,
  remapFormulaRefs,
  formatCellDisplay,
  findRemapSuspects,
} from '../../lib/grid/formula-parser';
import { isCoveredByMerge, findMergeStart } from '../../lib/grid/merge-utils';
import { TABLE_LIMITS } from '../../lib/grid/table-guards';
import {
  normalizeSheetGrid,
  sheetToSmartTableEntity,
} from '../../lib/import/xlsx-import';

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

console.log('\n=== PHASE 3 / B9: MERGE COVERAGE ===\n');

const cols3 = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
const big = [{ start: 'A1', end: 'C3', colSpan: 3, rowSpan: 3 }];
eq(isCoveredByMerge('A1', big, cols3), false, 'B9: merge start renders');
for (const c of ['B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3']) {
  eq(isCoveredByMerge(c, big, cols3), true, `B9: interior/end covered ${c}`);
}
for (const c of ['D1', 'A4', 'D3']) {
  eq(isCoveredByMerge(c, big, cols3), false, `B9: outside not covered ${c}`);
}
eq(findMergeStart('a1', big)?.end, 'C3', 'B9: findMergeStart is case-insensitive');

console.log('\n=== PHASE 3 / B10: FORMULA REMAP GUARD ===\n');

const shiftDown = (c: number, r: number) => ({ colIndex: c, rowIndex: r + 1 });
eq(
  remapFormulaRefs('=LOG10(A1)+B1', shiftDown),
  '=LOG10(A2)+B2',
  'B10: LOG10 preserved, refs shift on row insert'
);
eq(
  adjustFormula('=LOG10(A1)+B1', 1, 0),
  '=LOG10(A2)+B2',
  'B10: adjustFormula preserves LOG10 on autofill'
);
eq(
  remapFormulaRefs('=SUM(A1:A3)', shiftDown),
  '=SUM(A2:A4)',
  'B10: normal functions still remap'
);
eq(
  evaluateFormula('=-A1', { A1: '#DIV/0!' }),
  '#DIV/0!',
  'B10: unary minus propagates #DIV/0!'
);
eq(
  evaluateFormula('=+A1', { A1: '#VALUE!' }),
  '#VALUE!',
  'B10: unary plus propagates #VALUE!'
);
eq(evaluateFormula('=-A1', { A1: 5 }), -5, 'B10: unary minus still negates numbers');

const suspects = findRemapSuspects([
  { tableId: 't1', coord: 'B2', formula: '=LOG11(A1)*2' },
  { tableId: 't1', coord: 'C2', formula: '=SUM(A1:A3)' },
  { tableId: 't1', coord: 'D2', formula: '=IF(A1>1, "LOG10 keep", A1)' },
]);
eq(suspects.length, 1, 'B10: scanner flags one suspect, ignores SUM + quoted text');
eq(suspects[0]?.suspectToken, 'LOG11', 'B10: suspect token reported');

console.log('\n=== PHASE 3 / B11: SINGLE FORMATTER ===\n');

eq(formatCellDisplay(150), '150', 'B11: number formats');
eq(formatCellDisplay(true), 'true', 'B11: boolean formats (same on all surfaces)');
eq(formatCellDisplay('#DIV/0!'), '#DIV/0!', 'B11: errors pass through');
eq(formatCellDisplay(null), '', 'B11: null → empty');
eq(formatCellDisplay(undefined), '', 'B11: undefined → empty');

console.log('\n=== PHASE 3 / B14+B15: XLSX IMPORT ===\n');

eq(TABLE_LIMITS.MAX_COLS, 26, 'B14: store cap is 26');
// 30-column sheet: parse keeps 30 (native path), Smart entity caps at 26.
const wide: unknown[][] = [Array.from({ length: 30 }, (_, i) => `H${i}`)];
for (let r = 0; r < 3; r++) wide.push(Array.from({ length: 30 }, (_, i) => `R${r}C${i}`));
const normWide = (function () {
  const g = normalizeSheetGrid(wide as any, 'Wide', 0);
  (g as any).smartWarnings = [];
  (g as any).nativeWarnings = [];
  return g;
})();
eq(normWide.colCount, 30, 'B14: parse keeps 30 cols for the native path');
const entWide = sheetToSmartTableEntity(normWide as any, 'rep1', 'tbl1', false);
eq(entWide.columns_data.length, 26, 'B14: Smart entity capped at 26 columns');

// Merge preservation with header offset (sheet row 1 = header).
const sheet2: any = {
  name: 'S',
  headers: ['A', 'B', 'C'],
  rows: [
    ['A', 'B', 'C'],
    ['a1', 'b1', 'c1'],
    ['a2', 'b2', 'c2'],
    ['a3', 'b3', 'c3'],
  ],
  rowCount: 4,
  colCount: 3,
  truncated: false,
  merges: [{ start: 'A2', end: 'B3' }],
  smartWarnings: [],
  nativeWarnings: [],
};
const ent2 = sheetToSmartTableEntity(sheet2, 'rep1', 'tbl2', false);
eq(ent2.merged_cells.length, 1, 'B15: data merge preserved');
eq(ent2.merged_cells[0].start, 'A1', 'B15: sheet row 2 → entity row 1 (header offset)');
eq(ent2.merged_cells[0].end, 'B2', 'B15: merge end shifted likewise');
eq(ent2.merged_cells[0].rowSpan, 2, 'B15: rowSpan kept');

// Header-only merge cannot be represented → dropped with warning.
const sheet3: any = { ...sheet2, merges: [{ start: 'A1', end: 'B1' }], smartWarnings: [] };
const ent3 = sheetToSmartTableEntity(sheet3, 'rep1', 'tbl3', false);
eq(ent3.merged_cells.length, 0, 'B15: header-only merge dropped');
eq(sheet3.smartWarnings.length, 1, 'B15: dropped merge warned');

console.log('\n=== PHASE 3: TEST SUMMARY ===\n');
console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
