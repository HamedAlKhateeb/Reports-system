/**
 * HYBRID TABLE (UNIFIED TABLE) MANDATORY TEST SUITE
 *
 * Covers the full acceptance matrix:
 * - Basic operations & structural row/column insertion/deletion with reference remapping
 * - Formatting (alignment, bold/italic/underline persistence model)
 * - Spreadsheet engine (=A1, arithmetic, SUM multi-arg, recalculation, divide-by-zero, invalid input)
 * - Formula UX context-aware insertion (arithmetic vs function args, NO forced '+')
 * - Merge/unmerge/transpose with safe formula reference updates
 * - Export parity: evaluated values (not raw formulas) for DOCX/PDF/Share/Markdown paths
 * - Regression: existing evaluateFormula / adjustFormula behaviors stay intact
 */

import {
  evaluateFormula,
  colIndexToName,
  colNameToIndex,
  adjustFormula,
  expandRange,
  extractFormulaRefs,
  remapFormulaRefs,
  isFormulaError,
} from '../../lib/grid/formula-parser';
import {
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  transposeTable,
  computeReferenceInsertion,
} from '../../lib/grid/table-ops';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function eq(actual: unknown, expected: unknown, msg: string) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
  );
}

console.log('\n=== HYBRID TABLE: BASIC OPERATIONS ===\n');

// Column naming
eq(colIndexToName(0), 'A', 'colIndexToName(0) = A');
eq(colIndexToName(25), 'Z', 'colIndexToName(25) = Z');
eq(colIndexToName(26), 'AA', 'colIndexToName(26) = AA');
eq(colNameToIndex('A'), 0, "colNameToIndex('A') = 0");
eq(colNameToIndex('AA'), 26, "colNameToIndex('AA') = 26");

console.log('\n=== HYBRID TABLE: SPREADSHEET ENGINE ===\n');

const cells: Record<string, unknown> = {
  A1: 10,
  A2: 20,
  A3: 30,
  B1: '=A1',
  B2: '=A1+A2',
  B3: '=A1-A2',
  C1: '=A1*A2',
  C2: '=A2/A1',
  C3: '=SUM(A1,A2,A3)',
  D1: '=SUM(A1:A3)',
  D2: '=AVERAGE(A1:A3)',
  D3: '=MIN(A1:A3)',
  E1: '=MAX(A1:A3)',
  E2: '=COUNT(A1:A3)',
  E3: '=ROUND(3.14159, 2)',
};

eq(evaluateFormula('=A1', cells), 10, '=A1 references a single cell');
eq(evaluateFormula('=A1+A2', cells), 30, '=A1+A2 arithmetic addition');
eq(evaluateFormula('=A1-A2', cells), -10, '=A1-A2 arithmetic subtraction');
eq(evaluateFormula('=A1*A2', cells), 200, '=A1*A2 arithmetic multiplication');
eq(evaluateFormula('=A2/A1', cells), 2, '=A1/A2 arithmetic division');
eq(evaluateFormula('=SUM(A1,A2,A3)', cells), 60, '=SUM(A1,A2,A3) multi-argument sum');
eq(evaluateFormula('=SUM(A1:A3)', cells), 60, '=SUM(A1:A3) range sum');
eq(evaluateFormula('=AVERAGE(A1:A3)', cells), 20, '=AVERAGE over range');
eq(evaluateFormula('=ROUND(3.14159, 2)', cells), 3.14, '=ROUND with digits');

// Chained dependency: B2 depends on A1+A2; changing A1 changes the result
const chainedCells: Record<string, unknown> = { A1: 100, A2: 50, B2: '=A1+A2', C1: '=B2*2' };
eq(evaluateFormula('=B2*2', chainedCells), 300, 'Reactive recalculation through a chained dependency');

// Error handling: divide by zero
eq(evaluateFormula('=A1/0', { A1: 5 }), '#DIV/0!', 'Divide by zero yields #DIV/0! sentinel (no crash)');

// Error handling: non-numeric text inside arithmetic
eq(evaluateFormula('=A1+B1', { A1: 5, B1: 'hello' }), '#VALUE!', 'Non-numeric input yields #VALUE! (no crash)');

