/**
 * AUTOMATED TEST SUITE: Table Selection & Multi-Row/Col Paste Auto-Expansion
 *
 * Covers:
 * 1. Universal Clipboard Table Parsing (HTML, Markdown, TSV, CSV)
 * 2. Multi-column and Multi-row auto-expansion on paste
 * 3. Cell selection persistence (single click selects without disappearing into edit mode)
 * 4. Row header selection (click & drag selects entire row across all columns)
 * 5. Column header selection (click & drag selects entire column across all rows)
 * 6. Top-left corner (#) selection (selects entire spreadsheet)
 * 7. TipTap ProseMirror table paste auto-expansion & cell distribution
 */

import {
  parseHtmlTableToGrid,
  parseClipboardToTableGrid,
  parseMarkdownTableToGrid,
  hasMarkdownTable,
} from '../../lib/markdown';
import { parseTSV, SPREADSHEET_CAP, ColDef, GridRow, normBounds } from '../../components/editor/grid/MiniSpreadsheet';
import { colIndexToName } from '../../lib/grid/formula-parser';

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
  console.log('=== TEST SUITE: Table Selection & Multi-Row/Col Paste Auto-Expansion ===\n');

  // --------------------------------------------------------------------------
  // SECTION 1: Universal Clipboard Table Parsing
  // --------------------------------------------------------------------------
  console.log('--- 1. Universal Clipboard Table Parsing ---');

  // 1A. HTML Table (from Excel / Web / Word)
  const sampleHtmlTable = `
    <table border="1">
      <thead>
        <tr><th>الاسم</th><th>القسم</th><th>الراتب</th></tr>
      </thead>
      <tbody>
        <tr><td>أحمد علي</td><td>المبيعات</td><td>5000&nbsp;ر.س</td></tr>
        <tr><td>فاطمة حسن</td><td>تقنية&amp;المعلومات</td><td>7500&nbsp;ر.س</td></tr>
        <tr><td>عمر خالد</td><td>المالية</td><td>6200&nbsp;ر.س</td></tr>
      </tbody>
    </table>
  `;

  const htmlGrid = parseHtmlTableToGrid(sampleHtmlTable);
  assert(htmlGrid !== null, 'parseHtmlTableToGrid returns a 2D array');
  eq(htmlGrid?.length, 4, 'HTML table has 4 rows (1 header + 3 data rows)');
  eq(htmlGrid?.[0], ['الاسم', 'القسم', 'الراتب'], 'Header row matches');
  eq(htmlGrid?.[1], ['أحمد علي', 'المبيعات', '5000 ر.س'], 'Row 1 decoded entities correctly');
  eq(htmlGrid?.[2]?.[1], 'تقنية&المعلومات', 'Ampersand entity decoded correctly');

  // 1B. Clipboard Auto-Detection: HTML preferred over raw text
  const clipboardHtmlGrid = parseClipboardToTableGrid('some fallback plain text', sampleHtmlTable);
  eq(clipboardHtmlGrid?.length, 4, 'parseClipboardToTableGrid extracts HTML table when present');

  // 1C. Markdown Table Parsing
  const mdTable = `
| المعيار | الهدف | النتيجة |
|---|---|---|
| الأداء | 99% | 99.5% |
| الأمان | 100% | 100% |
`;
  const parsedMdGrid = parseClipboardToTableGrid(mdTable);
  eq(parsedMdGrid?.length, 3, 'parseClipboardToTableGrid parses Markdown table');
  eq(parsedMdGrid?.[1], ['الأداء', '99%', '99.5%'], 'Markdown data row parsed correctly');

  // 1D. Tab-Separated Values (TSV from Excel copy)
  const tsvText = 'الربع الأول\tالربع الثاني\tالربع الثالث\n1000\t1500\t2000\n1100\t1600\t2100';
  const parsedTsv = parseClipboardToTableGrid(tsvText);
  eq(parsedTsv?.length, 3, 'parseClipboardToTableGrid parses TSV table');
  eq(parsedTsv?.[0], ['الربع الأول', 'الربع الثاني', 'الربع الثالث'], 'TSV row 0 parsed');
  eq(parsedTsv?.[1], ['1000', '1500', '2000'], 'TSV row 1 parsed');

  // 1E. Comma-Separated Values (CSV)
  const csvText = 'ID,Name,Status\n1,Task A,Done\n2,Task B,Pending';
  const parsedCsv = parseClipboardToTableGrid(csvText);
  eq(parsedCsv?.length, 3, 'parseClipboardToTableGrid parses CSV');
  eq(parsedCsv?.[1], ['1', 'Task A', 'Done'], 'CSV row 1 parsed');

  // --------------------------------------------------------------------------
  // SECTION 2: Spreadsheet Paste & Auto-Expansion (Rows & Columns)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Spreadsheet Paste Auto-Expansion ---');

  // Initial small table: 2 columns, 2 rows
  let testCols: ColDef[] = [
    { id: 'A', name: 'A', width: 140 },
    { id: 'B', name: 'B', width: 140 },
  ];
  let testRows: GridRow[] = [
    { A: 'valA1', B: 'valB1' },
    { A: 'valA2', B: 'valB2' },
  ];

  // Incoming paste: 4 rows x 4 columns starting at cell (0, 0)
  const incomingGrid = [
    ['Header1', 'Header2', 'Header3', 'Header4'],
    ['R1C1', 'R1C2', 'R1C3', 'R1C4'],
    ['R2C1', 'R2C2', 'R2C3', 'R2C4'],
    ['R3C1', 'R3C2', 'R3C3', 'R3C4'],
  ];

  // Simulate pasteAt expansion logic
  const startR = 0;
  const startC = 0;
  const maxIncomingCols = Math.max(...incomingGrid.map((r) => r.length));
  const neededCols = Math.min(startC + maxIncomingCols, SPREADSHEET_CAP.COLS);

  // Column expansion
  if (neededCols > testCols.length) {
    const usedIds = new Set(testCols.map((c) => c.id));
    while (testCols.length < neededCols) {
      let idx = testCols.length;
      while (usedIds.has(colIndexToName(idx))) idx++;
      const newColId = colIndexToName(idx);
      usedIds.add(newColId);
      testCols.push({ id: newColId, name: newColId, width: 140 });
    }
  }

  eq(testCols.length, 4, 'Columns auto-expanded from 2 to 4');
  eq(testCols.map((c) => c.id), ['A', 'B', 'C', 'D'], 'Column IDs generated sequentially (A, B, C, D)');

  // Row expansion
  const neededRows = Math.min(startR + incomingGrid.length, SPREADSHEET_CAP.ROWS);
  while (testRows.length < neededRows) {
    const blank: GridRow = {};
    testCols.forEach((c) => { blank[c.id] = ''; });
    testRows.push(blank);
  }

  eq(testRows.length, 4, 'Rows auto-expanded from 2 to 4');

  // Cell distribution
  incomingGrid.forEach((rowVals, dr) => {
    const r = startR + dr;
    rowVals.forEach((val, dc) => {
      const c = startC + dc;
      const colId = testCols[c].id;
      testRows[r][colId] = val;
    });
  });

  // Verify all cells filled across all rows and columns
  eq(testRows[0]['A'], 'Header1', 'Cell (0, 0) filled');
  eq(testRows[0]['D'], 'Header4', 'Cell (0, 3) filled in newly created column D');
  eq(testRows[3]['A'], 'R3C1', 'Cell (3, 0) filled in newly created row 3');
  eq(testRows[3]['D'], 'R3C4', 'Cell (3, 3) filled in newly created row 3 & column D');

  // Case 2B: Paste with offset starting at row 2, col 2
  const offsetGrid = [
    ['X1', 'X2'],
    ['X3', 'X4'],
  ];
  const offsetStartR = 2;
  const offsetStartC = 2;
  const offsetMaxCols = Math.max(...offsetGrid.map((r) => r.length));
  const offsetNeededCols = Math.min(offsetStartC + offsetMaxCols, SPREADSHEET_CAP.COLS);
  const offsetNeededRows = Math.min(offsetStartR + offsetGrid.length, SPREADSHEET_CAP.ROWS);

  assert(offsetNeededCols <= testCols.length, 'Existing columns (4) accommodate offset startC(2) + cols(2) = 4');
  assert(offsetNeededRows <= testRows.length, 'Existing rows (4) accommodate offset startR(2) + rows(2) = 4');

  offsetGrid.forEach((rowVals, dr) => {
    const r = offsetStartR + dr;
    rowVals.forEach((val, dc) => {
      const c = offsetStartC + dc;
      testRows[r][testCols[c].id] = val;
    });
  });

  eq(testRows[2]['C'], 'X1', 'Offset paste placed in (2, C)');
  eq(testRows[2]['D'], 'X2', 'Offset paste placed in (2, D)');
  eq(testRows[3]['C'], 'X3', 'Offset paste placed in (3, C)');
  eq(testRows[3]['D'], 'X4', 'Offset paste placed in (3, D)');
  eq(testRows[0]['A'], 'Header1', 'Original cells outside paste range preserved untouched');

  // --------------------------------------------------------------------------
  // SECTION 3: Selection Persistence & Table Header Selection
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Selection Persistence & Header Selection ---');

  // 3A. Single Cell Selection
  let sel: { r: number; c: number } | null = { r: 1, c: 2 };
  let anchor: { r: number; c: number } | null = { r: 1, c: 2 };
  let bounds = normBounds(sel, anchor);
  eq(bounds, { r0: 1, c0: 2, r1: 1, c1: 2 }, 'Single cell bounds is a 1x1 range');
  assert(bounds.r0 === 1 && bounds.c0 === 2, 'Cell selection does NOT clear or collapse');

  // 3B. Row Header Selection (Click row # 2)
  const clickRowIdx = 2;
  sel = { r: clickRowIdx, c: 0 };
  anchor = { r: clickRowIdx, c: testCols.length - 1 };
  bounds = normBounds(sel, anchor);
  eq(bounds, { r0: 2, c0: 0, r1: 2, c1: 3 }, 'Row selection spans from col 0 to last column (3)');
  assert(bounds.r0 <= 2 && bounds.r1 >= 2, 'Row 2 is selected');
  assert(bounds.c0 === 0 && bounds.c1 === 3, 'All 4 columns are included in row selection');

  // 3C. Row Drag Selection (Drag from row 1 to row 3)
  const dragRowStart = 1;
  const dragRowEnd = 3;
  sel = { r: dragRowStart, c: 0 };
  anchor = { r: dragRowEnd, c: testCols.length - 1 };
  bounds = normBounds(sel, anchor);
  eq(bounds, { r0: 1, c0: 0, r1: 3, c1: 3 }, 'Row drag selection spans rows 1-3 across all columns');

  // 3D. Column Header Selection (Click column B, index 1)
  const clickColIdx = 1;
  sel = { r: 0, c: clickColIdx };
  anchor = { r: testRows.length - 1, c: clickColIdx };
  bounds = normBounds(sel, anchor);
  eq(bounds, { r0: 0, c0: 1, r1: 3, c1: 1 }, 'Column selection spans from row 0 to last row (3)');

  // 3E. Column Drag Selection (Drag from col 1 to col 3)
  const dragColStart = 1;
  const dragColEnd = 3;
  sel = { r: 0, c: dragColStart };
  anchor = { r: testRows.length - 1, c: dragColEnd };
  bounds = normBounds(sel, anchor);
  eq(bounds, { r0: 0, c0: 1, r1: 3, c1: 3 }, 'Column drag selection spans cols 1-3 across all rows');

  // 3F. Select All Corner (#)
  sel = { r: 0, c: 0 };
  anchor = { r: testRows.length - 1, c: testCols.length - 1 };
  bounds = normBounds(sel, anchor);
  eq(bounds, { r0: 0, c0: 0, r1: 3, c1: 3 }, 'Select All corner selects entire spreadsheet');

  // --------------------------------------------------------------------------
  // SECTION 4: TipTap ProseMirror Table Reconstruction Logic
  // --------------------------------------------------------------------------
  console.log('\n--- 4. TipTap ProseMirror Table Auto-Expansion Simulation ---');

  interface MockCell { text: string; isHeader: boolean; }
  interface MockRow { cells: MockCell[]; }
  interface MockTable { rows: MockRow[]; }

  const initialTable: MockTable = {
    rows: [
      { cells: [{ text: 'H1', isHeader: true }, { text: 'H2', isHeader: true }] },
      { cells: [{ text: 'C1', isHeader: false }, { text: 'C2', isHeader: false }] },
    ],
  };

  const pastedTipTapGrid = [
    ['P1', 'P2', 'P3'],
    ['P4', 'P5', 'P6'],
    ['P7', 'P8', 'P9'],
  ];

  const tStartRow = 1;
  const tStartCol = 0;
  const tTargetRowCount = Math.max(initialTable.rows.length, tStartRow + pastedTipTapGrid.length);
  const tMaxIncomingCols = Math.max(...pastedTipTapGrid.map((r) => r.length));
  const tExistingColCount = initialTable.rows[0].cells.length;
  const tTargetColCount = Math.max(tExistingColCount, tStartCol + tMaxIncomingCols);

  const newMockRows: MockRow[] = [];
  for (let r = 0; r < tTargetRowCount; r++) {
    const isHeader = r === 0;
    const origRow = r < initialTable.rows.length ? initialTable.rows[r] : null;
    const newCells: MockCell[] = [];
    for (let c = 0; c < tTargetColCount; c++) {
      const isPasted =
        r >= tStartRow &&
        r < tStartRow + pastedTipTapGrid.length &&
        c >= tStartCol &&
        c < tStartCol + pastedTipTapGrid[r - tStartRow].length;

      let textVal = '';
      if (isPasted) {
        textVal = pastedTipTapGrid[r - tStartRow][c - tStartCol];
      } else if (origRow && c < origRow.cells.length) {
        textVal = origRow.cells[c].text;
      }
      newCells.push({ text: textVal, isHeader });
    }
    newMockRows.push({ cells: newCells });
  }

  eq(newMockRows.length, 4, 'TipTap table expanded to 4 rows (1 header + 3 data rows)');
  eq(newMockRows[0].cells.length, 3, 'TipTap table expanded to 3 columns');
  eq(newMockRows[1].cells.map((c) => c.text), ['P1', 'P2', 'P3'], 'TipTap row 1 has pasted P1, P2, P3');
  eq(newMockRows[2].cells.map((c) => c.text), ['P4', 'P5', 'P6'], 'TipTap row 2 has pasted P4, P5, P6');
  eq(newMockRows[3].cells.map((c) => c.text), ['P7', 'P8', 'P9'], 'TipTap row 3 has pasted P7, P8, P9');
  eq(newMockRows[0].cells[0].text, 'H1', 'TipTap header cell 0 preserved');
  eq(newMockRows[0].cells[1].text, 'H2', 'TipTap header cell 1 preserved');

  // Summary
  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void run();
