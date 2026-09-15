'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { SmartTableErrorBoundary } from './grid/SmartTableErrorBoundary';
import { PageLoading } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Eraser, Trash2, ArrowRightLeft, ArrowLeftRight, Table2 } from 'lucide-react';

// Univer is heavy (canvas engine) and client-only: isolated chunk, no SSR.
const UniverTable = dynamic(() => import('./grid/UniverTable').then((m) => m.UniverTable), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[300px] items-center justify-center">
      <PageLoading label="…" className="flex-col" spinnerClassName="size-6" />
    </div>
  ),
});

export function SmartTableView(props: NodeViewProps) {
  const { node, deleteNode } = props;
  const { tableId, reportId, displayMode = 'embedded-edit' } = node.attrs;
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [confirmNode, askConfirm] = useConfirm();
  const [tableName, setTableName] = useState('');
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Flush handshake: ask the mounted Univer renderer to persist any
  // pending keystrokes and WAIT before direction toggle / clear / repair.
  // Without this, the debounced save lands after the operation and
  // resurrects old values or clobbers the new direction.
  const flushRenderer = useCallback(async () => {
    try {
      const promises: Array<Promise<unknown>> = [];
      window.dispatchEvent(new CustomEvent('smart-table-flush', { detail: { tableId, promises } }));
      if (promises.length > 0) await Promise.allSettled(promises);
      else await new Promise((r) => setTimeout(r, 250));
    } catch {}
  }, [tableId]);

  // Show the table name + direction without depending on the sheet engine.
  useEffect(() => {
    if (!tableId || typeof tableId !== 'string') return;
    let alive = true;
    const load = async () => {
      try {
        const { getTableById, getTableDirection } = await import('@/lib/db-intelligence');
        const ent = await getTableById(tableId);
        if (!alive) return;
        if (ent) {
          if (typeof (ent as any).name === 'string') setTableName((ent as any).name);
          setDirection(getTableDirection(ent));
        }
      } catch {}
    };
    void load();
    const onUpd = (e: Event) => {
      try {
        if ((e as CustomEvent)?.detail?.tableId === tableId) void load();
      } catch {}
    };
    const onActive = (e: Event) => {
      try {
        const d = (e as CustomEvent)?.detail || {};
        if (d.tableId === tableId && typeof d.name === 'string' && d.name) setTableName(d.name);
      } catch {}
    };
    window.addEventListener('smart-table-updated', onUpd);
    window.addEventListener('smart-table-active', onActive);
    return () => {
      alive = false;
      window.removeEventListener('smart-table-updated', onUpd);
      window.removeEventListener('smart-table-active', onActive);
    };
  }, [tableId]);

  const handleDelete = useCallback(async () => {
    if (busy) return;
    const ok = await askConfirm(
      isAr
        ? `حذف هذا الجدول الذكي نهائيًا من التقرير؟ سيُحذف الجدول وكل قيمه ولا يمكن التراجع.`
        : `Permanently delete this smart table from the report? The table and all its values will be gone.`
    );
    if (!ok) return;
    try {
      setBusy(true);
      const { deleteTableEntity } = await import('@/lib/db-intelligence');
      await deleteTableEntity(tableId);
      try {
        window.dispatchEvent(new CustomEvent('smart-table-deleted', { detail: { tableId } }));
      } catch {}
    } catch (err) {
      console.warn('Smart table entity delete failed (node still removed)', err);
    } finally {
      setBusy(false);
    }
    // Node removal is the source of the persisted deletion (autosave stores
    // the doc without this block). Always attempt it — even if the entity
    // delete above threw — and emit a backup event so the editor can strip
    // any residual node with the same id (e.g. stale NodeView props).
    try {
      deleteNode();
    } catch (err) {
      console.warn('Smart table deleteNode failed, dispatching backup', err);
    }
    try {
      window.dispatchEvent(new CustomEvent('smart-table-delete-node', { detail: { tableId } }));
    } catch {}
  }, [askConfirm, busy, deleteNode, isAr, tableId]);

  const handleClear = useCallback(async () => {
    if (busy) return;
    const ok = await askConfirm(
      isAr ? 'مسح كل القيم داخل هذا الجدول؟ سيبقى الجدول فارغًا.' : 'Clear all values inside this table? The empty sheet stays.'
    );
    if (!ok) return;
    try {
      setBusy(true);
      await flushRenderer();
      const { clearTableValues } = await import('@/lib/db-intelligence');
      await clearTableValues(tableId);
    } catch (err) {
      console.warn('Clear table values failed', err);
    } finally {
      setBusy(false);
    }
  }, [askConfirm, busy, flushRenderer, isAr, tableId]);

  const handleToggleDirection = useCallback(async () => {
    if (busy) return;
    try {
      setBusy(true);
      await flushRenderer();
      const { toggleTableDirection } = await import('@/lib/db-intelligence');
      const next = await toggleTableDirection(tableId);
      if (next) setDirection(next);
    } catch (err) {
      console.warn('Toggle table direction failed', err);
    } finally {
      setBusy(false);
    }
  }, [busy, flushRenderer, tableId]);

  // Explicit column-order repair for tables swapped by the reverted
  // auto-mirror experiment. Mirror is an involution: pressing twice
  // restores the original, so a mistaken press is self-undoing.
  const handleMirrorRepair = useCallback(async () => {
    if (busy) return;
    const ok = await askConfirm(
      isAr
        ? 'عكس ترتيب أعمدة البيانات (القيم والصيغ معها)؟ استخدمه مرة واحدة إذا كانت الأعمدة متبدلة. الضغط مرتين يعيد الأصل.'
        : 'Mirror data column order (values and formulas move along)? Use once if columns look swapped. Pressing twice restores the original.'
    );
    if (!ok) return;
    try {
      setBusy(true);
      await flushRenderer();
      const { mirrorTableColumns } = await import('@/lib/db-intelligence');
      await mirrorTableColumns(tableId);
    } catch (err) {
      console.warn('Mirror table columns failed', err);
    } finally {
      setBusy(false);
    }
  }, [askConfirm, busy, flushRenderer, isAr, tableId]);

  const commitRename = useCallback(async () => {
    if (!renaming) return;
    const next = nameDraft.trim().slice(0, 120);
    setRenaming(false);
    if (!next || next === tableName) return;
    try {
      const { getTableById, saveTable } = await import('@/lib/db-intelligence');
      const ent = await getTableById(tableId);
      if (!ent) return;
      // Keep the Univer sheet tab in sync (Univer reads it from the snapshot).
      try {
        const snap: any = (ent as any).univerSnapshot;
        if (snap && typeof snap === 'object' && snap.sheets) {
          const sid = (snap.sheetOrder || [])[0] || Object.keys(snap.sheets)[0];
          if (sid && snap.sheets[sid] && typeof snap.sheets[sid] === 'object') {
            snap.sheets[sid].name = next.slice(0, 60);
          }
          if (typeof snap.name === 'string') snap.name = next.slice(0, 60);
        }
      } catch {}
      await saveTable({ ...(ent as any), name: next, univerSnapshot: (ent as any).univerSnapshot });
      setTableName(next);
    } catch (err) {
      console.warn('Rename table failed', err);
    }
  }, [renaming, nameDraft, tableName, tableId]);

  if (!tableId || typeof tableId !== 'string') {
    return (
      <NodeViewWrapper className="smart-table-node-view relative my-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          جدول ذكي بدون معرّف — احذفه وأدرج جدولاً جديداً.
        </div>
      </NodeViewWrapper>
    );
  }

  // Permanent node header: delete / clear / direction NEVER depend on the
  // sheet engine, the toolbar focus bridge, or a successful Univer mount —
  // the table can always be managed and removed from here.
  return (
    <NodeViewWrapper className="smart-table-node-view relative my-4 select-none">
      <div
        className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs"
        contentEditable={false}
        data-table-id={tableId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-muted/40 px-2.5 py-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-bold text-foreground">
            <Table2 className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            {renaming ? (
              <input
                autoFocus
                value={nameDraft}
                dir="auto"
                maxLength={120}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  else if (e.key === 'Escape') setRenaming(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-6 min-w-0 w-32 rounded border border-primary bg-card px-1 text-[11px] outline-none sm:w-44"
                aria-label={isAr ? 'اسم الجدول' : 'Table name'}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(tableName);
                  setRenaming(true);
                }}
                className="truncate rounded px-0.5 hover:bg-muted"
                title={isAr ? 'انقر لتعديل الاسم' : 'Click to rename'}
              >
                {tableName || (isAr ? 'جدول ذكي' : 'Smart table')}
              </button>
            )}
            <span
              className="shrink-0 rounded border border-border bg-card px-1 py-px font-mono text-[10px] font-semibold text-muted-foreground"
              title={direction === 'rtl' ? (isAr ? 'يمين ← يسار (ورقة عربية — Univer)' : 'Right-to-left (Arabic Univer sheet)') : (isAr ? 'يسار ← يمين (ورقة إنجليزية — Univer)' : 'Left-to-right (English Univer sheet)')}
            >
              {direction.toUpperCase()}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void handleToggleDirection()}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
            title={isAr ? 'تبديل الاتجاه (العربي = ورقة Univer عربية، الإنجليزي = ورقة Univer إنجليزية)' : 'Toggle direction (RTL = Arabic Univer sheet, LTR = English Univer sheet)'}
          >
            <ArrowRightLeft className="h-3 w-3" />
            <span className="hidden sm:inline">{isAr ? 'الاتجاه' : 'Direction'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleMirrorRepair()}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
            title={isAr ? 'إصلاح ترتيب الأعمدة — فقط إذا كانت القيم متبدلة (الضغط مرتين يعيد الأصل)' : 'Repair column order — only if values look swapped (pressing twice restores)'}
          >
            <ArrowLeftRight className="h-3 w-3" />
            <span className="hidden sm:inline">{isAr ? 'إصلاح الأعمدة' : 'Fix columns'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
            title={isAr ? 'مسح كل القيم داخل الجدول' : 'Clear all values inside the table'}
          >
            <Eraser className="h-3 w-3" />
            <span className="hidden sm:inline">{isAr ? 'مسح القيم' : 'Clear'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50"
            title={isAr ? 'حذف الجدول نهائيًا من التقرير' : 'Delete the table permanently'}
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden sm:inline">{isAr ? 'حذف الجدول' : 'Delete'}</span>
          </button>
        </div>
        <SmartTableErrorBoundary tableId={tableId} onDeleteNode={deleteNode}>
          {/*
            Single engine: Univer for BOTH directions (تعريب شامل).
            - RTL → ورقة Univer عربية: واجهة ar-SA + rightToLeft + محاذاة يمين
              + خط عربي + إطار شبكة معكوس (عمود A يمين — lib/grid/univer-rtl-frame).
            - LTR → ورقة Univer إنجليزية: واجهة en-US + محاذاة يسار.
            Direction toggle flips the live Univer snapshot (locale/rightToLeft/
            defaultStyle) then rebuilds — no data move, no formula rewrite.
            Flush handshake (above) runs before every toggle/clear/repair,
            so no keystroke is lost in the switch.
          */}
          <UniverTable
            key={`${tableId}-${direction}`}
            tableId={tableId}
            reportId={reportId}
            mode={displayMode}
            onDeleteNode={deleteNode}
          />
        </SmartTableErrorBoundary>
      </div>
      {confirmNode}
    </NodeViewWrapper>
  );
}