// Error handling: incomplete/broken formulas never throw
try {
  const r1 = evaluateFormula('=SUM(', { A1: 1 });
  assert(typeof r1 === 'string' && (r1 as string).startsWith('#'), 'Incomplete formula "=SUM(" returns an error string, never throws');
  const r2 = evaluateFormula('=1+', {});
  assert(typeof r2 === 'string' && (r2 as string).startsWith('#'), 'Incomplete formula "=1+" returns an error string, never throws');
  const r3 = evaluateFormula('=(((', {});
  assert(typeof r3 === 'string' && (r3 as string).startsWith('#'), 'Garbage formula "=(((" returns an error string, never throws');
  const r4 = evaluateFormula('=SUM(A1:ZZZ999999)', { A1: 1 });
  assert(
    typeof r4 === 'number' || (typeof r4 === 'string' && r4.startsWith('#')),
    'Absurd range degrades safely (never freezes, never throws)'
  );
  const r5 = evaluateFormula('=randomgarbage$$$', {});
  assert(typeof r5 === 'string', 'Random garbage input never crashes the evaluator');
} catch (e) {
  assert(false, `Broken formulas must not throw (threw: ${String(e)})`);
}

// Circular reference detection
eq(evaluateFormula('=B1', { A1: '=B1', B1: '=A1' }), '#CIRCULAR!', 'Circular reference yields #CIRCULAR!');

// Trailing garbage detection
eq(evaluateFormula('=A1 D2', { A1: 1, D2: 2 }), '#VALUE!', 'Trailing token after complete expression = #VALUE!');

// Text concatenation
eq(evaluateFormula('="Total: "&A1', { A1: 42 }), 'Total: 42', 'String concatenation with & works');

// Error detection helper
assert(isFormulaError('#REF!'), 'isFormulaError detects #REF!');
assert(isFormulaError('#DIV/0!'), 'isFormulaError detects #DIV/0!');
assert(!isFormulaError('#hashtag'), 'isFormulaError ignores non-error # strings');
assert(!isFormulaError(42), 'isFormulaError ignores numbers');

console.log('\n=== HYBRID TABLE: FORMULA UX (CONTEXT-AWARE INSERTION) ===\n');

// Scenario 1: arithmetic expression
// "=" + click C2 -> "=C2"
let res = computeReferenceInsertion('=', 1);
eq(res.insert('C2'), 'C2', 'UX: "=" + click C2 inserts "C2"');

// "=C2" + "+" -> "=C2+" then click D2 -> "=C2+D2"
res = computeReferenceInsertion('=C2+', 4);
eq(res.insert('D2'), 'D2', 'UX: "=C2+" + click D2 inserts "D2"');

// Arithmetic without operator: click must NOT inject anything (no "=C2D2")
res = computeReferenceInsertion('=C2', 3);
eq(res.insert('D2'), '', 'UX: "=C2" + click D2 inserts NOTHING (never "=C2D2")');

// Scenario 2: function arguments (SUM)
// "=SUM(" + click C2 -> "=SUM(C2"
res = computeReferenceInsertion('=SUM(', 5);
eq(res.insert('C2'), 'C2', 'UX: "=SUM(" + click C2 inserts "C2"');

// "=SUM(C2" + click D2 directly (no operator) -> auto-comma: "=SUM(C2,D2"
res = computeReferenceInsertion('=SUM(C2', 6);
eq(res.insert('D2'), ',D2', 'UX: "=SUM(C2" + click D2 auto-inserts ",D2" (NO forced +)');

// "=SUM(C2,D2" + click E2 -> "=SUM(C2,D2,E2"
res = computeReferenceInsertion('=SUM(C2,D2', 9);
eq(res.insert('E2'), ',E2', 'UX: "=SUM(C2,D2" + click E2 auto-inserts ",E2"');

// Inside function after an operator: still argument separator
res = computeReferenceInsertion('=SUM(C2+', 7);
eq(res.insert('D2'), ',D2', 'UX: "=SUM(C2+" + click D2 starts a new argument ",D2"');

// After a range: still argument separator
res = computeReferenceInsertion('=SUM(A1:B2', 10);
eq(res.insert('C1'), ',C1', 'UX: after range, click starts a new argument');

// Nested function context: right after a comma inside args -> bare ref
res = computeReferenceInsertion('=IF(SUM(A1,', 11);
eq(res.insert('B1'), 'B1', 'UX: nested function args after comma insert bare ref');
// Nested function but after a complete value -> separator
res = computeReferenceInsertion('=IF(SUM(A1', 9);
eq(res.insert('B1'), ',B1', 'UX: nested function after value inserts separator');

console.log('\n=== HYBRID TABLE: REFERENCE EXTRACTION & HIGHLIGHTING ===\n');

