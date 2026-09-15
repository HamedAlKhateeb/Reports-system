/**
 * UNIVER ADAPTER TEST SUITE — TableEntity <-> Univer snapshot bridge.
 *
 * Verifies (pure data, no Univer runtime):
 * 1. entity → snapshot: values, formulas, style dedupe, merges, widths, RTL
 * 2. snapshot → derived: round-trip back to canonical rows/formats/merges
 * 3. lazy-migration detection (old tables vs migrated tables)
 * 4. caps respected (200 rows x 26 cols), garbage-tolerant (never throws)
 */

import {
  entityToUniverSnapshot,
  univerSnapshotToDerived,
  needsUniverMigration,
  cellFormatToUniverStyle,
  univerStyleToCellFormat,
  applyColumnNames,
  normalizeDivergentRichText,
  UNIVER_SHEET_ID,
  UNIVER_GRID_CAP,
} from '../../lib/grid/univer-adapter';

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

function legacyEntity() {
  return {
    id: 't1',
    report_id: 'r1',
    name: 'تقرير المبيعات',
    direction: 'rtl',
    columns_data: [
      { id: 'A', name: 'البند', type: 'text', width: 200 },
      { id: 'B', name: 'العدد', type: 'number', width: 110 },
    ],
    rows_data: [
      { A: 'قلم', B: 5 },
      { A: 'دفتر', B: '=B1*2' },
      { A: '', B: '' },
    ],
    cell_formats: {
      A1: { bold: true, align: 'center' },
      A2: { bold: true, align: 'center' },
      B2: { italic: true },
    },
    merged_cells: [{ start: 'A3', end: 'B3' }],
    version: 1,
    created_at: 'x',
    updated_at: 'y',
  } as any;
}

