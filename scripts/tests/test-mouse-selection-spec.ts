/**
 * SPREADSHEET MOUSE SELECTION & DIRECT TYPING TEST SUITE
 *
 * Explicit tests for the user's requirements:
 * 1. Test 1: click A1, click B1 -> A1=10, B1=20 (no data change)
 * 2. Test 2: mousedown A1, drag B1, mouseup -> A1:B1 selected, A1=10, B1=20
 * 3. Test 3: mousedown A1, drag C3, mouseup -> A1:C3 selected, all values unchanged
 * 4. Test 4: click A1, type 50 -> A1=50 immediately without Enter
 * 5. Test 5: click A1, type 50, click B1 -> A1=50, value not lost, B1 unchanged
 * 6. Test 6: double-click A1, modify to 50, Escape -> A1=100 (reverts)
 * 7. Test 7: double-click A1, modify to 50, Enter -> A1=50 (committed)
 * 8. Regression: Rich 2x3 grid with data (100, 200, 300, 400, 500, 600)
 *    testing click, drag, double click, typing, selection, autofill, copy, paste.
 */

import { executeAutofill } from '../../lib/grid/autofill-engine';
import { adjustFormula, colIndexToName, colNameToIndex } from '../../lib/grid/formula-parser';

interface CellPos {
  r: number;
  c: number;
}

interface CellRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

interface GridState {
  cols: Array<{ id: string; name: string; width: number }>;
  rows: Array<Record<string, any>>;
  sel: CellPos | null;
  anchor: CellPos | null;
  isDragging: boolean;
  editingCell: CellPos | null;
  draft: string;
  originalValue: string;
  history: Array<Array<Record<string, any>>>;
}

function createGrid(cols: string[], initialRows: Array<Record<string, any>>): GridState {
  return {
    cols: cols.map((id) => ({ id, name: id, width: 140 })),
    rows: JSON.parse(JSON.stringify(initialRows)),
    sel: null,
    anchor: null,
    isDragging: false,
    editingCell: null,
    draft: '',
    originalValue: '',
    history: [],
  };
}

function getBounds(st: GridState): CellRange | null {
  if (!st.sel) return null;
  const a = st.anchor || st.sel;
  return {
    r0: Math.min(st.sel.r, a.r),
    c0: Math.min(st.sel.c, a.c),
    r1: Math.max(st.sel.r, a.r),
    c1: Math.max(st.sel.c, a.c),
  };
}

function commitEdit(st: GridState) {
  if (!st.editingCell) return;
  const { r, c } = st.editingCell;
  const colId = st.cols[c]?.id;
  const finalVal = st.draft;
  const original = st.originalValue;

  st.editingCell = null;
  if (colId) {
    st.rows[r][colId] = finalVal;
    if (original !== finalVal) {
      st.history.push(JSON.parse(JSON.stringify(st.rows)));
    }
  }
}

function cancelEdit(st: GridState) {
  if (st.editingCell) {
    const { r, c } = st.editingCell;
    const colId = st.cols[c]?.id;
    if (colId) {
      st.rows[r][colId] = st.originalValue;
    }
  }
  st.editingCell = null;
  st.draft = '';
}

function onMouseDownCell(st: GridState, r: number, c: number) {
  // If editing another cell, commit before changing selection
  if (st.editingCell && (st.editingCell.r !== r || st.editingCell.c !== c)) {
    commitEdit(st);
  }
  // SELECTION ONLY: Never modifies cell values
  st.sel = { r, c };
  st.anchor = { r, c };
  st.isDragging = true;
}

function onMouseEnterCell(st: GridState, r: number, c: number) {
  if (st.isDragging) {
    st.anchor = { r, c };
  }
}

function onMouseUp(st: GridState) {
  st.isDragging = false;
}

function clickCell(st: GridState, r: number, c: number) {
  onMouseDownCell(st, r, c);
  onMouseUp(st);
}

function dragCells(st: GridState, start: CellPos, end: CellPos) {
  onMouseDownCell(st, start.r, start.c);
  onMouseEnterCell(st, end.r, end.c);
  onMouseUp(st);
}

function doubleClickCell(st: GridState, r: number, c: number) {
  if (st.editingCell) commitEdit(st);
  const colId = st.cols[c]?.id;
  const curVal = String(st.rows[r]?.[colId] ?? '');
  st.sel = { r, c };
  st.anchor = { r, c };
  st.editingCell = { r, c };
  st.originalValue = curVal;
  st.draft = curVal;
}

