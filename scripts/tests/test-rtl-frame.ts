/**
 * RTL FRAME TEST SUITE — Excel-style right-to-left sheet frame math.
 *
 * Verifies the PURE part of the RTL frame solution (no Univer runtime):
 * 1. Scene/content mirroring is an involution (mirror twice = identity).
 * 2. Column A lands at the right, row header at the right, total width kept.
 * 3. Viewport mirroring rule (swap vs re-anchor) + fresh-open scroll target.
 * 4. RTL gate reads only the worksheet rightToLeft flag.
 */

import {
  rtlSceneWidth,
  mirrorScenePoint,
  mirrorSceneRect,
  mirrorContentPoint,
  mirrorContentRect,
  mirrorViewBoundX,
  mirrorViewportH,
  rtlInitialViewportScrollX,
  mirrorTextAlign,
  mirrorColumnOffset,
  isRtlFlag,
} from '../../lib/grid/rtl-frame-math';
import { isRtlSkeleton } from '../../lib/grid/univer-rtl-frame';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
function assert(c: boolean, msg: string) {
  if (c) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg}`); failed++; }
}
function eq(a: any, b: any, msg: string) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg} -> expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++; }
}

// Sheet geometry fixture: 3 columns (100, 140, 200) + row header 44.
// LTR scene: [header 0..44][A 44..144][B 144..284][C 284..484], S = 484.
const W = 440;
const L = 44;
const S = W + L;

async function run() {
  console.log('=== RTL FRAME TEST SUITE ===\n');

  // 1. scene width + involution
  eq(rtlSceneWidth(W, L), S, 'scene width = columns + header');
  eq(mirrorScenePoint(mirrorScenePoint(100, S), S), 100, 'point mirror is involution');
  eq(
    mirrorSceneRect(mirrorSceneRect({ startX: 44, endX: 144 }, S), S),
    { startX: 44, endX: 144 },
    'rect mirror is involution'
  );
  eq(
    mirrorContentRect(mirrorContentRect({ startX: 0, endX: 100 }, W), W),
    { startX: 0, endX: 100 },
    'content mirror is involution'
  );

  // 2. Excel layout: column A (LTR 44..144) -> RTL right edge (340..440)
  eq(mirrorSceneRect({ startX: 44, endX: 144 }, S), { startX: 340, endX: 440 }, 'column A lands at the right');
  eq(mirrorSceneRect({ startX: 284, endX: 484 }, S), { startX: 0, endX: 200 }, 'column C lands at the left');
  eq(mirrorScenePoint(0, S), S, 'scene origin mirrors to scene end');
  // header=false content space: A is [0..100] -> [340..440]
  eq(mirrorContentRect({ startX: 0, endX: 100 }, W), { startX: 340, endX: 440 }, 'content-space A lands right');
  assert(mirrorContentPoint(0, W) === W, 'content origin mirrors to content end');

  // 3. view bounds mirror (top/bottom untouched by caller; left/right swap)
  eq(
    mirrorViewBoundX({ left: 44, right: 300, top: 10, bottom: 50 }, S),
    { left: 184, right: 440, top: 10, bottom: 50 },
    'view bound mirrors left/right only'
  );

  // 4. viewport rule: left+right swaps; width keeps width and re-anchors
  eq(mirrorViewportH({ left: 44, right: 0, width: null }, 800), { left: 0, right: 44 }, 'viewMain swaps left/right');
  eq(
    mirrorViewportH({ left: 0, right: 0, width: 45 }, 800),
    { left: 755, right: 0 },
    'row-header viewport re-anchors right'
  );
  // width-mode result keeps covering the same width
  const m = mirrorViewportH({ left: 44, right: 0, width: 120 }, 800);
  eq(m.left + 120, 800 - 44, 'frozen viewport keeps width, mirrored position');

  // 5. fresh-open scroll: A visible at the right edge
  eq(rtlInitialViewportScrollX(440, 300), 140, 'initial scroll = W - viewport');
  eq(rtlInitialViewportScrollX(200, 300), 0, 'narrow sheet clamps to 0');
  eq(rtlInitialViewportScrollX(NaN, 300), 0, 'garbage safe');

  // 6. text align + intra-cell offset
  eq(mirrorTextAlign('left'), 'right', 'align left<->right');
  eq(mirrorTextAlign('right'), 'left', 'align right<->left');
  eq(mirrorTextAlign('center'), 'center', 'align center stays');
  eq(mirrorColumnOffset(30, 100), 70, 'intra-cell offset mirrors');
  eq(mirrorColumnOffset(0, 0), 0, 'degenerate width safe');

  // 7. gate: only rightToLeft === 1
  assert(isRtlFlag(1) === true, 'flag 1 is RTL');
  assert(isRtlFlag(0) === false, 'flag 0 is LTR');
  assert(isRtlFlag(undefined) === false, 'missing flag is LTR');
  const rtlWs = { getConfig: () => ({ rightToLeft: 1 }) };
  const ltrWs = { getConfig: () => ({ rightToLeft: 0 }) };
  assert(isRtlSkeleton({ worksheet: rtlWs }) === true, 'skeleton gate opens for RTL sheet');
  assert(isRtlSkeleton({ worksheet: ltrWs }) === false, 'skeleton gate closed for LTR sheet');
  assert(isRtlSkeleton(null) === false, 'null skeleton safe');
  assert(isRtlSkeleton({}) === false, 'skeleton without worksheet safe');

  // 8. patch-surface audit: every engine method the RTL frame patches must
  // exist in the INSTALLED bundles. If a vendor upgrade renames one, this
  // fails loudly instead of silently disabling the mirror.
  console.log('\n  -- patch-surface audit (@univerjs 0.25.1 bundles) --');
  let coreSrc = '';
  let engineSrc = '';
  let sheetsUiSrc = '';
  try {
    coreSrc = fs.readFileSync(path.resolve('node_modules/@univerjs/core/lib/cjs/index.js'), 'utf8');
  } catch {}
  try {
    engineSrc = fs.readFileSync(path.resolve('node_modules/@univerjs/engine-render/lib/cjs/index.js'), 'utf8');
  } catch {}
  try {
    sheetsUiSrc = fs.readFileSync(path.resolve('node_modules/@univerjs/sheets-ui/lib/cjs/index.js'), 'utf8');
  } catch {}
  assert(coreSrc.length > 100000, 'core bundle readable');
  assert(engineSrc.length > 100000, 'engine-render bundle readable');
  assert(sheetsUiSrc.length > 100000, 'sheets-ui bundle readable');
  const coreTargets = [
    'getCellWithCoordByIndex(row, column, header',
    'getNoMergeCellWithCoordByIndex(rowIndex',
    'getOffsetByColumn(column)',
    'getColumnIndexByOffsetX(evtOffsetX',
    'getOffsetRelativeToRowCol(offsetX',
  ];
  for (const t of coreTargets) assert(coreSrc.includes(t), `core patch target present: ${t.slice(0, 42)}`);
  const engineTargets = [
    '_getRangeByViewBounding(rowHeightAccumulation',
    'paintNewAreaForScrolling(viewportInfo, param)',
    'var Spreadsheet = class extends SheetComponent',
    'var SpreadsheetColumnHeader = class',
    'var SpreadsheetRowHeader = class',
    'var ColumnHeaderLayout = class',
    'var Font = class extends SheetExtension',
    '_clipByRenderBounds(renderFontContext',
    '_renderDocuments(ctx, row, col, renderFontCtx',
  ];
  for (const t of engineTargets) assert(engineSrc.includes(t), `engine patch target present: ${t.slice(0, 42)}`);
  // Corner placeholder is created by sheets-ui (SheetRenderController) but
  // lives on the scene, so scene.getObject() still reaches it.
  assert(
    sheetsUiSrc.includes('__SpreadsheetLeftTopPlaceholder__'),
    'sheets-ui creates the corner placeholder (scene-reachable)'
  );

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
