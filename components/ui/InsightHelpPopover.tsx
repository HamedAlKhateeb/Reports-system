'use client';

import React from 'react';
import { CircleHelp, Database, Calculator, HelpCircle, Target, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';

import { getMetricHelpDetails } from '@/lib/insight-help-data';

export interface InsightHelpDetails {
  title: string;
  whatIsIt: string;
  dataSource: string;
  calculation: string;
  meaning: string;
  howToBenefit: string;
  example?: string;
}

export interface InsightHelpPopoverProps {
  details?: InsightHelpDetails;
  helpDetails?: InsightHelpDetails;
  helpKey?: string;
  className?: string;
  iconClassName?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export function InsightHelpPopover({
  details,
  helpDetails,
  helpKey,
  className,
  iconClassName,
  side = 'top',
  align = 'center',
}: InsightHelpPopoverProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const resolvedDetails =
    details ||
    helpDetails ||
    (helpKey ? getMetricHelpDetails(helpKey, lang) : null);

  if (!resolvedDetails) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={isAr ? `شرح مؤشر: ${resolvedDetails.title}` : `Explanation for metric: ${resolvedDetails.title}`}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0',
            className
          )}
          title={isAr ? `ما هو مؤشر ${resolvedDetails.title}؟` : `What is ${resolvedDetails.title}?`}
        >
          <CircleHelp className={cn('size-3.5', iconClassName)} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
        className="z-50 w-80 sm:w-96 max-w-[calc(100vw-2rem)] p-4 text-xs shadow-2xl rounded-2xl border border-border bg-card text-foreground"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/70 pb-2">
            <div className="size-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <HelpCircle className="size-3.5" />
            </div>
            <h4 className="font-bold text-sm text-foreground truncate">{resolvedDetails.title}</h4>
          </div>

          {/* 1. What is it */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-muted-foreground">
              <Sparkles className="size-3 text-amber-500 shrink-0" />
              <span>{isAr ? 'ما هو هذا المؤشر؟' : 'What is this indicator?'}</span>
            </div>
            <p className="text-foreground leading-relaxed ps-4">{resolvedDetails.whatIsIt}</p>
          </div>

          {/* 2. Data Source & Calculation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl bg-muted/40 p-2.5 border border-border/50 text-[11px]">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                <Database className="size-3 text-blue-500 shrink-0" />
                <span>{isAr ? 'مصدر البيانات' : 'Data Source'}</span>
              </div>
              <p className="text-foreground leading-snug">{resolvedDetails.dataSource}</p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                <Calculator className="size-3 text-emerald-500 shrink-0" />
                <span>{isAr ? 'طريقة الحساب' : 'Calculation'}</span>
              </div>
              <p className="text-foreground leading-snug">{resolvedDetails.calculation}</p>
            </div>
          </div>

          {/* 3. Meaning */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-muted-foreground">
              <Target className="size-3 text-indigo-500 shrink-0" />
              <span>{isAr ? 'ماذا يعني الرقم أو النتيجة؟' : 'What does the number mean?'}</span>
            </div>
            <p className="text-foreground leading-relaxed ps-4">{resolvedDetails.meaning}</p>
          </div>

          {/* 4. How to Benefit */}
          <div className="space-y-1 rounded-lg bg-primary/5 p-2 border border-primary/10 text-[11px]">
            <span className="font-semibold text-primary block">
              {isAr ? '💡 كيف تستفيد منه؟' : '💡 How to benefit?'}
            </span>
            <p className="text-muted-foreground leading-relaxed">{resolvedDetails.howToBenefit}</p>
          </div>

          {/* Optional Example */}
          {resolvedDetails.example && (
            <div className="text-[10px] text-muted-foreground/80 italic border-t border-border/40 pt-1.5">
              <span className="font-semibold not-italic">{isAr ? 'مثال: ' : 'Example: '}</span>
              {resolvedDetails.example}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
