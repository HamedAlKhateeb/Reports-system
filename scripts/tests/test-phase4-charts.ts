/**
 * PHASE 4 (CHARTS / B17) MANDATORY TEST SUITE
 *
 * - Native fingerprint rebinding survives inserting a table ABOVE the source.
 * - Legacy charts (no fingerprint) keep positional behavior.
 * - chartDataTable() activates the data-table export (capped, formatted).
 */

import {
  extractNativeTables,
  nativeFingerprint,
  resolveNativeWithFallback,
  resolveFromNative,
} from '../../lib/charts/engine';
import { chartDataTable } from '../../lib/charts/export-helpers';

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function nativeTable(headers: string[], rows: string[][]) {
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: headers.map((h) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: h }] }] })) },
      ...rows.map((r) => ({ type: 'tableRow', content: r.map((c) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: c }] }] })) })),
    ],
  };
}

console.log('\n=== PHASE 4 / B17: NATIVE REBINDING ===\n');

const salesHeaders = ['Product', 'Q1', 'Q2'];
const salesRows = [['A', '10', '20'], ['B', '30', '40']];
const otherHeaders = ['X', 'Y'];
const otherRows = [['x', '1']];

// Chart created against native:0 (sales table).
const docV1: any = { type: 'doc', content: [nativeTable(salesHeaders, salesRows)] };
const nativesV1 = extractNativeTables(docV1);
eq(nativesV1.length, 1, 'B17: one native table extracted');
const fp = nativeFingerprint(nativesV1[0]);
eq(typeof fp === 'string' && fp.length > 0, true, 'B17: fingerprint is non-empty');

// Insert a table ABOVE → source shifts to native:1.
const docV2: any = {
  type: 'doc',
  content: [nativeTable(otherHeaders, otherRows), nativeTable(salesHeaders, salesRows)],
};
const nativesV2 = extractNativeTables(docV2);
eq(nativesV2[1].key, 'native:1', 'B17: source shifted to native:1 after insert-above');

// Old positional resolve now binds the WRONG table...
const wrong = resolveFromNative(nativesV2.find((n) => n.key === 'native:0') || null, {
  chartId: 'c',
  type: 'bar',
  title: '',
  source: { tableId: 'native:0', kind: 'native', categoryColumn: '0', valueColumns: ['1'] },
} as any);
eq(wrong.categories, ['x'], 'B17: positional resolve binds the WRONG table (bug reproduced)');

// ...while fingerprint fallback heals it.
const healed = resolveNativeWithFallback(nativesV2, 'native:0', fp);
eq(healed.info?.key, 'native:1', 'B17: fingerprint rebinds to the moved table');
eq(healed.rebound, true, 'B17: rebound flag set');
const healedData = resolveFromNative(healed.info, {
  chartId: 'c',
  type: 'bar',
  title: '',
  source: { tableId: 'native:0', kind: 'native', categoryColumn: '0', valueColumns: ['1'] },
} as any);
eq(healedData.categories, ['A', 'B'], 'B17: healed resolve returns original data');
eq(healedData.series[0].values, [10, 30], 'B17: healed series values correct');

// Legacy (no fingerprint): positional behavior preserved.
const legacy = resolveNativeWithFallback(nativesV2, 'native:0', null);
eq(legacy.info?.key, 'native:0', 'B17: legacy charts keep positional match');
eq(legacy.rebound, false, 'B17: legacy never rebounds');

// Deleted source → null (explicit broken, not silent wrong data).
const gone = resolveNativeWithFallback(
  extractNativeTables({ type: 'doc', content: [nativeTable(otherHeaders, otherRows)] }),
  'native:0',
  fp
);
eq(gone.info, null, 'B17: deleted source resolves to null (broken, explicit)');

console.log('\n=== PHASE 4 / B17: DATA-TABLE EXPORT ===\n');

const chartNode: any = {
  type: 'reportChart',
  attrs: {
    chartId: 'c1',
    type: 'bar',
    title: 'Sales',
    sourceTableId: 'native:0',
    sourceKind: 'native',
    sourceFingerprint: fp,
    categoryColumn: '0',
    valueColumns: ['1', '2'],
  },
};
const dt = chartDataTable(chartNode, docV2, {}, 50, 'Item');
eq(dt.broken, false, 'B17: data table resolves after insert-above');
eq(dt.headers, ['Item', 'Q1', 'Q2'], 'B17: headers shaped');
eq(dt.rows, [['A', '10', '20'], ['B', '30', '40']], 'B17: rows shaped');
eq(dt.truncated, false, 'B17: small table not truncated');

const dtCap = chartDataTable(chartNode, docV2, {}, 1, 'Item');
eq(dtCap.rows.length, 1, 'B17: rows capped');
eq(dtCap.truncated, true, 'B17: truncation flagged');
eq(dtCap.totalRows, 2, 'B17: total preserved');

const brokenNode: any = {
  type: 'reportChart',
  attrs: { chartId: 'c2', type: 'bar', title: 'Gone', sourceTableId: 'native:9', sourceKind: 'native', categoryColumn: '0', valueColumns: ['1'] },
};
eq(chartDataTable(brokenNode, docV2, {}).broken, true, 'B17: missing source marked broken');

console.log('\n=== PHASE 4: TEST SUMMARY ===\n');
console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
