'use client';

import React from 'react';
import { MessageSquare, Calendar, Link2, AlertCircle, Clock, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { IssueItem, ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getSeverityLabel, IssueSeverity } from '@/lib/i18n/dictionary';

interface IssueCardProps {
  issue: IssueItem;
  linkedReport?: ReportItem | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, issueId: string) => void;
  onDragOverCard?: (e: React.DragEvent, issueId: string) => void;
  onDragLeaveCard?: (e: React.DragEvent) => void;
  onDropOnCard?: (e: React.DragEvent, targetIssueId: string, position: 'before' | 'after') => void;
  isDragOverTarget?: boolean;
  dropPosition?: 'before' | 'after' | null;
  onMoveUp?: (e: React.MouseEvent) => void;
  onMoveDown?: (e: React.MouseEvent) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function IssueCard({
  issue,
  linkedReport,
  onClick,
  onDragStart,
  onDragOverCard,
  onDragLeaveCard,
  onDropOnCard,
  isDragOverTarget,
  dropPosition,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: IssueCardProps) {
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

  const handleCardDragOver = (e: React.DragEvent) => {
    if (onDragOverCard) {
      onDragOverCard(e, issue.id);
    }
  };

  const handleCardDrop = (e: React.DragEvent) => {
    if (onDropOnCard && dropPosition) {
      onDropOnCard(e, issue.id, dropPosition);
    }
  };

  return (
    <div className="relative">
      {/* Drop indicator: Before */}
      {isDragOverTarget && dropPosition === 'before' && (
        <div className="h-1.5 w-full bg-olive-600 dark:bg-olive-400 rounded-full mb-1.5 shadow-sm animate-pulse" />
      )}

      <div
        draggable
        onDragStart={(e) => onDragStart(e, issue.id)}
        onDragOver={handleCardDragOver}
        onDragLeave={onDragLeaveCard}
        onDrop={handleCardDrop}
        onClick={onClick}
        className="group relative cursor-grab active:cursor-grabbing rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card p-4 shadow-2xs transition-all hover:border-olive-500 dark:hover:border-olive-400 hover:shadow-md"
      >
        {/* Top: Severity Badge, Grip Handle & Actions */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors cursor-grab"
              title={lang === 'ar' ? 'اسحب للترتيب لأعلى أو لأسفل' : 'Drag to reorder up or down'}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${getSeverityStyle(
                issue.severity
              )}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span>{getSeverityLabel(issue.severity, lang)}</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Quick Move Up/Down Buttons */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-muted/60 dark:bg-muted/30 rounded-md p-0.5">
              {canMoveUp && (
                <button
                  type="button"
                  onClick={onMoveUp}
                  className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
                  title={t('moveIssueUp')}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
              )}
              {canMoveDown && (
                <button
                  type="button"
                  onClick={onMoveDown}
                  className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
                  title={t('moveIssueDown')}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              )}
            </div>

            {linkedReport && (
              <span
                className="flex items-center gap-1 text-[11px] font-semibold text-olive-700 bg-olive-50 dark:bg-olive-950/40 px-2 py-0.5 rounded border border-olive-200 dark:border-olive-800 max-w-[130px] truncate"
                title={`${linkedReport.title} (#${linkedReport.reportNumber})`}
              >
                <Link2 className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">#{linkedReport.reportNumber}</span>
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-foreground group-hover:text-olive-700 dark:group-hover:text-olive-400 transition-colors line-clamp-2">
          {issue.title}
        </h3>

        {/* Description Snippet */}
        {issue.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {issue.description}
          </p>
        )}

        {/* Footer: Date & Comments Count */}
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>
              {new Date(issue.updatedAt || issue.createdAt).toLocaleDateString(
                lang === 'ar' ? 'ar-EG' : 'en-US'
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 font-medium text-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>{issue.commentsCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Drop indicator: After */}
      {isDragOverTarget && dropPosition === 'after' && (
        <div className="h-1.5 w-full bg-olive-600 dark:bg-olive-400 rounded-full mt-1.5 shadow-sm animate-pulse" />
      )}
    </div>
  );
}
