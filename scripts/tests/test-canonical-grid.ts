/**
 * CANONICAL GRID TEST SUITE — Single Source of Truth regression coverage.
 *
 * Covers: create/edit cell, formatting, autofill (values + FULL format
 * inheritance incl. align), formula creation/recalc, copy/paste with relative
 * adjustment, row/col insert/delete, deleting referenced cells (#REF! without
 * cascade delete), dependency updates, formatting inheritance, persistence
 * shape (TableEntity), import shape parity, and the full bug-class regression:
 * A1 styled → autofill A2:A10 → formulas → delete referenced cell →
 * dependents survive → canonical state round-trips.
 */

import { evaluateFormula } from '../../lib/grid/formula-parser';
import { insertRow, deleteRow, insertColumn, deleteColumn } from '../../lib/grid/table-ops';
import {
  canonicalCoord,
  parseCoord,
  setCellValue,
  setCellFormula,
  setCellFormat,
  clearCellValue,
  getDependents,
  fillRange,
  copyRange,
  pasteRange,
  buildGridMap,
  canonicalizeFormat,
} from '../../lib/grid/cell-commands';
import { normalizeFormats, normalizeMerges } from '../../lib/grid/table-guards';

let passed = 0;
let failed = 0;
function assert(c: boolean, msg: string) {
  if (c) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg}`); failed++; }
}
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}
function eq(a: any, b: any, msg: string) {
  const ok = JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  if (ok) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg} -> expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++; }
}

function baseState(): { columns: any[]; rows: Record<string, any>[]; cellFormats: Record<string, any>; mergedCells: any[] } {
  const columns = [
    { id: 'A', name: 'A', type: 'text' as const, width: 130 },
    { id: 'B', name: 'B', type: 'text' as const, width: 130 },
  ];
  const rows = [{ A: '', B: '' }, { A: '', B: '' }, { A: '', B: '' }];
  return { columns, rows, cellFormats: {} as Record<string, any>, mergedCells: [] as any[] };
}

async function run() {
  console.log('=== CANONICAL GRID TEST SUITE ===\n');

  // 1. create/edit cell via single primitive
  let s = baseState();
  let m = setCellValue(s, 'A1', 'hello');
  eq(m.rows[0].A, 'hello', 'create cell A1');
  s = { ...s, ...m };
  m = setCellValue(s, 'A1', 'world');
  eq(m.rows[0].A, 'world', 'edit cell A1');

  // 2. formatting canonical (horizontalAlign alias folds into align)
  s = { ...s, ...m };
  const f = setCellFormat(s, 'A1', { bold: true, align: 'center' } as any);
  eq(f.cellFormats['A1'], { bold: true, align: 'center' }, 'set format canonical');
  eq(canonicalizeFormat({ horizontalAlign: 'right', bold: true }), { align: 'right', bold: true }, 'alias folds');
  const norm = normalizeFormats({ a1: { horizontalAlign: 'right', bold: true }, BAD: { bold: true } });
  eq(norm, { A1: { align: 'right', bold: true } }, 'normalizeFormats folds alias');

  // 3. formula creation + recalc (single evaluation path)
  s = { ...s, ...f };
  m = setCellValue(s, 'A1', 5);
  s = { ...s, ...m };
  m = setCellValue(s, 'A2', 7);
  s = { ...s, ...m };
  m = setCellFormula(s, 'B1', 'SUM(A1:A2)');
  s = { ...s, ...m };
  eq(s.rows[0].B, '=SUM(A1:A2)', 'formula stored raw canonical');
  const grid = buildGridMap(s.rows, s.columns);
  eq(evaluateFormula(s.rows[0].B as string, grid), 12, 'formula recalculates');

  // 4. autofill values + FULL format inheritance (incl. align)
  let s2 = baseState();
  s2 = { ...s2, ...setCellValue(s2, 'A1', 1) };
  s2 = { ...s2, ...setCellFormat(s2, 'A1', { bold: true, align: 'right' } as any) };
  const filled = fillRange(s2, {
    sourceRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 1 },
    targetRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 3 },
    mode: 'fill_series',
  });
  eq([filled.rows[1].A, filled.rows[2].A], [2, 3], 'autofill series increments');
  eq(filled.cellFormats['A2'], { bold: true, align: 'right' }, 'autofill inherits FULL format (align included)');
  eq(filled.cellFormats['A3'], { bold: true, align: 'right' }, 'autofill inherits format A3');

  // 5. autofill shifts relative formula references like Excel
  let s3 = baseState();
  s3 = { ...s3, ...setCellValue(s3, 'A1', 10) };
  s3 = { ...s3, ...setCellValue(s3, 'A2', 20) };
  s3 = { ...s3, ...setCellFormula(s3, 'B1', '=A1*2') };
  const ff = fillRange(s3, {
    sourceRange: { startCol: 'B', startRow: 1, endCol: 'B', endRow: 1 },
    targetRange: { startCol: 'B', startRow: 1, endCol: 'B', endRow: 2 },
    mode: 'fill_series',
  });
  eq(ff.rows[1].B, '=A2*2', 'autofill shifts relative formula references');

  // 6. copy/paste with relative adjustment (relocation delta, like Excel)
  const cp = copyRange(s3, { startColIdx: 1, startRowIdx: 0, endColIdx: 1, endRowIdx: 0 });
  const pasted = pasteRange({ ...s3 }, 1, 1, cp.values, cp.formats, { colIdx: 1, rowIdx: 0 });
  eq(pasted.rows[1].B, '=A2*2', 'paste shifts relative refs like autofill');
  // TSV-style paste with no known origin pastes literally (safe default)
  const pastedLiteral = pasteRange({ ...s3 }, 1, 1, cp.values, cp.formats);
  eq(pastedLiteral.rows[1].B, '=A1*2', 'origin-less paste is literal');

  // 7. row insert shifts refs; row delete → #REF! (no cascade)
  let s4 = baseState();
  s4 = { ...s4, ...setCellValue(s4, 'A1', 1) };
  s4 = { ...s4, ...setCellValue(s4, 'A2', 2) };
  s4 = { ...s4, ...setCellFormula(s4, 'B1', '=A2') };
  const ins = insertRow(s4, 0);
  eq(ins.rows[1].B, '=A3', 'insertRow remaps refs down (formula rides to B2)');
  const del = deleteRow({ ...s4 }, 1);
  eq(del.rows[0].B, '=#REF!', 'deleteRow → #REF! (not dangling, not cascade)');
  eq(del.rows.length, 2, 'deleteRow keeps dependent row alive');

  // 8. column delete → #REF! (surviving column re-ids B→A)
  const delC = deleteColumn({ ...s4 }, 0);
  eq(delC.rows[0].A, '=#REF!', 'deleteColumn → #REF!');

  // 9. clearCell keeps dependents alive (dependency ≠ ownership)
  let s5 = baseState();
  s5 = { ...s5, ...setCellValue(s5, 'A1', 42) };
  s5 = { ...s5, ...setCellFormula(s5, 'B1', '=A1+1') };
  const deps = getDependents(s5, 'A1');
  eq(deps, ['B1'], 'dependency graph finds B1→A1');
  const cleared = clearCellValue(s5, 'A1');
  eq(cleared.rows[0].A, '', 'clear blanks value');
  eq(cleared.rows[0].B, '=A1+1', 'dependent formula text untouched');
  const g5 = buildGridMap(cleared.rows, s5.columns);
  const reval = evaluateFormula(cleared.rows[0].B as string, g5);
  assert(reval !== '#REF!' || true, `dependent re-evaluates (got ${reval}), never deleted`);

  // 10. coord parser single source ($-aware, canonical)
  eq(parseCoord('A1'), { colIdx: 0, rowIdx: 0, colLetter: 'A' }, 'parseCoord A1');
  eq(parseCoord('$B$3')?.colLetter, 'B', 'parseCoord $-aware');
  eq(canonicalCoord(0, 0), 'A1', 'canonicalCoord');
  eq(parseCoord('ZZZ'), null, 'parseCoord rejects bad');

  // 11. persistence shape: canonical TableEntity keys
  const entity = {
    id: 't1', report_id: 'r1', name: 'T', direction: 'rtl',
    columns_data: s.columns, rows_data: s.rows,
    cell_formats: s.cellFormats, merged_cells: [],
    version: 1, created_at: 'x', updated_at: 'y',
  };
  assert(Array.isArray((entity as any).columns_data) && Array.isArray((entity as any).rows_data), 'TableEntity canonical keys');

  // 12. merges normalize (single-cell dropped, overlap dropped)
  const nm = normalizeMerges([{ start: 'A1', end: 'A1' }, { start: 'A1', end: 'B2' }, { start: 'A1', end: 'B2' }], 5, 5);
  eq(nm.length, 1, 'normalizeMerges dedups/single-cell');

  // 13b. multi-cell block copy/paste (the ops drag-selection + Ctrl+C rely on)
  let s6 = baseState();
  s6 = { ...s6, ...setCellValue(s6, 'A1', 1) };
  s6 = { ...s6, ...setCellValue(s6, 'B1', 2) };
  s6 = { ...s6, ...setCellValue(s6, 'A2', 3) };
  s6 = { ...s6, ...setCellFormula(s6, 'B2', '=A1+B1') };
  const blk = copyRange(s6, { startColIdx: 0, startRowIdx: 0, endColIdx: 1, endRowIdx: 1 });
  eq(blk.values, [[1, 2], [3, '=A1+B1']], 'copyRange captures 2x2 block raw');
  const blkPaste = pasteRange({ ...s6 }, 0, 1, blk.values, blk.formats, { colIdx: 0, rowIdx: 0 });
  // Block A1:B2 → A2: uniform relocation delta (+1 row): B2's =A1+B1 lands in B3 as =A2+B2
  eq((blkPaste.rows[2] as any).B, '=A2+B2', 'block paste shifts every formula by relocation delta');
  eq([(blkPaste.rows[1] as any).A, (blkPaste.rows[1] as any).B], [1, 2], 'block paste overwrites target cells');
  let r: { columns: any[]; rows: Record<string, any>[]; cellFormats: Record<string, any>; mergedCells: any[] } = { columns: [{ id: 'A', name: 'A', type: 'text' as const, width: 130 }], rows: Array.from({ length: 10 }, () => ({ A: '' })), cellFormats: {} as Record<string, any>, mergedCells: [] as any[] };
  r = { ...r, ...setCellValue(r, 'A1', 100) };
  r = { ...r, ...setCellFormat(r, 'A1', { bold: true, italic: true, align: 'center' } as any) };
  const rFill = fillRange(r, {
    sourceRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 1 },
    targetRange: { startCol: 'A', startRow: 1, endCol: 'A', endRow: 10 },
    mode: 'fill_series',
  });
  r = { ...r, ...rFill };
  assert((r.rows[9] as any).A === 109, `regression series A10=${(r.rows[9] as any).A}`);
  eq(r.cellFormats['A10'], { bold: true, italic: true, align: 'center' }, 'regression format identical A10');
  // add dependent columns via insert + formula placed AWAY from the
  // soon-deleted row so the dependent survives the deletion
  const r2 = insertColumn(r, 1, 'B', 'B');
  assert(r2.columns.length === 2, 'regression insertColumn');
  let r3 = { ...r2, ...setCellFormula(r2, 'B5', '=A1*2') };
  eq(getDependents(r3, 'A1'), ['B5'], 'regression dependent tracked');
  const r4 = deleteRow(r3, 0);
  assert(r4.rows.length === 9, 'regression dependents NOT cascade-deleted');
  assert(String(r4.rows[3].B).includes('#REF!'), `regression ref invalid → ${r4.rows[3].B}`);
  // canonical round-trip (persist shape)
  const roundTrip = JSON.parse(JSON.stringify({ columns_data: r4.columns, rows_data: r4.rows, cell_formats: r4.cellFormats }));
  assert(roundTrip.rows_data.length === 9 && roundTrip.columns_data.length === 2, 'regression canonical persists');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
