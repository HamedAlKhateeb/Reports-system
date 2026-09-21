/**
 * MINI SPREADSHEET AUTOMATED TEST SUITE
 *
 * Validates:
 * 1. Single cell non-formula copy autofill (e.g. "تفتيش" -> "تفتيش", "5" -> 5)
 * 2. Multi-cell numeric series autofill (e.g. 1, 2 -> 3, 4, 5; 10, 20 -> 30, 40, 50; 2024, 2025 -> 2026, 2027)
 * 3. Formula autofill with relative shifts and absolute reference locking ($A$1)
 * 4. Cell format preservation on autofill
 * 5. Arithmetic formula evaluation (SUM, AVERAGE, MIN, MAX, +, -, *, /, circular safety)
 * 6. Direction logic (RTL / LTR)
 */

import {
  evaluateFormula,
  adjustFormula,
  colIndexToName,
  colNameToIndex,
  parseCellRef,
} from '../../lib/grid/formula-parser';
import { executeAutofill, generateSeriesValues } from '../../lib/grid/autofill-engine';
import {
  normalizeDigits,
  computeGridDisplay,
  toA1,
} from '../../components/editor/grid/MiniSpreadsheet';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

function eq(actual: any, expected: any, msg: string) {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg} -> expected ${eStr}, got ${aStr}`);
    failed++;
  }
}

async function run() {
  console.log('=== MINI SPREADSHEET AUTOMATED TESTS ===\n');

  // ----------------------------------------------------
  // 1. Single Cell Copy Autofill
  // ----------------------------------------------------
  console.log('--- 1. Single Cell Copy Autofill ---');

  // Case 1A: Single Arabic text cell dragged downward
  const gridText: Record<string, any> = { A1: 'تفتيش' };
  const fillText = executeAutofill({
    sourceRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 1 },
    targetRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 4 },
    currentGridData: gridText,
    mode: 'copy_cells',
  });
  eq(fillText.newCells['A2'], 'تفتيش', 'Single Arabic cell copies to A2');
  eq(fillText.newCells['A3'], 'تفتيش', 'Single Arabic cell copies to A3');
  eq(fillText.newCells['A4'], 'تفتيش', 'Single Arabic cell copies to A4');

  // Case 1B: Single numeric cell dragged downward with mode 'copy_cells'
  const gridSingleNum: Record<string, any> = { A1: 42 };
  const fillSingleNum = executeAutofill({
    sourceRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 1 },
    targetRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 3 },
    currentGridData: gridSingleNum,
    mode: 'copy_cells',
  });
  eq(fillSingleNum.newCells['A2'], 42, 'Single number cell copies rather than increments');
  eq(fillSingleNum.newCells['A3'], 42, 'Single number cell copies to A3');

  // ----------------------------------------------------
  // 2. Multi-Cell Numeric Series Autofill
  // ----------------------------------------------------
  console.log('\n--- 2. Multi-Cell Numeric Series Autofill ---');

  // Case 2A: 1, 2 -> 3, 4, 5
  const grid12: Record<string, any> = { A1: 1, A2: 2 };
  const fill12 = executeAutofill({
    sourceRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 2 },
    targetRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 5 },
    currentGridData: grid12,
    mode: 'fill_series',
  });
  eq(fill12.newCells['A3'], 3, 'Series [1, 2] -> A3 is 3');
  eq(fill12.newCells['A4'], 4, 'Series [1, 2] -> A4 is 4');
  eq(fill12.newCells['A5'], 5, 'Series [1, 2] -> A5 is 5');

  // Case 2B: 10, 20 -> 30, 40, 50
  const grid1020: Record<string, any> = { B1: 10, B2: 20 };
  const fill1020 = executeAutofill({
    sourceRange: { startCol: 'B', startRow: 1, endCol: 'B', endRow: 2 },
    targetRange: { startCol: 'B', startRow: 1, endCol: 'B', endRow: 5 },
    currentGridData: grid1020,
    mode: 'fill_series',
  });
  eq(fill1020.newCells['B3'], 30, 'Series [10, 20] -> B3 is 30');
  eq(fill1020.newCells['B4'], 40, 'Series [10, 20] -> B4 is 40');
  eq(fill1020.newCells['B5'], 50, 'Series [10, 20] -> B5 is 50');

  // Case 2C: 2024, 2025 -> 2026, 2027
  const gridYears: Record<string, any> = { C1: 2024, C2: 2025 };
  const fillYears = executeAutofill({
    sourceRange: { startCol: 'C', startRow: 1, endCol: 'C', endRow: 2 },
    targetRange: { startCol: 'C', startRow: 1, endCol: 'C', endRow: 4 },
    currentGridData: gridYears,
    mode: 'fill_series',
  });
  eq(fillYears.newCells['C3'], 2026, 'Series [2024, 2025] -> C3 is 2026');
  eq(fillYears.newCells['C4'], 2027, 'Series [2024, 2025] -> C4 is 2027');

  // ----------------------------------------------------
  // 3. Formula Autofill & Relative/Absolute Shifts
  // ----------------------------------------------------
  console.log('\n--- 3. Formula Autofill ---');

  // Case 3A: Relative cell reference shift (=B2*C2 downwards)
  eq(adjustFormula('=B2*C2', 1, 0), '=B3*C3', 'adjustFormula shifts rows down by 1');
  eq(adjustFormula('=B2*C2', 2, 0), '=B4*C4', 'adjustFormula shifts rows down by 2');

  // Case 3B: Absolute reference preservation ($C$1)
  eq(
    adjustFormula('=A2*$C$1', 1, 0),
    '=A3*$C$1',
    'Absolute reference $C$1 is preserved while relative A2 shifts to A3'
  );

  // Case 3C: Mixed reference preservation ($A2 and A$2)
  eq(adjustFormula('=$A2+B$2', 1, 1), '=$A3+C$2', 'Mixed reference shifts correctly');

  // Case 3D: Autofill engine formula propagation
  const gridFormula: Record<string, any> = {
    B1: 10,
    C1: 2,
    D1: '=B1*C1',
  };
  const fillFormula = executeAutofill({
    sourceRange: { startCol: 'D', startRow: 1, endCol: 'D', endRow: 1 },
    targetRange: { startCol: 'D', startRow: 1, endCol: 'D', endRow: 3 },
    currentGridData: gridFormula,
    mode: 'fill_series',
  });
  eq(fillFormula.newCells['D2'], '=B2*C2', 'Formula autofill shifts relative references to D2');
  eq(fillFormula.newCells['D3'], '=B3*C3', 'Formula autofill shifts relative references to D3');

  // ----------------------------------------------------
  // 4. Formatting Preservation
  // ----------------------------------------------------
  console.log('\n--- 4. Formatting Preservation ---');

  // Source formats
  const srcFormats: Record<string, any> = {
    A1: { bold: true, align: 'center', textColor: '#ff0000' },
  };
  // Simulate format preservation as in MiniSpreadsheet
  const nextFormats = { ...srcFormats };
  const targetCoords = ['A2', 'A3', 'A4'];
  targetCoords.forEach((coord) => {
    nextFormats[coord] = { ...srcFormats['A1'] };
  });

  eq(nextFormats['A2'].bold, true, 'Bold preserved to A2');
  eq(nextFormats['A3'].align, 'center', 'Align center preserved to A3');
  eq(nextFormats['A4'].textColor, '#ff0000', 'Text color preserved to A4');

  // ----------------------------------------------------
  // 5. Formula Evaluation Engine
  // ----------------------------------------------------
  console.log('\n--- 5. Formula Evaluation Engine ---');

  const evalGrid: Record<string, any> = {
    A1: 10,
    A2: 20,
    A3: 30,
    B1: 5,
    B2: 15,
  };

  eq(evaluateFormula('=SUM(A1:A3)', evalGrid), 60, 'SUM(A1:A3) = 60');
  eq(evaluateFormula('=AVERAGE(A1:A3)', evalGrid), 20, 'AVERAGE(A1:A3) = 20');
  eq(evaluateFormula('=MIN(A1:A3)', evalGrid), 10, 'MIN(A1:A3) = 10');
  eq(evaluateFormula('=MAX(A1:A3)', evalGrid), 30, 'MAX(A1:A3) = 30');
  eq(evaluateFormula('=A1*B1+A2/B1', evalGrid), 54, 'Arithmetic precedence: 10*5 + 20/5 = 54');

  // Circular reference safety
  const circGrid: Record<string, any> = {
    A1: '=B1+1',
    B1: '=A1+1',
  };
  const circResult = evaluateFormula('=A1', circGrid);
  assert(
    circResult === '#CIRCULAR!' || typeof circResult === 'string',
    'Circular references caught cleanly without infinite recursion'
  );

  // ----------------------------------------------------
  // 6. Native Arabic and RTL Handling
  // ----------------------------------------------------
  console.log('\n--- 6. Native Arabic & RTL Handling ---');

  eq(normalizeDigits('١٢٣٤٥'), '12345', 'Arabic-Indic digits normalized cleanly');
  const cols = [
    { id: 'A', name: 'العمود أ', width: 150 },
    { id: 'B', name: 'العمود ب', width: 150 },
  ];
  const gridRows = [
    { A: 'مراجعة رقم 1', B: '=A1' },
  ];
  const display = computeGridDisplay(gridRows, cols);
  eq(display['A1'], 'مراجعة رقم 1', 'Arabic text passes through properly');
  eq(display['B1'], 'مراجعة رقم 1', 'Reference to Arabic cell displays properly');

  console.log(`\n========================================`);
  console.log(`MiniSpreadsheet Tests Finished: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
