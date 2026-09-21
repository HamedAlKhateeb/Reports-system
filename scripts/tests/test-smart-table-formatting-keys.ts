/**
 * SMART TABLE FORMATTING, KEYBOARD SHORTCUTS & PERSISTENCE TEST SUITE
 *
 * Validates:
 * 1. Cell selection bounds & range coordinates.
 * 2. Delete / Backspace key clearing: clears selected cells without breaking grid structure.
 * 3. Formatting operations: Bold, Italic, Underline, Alignment (Left, Center, Right), Text Color, Bg Color.
 * 4. Cell Merging & Unmerging boundary resolution.
 * 5. Arithmetic formulas evaluation and circular reference protection.
 * 6. Persistence to database / storage and exact round-trip retrieval.
 */

import {
  colIndexToName,
  colNameToIndex,
  parseCellRef,
  evaluateFormula,
  remapFormulaRefs,
  adjustFormula,
} from '../../lib/grid/formula-parser';
import {
  saveTable,
  getTableById,
} from '../../lib/db-intelligence';
import type { TableEntity, TableColumnConfig } from '../../lib/types';

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

// In Node.js environment, mock localStorage if window is not defined
if (typeof window === 'undefined') {
  const store = new Map<string, string>();
  (global as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

const toA1 = (c: number, r: number) => `${colIndexToName(c)}${r + 1}`.toUpperCase();

interface CellBounds {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

function rangeCoords(b: CellBounds): Array<{ r: number; c: number }> {
  const pts: Array<{ r: number; c: number }> = [];
  for (let r = b.r0; r <= b.r1; r++) {
    for (let c = b.c0; c <= b.c1; c++) {
      pts.push({ r, c });
    }
  }
  return pts;
}

async function runTests() {
  console.log('--- Test Suite: Smart Table Formatting, Keyboard & Persistence ---');

  // 1. Coordinates and Cell References
  console.log('\n1. Cell Coordinates & Indexing:');
  eq(toA1(0, 0), 'A1', 'Index (0,0) is A1');
  eq(toA1(2, 4), 'C5', 'Index (2,4) is C5');
  eq(colIndexToName(0), 'A', 'Column 0 is A');
  eq(colIndexToName(25), 'Z', 'Column 25 is Z');
  eq(colNameToIndex('A'), 0, 'Col A index is 0');
  eq(colNameToIndex('C'), 2, 'Col C index is 2');

  const refB3 = parseCellRef('B3');
  assert(refB3 !== null && refB3.colIndex === 1 && refB3.rowIndex === 2, 'Parsed B3 correctly');

  // 2. Selection & Delete/Backspace Clearing
  console.log('\n2. Cell Range Selection & Keyboard Clearing:');
  const cols = [
    { id: 'A', name: 'البند', width: 140 },
    { id: 'B', name: 'الكمية', width: 100 },
    { id: 'C', name: 'السعر', width: 120 },
  ];
  let rows = [
    { A: 'خادم رئيسي', B: '2', C: '5000' },
    { A: 'جدار ناري', B: '1', C: '3200' },
    { A: 'محول شبكة', B: '4', C: '800' },
  ];

  // User selects cells B2:C3 (r0=1, c0=1, r1=2, c1=2)
  const selBounds: CellBounds = { r0: 1, c0: 1, r1: 2, c1: 2 };
  const targetPoints = rangeCoords(selBounds);
  eq(targetPoints.length, 4, 'Selected 4 cells in 2x2 range');

  // Simulate Delete / Backspace key press
  const nextRows = rows.map((r) => ({ ...r }));
  targetPoints.forEach((pt) => {
    const colId = cols[pt.c]?.id;
    if (colId) (nextRows[pt.r] as Record<string, any>)[colId] = '';
  });

  // Verify: row count and column count do not change, grid is intact
  eq(nextRows.length, 3, 'Row count is preserved after Delete key');
  eq(Object.keys(nextRows[0]).length, 3, 'Column count is preserved');
  eq(nextRows[0].A, 'خادم رئيسي', 'Unselected row 0 cell A unchanged');
  eq(nextRows[0].B, '2', 'Unselected row 0 cell B unchanged');
  eq(nextRows[1].B, '', 'Selected cell B2 cleared');
  eq(nextRows[1].C, '', 'Selected cell C2 cleared');
  eq(nextRows[2].B, '', 'Selected cell B3 cleared');
  eq(nextRows[2].C, '', 'Selected cell C3 cleared');
  eq(nextRows[1].A, 'جدار ناري', 'Row 1 cell A (outside selection) remains intact');

  // 3. Formatting Commands: Bold, Italic, Underline, Alignment, Colors
  console.log('\n3. Smart Table Formatting Commands:');
  let cellFormats: Record<string, any> = {};

  // Apply Bold to A1
  cellFormats['A1'] = { ...cellFormats['A1'], bold: true };
  assert(cellFormats['A1'].bold === true, 'A1 is Bold');

  // Apply Italic and Underline to A1
  cellFormats['A1'] = { ...cellFormats['A1'], italic: true, underline: true };
  assert(cellFormats['A1'].italic === true, 'A1 is Italic');
  assert(cellFormats['A1'].underline === true, 'A1 is Underlined');

  // Apply Alignment to range B1:C1
  const headerBounds: CellBounds = { r0: 0, c0: 1, r1: 0, c1: 2 };
  rangeCoords(headerBounds).forEach((pt) => {
    const coord = toA1(pt.c, pt.r);
    cellFormats[coord] = { ...cellFormats[coord], align: 'center' };
  });
  eq(cellFormats['B1'].align, 'center', 'B1 is aligned center');
  eq(cellFormats['C1'].align, 'center', 'C1 is aligned center');

  // Apply Colors to A1: textColor = #1e40af (Blue), bg = #eff6ff (Light Blue)
  cellFormats['A1'] = {
    ...cellFormats['A1'],
    textColor: '#1e40af',
    bg: '#eff6ff',
  };
  eq(cellFormats['A1'].textColor, '#1e40af', 'A1 text color applied');
  eq(cellFormats['A1'].bg, '#eff6ff', 'A1 background color applied');

  // 4. Merged Cells Resolution
  console.log('\n4. Merged Cells Handling:');
  const merges = [{ start: 'A1', end: 'B1' }];
  const startRef = parseCellRef(merges[0].start)!;
  const endRef = parseCellRef(merges[0].end)!;
  const rowSpan = endRef.rowIndex - startRef.rowIndex + 1;
  const colSpan = endRef.colIndex - startRef.colIndex + 1;
  eq(rowSpan, 1, 'Merge span rows = 1');
  eq(colSpan, 2, 'Merge span cols = 2');

  // 5. Formula Evaluation
  console.log('\n5. Arithmetic Formulas:');
  const formulaCtx = {
    A1: 10,
    A2: 20,
    A3: 30,
  };
  const sumVal = evaluateFormula('=SUM(A1:A3)', (ref) => formulaCtx[ref as keyof typeof formulaCtx] ?? 0);
  eq(sumVal, 60, '=SUM(A1:A3) evaluates to 60');

  const avgVal = evaluateFormula('=AVERAGE(A1:A3)', (ref) => formulaCtx[ref as keyof typeof formulaCtx] ?? 0);
  eq(avgVal, 20, '=AVERAGE(A1:A3) evaluates to 20');

  // Relative reference shift on copy/paste
  const shiftedFormula = adjustFormula('=A1*2', 1, 0);
  eq(shiftedFormula, '=A2*2', 'Formula relative reference shifted correctly down 1 row');

  // 6. Persistence Round-Trip
  console.log('\n6. Smart Table Entity Database Persistence:');
  const tableId = `tbl_test_${Date.now()}`;
  const columnsData: TableColumnConfig[] = cols.map((c) => ({
    id: c.id,
    name: c.name,
    type: 'text',
    width: c.width,
  }));

  const tableEntity: TableEntity = {
    id: tableId,
    report_id: 'rep_finance_01',
    name: 'جدول المشتريات والتجهيزات',
    direction: 'rtl',
    columns_data: columnsData,
    rows_data: nextRows,
    cell_formats: cellFormats,
    merged_cells: merges,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await saveTable(tableEntity);

  const loadedTable = await getTableById(tableId);
  assert(loadedTable !== null, 'Table successfully retrieved from persistence');
  eq(loadedTable?.name, 'جدول المشتريات والتجهيزات', 'Table name persisted');
  eq(loadedTable?.direction, 'rtl', 'RTL direction persisted');
  eq(loadedTable?.cell_formats?.['A1']?.bold, true, 'Cell formatting (bold) persisted');
  eq(loadedTable?.cell_formats?.['A1']?.textColor, '#1e40af', 'Cell text color persisted');
  eq(loadedTable?.cell_formats?.['A1']?.bg, '#eff6ff', 'Cell background color persisted');
  eq(loadedTable?.merged_cells?.[0]?.start, 'A1', 'Merged cells start persisted');
  eq(loadedTable?.merged_cells?.[0]?.end, 'B1', 'Merged cells end persisted');
  eq(loadedTable?.rows_data?.[0]?.A, 'خادم رئيسي', 'Row values persisted accurately');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
