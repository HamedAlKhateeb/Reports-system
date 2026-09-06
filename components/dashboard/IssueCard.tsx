'use client';

import React from 'react';
import { MessageSquare, Calendar, Link2, AlertCircle, Clock } from 'lucide-react';
import { IssueItem, ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getSeverityLabel, IssueSeverity } from '@/lib/i18n/dictionary';

interface IssueCardProps {
  issue: IssueItem;
  linkedReport?: ReportItem | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, issueId: string) => void;
}

export function IssueCard({ issue, linkedReport, onClick, onDragStart }: IssueCardProps) {
  const { lang, t } = useLanguage();

  const getSeverityStyle = (sev: IssueSeverity) => {
    switch (sev) {
      case 'critical':
        return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50';
      case 'major':
        return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50';
      case 'normal':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50';
      case 'minor':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800';
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, issue.id)}
      onClick={onClick}
      className="group relative cursor-grab active:cursor-grabbing rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-teal-400 hover:shadow-md"
    >
      {/* Top: Severity Badge and Optional Report Link */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${getSeverityStyle(
            issue.severity
          )}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span>{getSeverityLabel(issue.severity, lang)}</span>
        </span>

        {linkedReport && (
          <span
            className="flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 max-w-[140px] truncate"
            title={`${linkedReport.title} (#${linkedReport.reportNumber})`}
          >
            <Link2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">#{linkedReport.reportNumber}</span>
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-2">
        {issue.title}
      </h3>

      {/* Description Snippet */}
      {issue.description && (
        <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {issue.description}
        </p>
      )}

      {/* Footer: Date & Comments Count */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>
            {new Date(issue.updatedAt || issue.createdAt).toLocaleDateString(
              lang === 'ar' ? 'ar-EG' : 'en-US'
            )}
          </span>
        </div>

        <div className="flex items-center gap-1 font-medium text-slate-500">
          <MessageSquare className="h-3 w-3" />
          <span>{issue.commentsCount || 0}</span>
        </div>
      </div>
    </div>
  );
}