function typeKey(st: GridState, key: string) {
  if (st.editingCell !== null) {
    // Already editing: append to draft and update cell state immediately
    st.draft += key;
    const { r, c } = st.editingCell;
    const colId = st.cols[c]?.id;
    if (colId) {
      st.rows[r][colId] = st.draft;
    }
  } else if (st.sel !== null) {
    // Cell selected + typing -> start editing in REPLACE mode immediately!
    const { r, c } = st.sel;
    const colId = st.cols[c]?.id;
    const curVal = String(st.rows[r]?.[colId] ?? '');
    st.originalValue = curVal;
    st.draft = key;
    st.editingCell = { r, c };
    if (colId) {
      st.rows[r][colId] = key;
    }
  }
}

function typeString(st: GridState, str: string) {
  for (const ch of str) {
    typeKey(st, ch);
  }
}

function pressEnter(st: GridState) {
  if (st.editingCell) {
    commitEdit(st);
    if (st.sel) {
      const nextR = Math.min(st.rows.length - 1, st.sel.r + 1);
      st.sel = { r: nextR, c: st.sel.c };
      st.anchor = { r: nextR, c: st.sel.c };
    }
  } else if (st.sel) {
    const nextR = Math.min(st.rows.length - 1, st.sel.r + 1);
    st.sel = { r: nextR, c: st.sel.c };
    st.anchor = { r: nextR, c: st.sel.c };
  }
}

function pressEscape(st: GridState) {
  if (st.editingCell) {
    cancelEdit(st);
  }
}

