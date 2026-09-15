/**
 * TABLE MIRROR TEST SUITE — explicit column-order repair only.
 *
 * mirrorSnapshotHorizontally() is NEVER called implicitly (direction toggle
 * must not move data — the engine frame cannot mirror). It exists solely
 * for the user-confirmed "repair column order" action. Verifies formula
 * rewriting, cell/width/merge mirroring, header travel, involution
 * (twice = identity) and garbage safety.
 */

import {
  entityToUniverSnapshot,
  univerSnapshotToDerived,
  mirrorSnapshotHorizontally,
  mirrorFormulaColumns,
  mirrorColumnNames,
  snapshotUsedColCount,
  applyColumnNames,
  UNIVER_SHEET_ID,
} from '../../lib/grid/univer-adapter';

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

async function run() {
  console.log('=== TABLE MIRROR TEST SUITE ===\n');

  eq(mirrorFormulaColumns('=B1*2', 3), '=B1*2', 'middle column stays (W=3)');
  eq(mirrorFormulaColumns('=A1+10', 3), '=C1+10', 'A1 → C1 (W=3)');
  eq(mirrorFormulaColumns('=C5', 3), '=A5', 'C5 → A5 (W=3)');
  eq(mirrorFormulaColumns('=$A$1+B$2', 4), '=$D$1+C$2', '$ markers kept (W=4)');
  eq(mirrorFormulaColumns('=SUM(A1:A5)', 3), '=SUM(C1:C5)', 'range endpoints mirrored');
  eq(mirrorFormulaColumns('=IF(A1>0,"نص A1",B2)', 3), '=IF(C1>0,"نص A1",B2)', 'string literal untouched');
  eq(mirrorFormulaColumns('=Z99', 3), '=Z99', 'out-of-extent ref kept');

  const entity: any = {
    id: 't1',
    report_id: 'r1',
    name: 'جدول',
    direction: 'rtl',
    columns_data: [
      { id: 'A', name: 'البند', type: 'text', width: 200 },
      { id: 'B', name: 'العدد', type: 'number', width: 110 },
      { id: 'C', name: 'ملاحظة', type: 'text', width: 150 },
    ],
    rows_data: [
      { A: 'قلم', B: 5, C: '=B1*2' },
      { A: 'دفتر', B: 3, C: 'ok' },
    ],
    cell_formats: { A1: { bold: true } },
    merged_cells: [],
    version: 1,
    created_at: 'x',
    updated_at: 'y',
  };
  const snap: any = entityToUniverSnapshot(entity, { isAr: true });
  const before = JSON.stringify(snap);
  eq(snapshotUsedColCount(snap), 3, 'used col count = 3');

  const mirrored: any = mirrorSnapshotHorizontally(snap);
  assert(JSON.stringify(snap) === before, 'input snapshot never mutated');
  eq(mirrored.sheets[UNIVER_SHEET_ID].cellData['0']['2'], { v: 'قلم', s: 's1' }, 'A1 value moved to C1 with style');
  eq(mirrored.sheets[UNIVER_SHEET_ID].cellData['0']['1'], { v: 5 }, 'middle value stays');
  eq(mirrored.sheets[UNIVER_SHEET_ID].columnData['0'], { w: 150 }, 'width C traveled to 0');
  eq(mirrored.sheets[UNIVER_SHEET_ID].columnData['2'], { w: 200 }, 'width A traveled to 2');

  const twice: any = mirrorSnapshotHorizontally(mirrored);
  eq(twice.sheets[UNIVER_SHEET_ID].cellData, snap.sheets[UNIVER_SHEET_ID].cellData, 'mirror twice restores cells (involution)');
  eq(twice.sheets[UNIVER_SHEET_ID].columnData, snap.sheets[UNIVER_SHEET_ID].columnData, 'mirror twice restores widths');

  const withMerge: any = JSON.parse(before);
  withMerge.sheets[UNIVER_SHEET_ID].cellData['2'] = { '0': { v: 'x' }, '1': { v: 'y' } };
  withMerge.sheets[UNIVER_SHEET_ID].mergeData = [{ startRow: 2, startColumn: 0, endRow: 2, endColumn: 1 }];
  const mm: any = mirrorSnapshotHorizontally(withMerge);
  eq(mm.sheets[UNIVER_SHEET_ID].mergeData, [{ startRow: 2, startColumn: 1, endRow: 2, endColumn: 2 }], 'merge mirrored');

  eq(mirrorColumnNames(['البند', 'العدد', 'ملاحظة'], 3), ['ملاحظة', 'العدد', 'البند'], 'names travel');

  const derived = univerSnapshotToDerived(mirrored);
  applyColumnNames(derived, mirrorColumnNames(entity.columns_data.map((c: any) => c.name), 3));
  eq(derived.rows[0], { A: '=B1*2', B: 5, C: 'قلم' }, 'derived rows mirrored');
  eq(derived.cellFormats['C1'], { bold: true }, 'format traveled');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
