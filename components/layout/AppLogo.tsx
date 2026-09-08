'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  showSubtitle?: boolean;
  className?: string;
}

export function AppLogo({
  size = 'md',
  showWordmark = true,
  showSubtitle = false,
  className,
}: AppLogoProps) {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const sizeMap = {
    sm: {
      mark: 'h-7 w-7 rounded-lg',
      svg: 'w-4 h-4',
      title: 'text-sm font-bold',
      sub: 'text-[9px]',
    },
    md: {
      mark: 'h-9 w-9 rounded-xl',
      svg: 'w-5 h-5',
      title: 'text-base font-bold',
      sub: 'text-[10px]',
    },
    lg: {
      mark: 'h-12 w-12 rounded-2xl',
      svg: 'w-6 h-6',
      title: 'text-xl font-bold',
      sub: 'text-xs',
    },
    xl: {
      mark: 'h-14 w-14 rounded-2xl',
      svg: 'w-7 h-7',
      title: 'text-2xl font-bold',
      sub: 'text-xs',
    },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      {/* SVG Geometric SaaS Mark */}
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-[#2E4034] via-[#24362A] to-[#1B281F] text-white shadow-sm ring-1 ring-white/10 shrink-0 relative overflow-hidden group',
          currentSize.mark
        )}
      >
        {/* Subtle decorative inner gradient highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 opacity-80" />

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('text-emerald-400 relative z-10 transition-transform duration-300 group-hover:scale-105', currentSize.svg)}
        >
          {/* Document Sheet */}
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="currentColor"
            className="text-white/90"
            strokeWidth="1.8"
          />
          {/* Folded Corner */}
          <polyline points="14 2 14 8 20 8" stroke="currentColor" className="text-white/90" strokeWidth="1.8" />
          {/* Data Bars */}
          <line x1="9" y1="13" x2="15" y2="13" stroke="currentColor" className="text-white/60" strokeWidth="1.8" />
          <line x1="9" y1="17" x2="13" y2="17" stroke="currentColor" className="text-white/60" strokeWidth="1.8" />
          {/* Verified Quality Emblem Check */}
          <circle cx="16.5" cy="16.5" r="4" fill="#2E4034" stroke="#10B981" strokeWidth="1.8" />
          <path d="m15 16.5 1 1 2-2" stroke="#10B981" strokeWidth="1.8" />
        </svg>
      </div>

      {/* Wordmark */}
      {showWordmark && (
        <div className="flex flex-col text-start leading-tight">
          <span
            className={cn(
              'font-extrabold tracking-tight text-foreground flex items-center gap-1.5',
              currentSize.title
            )}
          >
            <span>{isAr ? 'نظام التقارير' : 'Reports System'}</span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {showSubtitle && (
            <span className={cn('text-muted-foreground font-medium', currentSize.sub)}>
              {isAr ? 'مراجعة وتتبع الجودة والأخطاء' : 'Quality Auditing & Defect Tracking'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
