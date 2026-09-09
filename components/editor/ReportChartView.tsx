'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Pencil, Copy, Trash2, AlertTriangle, BarChart3, Maximize2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getTableById } from '@/lib/db';
import type { ChartSchema } from '@/lib/charts/types';
import { buildEchartsOption, extractNativeTables, resolveFromNative, resolveFromSmart } from '@/lib/charts/engine';
import { cn } from '@/lib/utils';

function attrsToSchema(a: any): ChartSchema {
  const vc = Array.isArray(a.valueColumns) ? a.valueColumns.map(String) : [];
  return {
    chartId: String(a.chartId || ''),
    type: a.type || 'bar',
    title: a.title || '',
    source: {
      tableId: String(a.sourceTableId || ''),
      kind: a.sourceKind === 'native' ? 'native' : 'smart',
      categoryColumn: String(a.categoryColumn || ''),
      valueColumns: vc,
      tableName: a.tableName || '',
    },
    xAxisName: a.xAxisName || '',
    yAxisName: a.yAxisName || '',
    showLegend: a.showLegend !== false,
    showLabels: !!a.showLabels,
    stacked: !!a.stacked,
    height: Number(a.height) || 320,
  };
}

export function ReportChartView(props: NodeViewProps) {
  const { node, editor, selected, updateAttributes, deleteNode } = props as any;
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const schema = useMemo(() => attrsToSchema(node.attrs), [node.attrs]);
  const [dataTick, setDataTick] = useState(0);
  const [smartSnapshot, setSmartSnapshot] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [echartsMod, setEchartsMod] = useState<any>(null);

  // lazy-load echarts (keeps initial bundle small)
  useEffect(() => {
    let alive = true;
    import('echarts').then((m) => {
      if (alive) setEchartsMod(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // load smart table snapshot + subscribe to live updates
  const loadSmart = useCallback(async () => {
    if (schema.source.kind !== 'smart' || !schema.source.tableId) {
      setSmartSnapshot(null);
      return;
    }
    try {
      const t = await getTableById(schema.source.tableId);
      setSmartSnapshot(t);
    } catch {
      setSmartSnapshot(null);
    }
  }, [schema.source.kind, schema.source.tableId]);

  useEffect(() => {
    loadSmart();
  }, [loadSmart, dataTick]);

  useEffect(() => {
    const onTable = (e: Event) => {
      const d = (e as CustomEvent)?.detail || {};
      if (!d.tableId || d.tableId === schema.source.tableId) {
        setDataTick((x) => x + 1);
      }
    };
    const onDoc = () => setDataTick((x) => x + 1);
    window.addEventListener('smart-table-updated', onTable);
    window.addEventListener('chart-source-changed', onTable as EventListener);
    let off: (() => void) | null = null;
    try {
      if (editor?.on) {
        const h = () => setDataTick((x) => x + 1);
        editor.on('update', h);
        off = () => editor.off('update', h);
      }
    } catch {}
    return () => {
      window.removeEventListener('smart-table-updated', onTable);
      window.removeEventListener('chart-source-changed', onTable as EventListener);
      if (off) off();
    };
  }, [editor, schema.source.tableId]);

  // resolve data
  const resolved = useMemo(() => {
    if (schema.source.kind === 'smart') {
      return resolveFromSmart(smartSnapshot, schema);
    }
    try {
      const doc = editor?.getJSON?.();
      const natives = extractNativeTables(doc);
      const info = natives.find((n) => n.key === schema.source.tableId) || null;
      return resolveFromNative(info, schema);
    } catch {
      return { categories: [], series: [], missing: [...schema.source.valueColumns], valueCount: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, smartSnapshot, dataTick, editor]);

  const broken = resolved.missing.length > 0;
  const empty = !broken && (resolved.series.length === 0 || resolved.valueCount === 0);
  const option = useMemo(() => buildEchartsOption(schema, resolved), [schema, resolved]);

  // render echarts
  useEffect(() => {
    if (!echartsMod || !containerRef.current) return;
    const echarts = echartsMod.default || echartsMod;
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current);
    }
    const chart = chartRef.current;
    try {
      chart.setOption(option, { notMerge: true });
    } catch {}
    const onResize = () => { try { chart.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    // ResizeObserver for responsive container
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => { try { chart.resize(); } catch {} });
      if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement);
    } catch {}
    return () => {
      window.removeEventListener('resize', onResize);
      try { ro?.disconnect(); } catch {}
    };
  }, [echartsMod, option]);

  useEffect(() => {
    return () => {
      try { chartRef.current?.dispose(); } catch {}
      chartRef.current = null;
    };
  }, []);

  const openEditor = () => {
    window.dispatchEvent(new CustomEvent('chart-edit-request', { detail: { chartId: schema.chartId } }));
  };
  const duplicate = () => {
    window.dispatchEvent(new CustomEvent('chart-duplicate-request', { detail: { chartId: schema.chartId } }));
  };

  // corner resize (height)
  const [resizing, setResizing] = useState(false);
  const startRef = useRef<{ y: number; h: number }>({ y: 0, h: 320 });
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setResizing(true);
    startRef.current = { y: e.clientY, h: schema.height || 320 };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizing) return;
    const dh = e.clientY - startRef.current.y;
    const nh = Math.max(220, Math.min(640, Math.round(startRef.current.h + dh)));
    updateAttributes?.({ height: nh });
  };
  const onResizeUp = () => setResizing(false);

  return (
    <NodeViewWrapper
      className={cn('report-chart-node my-4 w-full max-w-full', selected && 'outline-2 outline-offset-2 outline-[#2E4034] rounded-xl')}
      data-chart-id={schema.chartId}
    >
      <div contentEditable={false} className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* header bar */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[#2E4034]" />
            <span className="truncate font-bold text-foreground">{schema.title || (isAr ? 'رسم بياني' : 'Chart')}</span>
            <span className="hidden sm:inline rounded bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">{schema.type}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={openEditor} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={isAr ? 'تحرير الرسم' : 'Edit chart'}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={duplicate} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={isAr ? 'تكرار' : 'Duplicate'}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600" title={isAr ? 'حذف' : 'Delete'}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            <span>{isAr ? 'حذف هذا الرسم؟ (لن يتأثر الجدول)' : 'Delete this chart? (table is untouched)'}</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => { setConfirmDelete(false); deleteNode?.(); }} className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700">
                {isAr ? 'حذف' : 'Delete'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded border border-border bg-background px-2 py-0.5 text-[11px]">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {broken && (
          <button
            type="button"
            onClick={openEditor}
            className="flex w-full items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{isAr ? '⚠ مصدر بيانات الرسم البياني يحتاج إلى مراجعة — اضغط للإصلاح' : 'Chart data source needs review — click to fix'}</span>
          </button>
        )}

        {empty && !broken ? (
          <div className="flex h-40 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {isAr ? 'لا توجد قيم رقمية في الأعمدة المحددة — عدّل مصدر البيانات' : 'No numeric values in selected columns — adjust the source'}
          </div>
        ) : (
          <div className="relative w-full max-w-full">
            <div ref={containerRef} style={{ height: schema.height || 320, width: '100%' }} className="w-full max-w-full" />
            <div
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              style={{ touchAction: 'none' }}
              className={cn('absolute bottom-2 end-2 z-10 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-md bg-black/60 text-white shadow-md transition-opacity hover:bg-black/85', resizing ? 'opacity-100 ring-2 ring-white' : 'opacity-70 hover:opacity-100')}
              title={isAr ? 'اسحب لتغيير الحجم' : 'Drag to resize'}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
