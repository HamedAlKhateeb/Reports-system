/**
 * PHASE 4 TEST SUITE: Excel-like Grid Formula Parser & Autofill Engine
 * 
 * Verifies:
 * 1. Safe arithmetic and operator precedence without eval
 * 2. Excel standard functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR
 * 3. Relative and absolute cell references ($A$1, $A1, A$1, A1)
 * 4. Range expansions (A1:B3)
 * 5. Circular dependency protection (#CIRCULAR!)
 * 6. Error handling (#DIV/0!, #REF!, #VALUE!)
 * 7. Relative reference shifting (adjustFormula)
 * 8. Autofill single number, multi-step, negative step, PRB-001, and dates
 * 9. Fill series vs Copy cells modes
 * 10. Atomic undoable transaction changeset
 */

import {
  colIndexToName,
  colNameToIndex,
  parseCellRef,
  expandRange,
  adjustFormula,
  evaluateFormula,
} from '../../lib/grid/formula-parser';

import {
  generateSeriesValues,
  executeAutofill,
  parseAlphanumericPattern,
} from '../../lib/grid/autofill-engine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

function assertEqual(actual: any, expected: any, msg: string) {
  const isMatch = JSON.stringify(actual) === JSON.stringify(expected);
  if (isMatch) {
    console.log(`  [PASS] ${msg}: ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg} -> expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function runPhase4Tests() {
  console.log('=== PHASE 4 TEST SUITE: Excel Grid Formulas & Autofill ===\n');

  // 1. Coordinate Conversions
  console.log('Test 1: Column coordinate conversions');
  assertEqual(colIndexToName(0), 'A', 'Index 0 to Col A');
  assertEqual(colIndexToName(25), 'Z', 'Index 25 to Col Z');
  assertEqual(colIndexToName(26), 'AA', 'Index 26 to Col AA');
  assertEqual(colNameToIndex('A'), 0, 'Col A to Index 0');
  assertEqual(colNameToIndex('Z'), 25, 'Col Z to Index 25');
  assertEqual(colNameToIndex('AA'), 26, 'Col AA to Index 26');

  // 2. Cell Reference Parsing
  console.log('\nTest 2: Cell reference parsing');
  const c1 = parseCellRef('B5');
  assert(c1 !== null && c1.colName === 'B' && c1.rowNumber === 5 && !c1.isColFixed && !c1.isRowFixed, 'Parses B5 relative');
  const c2 = parseCellRef('$C$10');
  assert(c2 !== null && c2.colName === 'C' && c2.rowNumber === 10 && c2.isColFixed && c2.isRowFixed, 'Parses $C$10 absolute');
  const c3 = parseCellRef('$D2');
  assert(c3 !== null && c3.isColFixed && !c3.isRowFixed, 'Parses $D2 mixed');

  // 3. Range Expansion
  console.log('\nTest 3: Range expansion');
  const rangeCells = expandRange('A1:B2');
  assertEqual(rangeCells, ['A1', 'A2', 'B1', 'B2'], 'Expands A1:B2 into 4 cells');

  // 4. Safe Arithmetic & Precedence
  console.log('\nTest 4: Safe Arithmetic');
  assertEqual(evaluateFormula('=1 + 2 * 3', {}), 7, 'Operator precedence 1 + 2 * 3 = 7');
  assertEqual(evaluateFormula('=(1 + 2) * 3', {}), 9, 'Parentheses (1 + 2) * 3 = 9');
  assertEqual(evaluateFormula('=10 - 4 - 2', {}), 4, 'Left-to-right subtraction');
  assertEqual(evaluateFormula('=10 / 2', {}), 5, 'Division 10 / 2 = 5');
  assertEqual(evaluateFormula('=10 / 0', {}), '#DIV/0!', 'Division by zero error');

  // 5. Cell References in Formulas
  console.log('\nTest 5: Cell References');
  const testCells: Record<string, any> = {
    A1: 10,
    A2: 20,
    A3: 30,
    B1: 5,
    B2: 15,
    C1: '=A1 + B1', // 15
    C2: '=A2 * 2',  // 40
    TXT1: 'Hello',
    EMPTY: '',
  };
  assertEqual(evaluateFormula('=A1 + B1', testCells), 15, 'Evaluates =A1 + B1');
  assertEqual(evaluateFormula('=C1 + C2', testCells), 55, 'Evaluates formula depending on formula cells');

  // 6. Aggregate Functions (SUM, AVERAGE, MIN, MAX, COUNT, COUNTA)
  console.log('\nTest 6: Aggregate Functions');
  assertEqual(evaluateFormula('=SUM(A1:A3)', testCells), 60, 'SUM(A1:A3) = 60');
  assertEqual(evaluateFormula('=AVERAGE(A1:A3)', testCells), 20, 'AVERAGE(A1:A3) = 20');
  assertEqual(evaluateFormula('=MIN(A1:A3)', testCells), 10, 'MIN(A1:A3) = 10');
  assertEqual(evaluateFormula('=MAX(A1:A3)', testCells), 30, 'MAX(A1:A3) = 30');
  assertEqual(evaluateFormula('=COUNT(A1, A2, TXT1)', testCells), 2, 'COUNT filters non-numeric strings');
  assertEqual(evaluateFormula('=COUNTA(A1, A2, TXT1, EMPTY)', testCells), 3, 'COUNTA counts non-empty');

  // 7. Logical Functions (IF, AND, OR)
  console.log('\nTest 7: Logical Functions');
  assertEqual(evaluateFormula('=IF(A1 > 5, "High", "Low")', testCells), 'High', 'IF true condition');
  assertEqual(evaluateFormula('=IF(A1 < 5, "High", "Low")', testCells), 'Low', 'IF false condition');
  assertEqual(evaluateFormula('=AND(A1 > 0, B1 > 0)', testCells), true, 'AND true');
  assertEqual(evaluateFormula('=AND(A1 > 0, B1 < 0)', testCells), false, 'AND false');
  assertEqual(evaluateFormula('=OR(A1 < 0, B1 > 0)', testCells), true, 'OR true');

  // 8. Circular Reference Protection
  console.log('\nTest 8: Circular Dependency Protection');
  const circularCells: Record<string, any> = {
    A1: '=B1 + 1',
    B1: '=A1 * 2',
  };
  assertEqual(evaluateFormula('=A1', circularCells), '#CIRCULAR!', 'Detects direct circular reference');

  // 9. Formula Relative Adjustment for Drag/Copy
  console.log('\nTest 9: Formula Reference Adjustment');
  assertEqual(adjustFormula('=A1 + B1', 1, 0), '=A2 + B2', 'Shifts down 1 row');
  assertEqual(adjustFormula('=A1 + B1', 0, 1), '=B1 + C1', 'Shifts right 1 column');
  assertEqual(adjustFormula('=$A$1 + B1', 2, 2), '=$A$1 + D3', 'Preserves absolute reference $A$1');
  assertEqual(adjustFormula('=$A1 + B$1', 1, 1), '=$A2 + C$1', 'Preserves mixed references');
  assertEqual(adjustFormula('=A1', -2, 0), '=#REF!', 'Returns #REF! when shifting before row 1');

  // 10. Autofill: Single Number Increment vs Copy
  console.log('\nTest 10: Autofill Single Number Series & Copy');
  const fill1 = generateSeriesValues([1], 4, 'fill_series');
  assertEqual(fill1, [2, 3, 4, 5], 'Single number 1 -> [2, 3, 4, 5]');
  const copy1 = generateSeriesValues([1], 4, 'copy_cells');
  assertEqual(copy1, [1, 1, 1, 1], 'Copy cells 1 -> [1, 1, 1, 1]');
  const fill5 = generateSeriesValues([5], 3, 'fill_series');
  assertEqual(fill5, [6, 7, 8], 'Single number 5 -> [6, 7, 8]');

  // 11. Autofill: Arithmetic Steps (Positive & Negative)
  console.log('\nTest 11: Autofill Multi-step & Negative');
  const stepSeq = generateSeriesValues([1, 3], 3, 'fill_series');
  assertEqual(stepSeq, [5, 7, 9], 'Step delta 2: [1, 3] -> [5, 7, 9]');
  const negSeq = generateSeriesValues([10, 8], 3, 'fill_series');
  assertEqual(negSeq, [6, 4, 2], 'Negative step delta -2: [10, 8] -> [6, 4, 2]');

  // 12. Autofill: Issue Key / Alphanumeric Patterns
  console.log('\nTest 12: Issue Key & Alphanumeric Progression');
  const prbSeq = generateSeriesValues(['PRB-001'], 3, 'fill_series');
  assertEqual(prbSeq, ['PRB-002', 'PRB-003', 'PRB-004'], 'PRB-001 -> [PRB-002, PRB-003, PRB-004]');
  const itemSeq = generateSeriesValues(['ITEM_09'], 2, 'fill_series');
  assertEqual(itemSeq, ['ITEM_10', 'ITEM_11'], 'ITEM_09 -> [ITEM_10, ITEM_11]');

  // 13. Autofill: Date Progression
  console.log('\nTest 13: Date Progression');
  const dateSeq = generateSeriesValues(['2026-09-01'], 3, 'fill_series');
  assertEqual(dateSeq, ['2026-09-02', '2026-09-03', '2026-09-04'], '2026-09-01 -> [2026-09-02, 2026-09-03, 2026-09-04]');

  // 14. 2D Grid Autofill Execution & Atomic Changeset
  console.log('\nTest 14: 2D Grid Autofill Execution');
  const gridData: Record<string, any> = {
    A1: 'PRB-001',
    B1: 100,
    C1: '=B1 * 2',
  };
  const autofillRes = executeAutofill({
    sourceRange: { startCol: 'A', startRow: 1, endCol: 'C', endRow: 1 },
    targetRange: { startCol: 'A', startRow: 1, endCol: 'C', endRow: 3 },
    currentGridData: gridData,
    mode: 'fill_series',
  });

  assertEqual(autofillRes.changes.length, 6, 'Generated 6 cell changes (2 rows x 3 cols)');
  assertEqual(autofillRes.newCells['A2'], 'PRB-002', 'Autofill row 2 col A -> PRB-002');
  assertEqual(autofillRes.newCells['A3'], 'PRB-003', 'Autofill row 3 col A -> PRB-003');
  assertEqual(autofillRes.newCells['B2'], 101, 'Autofill row 2 col B -> 101');
  assertEqual(autofillRes.newCells['B3'], 102, 'Autofill row 3 col B -> 102');
  assertEqual(autofillRes.newCells['C2'], '=B2 * 2', 'Autofill row 2 col C adjusted formula -> =B2 * 2');
  assertEqual(autofillRes.newCells['C3'], '=B3 * 2', 'Autofill row 3 col C adjusted formula -> =B3 * 2');

  // Summary
  console.log('\n=============================================');
  console.log(`Phase 4 Test Results: ${passed} passed, ${failed} failed`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4Tests().catch((e) => {
  console.error('Fatal error in Phase 4 test:', e);
  process.exit(1);
});
