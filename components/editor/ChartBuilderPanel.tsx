'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, CircleHelp, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getTableById, getTablesByReportId } from '@/lib/db';
import type { ChartSchema, ChartType } from '@/lib/charts/types';
import { CHART_TYPES, newChartId, normalizeChartType } from '@/lib/charts/types';
import {
  buildEchartsOption,
  detectNativeColumns,
  detectSmartColumns,
  extractNativeTables,
  resolveFromNative,
  resolveFromSmart,
  type NativeTableInfo,
} from '@/lib/charts/engine';
import { cn } from '@/lib/utils';

interface SourceOption {
  tableId: string;
  kind: 'smart' | 'native';
  name: string;
}

interface Props {
  editor: any;
  reportId: string;
  /** edit existing chart */
  editChartId?: string | null;
  /** pre-selected source (smart table id or native:N key) */
  presetSource?: { tableId: string; kind: 'smart' | 'native' } | null;
  onClose: () => void;
  onDone?: (chartId: string) => void;
}

function readChartAttrs(editor: any, chartId: string): any | null {
  let found: any = null;
  try {
    editor?.state?.doc?.descendants?.((node: any) => {
      if (node.type.name === 'reportChart' && node.attrs.chartId === chartId) found = { ...node.attrs };
    });
  } catch {}
  return found;
}