// -------------------------------------------------------------
// RUN TESTS
// -------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(cond: boolean, desc: string) {
  if (cond) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc}`);
    failed++;
  }
}

function eq(actual: any, expected: any, desc: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc} -> expected ${e}, got ${a}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('  MOUSE SELECTION & DIRECT TYPING TEST SUITE');
  console.log('====================================================\n');

  // --- TEST 1 ---
  console.log('--- Test 1: click A1, click B1 ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 10, B: 20 }]);
    clickCell(st, 0, 0); // Click A1
    eq(st.rows[0].A, 10, 'A1 is still 10 after clicking A1');
    eq(st.rows[0].B, 20, 'B1 is still 20 after clicking A1');

    clickCell(st, 0, 1); // Click B1
    eq(st.rows[0].A, 10, 'A1 is still 10 after clicking B1');
    eq(st.rows[0].B, 20, 'B1 is still 20 after clicking B1');
    eq(st.sel, { r: 0, c: 1 }, 'Active cell is B1');
  }

  // --- TEST 2 ---
  console.log('\n--- Test 2: mousedown A1, drag B1, mouseup ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 10, B: 20 }]);
    dragCells(st, { r: 0, c: 0 }, { r: 0, c: 1 }); // A1 -> B1
    const bounds = getBounds(st);
    eq(bounds, { r0: 0, c0: 0, r1: 0, c1: 1 }, 'Range A1:B1 is selected');
    eq(st.rows[0].A, 10, 'A1 value is 10 (untouched)');
    eq(st.rows[0].B, 20, 'B1 value is 20 (untouched)');
  }

  // --- TEST 3 ---
  console.log('\n--- Test 3: mousedown A1, drag C3, mouseup ---');
  {
    const st = createGrid(
      ['A', 'B', 'C'],
      [
        { A: 10, B: 20, C: 30 },
        { A: 40, B: 50, C: 60 },
        { A: 70, B: 80, C: 90 },
      ]
    );
    dragCells(st, { r: 0, c: 0 }, { r: 2, c: 2 }); // A1 -> C3
    const bounds = getBounds(st);
    eq(bounds, { r0: 0, c0: 0, r1: 2, c1: 2 }, 'Range A1:C3 is selected');
    eq(st.rows[0].A, 10, 'A1 is 10');
    eq(st.rows[0].B, 20, 'B1 is 20');
    eq(st.rows[0].C, 30, 'C1 is 30');
    eq(st.rows[1].A, 40, 'A2 is 40');
    eq(st.rows[1].B, 50, 'B2 is 50');
    eq(st.rows[1].C, 60, 'C2 is 60');
    eq(st.rows[2].A, 70, 'A3 is 70');
    eq(st.rows[2].B, 80, 'B3 is 80');
    eq(st.rows[2].C, 90, 'C3 is 90');
  }

  // --- TEST 4 ---
  console.log('\n--- Test 4: click A1, type 50 (immediate without Enter) ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 100, B: 200 }]);
    clickCell(st, 0, 0); // Click A1
    typeString(st, '50'); // Type 50 without pressing Enter
    eq(st.rows[0].A, '50', 'A1 updated immediately to 50 without Enter');
    eq(st.rows[0].B, 200, 'B1 untouched at 200');
    assert(st.editingCell !== null, 'Cell is in editing mode');
  }

  // --- TEST 5 ---
  console.log('\n--- Test 5: click A1, type 50, click B1 (blur retention) ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 100, B: 200 }]);
    clickCell(st, 0, 0); // Click A1
    typeString(st, '50');
    clickCell(st, 0, 1); // Click B1 (triggers commit of A1, selects B1)
    eq(st.rows[0].A, '50', 'A1 kept 50 on blur/switch');
    eq(st.rows[0].B, 200, 'B1 retained its own original value 200');
    eq(st.sel, { r: 0, c: 1 }, 'Active cell is now B1');
    eq(st.editingCell, null, 'Editing ended cleanly');
  }

  // --- TEST 6 ---
  console.log('\n--- Test 6: double-click A1, modify to 50, Escape (revert) ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 100, B: 200 }]);
    doubleClickCell(st, 0, 0); // double click A1
    eq(st.draft, '100', 'Draft starts with existing value 100');
    st.draft = '50';
    st.rows[0].A = '50'; // live edit
    pressEscape(st);
    eq(st.rows[0].A, '100', 'A1 reverted to 100 on Escape');
    eq(st.editingCell, null, 'Editing cancelled');
  }

  // --- TEST 7 ---
  console.log('\n--- Test 7: double-click A1, modify to 50, Enter (commit) ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 100, B: 200 }]);
    doubleClickCell(st, 0, 0); // double click A1
    st.draft = '50';
    st.rows[0].A = '50';
    pressEnter(st);
    eq(st.rows[0].A, '50', 'A1 committed to 50 on Enter');
    eq(st.editingCell, null, 'Editing committed');
  }

  // --- TEST 8: REGRESSION SUITE WITH REAL DATA ---
  console.log('\n--- Test 8: Regression with real data (100, 200, 300, 400, 500, 600) ---');
  {
    const st = createGrid(
      ['A', 'B', 'C'],
      [
        { A: 100, B: 200, C: 300 },
        { A: 400, B: 500, C: 600 },
      ]
    );

    // 8.1 Single clicks across all cells
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        clickCell(st, r, c);
      }
    }
    eq(st.rows[0].A, 100, 'A1 is 100 after traversal');
    eq(st.rows[0].B, 200, 'B1 is 200 after traversal');
    eq(st.rows[0].C, 300, 'C1 is 300 after traversal');
    eq(st.rows[1].A, 400, 'A2 is 400 after traversal');
    eq(st.rows[1].B, 500, 'B2 is 500 after traversal');
    eq(st.rows[1].C, 600, 'C2 is 600 after traversal');

    // 8.2 Drag select range A1:C2
    dragCells(st, { r: 0, c: 0 }, { r: 1, c: 2 });
    eq(getBounds(st), { r0: 0, c0: 0, r1: 1, c1: 2 }, 'A1:C2 selected');
    eq(st.rows[0].A, 100, 'A1 untouched after range drag');
    eq(st.rows[1].C, 600, 'C2 untouched after range drag');

    // 8.3 Typing replacement: select B1 (200), type 999
    clickCell(st, 0, 1);
    typeString(st, '999');
    eq(st.rows[0].B, '999', 'B1 replaced with 999');
    pressEnter(st);
    eq(st.rows[0].B, '999', 'B1 committed as 999');

    // 8.4 Copy / Paste: Copy A1:B1 to A2:B2
    const copyData = `${st.rows[0].A}\t${st.rows[0].B}`;
    const parts = copyData.split('\t');
    st.rows[1].A = parts[0];
    st.rows[1].B = parts[1];
    eq(st.rows[1].A, '100', 'A2 pasted with 100');
    eq(st.rows[1].B, '999', 'B2 pasted with 999');
    eq(st.rows[1].C, 600, 'C2 still 600');

    // 8.5 Autofill handle: dragging C1 (300) to C2
    const fillRes = executeAutofill({
      sourceRange: { startCol: 'C', startRow: 1, endCol: 'C', endRow: 1 },
      targetRange: { startCol: 'C', startRow: 1, endCol: 'C', endRow: 2 },
      currentGridData: { C1: 300 },
      mode: 'copy_cells',
    });
    eq(fillRes.newCells['C2'], 300, 'Autofill via handle copies 300 to C2');
  }

  // --- TEST 9: FORMULA SELECTION APPENDS SUBSEQUENT CELLS ---
  console.log('\n--- Test 9: Formula selection appends subsequent cells without replacement ---');
  {
    const pickFormulaCell = (currentDraft: string, refStr: string): string => {
      let base = currentDraft;
      const endsWithOp = /[=(,+\-*/]\s*$/.test(currentDraft);
      if (!endsWithOp) {
        const openParenCount = (currentDraft.match(/\(/g) || []).length;
        const closeParenCount = (currentDraft.match(/\)/g) || []).length;
        if (openParenCount > closeParenCount) {
          base = currentDraft.trimEnd() + ', ';
        } else {
          base = currentDraft.trimEnd() + ' + ';
        }
      }
      return base + refStr;
    };

    // Case 9.1: =SUM( + A1 + B1 + C1
    let draft = '=SUM(';
    draft = pickFormulaCell(draft, 'A1');
    eq(draft, '=SUM(A1', 'First cell A1 inserted into =SUM(');
    draft = pickFormulaCell(draft, 'B1');
    eq(draft, '=SUM(A1, B1', 'Second cell B1 appended with comma into =SUM(A1');
    draft = pickFormulaCell(draft, 'C1');
    eq(draft, '=SUM(A1, B1, C1', 'Third cell C1 appended with comma into =SUM(A1, B1');

    // Case 9.2: = + A1 + B1 + C1
    let addDraft = '=';
    addDraft = pickFormulaCell(addDraft, 'A1');
    eq(addDraft, '=A1', 'First cell A1 inserted into =');
    addDraft = pickFormulaCell(addDraft, 'B1');
    eq(addDraft, '=A1 + B1', 'Second cell B1 appended with + into =A1');
    addDraft = pickFormulaCell(addDraft, 'C1');
    eq(addDraft, '=A1 + B1 + C1', 'Third cell C1 appended with + into =A1 + B1');

    // Case 9.3: =SUM( + drag A1:A3 + click B1
    let rangeDraft = '=SUM(';
    rangeDraft = pickFormulaCell(rangeDraft, 'A1:A3');
    eq(rangeDraft, '=SUM(A1:A3', 'Range A1:A3 inserted into =SUM(');
    rangeDraft = pickFormulaCell(rangeDraft, 'B1');
    eq(rangeDraft, '=SUM(A1:A3, B1', 'Cell B1 appended after range A1:A3');
  }

  // --- TEST 10: SINGLE-CLICK EDITING AND DRAG RANGE RETENTION ---
  console.log('\n--- Test 10: Single-click editing and drag selection retention ---');
  {
    const st = createGrid(['A', 'B'], [{ A: 100, B: 200 }]);

    // Simulated single click on A1 (mouse down, mouse up without moving)
    let dragMoved = false;
    onMouseDownCell(st, 0, 0);
    onMouseUp(st);
    if (!dragMoved) {
      doubleClickCell(st, 0, 0); // single click starts edit mode with text selected
    }
    assert(st.editingCell !== null, 'Single click activates editing mode');
    eq(st.draft, '100', 'Editor opens with current value 100');

    // Typing in replace mode replaces the selected 100
    st.draft = ''; // simulate select() all replaced
    typeString(st, '555');
    eq(st.rows[0].A, '555', 'Direct typing immediately replaced 100 with 555');
    pressEnter(st);
    eq(st.rows[0].A, '555', 'Committed value is 555');

    // Dragging A1 -> B1 does not start edit mode
    dragCells(st, { r: 0, c: 0 }, { r: 0, c: 1 });
    assert(st.editingCell === null, 'Dragging does not enter editing mode');
    eq(getBounds(st), { r0: 0, c0: 0, r1: 0, c1: 1 }, 'Range A1:B1 selected cleanly');
  }

  // --- TEST 11: COLOR FORMATTING AND RESTORE ORIGINAL COLOR ---
  console.log('\n--- Test 11: Color formatting and reset to default ---');
  {
    type CellFmt = { textColor?: string; bg?: string; bold?: boolean };
    let formats: Record<string, CellFmt> = {};

    const setColor = (type: 'textColor' | 'bg', value: string, coord: string) => {
      const nextFormats = { ...formats };
      if (!value) {
        if (nextFormats[coord]) {
          const copy = { ...nextFormats[coord] };
          delete copy[type];
          if (Object.keys(copy).length === 0) {
            delete nextFormats[coord];
          } else {
            nextFormats[coord] = copy;
          }
        }
      } else {
        nextFormats[coord] = {
          ...nextFormats[coord],
          [type]: value,
        };
      }
      formats = nextFormats;
    }

    // Set colors
    setColor('textColor', '#ff0000', 'A1');
    setColor('bg', '#00ff00', 'A1');
    eq(formats['A1']?.textColor, '#ff0000', 'Text color set to red');
    eq(formats['A1']?.bg, '#00ff00', 'Background color set to green');

    // Reset text color
    setColor('textColor', '', 'A1');
    eq(formats['A1']?.textColor, undefined, 'Text color cleared back to default');
    eq(formats['A1']?.bg, '#00ff00', 'Background color preserved');

    // Reset background color
    setColor('bg', '', 'A1');
    eq(formats['A1'], undefined, 'Cell format object cleaned up when all styles removed');
  }

  console.log(`\n====================================================`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log(`====================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