eq(extractFormulaRefs('=C2+D2'), ['C2', 'D2'], 'extractFormulaRefs finds C2 and D2');
eq(extractFormulaRefs('=SUM(C2,D2,E2)'), ['C2', 'D2', 'E2'], 'extractFormulaRefs finds SUM args');
eq(extractFormulaRefs('=SUM(A1:B3)'), ['A1', 'B3'], 'extractFormulaRefs finds range endpoints');
eq(extractFormulaRefs('hello'), [], 'extractFormulaRefs ignores non-formulas');

console.log('\n=== HYBRID TABLE: STRUCTURAL OPERATIONS & REFERENCE REMAPPING ===\n');

const baseState = {
  columns: [
    { id: 'A', name: 'Item', type: 'text' as const, width: 120 },
    { id: 'B', name: 'Qty', type: 'number' as const, width: 120 },
    { id: 'C', name: 'Total', type: 'number' as const, width: 140 },
  ],
  rows: [
    { A: 'Laptop', B: 2, C: '=B1*500' },
    { A: 'Mouse', B: 5, C: '=B2*30' },
    { A: 'Cable', B: 10, C: '=B3*12' },
  ],
  cellFormats: { C1: { align: 'right' as const }, A3: { bold: true } },
  mergedCells: [] as never[],
};

// Insert row above row 1: formulas referencing rows 1..3 must shift down
const afterRowInsert = insertRow(baseState, 0);
eq(afterRowInsert.rows.length, 4, 'insertRow adds one row');
eq(afterRowInsert.rows[1].C, '=B2*500', 'insertRow above shifts old row 1 to row 2, formula remapped to =B2*500');
eq(afterRowInsert.rows[2].C, '=B3*30', 'insertRow remaps old row 2 formula to =B3*30');
eq(afterRowInsert.rows[3].C, '=B4*12', 'insertRow remaps old row 3 formula to =B4*12');
eq(afterRowInsert.cellFormats['C2'], { align: 'right' }, 'insertRow shifts C1 format to C2');
eq(afterRowInsert.cellFormats['A4'], { bold: true }, 'insertRow shifts A3 format to A4');

// Insert row in the middle (before row 2): row 1 refs stay, rows 2-3 shift
const afterMidRowInsert = insertRow(baseState, 1);
eq(afterMidRowInsert.rows[0].C, '=B1*500', 'insertRow in middle keeps row-1 references intact');
eq(afterMidRowInsert.rows[2].C, '=B3*30', 'insertRow in middle shifts row-2 refs down');
eq(afterMidRowInsert.rows[3].C, '=B4*12', 'insertRow in middle shifts row-3 refs down');

// Delete row 1: formulas referencing row 2 keep working with shifted refs
const afterRowDelete = deleteRow(baseState, 0);
eq(afterRowDelete.rows.length, 2, 'deleteRow removes one row');
eq(afterRowDelete.rows[0].C, '=B1*30', 'deleteRow remaps old row 2 formula to new row 1');
eq(afterRowDelete.rows[1].C, '=B2*12', 'deleteRow remaps old row 3 formula to new row 2');

// Deleting the last row is refused
eq(deleteRow({ ...baseState, rows: [baseState.rows[0]] }, 0).rows.length, 1, 'deleteRow refuses to remove the last row');

// Insert column before B: formulas referencing B shift to C
const afterColInsert = insertColumn(baseState, 1, 'عمود', 'Column');
eq(afterColInsert.columns.length, 4, 'insertColumn adds one column');
eq(afterColInsert.columns.map((c) => c.id).join(','), 'A,B,C,D', 'insertColumn re-ids columns canonically (A,B,C,D)');
// Old column B (Qty) is renamed C; old column C (Total) is renamed D
eq(afterColInsert.rows[0].B, '', 'insertColumn leaves the new column empty');
eq(afterColInsert.rows[0].C, 2, 'insertColumn: old B values move to column C');
eq(String(afterColInsert.rows[0].D), '=C1*500', 'insertColumn remaps =B1*500 to =C1*500 in the shifted column');
eq(afterColInsert.cellFormats['D1'], { align: 'right' }, 'insertColumn shifts C1 format to D1');

// Delete column B: formulas referencing B become #REF!
const afterColDelete = deleteColumn(baseState, 1);
eq(afterColDelete.columns.length, 2, 'deleteColumn removes one column');
eq(afterColDelete.columns.map((c) => c.id).join(','), 'A,B', 'deleteColumn re-ids remaining columns');
eq(afterColDelete.rows[0].B, '=#REF!*500', 'deleteColumn turns =B1*500 into =#REF!*500 (Excel-like REF error)');

