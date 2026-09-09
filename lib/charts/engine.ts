/**
 * Chart Engine — the ONLY place that talks ECharts.
 *
 * Flow:  AI / Builder  →  ChartSchema (simple JSON)  →  buildEchartsOption()  →  Apache ECharts
 *
 * Nothing else in the app should hand-write ECharts config.
 */
import type { ChartSchema, ChartType, ResolvedChartData } from './types';
import { isPieLike } from './types';

export interface NativeTableInfo {
  key: string; // e.g. "native:0"
  index: number;
  headers: string[];
  rows: string[][];
}

export interface SmartTableLike {
  id: string;
  name: string;
  columns_data: Array<{ id: string; name: string; type?: string }>;
  rows_data: Array<Record<string, any>>;
}

/* ------------------------------------------------------------------ */
/* Numeric parsing (Arabic-Indic digits, %, currency symbols, commas)  */
/* ------------------------------------------------------------------ */

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  // Arabic-Indic digits → ASCII
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  s = s.replace(/[%٪]/g, '').replace(/,/g, '');
  // strip common currency words/symbols
  s = s.replace(/(ر\.?س|SAR|USD|\$|€|£|جنيه|دينار|درهم|ريال)/gi, '').trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Auto-detection: first text-ish column → category, numeric → series  */
/* ------------------------------------------------------------------ */

export interface DetectedColumns {
  category: string;
  values: string[];
  headers: string[];
}

function scoreNumericColumn(values: any[]): number {
  let hits = 0;
  for (const v of values) {
    if (v === null || v === undefined || String(v).trim() === '') continue;
    if (toNumber(v) !== null) hits++;
  }
  return values.length ? hits / values.length : 0;
}

export function detectSmartColumns(table: SmartTableLike): DetectedColumns {
  const cols = table.columns_data || [];
  const rows = table.rows_data || [];
  const headers = cols.map((c) => c.name || c.id);
  if (cols.length === 0) return { category: '', values: [], headers };
  const sample = rows.slice(0, 20);
  let category = cols[0].id;
  let bestTextScore = -1;
  for (const c of cols) {
    const vals = sample.map((r) => r?.[c.id]);
    const numericScore = scoreNumericColumn(vals);
    const textScore = 1 - numericScore;
    // prefer the left-most mostly-text column
    if (textScore > bestTextScore + 0.15) {
      bestTextScore = textScore;
      category = c.id;
    }
  }
  const values = cols
    .filter((c) => c.id !== category)
    .filter((c) => scoreNumericColumn(sample.map((r) => r?.[c.id])) >= 0.3)
    .map((c) => c.id);
  // fallback: if nothing numeric, take all non-category columns
  const finalValues = values.length > 0 ? values : cols.filter((c) => c.id !== category).map((c) => c.id);
  return { category, values: finalValues.slice(0, 6), headers };
}

export function detectNativeColumns(info: NativeTableInfo): DetectedColumns {
  const headers = info.headers;
  if (headers.length === 0) return { category: '0', values: [], headers };
  const sample = info.rows.slice(0, 20);
  let category = '0';
  let best = -1;
  for (let i = 0; i < headers.length; i++) {
    const vals = sample.map((r) => r?.[i]);
    const textScore = 1 - scoreNumericColumn(vals);
    if (textScore > best + 0.15) {
      best = textScore;
      category = String(i);
    }
  }
  const values: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (String(i) === category) continue;
    if (scoreNumericColumn(sample.map((r) => r?.[i])) >= 0.3) values.push(String(i));
  }
  const finalValues = values.length > 0
    ? values
    : headers.map((_, i) => String(i)).filter((k) => k !== category);
  return { category, values: finalValues.slice(0, 6), headers };
}

/* ------------------------------------------------------------------ */
/* Resolve live data from source                                       */
/* ------------------------------------------------------------------ */

function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('computedValue' in v) return cellText((v as any).computedValue ?? (v as any).value);
    if ('value' in v) return cellText((v as any).value);
    return '';
  }
  return String(v);
}

export function resolveFromSmart(table: SmartTableLike | null, schema: ChartSchema): ResolvedChartData {
  if (!table) return { categories: [], series: [], missing: [...schema.source.valueColumns, schema.source.categoryColumn], valueCount: 0 };
  const colIds = new Set((table.columns_data || []).map((c) => c.id));
  const missing: string[] = [];
  if (!colIds.has(schema.source.categoryColumn)) missing.push(schema.source.categoryColumn);
  for (const vc of schema.source.valueColumns) if (!colIds.has(vc)) missing.push(vc);
  const rows = table.rows_data || [];
  const categories = rows.map((r, i) => {
    const t = cellText(r?.[schema.source.categoryColumn]).trim();
    return t || `#${i + 1}`;
  });
  const series = schema.source.valueColumns
    .filter((vc) => colIds.has(vc))
    .map((vc) => {
      const col = table.columns_data.find((c) => c.id === vc);
      return {
        name: col?.name || vc,
        values: rows.map((r) => toNumber(cellText(r?.[vc]))),
      };
    });
  const valueCount = series.reduce((n, s) => n + s.values.filter((v) => v !== null).length, 0);
  return { categories, series, missing, valueCount };
}

