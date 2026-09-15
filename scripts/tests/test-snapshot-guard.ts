/**
 * SNAPSHOT GUARD TEST SUITE — sanitizeSnapshotForBoot().
 *
 * The engine must never receive a structurally insane workbook (it can hang
 * the renderer and freeze the tab on open). Verifies: valid snapshots pass
 * through untouched, out-of-bounds cells/merges are pruned, absurd
 * dimensions are refused (null → caller rebuilds from derived cache), and
 * garbage never throws.
 */

import {
  entityToUniverSnapshot,
  sanitizeSnapshotForBoot,
  UNIVER_SHEET_ID,
  UNIVER_GRID_CAP,
} from '../../lib/grid/univer-adapter';

let passed = 0;
let failed = 0;
function assert(c: boolean, msg: string) {
  if (c) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg}`); failed++; }
}

function baseEntity(): any {
  return {
    id: 't1',
    report_id: 'r1',
    name: 'جدول',
    direction: 'rtl',
    columns_data: [
      { id: 'A', name: 'البند', type: 'text', width: 200 },
      { id: 'B', name: 'العدد', type: 'number', width: 110 },
    ],
    rows_data: [{ A: 'قلم', B: 5 }],
    cell_formats: {},
    merged_cells: [],
    version: 1,
    created_at: 'x',
    updated_at: 'y',
  };
}

async function run() {
  console.log('=== SNAPSHOT GUARD TEST SUITE ===\n');

  // 1. Valid snapshot passes through (same reference, untouched).
  const good: any = entityToUniverSnapshot(baseEntity(), { isAr: true });
  const goodJson = JSON.stringify(good);
  assert(sanitizeSnapshotForBoot(good) === good, 'valid snapshot passes through untouched');
  assert(JSON.stringify(good) === goodJson, 'valid snapshot not mutated');

  // 2. Out-of-bounds cells pruned, valid cells kept.
  const oob: any = JSON.parse(goodJson);
  oob.sheets[UNIVER_SHEET_ID].cellData['500'] = { '0': { v: 'far' } };
  oob.sheets[UNIVER_SHEET_ID].cellData['0']['99'] = { v: 'wide' };
  const pruned: any = sanitizeSnapshotForBoot(oob);
  assert(pruned !== null, 'prunable snapshot accepted');
  assert(pruned.sheets[UNIVER_SHEET_ID].cellData['500'] === undefined, 'row 500 pruned');
  assert(pruned.sheets[UNIVER_SHEET_ID].cellData['0']['99'] === undefined, 'col 99 pruned');
  assert(pruned.sheets[UNIVER_SHEET_ID].cellData['0']['0'].v === 'قلم', 'valid cell kept');

  // 3. Absurd dimensions refused.
  const huge: any = JSON.parse(goodJson);
  huge.sheets[UNIVER_SHEET_ID].rowCount = 1000000;
  assert(sanitizeSnapshotForBoot(huge) === null, 'million-row snapshot refused');
  const wide: any = JSON.parse(goodJson);
  wide.sheets[UNIVER_SHEET_ID].columnCount = 5000;
  assert(sanitizeSnapshotForBoot(wide) === null, '5000-col snapshot refused');

  // 4. Bad merges dropped, good merges kept.
  const mg: any = JSON.parse(goodJson);
  mg.sheets[UNIVER_SHEET_ID].cellData['1'] = { '0': { v: 'a' }, '1': { v: 'b' } };
  mg.sheets[UNIVER_SHEET_ID].mergeData = [
    { startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 },
    { startRow: 0, startColumn: 0, endRow: 9999, endColumn: 9999 },
    'garbage',
  ];
  const mgOut: any = sanitizeSnapshotForBoot(mg);
  assert(
    Array.isArray(mgOut.sheets[UNIVER_SHEET_ID].mergeData) &&
      mgOut.sheets[UNIVER_SHEET_ID].mergeData.length === 1,
    'only the sane merge survives'
  );

  // 5. Garbage never throws, always null (or safe object).
  for (const bad of [null, undefined, 42, 'x', {}, { sheets: null }, { sheets: {}, sheetOrder: [] }]) {
    let out: any = 'threw';
    try {
      out = sanitizeSnapshotForBoot(bad);
    } catch {
      out = 'threw';
    }
    assert(out === null || (out && typeof out === 'object'), `garbage safe: ${JSON.stringify(bad)?.slice(0, 30)}`);
  }
  assert(
    sanitizeSnapshotForBoot({ sheets: { a: { id: 'a' } }, sheetOrder: ['a'], styles: {} }) !== null,
    'minimal sheet accepted'
  );

  // 6. Caps respected constants.
  assert(UNIVER_GRID_CAP.ROWS === 200 && UNIVER_GRID_CAP.COLS === 26, 'grid caps 200x26');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
