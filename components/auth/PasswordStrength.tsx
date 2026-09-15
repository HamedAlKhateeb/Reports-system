'use client';

import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { evaluateAccountPassword } from '@/lib/password-policy';
import { cn } from '@/lib/utils';

export function PasswordStrength({ password, lang }: { password: string; lang: 'ar' | 'en' }) {
  const ev = useMemo(() => evaluateAccountPassword(password), [password]);
  if (!password) return null;
  const pct = Math.round((ev.score / ev.rules.length) * 100);
  const barColor =
    ev.score <= 2 ? 'bg-red-500' : ev.score <= 4 ? 'bg-amber-500' : ev.score === 5 ? 'bg-emerald-500' : 'bg-emerald-600';
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-foreground">
          {lang === 'ar' ? 'قوة كلمة السر' : 'Password strength'}: {lang === 'ar' ? ev.strengthAr : ev.strengthEn}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">{ev.score}/6</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" dir="ltr">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {ev.rules.map((r) => (
          <li key={r.id} className="flex items-center gap-1.5 text-[11px]">
            {r.ok ? (
              <Check className="h-3 w-3 shrink-0 text-emerald-600" />
            ) : (
              <X className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className={r.ok ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}>
              {lang === 'ar' ? r.labelAr : r.labelEn}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
