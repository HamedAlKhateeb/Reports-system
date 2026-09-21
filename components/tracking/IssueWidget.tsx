'use client';

import React from 'react';
import type { BoardWidget } from '@/lib/boards-types';
import { AlertTriangle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200',
  major: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200',
  minor: 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300 border-slate-200',
};

export function IssueWidget({ widget, lang = 'ar' }: { widget: BoardWidget; lang?: 'ar' | 'en' }) {
  const isAr = lang === 'ar';
  const d: any = widget.data || {};
  const sev = String(d.severity || 'medium').toLowerCase();
  const sevCls = SEV_COLOR[sev] || SEV_COLOR.medium;
  const status = String(d.status || '');
  const statusLabel = status === 'done' ? (isAr ? 'منجز' : 'Done') : status === 'in_progress' ? (isAr ? 'قيد التنفيذ' : 'In progress') : (isAr ? 'مفتوح' : 'Open');
  return (
    <div className="flex h-full flex-col gap-1.5 p-2.5 text-start" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', sevCls)}>{d.severity || 'medium'}</span>
        <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{statusLabel}</span>
      </div>
      <div className="text-xs font-bold leading-snug text-foreground line-clamp-2">{widget.title || d.title || (isAr ? 'مشكلة' : 'Issue')}</div>
      {d.description ? <div className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">{String(d.description).slice(0, 220)}</div> : null}
      {d.linkedReportId ? (
        <div className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span className="truncate font-mono" dir="ltr">{String(d.linkedReportId).slice(0, 12)}…</span>
        </div>
      ) : null}
    </div>
  );
}
