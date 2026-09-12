/**
 * Shared export rendering for reportChart nodes.
 * Exports (PDF/DOCX/Markdown/share page) render charts as
 * title + data table so nothing breaks and content stays meaningful.
 */
import { resolveFromSmart, extractNativeTables, resolveFromNative, resolveNativeWithFallback } from './engine';
import { formatCellDisplay } from '../grid/formula-parser';

export interface ChartExportData {
  title: string;
  type: string;
  categories: string[];
  series: Array<{ name: string; values: (number | null)[] }>;
  broken: boolean;
}

export function resolveChartForExport(chartNode: any, doc: any, tablesMap: Record<string, any> = {}): ChartExportData {
  const a = chartNode?.attrs || {};
  const title = a.title || '';
  const type = a.type || 'bar';
  const tableId = String(a.sourceTableId || '');
  const kind = a.sourceKind === 'native' ? 'native' : 'smart';
  const categoryColumn = String(a.categoryColumn || '');
  const valueColumns: string[] = Array.isArray(a.valueColumns) ? a.valueColumns.map(String) : [];
  const schema: any = {
    chartId: a.chartId || '',
    type,
    title,
    source: { tableId, kind, categoryColumn, valueColumns },
  };
  try {
    if (kind === 'smart') {
      const t = tablesMap?.[tableId] || null;
      const r = resolveFromSmart(t, schema);
      return { title, type, categories: r.categories, series: r.series, broken: r.missing.length > 0 || !t };
    }
    const natives = extractNativeTables(doc);
    // Phase 4.4 (B17): fingerprint rebinding survives table insertions.
    const { info } = resolveNativeWithFallback(
      natives,
      tableId,
      typeof a.sourceFingerprint === 'string' ? a.sourceFingerprint : null
    );
    const r = resolveFromNative(info, schema);
    return { title, type, categories: r.categories, series: r.series, broken: r.missing.length > 0 || !info };
  } catch {
    return { title, type, categories: [], series: [], broken: true };
  }
}

export function escapeHtmlExport(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Phase 4.4 (B17) — activates the chart data-table export.
 * Resolves the chart (with native fingerprint rebinding) and shapes it as
 * a capped header+rows table every exporter (DOCX/PDF/MD/share) renders
 * natively. Previously exporters printed title-only placeholders.
 */
export interface ChartDataTable {
  title: string;
  type: string;
  broken: boolean;
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

export function chartDataTable(
  chartNode: any,
  doc: any,
  tablesMap: Record<string, any> = {},
  maxRows = 50,
  categoryHeader = 'Item'
): ChartDataTable {
  const data = resolveChartForExport(chartNode, doc, tablesMap);
  if (data.broken || data.categories.length === 0) {
    return {
      title: data.title,
      type: data.type,
      broken: true,
      headers: [],
      rows: [],
      totalRows: 0,
      truncated: false,
    };
  }
  const totalRows = data.categories.length;
  const slice = Math.min(totalRows, Math.max(maxRows, 1));
  const rows: string[][] = [];
  for (let i = 0; i < slice; i++) {
    rows.push([
      formatCellDisplay(data.categories[i]),
      ...data.series.map((s) => formatCellDisplay(s.values[i])),
    ]);
  }
  return {
    title: data.title,
    type: data.type,
    broken: false,
    headers: [categoryHeader, ...data.series.map((s) => s.name)],
    rows,
    totalRows,
    truncated: totalRows > slice,
  };
}
