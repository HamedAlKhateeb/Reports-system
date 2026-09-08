'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { InsightHelpPopover, InsightHelpDetails } from '@/components/ui/InsightHelpPopover';
import { getMetricHelpDetails } from '@/lib/insight-help-data';

export interface IssueMetricCardProps {
  title: string;
  count: number;
  breakdown?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger' | 'warning' | 'info' | 'success';
  percentage?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyLabel?: string;
  onClick?: () => void;
  active?: boolean;
  helpKey?: string;
  helpDetails?: InsightHelpDetails;
}

export function IssueMetricCard({
  title,
  count,
  breakdown,
  icon,
  variant = 'default',
  percentage,
  loading = false,
  error = null,
  onRetry,
  emptyLabel,
  onClick,
  active = false,
  helpKey,
  helpDetails,
}: IssueMetricCardProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const resolvedHelpDetails = helpDetails || (helpKey ? getMetricHelpDetails(helpKey, lang) : null);

  const variantStyles = {
    default: {
      border: 'border-border/80',
      bg: 'bg-card',
      iconBg: 'bg-olive-50 dark:bg-olive-950/60 text-olive-700 dark:text-olive-300',
      text: 'text-foreground',
      activeRing: 'ring-2 ring-olive-600',
    },
    danger: {
      border: 'border-red-200 dark:border-red-900/60',
      bg: 'bg-card hover:bg-red-50/20 dark:hover:bg-red-950/10',
      iconBg: 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400',
      text: 'text-red-600 dark:text-red-400',
      activeRing: 'ring-2 ring-red-500',
    },
    warning: {
      border: 'border-amber-200 dark:border-amber-900/60',
      bg: 'bg-card hover:bg-amber-50/20 dark:hover:bg-amber-950/10',
      iconBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
      text: 'text-amber-600 dark:text-amber-400',
      activeRing: 'ring-2 ring-amber-500',
    },
    info: {
      border: 'border-blue-200 dark:border-blue-900/60',
      bg: 'bg-card hover:bg-blue-50/20 dark:hover:bg-blue-950/10',
      iconBg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
      text: 'text-blue-600 dark:text-blue-400',
      activeRing: 'ring-2 ring-blue-500',
    },
    success: {
      border: 'border-emerald-200 dark:border-emerald-900/60',
      bg: 'bg-card hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
      text: 'text-emerald-600 dark:text-emerald-400',
      activeRing: 'ring-2 ring-emerald-500',
    },
  }[variant];

  // 1. LOADING STATE (Skeleton)
  if (loading) {
    return (
      <Card className="border-border/70 bg-card shadow-2xs p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2 w-2/3">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-7 w-12 bg-muted rounded" />
            <div className="h-2.5 w-28 bg-muted rounded" />
          </div>
          <div className="h-10 w-10 bg-muted rounded-xl" />
        </div>
      </Card>
    );
  }

  // 2. ERROR STATE
  if (error) {
    return (
      <Card className="border-red-300 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/20 p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">{title}</span>
            <p className="text-[11px] text-red-600/80 leading-tight">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-300 hover:underline pt-1"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
              </button>
            )}
          </div>
          <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600">
            <AlertCircle className="h-4 w-4" />
          </div>
        </div>
      </Card>
    );
  }

  // 3. EMPTY STATE vs 4. READY STATE
  const isEmpty = count === 0;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'group transition-all duration-150 shadow-2xs select-none border',
        variantStyles.border,
        variantStyles.bg,
        onClick && 'cursor-pointer hover:shadow-xs hover:border-foreground/30',
        active && variantStyles.activeRing
      )}
    >
      <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider line-clamp-1">
              {title}
            </span>
            {resolvedHelpDetails && (
              <InsightHelpPopover details={resolvedHelpDetails} />
            )}
          </div>
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-transform group-hover:scale-105',
              variantStyles.iconBg
            )}
          >
            {icon}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums',
                isEmpty ? 'text-muted-foreground' : variantStyles.text
              )}
            >
              {typeof percentage === 'number' ? `${percentage}%` : count}
            </span>

            {typeof percentage === 'number' && (
              <span className="text-xs text-muted-foreground font-medium">
                ({count} {isAr ? 'مغلقة' : 'closed'})
              </span>
            )}
          </div>

          {/* Level 3: Breakdown or Empty Explanation */}
          {isEmpty ? (
            <p className="text-[11px] text-muted-foreground/80 line-clamp-1">
              {emptyLabel || (isAr ? 'لا توجد مشاكل مسجلة' : 'No recorded issues')}
            </p>
          ) : breakdown ? (
            <p className="text-[11px] text-muted-foreground font-medium line-clamp-1">
              {breakdown}
            </p>
          ) : null}

          {/* Level 3b: Progress Bar for percentages */}
          {typeof percentage === 'number' && (
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-400 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              />
            </div>
          )}
        </div>

        {/* Level 4: Click to filter hint */}
        {onClick && (
          <div className="pt-1 flex items-center justify-between text-[10px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
            <span>{isAr ? 'تصفية في المشاكل' : 'Filter in issues'}</span>
            {isAr ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
