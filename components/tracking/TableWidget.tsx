'use client';

import React, { useEffect, useState } from 'react';
import type { BoardWidget } from '@/lib/boards-types';
import { Table2 } from 'lucide-react';

export function TableWidget({ widget, lang = 'ar' }: { widget: BoardWidget; lang?: 'ar' | 'en' }) {
  const isAr = lang === 'ar';
  const d: any = widget.data || {};
  const tableId = String(d.tableId || '');
  const snapshot = d?.snapshot as { headers?: string[]; rows?: string[][] } | undefined;
  const tableName = d.tableName ? String(d.tableName) : '';
  const [summary, setSummary] = useState<{ name: string; rows: number; cols: number } | null>(null);

  useEffect(() => {
    if (snapshot || !tableId || tableId.startsWith('ntbl_')) {
      setSummary(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const mod = await import('@/lib/db-intelligence');
        const ent = await mod.getTableById(tableId);
        if (!alive) return;
        if (ent) {
          setSummary({
            name: String((ent as any).name || tableName || tableId),
            rows: Array.isArray((ent as any).rows_data) ? (ent as any).rows_data.length : 0,
            cols: Array.isArray((ent as any).columns_data) ? (ent as any).columns_data.length : 0,
          });
        } else {
          setSummary({ name: String(tableName || tableId), rows: 0, cols: 0 });
        }
      } catch {
        if (alive) setSummary({ name: String(tableName || tableId), rows: 0, cols: 0 });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tableId, snapshot, tableName]);

  // Native (normal) table: frozen content snapshot preview.
  if (snapshot && Array.isArray(snapshot.headers)) {
    const headers = snapshot.headers;
    const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
    const shown = rows.slice(0, 5);
    return (
      <div className="flex h-full flex-col gap-1.5 p-2.5" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <Table2 className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
          <span className="truncate">{String(d.tableName || (isAr ? 'جدول عادي' : 'Normal table'))}</span>
          <span className="shrink-0 rounded border border-border bg-muted/50 px-1 py-px font-mono text-[9px] text-muted-foreground">
            {isAr ? 'عادي' : 'basic'}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/70">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-muted/60">
                {headers.map((h, i) => (
                  <th key={i} className="border border-border/60 px-1.5 py-1 text-start font-bold">
                    {h || '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <tr key={ri}>
                  {headers.map((_, ci) => (
                    <td key={ci} className="max-w-[90px] truncate border border-border/60 px-1.5 py-1" dir="auto">
                      {r[ci] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 text-[10px] text-muted-foreground">
          {isAr
            ? `${rows.length} صف × ${headers.length} عمود (لقطة من المحرر)`
            : `${rows.length} rows × ${headers.length} cols (editor snapshot)`}
          {rows.length > shown.length ? ` · +${rows.length - shown.length}` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1.5 p-2.5" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <Table2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
        <span className="truncate">{summary?.name || d.tableName || (isAr ? 'جدول من التقرير' : 'Report table')}</span>
      </div>
      <div className="rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px] text-muted-foreground">
        <div className="font-mono" dir="ltr">
          {tableId.slice(0, 24)}
        </div>
        <div className="mt-1 font-bold text-foreground">
          {isAr ? `${summary?.rows ?? '—'} صف × ${summary?.cols ?? '—'} عمود` : `${summary?.rows ?? '—'} rows × ${summary?.cols ?? '—'} cols`}
        </div>
        <div className="mt-1 text-[10px]">{isAr ? 'معاينة حية للجدول داخل المحرر — هذه بطاقة مرجعية للتتبع.' : 'Live table lives in the editor — this is a tracking reference card.'}</div>
      </div>
      {d.reportId ? (
        <div className="mt-auto font-mono text-[10px] text-muted-foreground" dir="ltr">
          rep:{String(d.reportId).slice(0, 12)}…
        </div>
      ) : null}
    </div>
  );
}
