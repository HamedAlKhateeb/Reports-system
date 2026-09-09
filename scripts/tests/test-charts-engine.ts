/**
 * Chart engine tests (headless, no browser):
 * Test 1: smart auto-detect (Month/Revenue/Expenses example from spec)
 * Test 2: resolve live data + update propagation (March 160 -> 200)
 * Test 3: all chart types produce valid ECharts options
 * Test 4: broken source (deleted column) -> missing + no crash
 * Test 5: native table detect + resolve
 * Test 6: validateSchema + AI verifyChartAction
 */
import {
  detectSmartColumns,
  detectNativeColumns,
  resolveFromSmart,
  resolveFromNative,
  buildEchartsOption,
  extractNativeTables,
  validateSchema,
} from '../../lib/charts/engine';
import { verifyChartAction } from '../../lib/charts/ai-tools';
import { normalizeChartType } from '../../lib/charts/types';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const smartTable: any = {
  id: 'table_17',
  name: 'Sales',
  columns_data: [
    { id: 'month', name: 'Month', type: 'text' },
    { id: 'revenue', name: 'Revenue', type: 'number' },
    { id: 'expenses', name: 'Expenses', type: 'number' },
  ],
  rows_data: [
    { month: 'Jan', revenue: 100, expenses: 70 },
    { month: 'Feb', revenue: 130, expenses: 90 },
    { month: 'Mar', revenue: 160, expenses: 100 },
  ],
};

// Test 1: auto-detect
const det = detectSmartColumns(smartTable);
ok('T1 category=month', det.category === 'month', JSON.stringify(det));
ok('T1 series=[revenue,expenses]', JSON.stringify(det.values) === JSON.stringify(['revenue', 'expenses']), JSON.stringify(det.values));

const schema: any = {
  chartId: 'cht_1',
  type: 'line',
  title: 'Revenue vs Expenses',
  source: { tableId: 'table_17', kind: 'smart', categoryColumn: 'month', valueColumns: ['revenue', 'expenses'] },
  showLegend: true,
};

// Test 2: resolve + live update
let r = resolveFromSmart(smartTable, schema);
ok('T2 categories', JSON.stringify(r.categories) === JSON.stringify(['Jan', 'Feb', 'Mar']), JSON.stringify(r.categories));
ok('T2 march revenue=160', r.series[0].values[2] === 160);
smartTable.rows_data[2].revenue = 200;
r = resolveFromSmart(smartTable, schema);
ok('T2 live update march=200', r.series[0].values[2] === 200, JSON.stringify(r.series[0].values));

// Test 3: all types build options
const types = ['bar', 'barH', 'line', 'area', 'pie', 'donut', 'scatter', 'stackedBar', 'groupedBar'] as const;
for (const t of types) {
  try {
    const opt = buildEchartsOption({ ...schema, type: t }, r);
    const hasSeries = Array.isArray(opt.series) && opt.series.length > 0;
    ok('T3 option ' + t, hasSeries, JSON.stringify(Object.keys(opt)));
  } catch (e: any) {
    ok('T3 option ' + t, false, String(e?.message));
  }
}

// Test 4: deleted column -> broken, no crash
const brokenSchema = { ...schema, source: { ...schema.source, valueColumns: ['revenue', 'deleted_col'] } };
const rb = resolveFromSmart(smartTable, brokenSchema);
ok('T4 missing reported', rb.missing.includes('deleted_col'), JSON.stringify(rb.missing));
try {
  buildEchartsOption(brokenSchema, rb);
  ok('T4 option still builds', true);
} catch { ok('T4 option still builds', false); }

// Test 5: native tables
const doc: any = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Month' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revenue' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Expenses' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jan' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '100' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '70' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Feb' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '130' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '90' }] }] },
        ]},
      ],
    },
  ],
};
const natives = extractNativeTables(doc);
ok('T5 one native table', natives.length === 1 && natives[0].headers.join(',') === 'Month,Revenue,Expenses', JSON.stringify(natives[0]?.headers));
const ndet = detectNativeColumns(natives[0]);
ok('T5 native detect', ndet.category === '0' && ndet.values.join(',') === '1,2', JSON.stringify(ndet));
const nschema: any = { chartId: 'c', type: 'bar', title: 't', source: { tableId: 'native:0', kind: 'native', categoryColumn: '0', valueColumns: ['1', '2'] } };
const nr = resolveFromNative(natives[0], nschema);
ok('T5 native resolve', nr.categories.join(',') === 'Jan,Feb' && nr.series[0].values[1] === 130, JSON.stringify(nr));

// Test 6: validation + AI tools
ok('T6 valid schema', validateSchema(schema).ok);
ok('T6 invalid schema', !validateSchema({ ...schema, source: { ...schema.source, valueColumns: [] } }).ok);
ok('T6 normalize aliases', normalizeChartType('column') === 'bar' && normalizeChartType('stacked') === 'stackedBar');
const verr = verifyChartAction({ name: 'create_chart', params: { type: 'line', source_table: 'nope', category: 'month', series: ['revenue'] } }, ['table_17'], []);
ok('T6 AI verify rejects unknown table', verr !== null, String(verr));
const vok = verifyChartAction({ name: 'create_chart', params: { type: 'line', source_table: 'table_17', category: 'month', series: ['revenue'] } }, ['table_17'], []);
ok('T6 AI verify accepts', vok === null, String(vok));
const vdel = verifyChartAction({ name: 'delete_chart', params: { chartId: 'nope' } }, [], ['cht_1']);
ok('T6 AI verify rejects unknown chart', vdel !== null);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