export function resolveFromNative(info: NativeTableInfo | null, schema: ChartSchema): ResolvedChartData {
  if (!info) return { categories: [], series: [], missing: [...schema.source.valueColumns, schema.source.categoryColumn], valueCount: 0 };
  const n = info.headers.length;
  const catIdx = Number(schema.source.categoryColumn);
  const valIdx = schema.source.valueColumns.map(Number);
  const missing: string[] = [];
  if (!Number.isInteger(catIdx) || catIdx < 0 || catIdx >= n) missing.push(schema.source.categoryColumn);
  for (const v of schema.source.valueColumns) {
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i >= n) missing.push(v);
  }
  const categories = info.rows.map((r, i) => (r?.[catIdx] ?? '').trim() || `#${i + 1}`);
  const series = valIdx
    .filter((i) => Number.isInteger(i) && i >= 0 && i < n)
    .map((i) => ({
      name: info.headers[i] || `C${i + 1}`,
      values: info.rows.map((r) => toNumber(r?.[i])),
    }));
  const valueCount = series.reduce((cnt, s) => cnt + s.values.filter((v) => v !== null).length, 0);
  return { categories, series, missing, valueCount };
}

/* ------------------------------------------------------------------ */
/* Schema → ECharts option (single choke point)                        */
/* ------------------------------------------------------------------ */

const PALETTE = ['#2E4034', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#EC4899', '#84CC16'];

export function buildEchartsOption(schema: ChartSchema, data: ResolvedChartData): any {
  const type: ChartType = schema.type;
  const base: any = {
    color: PALETTE,
    animationDuration: 350,
    title: schema.title
      ? { text: schema.title, left: 'center', textStyle: { fontSize: 14, fontWeight: 600 } }
      : undefined,
    tooltip: { trigger: isPieLike(type) ? 'item' : 'axis' },
    legend: schema.showLegend === false ? undefined : { orient: 'horizontal', bottom: 0, type: 'scroll' },
    grid: { left: 8, right: 12, top: schema.title ? 44 : 24, bottom: schema.showLegend === false ? 8 : 34, containLabel: true },
    textStyle: { fontFamily: 'inherit' },
  };

  if (isPieLike(type)) {
    // Pie uses first value column (or per-series sum). Keep simple & predictable.
    const s = data.series[0];
    const pieData = (data.categories || []).map((c, i) => ({
      name: c,
      value: s?.values[i] ?? 0,
    }));
    return {
      ...base,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: type === 'donut' ? ['42%', '68%'] : ['0%', '65%'],
          center: ['50%', '52%'],
          label: { show: schema.showLabels !== false, formatter: '{b}: {c}' },
          labelLine: { show: schema.showLabels !== false },
          data: pieData,
        },
      ],
    };
  }

  if (type === 'scatter') {
    const s0 = data.series[0];
    const s1 = data.series[1];
    const pts = (data.categories || []).map((_, i) => [s0?.values[i] ?? null, s1?.values[i] ?? s0?.values[i] ?? null]);
    return {
      ...base,
      xAxis: { type: 'value', name: schema.xAxisName || s0?.name || '' },
      yAxis: { type: 'value', name: schema.yAxisName || s1?.name || '' },
      series: [
        {
          type: 'scatter',
          symbolSize: 12,
          label: { show: !!schema.showLabels },
          data: pts.filter(([x, y]) => x !== null && y !== null),
        },
      ],
    };
  }

  const isH = type === 'barH';
  const series = data.series.map((s) => {
    if (type === 'line') return { name: s.name, type: 'line', smooth: true, symbolSize: 7, label: { show: !!schema.showLabels }, data: s.values };
    if (type === 'area') return { name: s.name, type: 'line', smooth: true, areaStyle: {}, symbolSize: 6, label: { show: !!schema.showLabels }, data: s.values };
    // bars (grouped / stacked / plain / horizontal)
    return {
      name: s.name,
      type: 'bar',
      stack: type === 'stackedBar' || schema.stacked ? 'total' : undefined,
      label: { show: !!schema.showLabels, position: isH ? 'right' : 'top' },
      data: s.values,
    };
  });

  return {
    ...base,
    xAxis: isH
      ? { type: 'value', name: schema.yAxisName || '' }
      : { type: 'category', data: data.categories, axisLabel: { interval: 0, rotate: data.categories.length > 6 ? 28 : 0, hideOverlap: true }, name: schema.xAxisName || '' },
    yAxis: isH
      ? { type: 'category', data: data.categories, name: schema.xAxisName || '' }
      : { type: 'value', name: schema.yAxisName || '' },
    series,
  };
}

/* ------------------------------------------------------------------ */
/* Native table extraction from TipTap JSON                            */
/* ------------------------------------------------------------------ */

export function extractNativeTables(doc: any): NativeTableInfo[] {
  const out: NativeTableInfo[] = [];
  if (!doc || !Array.isArray(doc.content)) return out;
  let tableIdx = 0;
  for (const node of doc.content) {
    if (node?.type !== 'table' || !Array.isArray(node.content)) continue;
    const rows: string[][] = [];
    let headers: string[] = [];
    node.content.forEach((rowNode: any, ri: number) => {
      if (rowNode?.type !== 'tableRow' || !Array.isArray(rowNode.content)) return;
      const cells: string[] = [];
      rowNode.content.forEach((cell: any) => {
        cells.push(extractCellText(cell));
      });
      if (ri === 0) headers = cells.map((c, i) => c || `C${i + 1}`);
      else rows.push(cells);
    });
    out.push({ key: `native:${tableIdx}`, index: tableIdx, headers, rows });
    tableIdx++;
  }
  return out;
}

function extractCellText(cell: any): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === 'text') parts.push(n.text || '');
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(cell);
  return parts.join(' ').trim();
}

export function validateSchema(schema: ChartSchema): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!schema.source?.tableId) errors.push('missing source table');
  if (!schema.source?.categoryColumn) errors.push('missing category column');
  if (!schema.source?.valueColumns || schema.source.valueColumns.length === 0) errors.push('no value columns');
  return { ok: errors.length === 0, errors };
}
