/**
 * AI actions for charts. The AI never writes HTML/SVG/ECharts —
 * it emits one of these intents and the editor executes + verifies.
 */
'use client';

import type { ChartSchema, ChartType } from './types';
import { normalizeChartType } from './types';

export type ChartAiAction =
  | { name: 'create_chart'; params: CreateChartParams }
  | { name: 'update_chart'; params: UpdateChartParams }
  | { name: 'delete_chart'; params: { chartId: string } }
  | { name: 'change_chart_type'; params: { chartId: string; type: ChartType } }
  | { name: 'update_chart_source'; params: UpdateChartSourceParams };

export interface CreateChartParams {
  type: ChartType | string;
  source_table: string;
  category: string;
  series: string[];
  title?: string;
}

export interface UpdateChartParams {
  chartId: string;
  title?: string;
  type?: ChartType | string;
  category?: string;
  series?: string[];
  showLegend?: boolean;
  showLabels?: boolean;
  xAxisName?: string;
  yAxisName?: string;
}

export interface UpdateChartSourceParams {
  chartId: string;
  source_table: string;
  category?: string;
  series?: string[];
}

export const CHART_AI_TOOL_DEFS = [
  {
    name: 'create_chart',
    description: 'Create a chart bound to a report table. Never emit HTML/SVG.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bar', 'barH', 'line', 'area', 'pie', 'donut', 'scatter', 'stackedBar', 'groupedBar'] },
        source_table: { type: 'string' },
        category: { type: 'string' },
        series: { type: 'array', items: { type: 'string' } },
        title: { type: 'string' },
      },
      required: ['type', 'source_table', 'category', 'series'],
    },
  },
  {
    name: 'update_chart',
    description: 'Update title/type/columns/legend/labels of an existing chart.',
    parameters: {
      type: 'object',
      properties: {
        chartId: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string' },
        category: { type: 'string' },
        series: { type: 'array', items: { type: 'string' } },
        showLegend: { type: 'boolean' },
        showLabels: { type: 'boolean' },
      },
      required: ['chartId'],
    },
  },
  { name: 'delete_chart', description: 'Delete a chart by id (tables are untouched).', parameters: { type: 'object', properties: { chartId: { type: 'string' } }, required: ['chartId'] } },
  { name: 'change_chart_type', description: 'Switch chart type.', parameters: { type: 'object', properties: { chartId: { type: 'string' }, type: { type: 'string' } }, required: ['chartId', 'type'] } },
  { name: 'update_chart_source', description: 'Rebind a chart to another table/columns.', parameters: { type: 'object', properties: { chartId: { type: 'string' }, source_table: { type: 'string' }, category: { type: 'string' }, series: { type: 'array', items: { type: 'string' } } }, required: ['chartId', 'source_table'] } },
] as const;

/** Verify params before execution — returns error string or null. */
export function verifyChartAction(action: ChartAiAction, knownTableIds: string[], knownChartIds: string[]): string | null {
  switch (action.name) {
    case 'create_chart': {
      const p = action.params;
      if (!knownTableIds.includes(p.source_table)) return `unknown source_table "${p.source_table}"`;
      if (!p.category) return 'category is required';
      if (!p.series || p.series.length === 0) return 'at least one series is required';
      normalizeChartType(p.type);
      return null;
    }
    case 'update_chart':
    case 'delete_chart':
    case 'change_chart_type':
    case 'update_chart_source': {
      const id = (action.params as any).chartId;
      if (!knownChartIds.includes(id)) return `unknown chartId "${id}"`;
      return null;
    }
  }
}

/** Dispatch an action to the live editor (TipTapEditor listens). */
export function dispatchChartAction(action: ChartAiAction): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('chart-ai-action', { detail: action }));
}

/** Build a ChartSchema from create params (kind resolved by editor). */
export function schemaFromCreateParams(p: CreateChartParams, chartId: string): ChartSchema {
  return {
    chartId,
    type: normalizeChartType(p.type),
    title: p.title || '',
    source: {
      tableId: p.source_table,
      kind: p.source_table.startsWith('native:') ? 'native' : 'smart',
      categoryColumn: p.category,
      valueColumns: p.series,
    },
    showLegend: true,
    showLabels: false,
    height: 320,
  };
}
