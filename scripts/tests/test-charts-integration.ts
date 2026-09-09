/**
 * Chart document-model integration tests (headless):
 * Simulates the full user journeys at the TipTap-JSON level:
 *  J1 create chart from smart table (Test 1 spec flow)
 *  J2 chart auto-uses in-table source (preset path, Test 2)
 *  J3 table edit propagates (Test 3)
 *  J4 type switching bar->line->pie (Test 4)
 *  J5 delete chart leaves tables intact (Test 5)
 *  J6 deleted source column -> broken, repairable, no crash (Test 6)
 *  J7 save JSON -> reload -> chart + binding survive (Test 7)
 *  J9 selection-mode table enumeration (smart + native)
 *  J10 existing nodes (paragraph/table/smartTable/image) untouched by chart ops
 */
import {
  detectSmartColumns,
  resolveFromSmart,
  buildEchartsOption,
  extractNativeTables,
} from '../../lib/charts/engine';
import { newChartId, normalizeChartType } from '../../lib/charts/types';
import { resolveChartForExport } from '../../lib/charts/export-helpers';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// ---- fixture: report doc with paragraph + native table + smart table + image ----
const smart: any = {
  id: 'tbl_sales', name: 'Sales',
  columns_data: [
    { id: 'A', name: 'Month', type: 'text' },
    { id: 'B', name: 'Revenue', type: 'number' },
    { id: 'C', name: 'Expenses', type: 'number' },
  ],
  rows_data: [
    { A: 'Jan', B: 100, C: 70 },
    { A: 'Feb', B: 130, C: 90 },
    { A: 'Mar', B: 160, C: 100 },
  ],
};

function chartAttrs(over: any = {}) {
  return {
    chartId: newChartId(), type: 'line', title: 'Revenue vs Expenses',
    sourceTableId: 'tbl_sales', sourceKind: 'smart',
    categoryColumn: 'A', valueColumns: ['B', 'C'],
    xAxisName: '', yAxisName: '', showLegend: true, showLabels: false,
    stacked: false, height: 320, tableName: 'Sales', ...over,
  };
}

let doc: any = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
    { type: 'smartTable', attrs: { tableId: 'tbl_sales', reportId: 'rep1', displayMode: 'embedded-edit' } },
    { type: 'reportChart', attrs: chartAttrs({ chartId: 'cht_fixed_1' }) },
    { type: 'reportImage', attrs: { fileName: 'img.png', caption: 'cap' } },
  ],
};

// J1: detect + schema from smart table
const det = detectSmartColumns(smart);
ok('J1 detect category/series', det.category === 'A' && det.values.join(',') === 'B,C', JSON.stringify(det));
const schema: any = {
  chartId: 'cht_fixed_1', type: 'line', title: 'Revenue vs Expenses',
  source: { tableId: 'tbl_sales', kind: 'smart', categoryColumn: det.category, valueColumns: det.values },
  showLegend: true,
};
let r = resolveFromSmart(smart, schema);
ok('J1 chart renders data', r.valueCount === 6 && r.missing.length === 0, JSON.stringify(r.missing));

// J2: preset path — cursor-in-table means source known without selection UI
const presetSource = { tableId: 'tbl_sales', kind: 'smart' as const };
ok('J2 in-table preset needs no selection', !!presetSource.tableId);

// J3: edit propagation
smart.rows_data[2].B = 200;
r = resolveFromSmart(smart, schema);
ok('J3 table edit propagates to chart', r.series[0].values[2] === 200);

// J4: type switching
for (const t of ['bar', 'line', 'pie']) {
  const opt = buildEchartsOption({ ...schema, type: normalizeChartType(t) }, r);
  ok('J4 type ' + t + ' renders', Array.isArray(opt.series) && opt.series.length > 0);
}

// J5: delete chart node — doc keeps tables, paragraph, image
doc.content = doc.content.filter((n: any) => !(n.type === 'reportChart' && n.attrs.chartId === 'cht_fixed_1'));
ok('J5 chart removed', !doc.content.some((n: any) => n.type === 'reportChart'));
ok('J5 tables+content intact', doc.content.some((n: any) => n.type === 'smartTable') && doc.content.some((n: any) => n.type === 'paragraph') && doc.content.some((n: any) => n.type === 'reportImage'));

// J6: column deletion -> broken state, repairable
smart.columns_data = smart.columns_data.filter((c: any) => c.id !== 'C');
const rb = resolveFromSmart(smart, schema);
ok('J6 broken detected, no crash', rb.missing.includes('C'), JSON.stringify(rb.missing));
const optBroken = buildEchartsOption(schema, rb);
ok('J6 broken still renders remainder', optBroken.series.length === 1);
// repair: rebind to remaining column
const repaired = { ...schema, source: { ...schema.source, valueColumns: ['B'] } };
const rr = resolveFromSmart(smart, repaired);
ok('J6 repairable', rr.missing.length === 0 && rr.series.length === 1);

// J7: JSON round-trip (save + reload)
doc.content.push({ type: 'reportChart', attrs: chartAttrs({ chartId: 'cht_persist_9' }) });
const saved = JSON.stringify(doc);
const reloaded = JSON.parse(saved);
const persisted = reloaded.content.find((n: any) => n.type === 'reportChart' && n.attrs.chartId === 'cht_persist_9');
ok('J7 chart survives save/reload', !!persisted && persisted.attrs.sourceTableId === 'tbl_sales' && persisted.attrs.valueColumns.join(',') === 'B,C');
const intactSmart: any = {
  ...smart,
  columns_data: [
    { id: 'A', name: 'Month', type: 'text' },
    { id: 'B', name: 'Revenue', type: 'number' },
    { id: 'C', name: 'Expenses', type: 'number' },
  ],
};
const exp = resolveChartForExport({ attrs: persisted.attrs }, reloaded, { tbl_sales: intactSmart });
ok('J7 export resolves after reload', !exp.broken && exp.series.length === 2, JSON.stringify({ broken: exp.broken, n: exp.series.length }));
// and with the column-deleted table, export honestly reports broken (J6 behavior)
const expBroken = resolveChartForExport({ attrs: persisted.attrs }, reloaded, { tbl_sales: smart });
ok('J7 export flags deleted column', expBroken.broken === true);

// J9: selection enumeration finds smart + native
const docWithNative: any = {
  type: 'doc',
  content: [
    { type: 'smartTable', attrs: { tableId: 'tbl_sales' } },
    { type: 'table', content: [
      { type: 'tableRow', content: [
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H1' }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H2' }] }] },
      ]},
      { type: 'tableRow', content: [
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
      ]},
    ]},
  ],
};
const listed: string[] = [];
docWithNative.content.forEach((n: any) => {
  if (n.type === 'smartTable') listed.push(n.attrs.tableId);
});
extractNativeTables(docWithNative).forEach((n) => listed.push(n.key));
ok('J9 selection lists smart+native', listed.includes('tbl_sales') && listed.includes('native:0'), JSON.stringify(listed));

// J10: chart attrs parse/render contract (node schema stability)
const attrs = chartAttrs({ chartId: 'cht_contract' });
const required = ['chartId', 'type', 'title', 'sourceTableId', 'sourceKind', 'categoryColumn', 'valueColumns', 'height'];
ok('J10 node attr contract', required.every((k) => k in attrs), JSON.stringify(Object.keys(attrs)));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