export function ChartBuilderPanel({ editor, reportId, editChartId, presetSource, onClose, onDone }: Props) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [smartCache, setSmartCache] = useState<Record<string, any>>({});
  const [natives, setNatives] = useState<NativeTableInfo[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  // form state
  const [sourceId, setSourceId] = useState<string>(presetSource?.tableId || '');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [series, setSeries] = useState<string[]>([]);
  const [xName, setXName] = useState('');
  const [yName, setYName] = useState('');
  const [legend, setLegend] = useState(true);
  const [labels, setLabels] = useState(false);
  const [autoTouched, setAutoTouched] = useState(false);

  const isEdit = !!editChartId;
  const previewRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [echartsMod, setEchartsMod] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    import('echarts').then((m) => { if (alive) setEchartsMod(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // load sources: smart tables of report + native tables in doc
  useEffect(() => {
    let alive = true;
    (async () => {
      const list: SourceOption[] = [];
      const cache: Record<string, any> = {};
      try {
        const tables = await getTablesByReportId(reportId);
        for (const t of tables) {
          cache[t.id] = t;
          list.push({ tableId: t.id, kind: 'smart', name: t.name || t.id });
        }
      } catch {}
      // also include smart tables embedded in doc but maybe different report
      try {
        editor?.state?.doc?.descendants?.((node: any) => {
          if (node.type.name === 'smartTable' && node.attrs.tableId && !cache[node.attrs.tableId]) {
            getTableById(node.attrs.tableId).then((t) => {
              if (t && alive) {
                setSmartCache((c) => ({ ...c, [t.id]: t }));
                setSources((s) => (s.some((x) => x.tableId === t.id) ? s : [...s, { tableId: t.id, kind: 'smart', name: t.name || t.id }]));
              }
            }).catch(() => {});
          }
        });
      } catch {}
      let nat: NativeTableInfo[] = [];
      try {
        nat = extractNativeTables(editor?.getJSON?.());
      } catch { nat = []; }
      for (const n of nat) {
        const label = n.headers.length ? n.headers.slice(0, 3).join('، ') : `Table ${n.index + 1}`;
        list.push({ tableId: n.key, kind: 'native', name: `${isAr ? 'جدول' : 'Table'} ${n.index + 1} (${label})` });
      }
      if (!alive) return;
      setSmartCache(cache);
      setNatives(nat);
      setSources(list);
      // default select
      if (!sourceId && list.length > 0) {
        const pre = presetSource?.tableId && list.some((l) => l.tableId === presetSource.tableId)
          ? presetSource.tableId
          : list[0].tableId;
        setSourceId(pre);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, reportId]);

  // if editing: hydrate form from node attrs
  useEffect(() => {
    if (!editChartId) return;
    const a = readChartAttrs(editor, editChartId);
    if (!a) return;
    setSourceId(String(a.sourceTableId || ''));
    setChartType(normalizeChartType(a.type));
    setTitle(a.title || '');
    setCategory(String(a.categoryColumn || ''));
    setSeries(Array.isArray(a.valueColumns) ? a.valueColumns.map(String) : []);
    setXName(a.xAxisName || '');
    setYName(a.yAxisName || '');
    setLegend(a.showLegend !== false);
    setLabels(!!a.showLabels);
    setAutoTouched(true);
  }, [editChartId, editor]);

  const activeSource = useMemo(() => sources.find((s) => s.tableId === sourceId) || null, [sources, sourceId]);

  // headers for column pickers
  const headers: Array<{ key: string; label: string; numeric: boolean }> = useMemo(() => {
    if (!activeSource) return [];
    if (activeSource.kind === 'smart') {
      const t = smartCache[activeSource.tableId];
      if (!t) return [];
      return (t.columns_data || []).map((c: any) => ({ key: String(c.id), label: c.name || c.id, numeric: c.type === 'number' }));
    }
    const n = natives.find((x) => x.key === activeSource.tableId);
    if (!n) return [];
    return n.headers.map((h, i) => ({ key: String(i), label: h || `C${i + 1}`, numeric: false }));
  }, [activeSource, smartCache, natives]);

  // auto-detect once per source change (until user touches)
  useEffect(() => {
    if (!activeSource || autoTouched) return;
    if (activeSource.kind === 'smart') {
      const t = smartCache[activeSource.tableId];
      if (!t) return;
      const d = detectSmartColumns(t);
      setCategory(d.category);
      setSeries(d.values);
      if (!title) setTitle(t.name ? `${t.name}` : '');
    } else {
      const n = natives.find((x) => x.key === activeSource.tableId);
      if (!n) return;
      const d = detectNativeColumns(n);
      setCategory(d.category);
      setSeries(d.values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource, smartCache, natives]);

  const draft: ChartSchema = useMemo(() => ({
    chartId: editChartId || 'preview',
    type: chartType,
    title,
    source: {
      tableId: sourceId,
      kind: activeSource?.kind || 'smart',
      categoryColumn: category,
      valueColumns: series,
      tableName: activeSource?.name || '',
    },
    xAxisName: xName,
    yAxisName: yName,
    showLegend: legend,
    showLabels: labels,
    height: 300,
  }), [editChartId, chartType, title, sourceId, activeSource, category, series, xName, yName, legend, labels]);

  const resolved = useMemo(() => {
    if (!activeSource) return { categories: [], series: [], missing: [], valueCount: 0 };
    if (activeSource.kind === 'smart') return resolveFromSmart(smartCache[activeSource.tableId] || null, draft);
    const n = natives.find((x) => x.key === activeSource.tableId) || null;
    return resolveFromNative(n, draft);
  }, [activeSource, smartCache, natives, draft]);

  const option = useMemo(() => buildEchartsOption(draft, resolved), [draft, resolved]);

  useEffect(() => {
    if (!echartsMod || !previewRef.current) return;
    const echarts = echartsMod.default || echartsMod;
    if (!chartRef.current) chartRef.current = echarts.init(previewRef.current);
    try { chartRef.current.setOption(option, { notMerge: true }); } catch {}
    const h = () => { try { chartRef.current?.resize(); } catch {} };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [echartsMod, option]);

  useEffect(() => () => { try { chartRef.current?.dispose(); } catch {} chartRef.current = null; }, []);

  const missing = resolved.missing.length > 0;
  const canSave = sourceId && category && series.length > 0 && !missing;

  const handleSave = () => {
    if (!editor) return;
    if (isEdit && editChartId) {
      editor.chain().focus().updateReportChart(editChartId, {
        type: chartType,
        title,
        sourceTableId: sourceId,
        sourceKind: activeSource?.kind || 'smart',
        categoryColumn: category,
        valueColumns: series,
        xAxisName: xName,
        yAxisName: yName,
        showLegend: legend,
        showLabels: labels,
        tableName: activeSource?.name || '',
      }).run();
      onDone?.(editChartId);
    } else {
      const id = newChartId();
      try {
        (editor.chain().focus() as any).setReportChart({
          chartId: id,
          type: chartType,
          title: title || (activeSource?.name || ''),
          sourceTableId: sourceId,
          sourceKind: activeSource?.kind || 'smart',
          categoryColumn: category,
          valueColumns: series,
          xAxisName: xName,
          yAxisName: yName,
          showLegend: legend,
          showLabels: labels,
          stacked: chartType === 'stackedBar',
          height: 320,
          tableName: activeSource?.name || '',
        }).run();
      } catch {
        editor.chain().insertContentAt(editor.state.doc.content.size, {
          type: 'reportChart',
          attrs: {
            chartId: id,
            type: chartType,
            title: title || (activeSource?.name || ''),
            sourceTableId: sourceId,
            sourceKind: activeSource?.kind || 'smart',
            categoryColumn: category,
            valueColumns: series,
            xAxisName: xName,
            yAxisName: yName,
            showLegend: legend,
            showLabels: labels,
            stacked: chartType === 'stackedBar',
            height: 320,
            tableName: activeSource?.name || '',
          },
        }).run();
      }
      onDone?.(id);
    }
    onClose();
  };

  const toggleSeries = (key: string) => {
    setAutoTouched(true);
    setSeries((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key].slice(0, 6)));
  };

  return (
    <div className="fixed inset-y-0 end-0 z-[60] flex w-full max-w-md flex-col border-s border-border bg-card shadow-2xl" dir={isAr ? 'rtl' : 'ltr'} role="dialog" aria-label={isAr ? 'منشئ الرسم البياني' : 'Chart builder'}>
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#2E4034]" />
          <h3 className="text-sm font-bold text-foreground">{isEdit ? (isAr ? 'تحرير الرسم البياني' : 'Edit chart') : (isAr ? 'إنشاء رسم بياني' : 'New chart')}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setShowHelp(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" title={isAr ? 'كيفية إنشاء Chart' : 'How to create a chart'}>
            <CircleHelp className="h-3.5 w-3.5" />
            <span>{isAr ? 'كيفية إنشاء Chart' : 'How to'}</span>
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={isAr ? 'إغلاق' : 'Close'}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {/* live preview */}
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="border-b border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
            {isAr ? 'معاينة مباشرة' : 'Live preview'}
          </div>
          <div ref={previewRef} style={{ height: 260, width: '100%' }} />
          {missing && (
            <div className="border-t border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              {isAr ? '⚠ مصدر بيانات الرسم البياني يحتاج إلى مراجعة' : 'Chart data source needs review'}
            </div>
          )}
        </div>

        {/* source */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">{isAr ? 'مصدر البيانات' : 'Data source'}</label>
          <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setAutoTouched(false); }} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-[#2E4034] focus:outline-none">
            {sources.map((s) => (
              <option key={s.tableId} value={s.tableId}>{s.name}</option>
            ))}
          </select>
          {sources.length === 0 && (
            <p className="text-[11px] text-muted-foreground">{isAr ? 'لا توجد جداول في التقرير بعد — أدرج جدولاً أولاً.' : 'No tables in this report yet — insert a table first.'}</p>
          )}
        </div>

        {/* type */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">{isAr ? 'نوع الرسم' : 'Chart type'}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => setChartType(ct.id)}
                className={cn('rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors', chartType === ct.id ? 'border-[#2E4034] bg-[#2E4034]/10 text-[#2E4034] dark:text-emerald-300' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}
              >
                {isAr ? ct.labelAr : ct.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* title */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">{isAr ? 'العنوان' : 'Title'}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isAr ? 'مثال: الإيرادات مقابل المصروفات' : 'e.g. Revenue vs Expenses'} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-[#2E4034] focus:outline-none" />
        </div>

        {/* category */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">{isAr ? 'الفئة / المحور X' : 'Category / X axis'}</label>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setAutoTouched(true); }} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-[#2E4034] focus:outline-none">
            <option value="">{isAr ? '— اختر —' : '— select —'}</option>
            {headers.map((h) => (
              <option key={h.key} value={h.key}>{h.label}</option>
            ))}
          </select>
        </div>

        {/* series */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">{isAr ? 'سلاسل البيانات' : 'Data series'}</label>
          <div className="space-y-1">
            {headers.filter((h) => h.key !== category).map((h) => (
              <label key={h.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs hover:bg-muted/50">
                <input type="checkbox" checked={series.includes(h.key)} onChange={() => toggleSeries(h.key)} className="h-3.5 w-3.5 accent-[#2E4034]" />
                <span className="font-medium text-foreground">{h.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* axes names */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">{isAr ? 'اسم المحور X' : 'X axis name'}</label>
            <input value={xName} onChange={(e) => setXName(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:border-[#2E4034] focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">{isAr ? 'اسم المحور Y' : 'Y axis name'}</label>
            <input value={yName} onChange={(e) => setYName(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:border-[#2E4034] focus:outline-none" />
          </div>
        </div>

        {/* toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
            <input type="checkbox" checked={legend} onChange={(e) => setLegend(e.target.checked)} className="h-3.5 w-3.5 accent-[#2E4034]" />
            <span>{isAr ? 'وسيلة الإيضاح' : 'Legend'}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="h-3.5 w-3.5 accent-[#2E4034]" />
            <span>{isAr ? 'تسميات البيانات' : 'Data labels'}</span>
          </label>
        </div>

        <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {isAr ? 'إذا تغيرت بيانات الجدول، يتم تحديث الرسم البياني المرتبط بها تلقائيًا.' : 'If table data changes, the linked chart updates automatically.'}
        </p>
      </div>

      {/* footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-[#2E4034] px-4 text-xs font-bold text-white hover:bg-[#24382F] disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          <span>{isEdit ? (isAr ? 'حفظ' : 'Save') : (isAr ? 'إنشاء Chart' : 'Create chart')}</span>
        </button>
      </div>

      {/* help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" dir={isAr ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-3 text-sm font-bold text-foreground">{isAr ? 'ⓘ كيفية إنشاء Chart' : 'ⓘ How to create a chart'}</h4>
            <ol className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {(isAr ? [
                '1. اضغط على Chart من شريط الأدوات العلوي.',
                '2. إذا كنت داخل جدول، سيستخدم النظام الجدول تلقائيًا.',
                '3. إذا لم تكن داخل جدول، حدد الجدول الذي تريد استخدامه.',
                '4. اضغط متابعة.',
                '5. اختر نوع الرسم.',
                '6. راجع الأعمدة التي اكتشفها النظام.',
                '7. عدّل العنوان أو المحاور إذا لزم.',
                '8. اضغط إنشاء Chart.',
              ] : [
                '1. Press Chart in the top toolbar.',
                '2. If inside a table, it is used automatically.',
                '3. Otherwise pick the table to use.',
                '4. Press Continue.',
                '5. Pick a chart type.',
                '6. Review auto-detected columns.',
                '7. Adjust title or axes if needed.',
                '8. Press Create chart.',
              ]).map((s) => (<li key={s}>{s}</li>))}
            </ol>
            <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] text-foreground">
              {isAr ? 'إذا تغيرت بيانات الجدول، يتم تحديث الرسم البياني المرتبط بها تلقائيًا.' : 'If table data changes, the linked chart updates automatically.'}
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setShowHelp(false)} className="h-8 rounded-lg bg-[#2E4034] px-4 text-xs font-bold text-white">
                {isAr ? 'فهمت' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
