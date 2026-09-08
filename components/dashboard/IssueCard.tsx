'use client';

import React, { useState } from 'react';
import { Link2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { IssueItem, ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getSeverityLabel, IssueSeverity } from '@/lib/i18n/dictionary';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const [canDrag, setCanDrag] = useState(false);

  // 5 Canonical severities using standard shadcn badge variants
  const getSeverityBadgeVariant = (
    sev: IssueSeverity | string
  ): 'destructive' | 'default' | 'secondary' | 'outline' => {
    switch (sev) {
      case 'critical':
      case 'حرجة':
        return 'destructive';
      case 'major':
      case 'كبيرة':
        return 'default';
      case 'medium':
      case 'متوسطة':
        return 'secondary';
      case 'normal':
      case 'عادية':
        return 'secondary';
      case 'minor':
      case 'طفيفة':
      default:
        return 'outline';
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
        <div className="h-1.5 w-full bg-primary rounded-full mb-1.5 shadow-2xs animate-pulse" />
      )}

      <Card
        draggable={canDrag}
        onDragStart={(e) => onDragStart(e, issue.id)}
        onDragEnd={() => setCanDrag(false)}
        onDragOver={handleCardDragOver}
        onDragLeave={onDragLeaveCard}
        onDrop={handleCardDrop}
        onClick={onClick}
        style={{ touchAction: 'pan-y' }}
        className={cn(
          "group relative transition-all hover:border-primary/60 hover:shadow-md select-none overflow-hidden",
          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        )}
      >
        <CardHeader className="p-3.5 pb-2">
          {/* Top: Severity Badge, Grip Handle & Actions */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span
                onMouseEnter={() => setCanDrag(true)}
                onMouseLeave={() => setCanDrag(false)}
                onMouseDown={() => setCanDrag(true)}
                onTouchStart={() => setCanDrag(true)}
                onTouchEnd={() => setCanDrag(false)}
                className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted/50 touch-none"
                title={lang === 'ar' ? 'اسحب للترتيب الرأسي' : 'Drag to reorder vertically'}
              >
                <GripVertical className="size-3.5" />
              </span>

              <Badge
                variant={getSeverityBadgeVariant(issue.severity)}
                className="gap-1 px-2 py-0.5 text-[11px] font-bold"
              >
                <span className="size-1.5 rounded-full bg-current" />
                <span>{getSeverityLabel(issue.severity, lang)}</span>
              </Badge>
            </div>

            <div className="flex items-center gap-1">
              {/* Quick Move Up/Down Buttons */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-muted/60 dark:bg-muted/30 rounded-md p-0.5 gap-0.5">
                {canMoveUp && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onMoveUp}
                    className="size-5 rounded p-0 text-muted-foreground hover:text-foreground"
                    title={t('moveIssueUp')}
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                )}
                {canMoveDown && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onMoveDown}
                    className="size-5 rounded p-0 text-muted-foreground hover:text-foreground"
                    title={t('moveIssueDown')}
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                )}
              </div>

              {linkedReport && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 text-[11px] font-semibold bg-primary/5 text-primary border-primary/20 max-w-[120px] truncate"
                  title={`${linkedReport.title} (#${linkedReport.reportNumber})`}
                >
                  <Link2 className="size-3 shrink-0" />
                  <span className="truncate">#{linkedReport.reportNumber}</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Title */}
          <CardTitle className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
            {issue.title}
          </CardTitle>
        </CardHeader>

      </Card>

      {/* Drop indicator: After */}
      {isDragOverTarget && dropPosition === 'after' && (
        <div className="h-1.5 w-full bg-primary rounded-full mt-1.5 shadow-2xs animate-pulse" />
      )}
    </div>
  );
}
