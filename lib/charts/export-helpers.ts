/**
 * Shared export rendering for reportChart nodes.
 * Exports (PDF/DOCX/Markdown/share page) render charts as
 * title + data table so nothing breaks and content stays meaningful.
 */
import { resolveFromSmart, extractNativeTables, resolveFromNative } from './engine';

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
    const info = natives.find((n) => n.key === tableId) || null;
    const r = resolveFromNative(info, schema);
    return { title, type, categories: r.categories, series: r.series, broken: r.missing.length > 0 || !info };
  } catch {
    return { title, type, categories: [], series: [], broken: true };
  }
}

export function escapeHtmlExport(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