async function run() {
  console.log('=== UNIVER ADAPTER TEST SUITE ===\n');

  // 1. migration detection
  assert(needsUniverMigration(legacyEntity()) === true, 'legacy entity needs migration');
  assert(needsUniverMigration({ ...legacyEntity(), univerSnapshot: { sheets: {} } }) === false, 'migrated entity skipped');
  assert(needsUniverMigration(null) === false, 'null safe');
  assert(needsUniverMigration({} as any) === true, 'object without snapshot needs migration');

  // 2. entity → snapshot structure
  const snap: any = entityToUniverSnapshot(legacyEntity(), { isAr: true });
  eq(snap.sheetOrder, [UNIVER_SHEET_ID], 'single sheet order');
  const sheet = snap.sheets[UNIVER_SHEET_ID];
  assert(sheet.rightToLeft === 1, 'RTL flag from entity direction');
  eq(sheet.rowCount, UNIVER_GRID_CAP.ROWS, 'row cap mirrors legacy limits');
  eq(sheet.columnCount, UNIVER_GRID_CAP.COLS, 'col cap mirrors legacy limits');
  eq(sheet.cellData['0']['0'], { v: 'قلم', s: 's1' }, 'text cell with style ref');
  eq(sheet.cellData['0']['1'], { v: 5 }, 'number cell, no style');
  eq(sheet.cellData['1']['1'].f, '=B1*2', 'formula preserved raw');
  assert(sheet.cellData['2'] === undefined, 'empty row omitted from snapshot');
  eq(Object.keys(snap.styles).length, 2, 'identical formats deduped to 2 styles');
  eq(sheet.mergeData, [{ startRow: 2, startColumn: 0, endRow: 2, endColumn: 1 }], 'merge A3:B3 mapped');
  eq(sheet.columnData['0'], { w: 200 }, 'column width carried');
  eq(sheet.name, 'تقرير المبيعات', 'sheet name from entity');

  // 3. LTR entity
  const ltr = entityToUniverSnapshot({ ...legacyEntity(), direction: 'ltr' });
  assert((ltr.sheets[UNIVER_SHEET_ID] as any).rightToLeft === 0, 'LTR flag');

  // 4. style mapping both directions
  eq(cellFormatToUniverStyle({ bold: true, align: 'right' } as any), { ht: 3, bl: 1 }, 'format→style');
  eq(univerStyleToCellFormat({ ht: 2, bl: 1, it: 1, ul: { s: 1 } } as any), { align: 'center', bold: true, italic: true, underline: true }, 'style→format');
  eq(univerStyleToCellFormat(null), null, 'null style safe');
  eq(univerStyleToCellFormat({ bg: { rgb: '#ff0000' } } as any), null, 'color-only style folds to null (documented lossy)');

  // 5. snapshot → derived round-trip
  const derived = univerSnapshotToDerived(snap);
  eq(derived.rows.length, 2, 'derived trims empty padding rows');
  eq(derived.columns.length, 2, 'derived trims padding cols');
  eq(derived.rows[0], { A: 'قلم', B: 5 }, 'values round-trip');
  eq(derived.rows[1], { A: 'دفتر', B: '=B1*2' }, 'formula round-trips raw');
  eq(derived.cellFormats['A1'], { align: 'center', bold: true }, 'format round-trips');
  eq(derived.cellFormats['B2'], { italic: true }, 'italic round-trips');
  eq(derived.mergedCells, [], 'out-of-extent merge dropped (A3:B3 beyond 2 used rows)');
  eq(derived.direction, 'rtl', 'direction round-trips');

  // 5b. merge inside used extent survives
  const withMerge: any = JSON.parse(JSON.stringify(snap));
  withMerge.sheets[UNIVER_SHEET_ID].cellData['2'] = { '0': { v: 'x' } };
  withMerge.sheets[UNIVER_SHEET_ID].mergeData = [{ startRow: 1, startColumn: 0, endRow: 2, endColumn: 1 }];
  const d2 = univerSnapshotToDerived(withMerge);
  eq(d2.mergedCells, [{ start: 'A2', end: 'B3' }], 'in-extent merge round-trips');

  // 6. column names re-applied (Univer has no column-name concept)
  applyColumnNames(derived, ['البند', 'العدد']);
  eq([derived.columns[0].name, derived.columns[1].name], ['البند', 'العدد'], 'header names preserved for exports');

  // 7. garbage tolerance
  const bad = univerSnapshotToDerived(null as any);
  assert(Array.isArray(bad.rows) && bad.rows.length === 1, 'null snapshot → fallback, never throws');
  const bad2 = univerSnapshotToDerived({ sheets: { x: { mergeData: [{ startRow: 5, startColumn: 5, endRow: 5, endColumn: 5 }] } } } as any);
  eq(bad2.mergedCells, [], 'single-cell merge dropped');
  const badEntity = entityToUniverSnapshot({} as any);
  assert(!!badEntity.sheets[UNIVER_SHEET_ID], 'empty entity → valid snapshot, never throws');

  // 8. full legacy → univer → derived → legacy-shape parity
  const src = legacyEntity();
  const round = univerSnapshotToDerived(entityToUniverSnapshot(src));
  applyColumnNames(round, src.columns_data.map((c: any) => c.name));
  eq(round.rows.slice(0, 2), src.rows_data.slice(0, 2), 'values parity (used extent)');
  eq(round.cellFormats, src.cell_formats, 'formats parity');

  // 9. divergent rich-text healing (display `p` vs canonical `v`)
  const richSnap = (cell: any) => ({
    sheets: { 'sheet-1': { cellData: { 0: { 1: cell } } } },
  });
  const rev = richSnap({
    v: 'حامد الخطيب',
    p: { body: { dataStream: 'بيطخلا دماح\r\n', textRuns: [{ st: 0, ed: 11 }], paragraphs: [{ startIndex: 11 }] } },
  });
  const healed = normalizeDivergentRichText(rev);
  eq(healed.fixed, 1, 'divergent p detected');
  eq(healed.snapshot.sheets['sheet-1'].cellData[0][1].v, 'حامد الخطيب', 'value kept');
  assert(!('p' in healed.snapshot.sheets['sheet-1'].cellData[0][1]), 'divergent p dropped');
  assert('p' in rev.sheets['sheet-1'].cellData[0][1], 'input never mutated');
  const sameP = richSnap({
    v: 'حامد الخطيب',
    p: { body: { dataStream: 'حامد الخطيب\r\n', textRuns: [{ st: 0, ed: 4, ts: { bl: 1 } }] } },
  });
  const kept = normalizeDivergentRichText(sameP);
  eq(kept.fixed, 0, 'matching rich body kept (formatting preserved)');
  assert(kept.snapshot === sameP, 'clean snapshot returns same ref');
  const formula = richSnap({ f: '=A1', v: 'x', p: { body: { dataStream: 'DIFFERENT\r\n' } } });
  eq(normalizeDivergentRichText(formula).fixed, 0, 'formula cells untouched');
  eq(normalizeDivergentRichText(null).fixed, 0, 'null safe');
  eq(normalizeDivergentRichText({}).fixed, 0, 'empty safe');
  eq(normalizeDivergentRichText({ sheets: null }).fixed, 0, 'null sheets safe');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