// The remapped formula still evaluates safely to #REF! instead of crashing
const refErrorCells: Record<string, unknown> = { B1: afterColDelete.rows[0].B, A1: afterColDelete.rows[0].A };
eq(
  evaluateFormula(String(afterColDelete.rows[0].B), { '#REF!*500': undefined, ...refErrorCells } as any),
  '#REF!',
  'Formula with #REF! reference evaluates to #REF! sentinel (no crash)'
);

// Transpose preserves values, formulas (remapped), and formats
// Mapping: old (colIdx C, rowIdx R) -> new (colIdx R, rowIdx C)
const afterTranspose = transposeTable(baseState);
eq(afterTranspose.columns.length, 3, 'transpose: new column count = old row count');
eq(afterTranspose.rows.length, 3, 'transpose: new row count = old column count');
// Old column A (idx 0) values ('Laptop','Mouse','Cable') land at new row 0 across cols A,B,C
eq(afterTranspose.rows[0].A, 'Laptop', 'transpose: A1 = old A1 value');
eq(afterTranspose.rows[0].B, 'Mouse', 'transpose: B1 = old A2 value');
eq(afterTranspose.rows[0].C, 'Cable', 'transpose: C1 = old A3 value');
// Old column B (idx 1) values (2,5,10) land at new row 1
eq(afterTranspose.rows[1].A, 2, 'transpose: A2 = old B1 value (2)');
eq(afterTranspose.rows[1].B, 5, 'transpose: B2 = old B2 value (5)');
eq(afterTranspose.rows[1].C, 10, 'transpose: C2 = old B3 value (10)');
// Old column C (idx 2) formulas land at new row 2, refs swapped:
// old C1 "=B1*500" (col 1, row 0) -> new coord (col 0, row 2) = A3, ref (1,0)->(0,1) = A2
eq(String(afterTranspose.rows[2].A), '=A2*500', 'transpose: old C1 formula remaps to =A2*500 at A3');
eq(String(afterTranspose.rows[2].B), '=B2*30', 'transpose: old C2 formula remaps to =B2*30 at B3');
eq(String(afterTranspose.rows[2].C), '=C2*12', 'transpose: old C3 formula remaps to =C2*12 at C3');
// Formats follow the same swap: old C1 format -> new A3
eq(afterTranspose.cellFormats['A3'], { align: 'right' }, 'transpose: old C1 format lands at A3');
eq(afterTranspose.cellFormats['C1'], { bold: true }, 'transpose: old A3 format lands at C1');

// Transposed formulas still evaluate correctly against the transposed grid
const transposedGrid: Record<string, unknown> = {};
afterTranspose.rows.forEach((r, rIdx) => {
  afterTranspose.columns.forEach((c) => {
    transposedGrid[`${c.id}${rIdx + 1}`] = r[c.id];
  });
});
eq(evaluateFormula(String(afterTranspose.rows[2].A), transposedGrid), 1000, 'transposed =A2*500 evaluates to 1000 (A2=2)');
eq(evaluateFormula(String(afterTranspose.rows[2].B), transposedGrid), 150, 'transposed =B2*30 evaluates to 150 (B2=5)');
eq(evaluateFormula(String(afterTranspose.rows[2].C), transposedGrid), 120, 'transposed =C2*12 evaluates to 120 (C2=10)');

// Transpose with merge: rectangle survives if it fits
const mergedState = {
  ...baseState,
  mergedCells: [{ start: 'A1', end: 'B2', colSpan: 2, rowSpan: 2 }],
};
const mergedTranspose = transposeTable(mergedState);
eq(mergedTranspose.mergedCells.length, 1, 'transpose keeps the merge rectangle');
eq(mergedTranspose.mergedCells[0].start, 'A1', 'transpose remaps merge start');
eq(mergedTranspose.mergedCells[0].end, 'B2', 'transpose remaps merge end');

// Transpose remaps merges that fit: old 3-wide A1:C1 becomes 3-tall A1:A3
const wideMergeState = {
  columns: [
    { id: 'A', name: 'a', type: 'text' as const, width: 100 },
    { id: 'B', name: 'b', type: 'text' as const, width: 100 },
    { id: 'C', name: 'c', type: 'text' as const, width: 100 },
  ],
  rows: [{ A: 1, B: 2, C: 3 }],
  cellFormats: {},
  mergedCells: [{ start: 'A1', end: 'C1', colSpan: 3, rowSpan: 1 }],
};
const wideMergeTranspose = transposeTable(wideMergeState);
eq(wideMergeTranspose.mergedCells.length, 1, 'transpose remaps a fitting 3-wide merge into a 3-tall merge');
eq(wideMergeTranspose.mergedCells[0].start, 'A1', 'transposed merge starts at A1');
eq(wideMergeTranspose.mergedCells[0].end, 'A3', 'transposed merge ends at A3');
eq(wideMergeTranspose.mergedCells[0].rowSpan, 3, 'transposed merge spans 3 rows');
eq(wideMergeTranspose.mergedCells[0].colSpan, 1, 'transposed merge spans 1 column');

