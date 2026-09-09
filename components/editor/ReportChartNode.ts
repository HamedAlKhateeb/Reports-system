import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ReportChartView } from './ReportChartView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reportChart: {
      setReportChart: (options: {
        chartId: string;
        type: string;
        title?: string;
        sourceTableId: string;
        sourceKind?: 'smart' | 'native';
        categoryColumn: string;
        valueColumns: string[] | string;
        xAxisName?: string;
        yAxisName?: string;
        showLegend?: boolean;
        showLabels?: boolean;
        stacked?: boolean;
        height?: number;
        tableName?: string;
      }) => ReturnType;
      updateReportChart: (chartId: string, patch: Record<string, any>) => ReturnType;
      deleteReportChart: (chartId: string) => ReturnType;
    };
  }
}

function parseValueColumns(v: any): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.map(String);
    } catch {}
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }
  return [];
}

export const ReportChart = Node.create({
  name: 'reportChart',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      chartId: { default: '' },
      type: { default: 'bar' },
      title: { default: '' },
      sourceTableId: { default: '' },
      sourceKind: { default: 'smart' },
      categoryColumn: { default: '' },
      valueColumns: { default: [] },
      xAxisName: { default: '' },
      yAxisName: { default: '' },
      showLegend: { default: true },
      showLabels: { default: false },
      stacked: { default: false },
      height: { default: 320 },
      tableName: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="report-chart"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            chartId: el.getAttribute('data-chart-id') || '',
            type: el.getAttribute('data-chart-type') || 'bar',
            title: el.getAttribute('data-title') || '',
            sourceTableId: el.getAttribute('data-source-table') || '',
            sourceKind: (el.getAttribute('data-source-kind') as any) || 'smart',
            categoryColumn: el.getAttribute('data-category') || '',
            valueColumns: parseValueColumns(el.getAttribute('data-series')),
            xAxisName: el.getAttribute('data-x-name') || '',
            yAxisName: el.getAttribute('data-y-name') || '',
            showLegend: el.getAttribute('data-legend') !== '0',
            showLabels: el.getAttribute('data-labels') === '1',
            stacked: el.getAttribute('data-stacked') === '1',
            height: Number(el.getAttribute('data-height')) || 320,
            tableName: el.getAttribute('data-table-name') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const series = Array.isArray(HTMLAttributes.valueColumns)
      ? JSON.stringify(HTMLAttributes.valueColumns)
      : HTMLAttributes.valueColumns;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'report-chart',
        'data-chart-id': HTMLAttributes.chartId,
        'data-chart-type': HTMLAttributes.type,
        'data-title': HTMLAttributes.title,
        'data-source-table': HTMLAttributes.sourceTableId,
        'data-source-kind': HTMLAttributes.sourceKind,
        'data-category': HTMLAttributes.categoryColumn,
        'data-series': series,
        'data-x-name': HTMLAttributes.xAxisName,
        'data-y-name': HTMLAttributes.yAxisName,
        'data-legend': HTMLAttributes.showLegend ? '1' : '0',
        'data-labels': HTMLAttributes.showLabels ? '1' : '0',
        'data-stacked': HTMLAttributes.stacked ? '1' : '0',
        'data-height': HTMLAttributes.height,
        'data-table-name': HTMLAttributes.tableName,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReportChartView);
  },

  addCommands() {
    return {
      setReportChart:
        (options) =>
        ({ chain, state }) => {
          const valueColumns = parseValueColumns((options as any).valueColumns);
          const attrs = { ...options, valueColumns };
          // FIX (Normal Table + Chart bug): never insert a chart INSIDE a table cell.
          // If the selection is inside a `table` node, insert AFTER the top-level
          // table block so the chart stays an independent document-level element:
          //   TABLE ... / CHART ...   (never TABLE > CELL > CHART)
          try {
            const sel: any = (state as any)?.selection;
            const $from = sel?.$from;
            if ($from) {
              let tableDepth = -1;
              for (let d = $from.depth; d > 0; d--) {
                try {
                  if ($from.node(d)?.type?.name === 'table') {
                    tableDepth = d;
                    break;
                  }
                } catch {}
              }
              if (tableDepth > 0) {
                let afterPos: number;
                try {
                  afterPos = $from.after(tableDepth);
                } catch {
                  afterPos = state.doc.content.size;
                }
                return (chain() as any)
                  .insertContentAt(afterPos, { type: this.name, attrs })
                  .run();
              }
            }
          } catch {}
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run();
        },
      updateReportChart:
        (chartId, patch) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'reportChart' && node.attrs.chartId === chartId) {
              found = true;
              const next = { ...node.attrs, ...patch };
              if ((patch as any).valueColumns !== undefined) {
                next.valueColumns = parseValueColumns((patch as any).valueColumns);
              }
              tr.setNodeMarkup(pos, undefined, next);
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
      deleteReportChart:
        (chartId) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (!found && node.type.name === 'reportChart' && node.attrs.chartId === chartId) {
              found = true;
              tr.delete(pos, pos + node.nodeSize);
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },
});
