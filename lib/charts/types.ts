/**
 * Mini Excel-like Chart system — schema & types.
 * Chart stores a REFERENCE to its data source, never a copy.
 */

export type ChartType =
  | 'bar'      // column / vertical bar
  | 'barH'     // horizontal bar
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'stackedBar'
  | 'groupedBar';

export type ChartSourceKind = 'smart' | 'native';

export interface ChartSource {
  /** Smart table entity id OR native table key (e.g. "native:3") */
  tableId: string;
  kind: ChartSourceKind;
  /** Column key (smart) or column index (native) used for categories / X axis */
  categoryColumn: string;
  /** Column keys (smart) or indices (native) used as series */
  valueColumns: string[];
  /** Optional human label of the source table at creation time */
  tableName?: string;
}

export interface ChartSchema {
  chartId: string;
  type: ChartType;
  title: string;
  source: ChartSource;
  xAxisName?: string;
  yAxisName?: string;
  showLegend?: boolean;
  showLabels?: boolean;
  stacked?: boolean;
  height?: number; // px
}

export interface ResolvedSeries {
  name: string;
  values: (number | null)[];
}

export interface ResolvedChartData {
  categories: string[];
  series: ResolvedSeries[];
  /** Missing column keys/indices that could not be resolved */
  missing: string[];
  /** Total numeric values resolved (for empty-state detection) */
  valueCount: number;
}

export const CHART_TYPES: Array<{ id: ChartType; labelAr: string; labelEn: string }> = [
  { id: 'bar', labelAr: 'عمودي', labelEn: 'Column' },
  { id: 'barH', labelAr: 'شريطي أفقي', labelEn: 'Bar' },
  { id: 'line', labelAr: 'خطي', labelEn: 'Line' },
  { id: 'area', labelAr: 'مساحي', labelEn: 'Area' },
  { id: 'pie', labelAr: 'دائري', labelEn: 'Pie' },
  { id: 'donut', labelAr: 'دونات', labelEn: 'Donut' },
  { id: 'scatter', labelAr: 'مبعثر', labelEn: 'Scatter' },
  { id: 'stackedBar', labelAr: 'مكدّس', labelEn: 'Stacked Bar' },
  { id: 'groupedBar', labelAr: 'مجمّع', labelEn: 'Grouped Bar' },
];

export function isPieLike(type: ChartType): boolean {
  return type === 'pie' || type === 'donut';
}

export function normalizeChartType(t: any): ChartType {
  const valid: ChartType[] = ['bar', 'barH', 'line', 'area', 'pie', 'donut', 'scatter', 'stackedBar', 'groupedBar'];
  if (valid.includes(t)) return t;
  // aliases
  if (t === 'column') return 'bar';
  if (t === 'bar_horizontal' || t === 'horizontalBar') return 'barH';
  if (t === 'stacked') return 'stackedBar';
  if (t === 'grouped') return 'groupedBar';
  return 'bar';
}

export function newChartId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'cht_' + crypto.randomUUID().slice(0, 8);
  } catch {}
  return 'cht_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
