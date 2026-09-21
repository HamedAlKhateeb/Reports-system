'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { SmartTableErrorBoundary } from './grid/SmartTableErrorBoundary';
import { MiniSpreadsheet } from './grid/MiniSpreadsheet';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Eraser, Trash2, ArrowRightLeft, Table2, KanbanSquare } from 'lucide-react';

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

  // Load table metadata
  useEffect(() => {
    if (!tableId || typeof tableId !== 'string') return;
    let alive = true;
    const load = async () => {
      try {
        const { getTableById, getTableDirection } = await import('@/lib/db-intelligence');
        const ent = await getTableById(tableId);
        if (!alive) return;
        if (ent) {
          if (typeof ent.name === 'string') setTableName(ent.name);
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
    window.addEventListener('smart-table-updated', onUpd);
    return () => {
      alive = false;
      window.removeEventListener('smart-table-updated', onUpd);
    };
  }, [tableId]);

  const handleDelete = useCallback(async () => {
    if (busy) return;
    const ok = await askConfirm(
      isAr
        ? 'حذف هذا الجدول الذكي نهائيًا من التقرير؟ سيُحذف الجدول وكل قيمه ولا يمكن التراجع.'
        : 'Permanently delete this smart table from the report? The table and all its values will be gone.'
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
      console.warn('Smart table delete failed', err);
    } finally {
      setBusy(false);
    }
    try {
      deleteNode();
    } catch (err) {
      console.warn('deleteNode failed', err);
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
      const { clearTableValues } = await import('@/lib/db-intelligence');
      await clearTableValues(tableId);
    } catch (err) {
      console.warn('Clear table values failed', err);
    } finally {
      setBusy(false);
    }
  }, [askConfirm, busy, isAr, tableId]);

  const handleToggleDirection = useCallback(async () => {
    if (busy) return;
    try {
      setBusy(true);
      const { toggleTableDirection } = await import('@/lib/db-intelligence');
      const next = await toggleTableDirection(tableId);
      if (next) setDirection(next);
    } catch (err) {
      console.warn('Toggle table direction failed', err);
    } finally {
      setBusy(false);
    }
  }, [busy, tableId]);

  const commitRename = useCallback(async () => {
    if (!renaming) return;
    const next = nameDraft.trim().slice(0, 120);
    setRenaming(false);
    if (!next || next === tableName) return;
    try {
      const { getTableById, saveTable } = await import('@/lib/db-intelligence');
      const ent = await getTableById(tableId);
      if (!ent) return;
      await saveTable({ ...ent, name: next });
      setTableName(next);
      try {
        window.dispatchEvent(new CustomEvent('smart-table-updated', { detail: { tableId, name: next } }));
      } catch {}
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
              title={direction === 'rtl' ? (isAr ? 'يمين ← يسار' : 'Right-to-left') : (isAr ? 'يسار ← يمين' : 'Left-to-right')}
            >
              {direction.toUpperCase()}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void handleToggleDirection()}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
            title={isAr ? 'تبديل الاتجاه (عربي RTL / إنجليزي LTR)' : 'Toggle direction (RTL / LTR)'}
          >
            <ArrowRightLeft className="h-3 w-3" />
            <span className="hidden sm:inline">{isAr ? 'الاتجاه' : 'Direction'}</span>
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
            onClick={() => {
              try {
                const key = 'pending_tracking_tables';
                const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
                const list: Array<{ kind?: 'smart' | 'native'; tableId: string; reportId?: string; name?: string; snapshot?: { headers: string[]; rows: string[][] }; at: string }> = raw ? JSON.parse(raw) : [];
                if (!list.some((x) => x.tableId === tableId)) {
                  list.push({ kind: 'smart', tableId, reportId, name: tableName || tableId, at: new Date().toISOString() });
                  try { window.localStorage.setItem(key, JSON.stringify(list)); } catch {}
                }
                try { window.dispatchEvent(new CustomEvent('tracking-table-queued', { detail: { tableId, reportId } })); } catch {}
              } catch {}
            }}
            className="flex h-7 items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 text-[11px] font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/50"
            title={isAr ? 'إرسال نسخة من هذا الجدول إلى لوحة التتبع' : 'Send a copy of this table to the tracking board'}
          >
            <KanbanSquare className="h-3 w-3" />
            <span className="hidden sm:inline">{isAr ? 'للتتبع' : 'Track'}</span>
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
          <MiniSpreadsheet
            key={`mini-${tableId}`}
            tableId={tableId}
            reportId={reportId}
            direction={direction}
            mode={displayMode}
            onDeleteNode={deleteNode}
          />
        </SmartTableErrorBoundary>
      </div>
      {confirmNode}
    </NodeViewWrapper>
  );
}