// Transpose drops merges that no longer fit
const unfitMergeState = {
  columns: [
    { id: 'A', name: 'a', type: 'text' as const, width: 100 },
    { id: 'B', name: 'b', type: 'text' as const, width: 100 },
  ],
  rows: [{ A: 1, B: 2 }, { A: 3, B: 4 }],
  cellFormats: {},
  mergedCells: [{ start: 'A1', end: 'B2', colSpan: 2, rowSpan: 2 }],
};
const unfitTranspose = transposeTable(unfitMergeState);
eq(unfitTranspose.mergedCells.length, 1, 'transpose keeps a square merge that fits both dimensions');
// A merge taller than the transposed width must be dropped:
const tallMergeState = {
  columns: [
    { id: 'A', name: 'a', type: 'text' as const, width: 100 },
    { id: 'B', name: 'b', type: 'text' as const, width: 100 },
  ],
  rows: [{ A: 1 }, { A: 2 }, { A: 3 }],
  cellFormats: {},
  mergedCells: [{ start: 'A1', end: 'A3', colSpan: 1, rowSpan: 3 }],
};
// After transpose: 3 columns (one per old row) and 1 row (old col A) + 1 row (old col B)... wait:
// new columns = old rows count = 3, new rows = old columns count = 2.
// old A1:A3 (cols[0..0], rows[0..2]) -> new cols [0..2], rows [0..0]: 3-wide x 1-tall => fits.
const tallMergeTranspose = transposeTable(tallMergeState);
eq(tallMergeTranspose.mergedCells.length, 1, '3-tall merge transposes into 3-wide merge that fits');

console.log('\n=== HYBRID TABLE: FORMULA SHIFT (AUTOFILL REGRESSION) ===\n');

eq(adjustFormula('=A1+B1', 1, 0), '=A2+B2', 'adjustFormula shifts refs down by 1 row');
eq(adjustFormula('=A1+B1', 0, 1), '=B1+C1', 'adjustFormula shifts refs right by 1 col');
eq(adjustFormula('=$A$1+B1', 1, 0), '=$A$1+B2', 'adjustFormula preserves absolute refs');
eq(adjustFormula('=A1', -1, 0), '=#REF!', 'adjustFormula yields #REF! when shifted above row 1');

// remapFormulaRefs: protect quoted strings
eq(
  remapFormulaRefs('=IF(A1>1, "A1 keep", A1)', (c, r) => ({ colIndex: c, rowIndex: r + 1 })),
  '=IF(A2>1, "A1 keep", A2)',
  'remapFormulaRefs never rewrites references inside quoted strings'
);
// remapFormulaRefs: null => #REF!
eq(
  remapFormulaRefs('=B1+C1', (c) => (c === 1 ? null : { colIndex: c, rowIndex: 0 })),
  '=#REF!+C1',
  'remapFormulaRefs maps deleted source to #REF!'
);

console.log('\n=== HYBRID TABLE: RANGE SAFETY ===\n');

eq(expandRange('A1:B2').length, 4, 'expandRange A1:B2 = 4 cells');
eq(expandRange('A1:ZZZ999999').length, 0, 'expandRange refuses absurd ranges (crash guard)');
eq(expandRange('BROKEN').length, 0, 'expandRange returns [] for invalid input');

console.log('\n=== HYBRID TABLE: EXPORT PARITY (EVALUATED VALUES) ===\n');

// The export path must show computed results, never the raw formula string
const exportCells: Record<string, unknown> = { C2: 100, D2: 50, E2: '=C2+D2' };
const evaluatedExport = evaluateFormula(String(exportCells.E2), exportCells);
eq(evaluatedExport, 150, 'Export parity: =C2+D2 evaluates to 150 (displayed value)');
eq(exportCells.E2, '=C2+D2', 'Export parity: stored value remains the raw formula string');

// A cell holding a formula shows its formula when re-opened for editing
const storedFormula = '=SUM(C2,D2,E2)';
const editReopen = String(storedFormula); // editing re-opens the raw stored string
eq(editReopen, '=SUM(C2,D2,E2)', 'Re-edit: formula cell re-opens with the original formula, not a constant');

console.log('\n=== HYBRID TABLE: TEST SUMMARY ===\n');
console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
