'use client';

import React, { useMemo } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { evaluateSharePassword } from '@/lib/share-password';
import { cn } from '@/lib/utils';

interface SharePasswordFormProps {
  lang: 'ar' | 'en';
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
}

const STRENGTH_BAR = ['bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-600'];

export function SharePasswordForm({ lang, draft, onDraft, onSubmit, busy }: SharePasswordFormProps) {
  const isAr = lang === 'ar';
  const evalResult = useMemo(() => evaluateSharePassword(draft), [draft]);
  const widthPct = draft ? `${(evalResult.score / 4) * 100}%` : '0%';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (evalResult.passed && !busy) onSubmit();
            }
          }}
          placeholder={isAr ? 'كلمة سر قوية للرابط' : 'Strong link password'}
          autoComplete="new-password"
          maxLength={64}
          className="h-8 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:border-teal-600"
          aria-label={isAr ? 'كلمة سر المشاركة' : 'Share password'}
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || !evalResult.passed}
          onClick={onSubmit}
          className="h-8 text-xs shrink-0"
          title={
            evalResult.passed
              ? isAr ? 'تفعيل كلمة السر' : 'Enable password'
              : isAr ? 'أكمل المعايير أولًا' : 'Meet the criteria first'
          }
        >
          <KeyRound className="h-3.5 w-3.5 me-1" />
          <span>{isAr ? 'تفعيل' : 'Enable'}</span>
        </Button>
      </div>

      {draft.length > 0 && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" dir="ltr">
              <div
                className={cn('h-full rounded-full transition-all', STRENGTH_BAR[Math.max(0, evalResult.score - 1)] || 'bg-red-400')}
                style={{ width: widthPct }}
              />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">
              {isAr ? evalResult.strengthAr : evalResult.strengthEn}
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
            {evalResult.rules.map((rule) => (
              <li
                key={rule.id}
                className={cn(
                  'flex items-center gap-1 text-[10px]',
                  rule.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0',
                    rule.ok ? 'border-emerald-500 bg-emerald-500/15' : 'border-border'
                  )}
                >
                  {rule.ok && <Check className="h-2.5 w-2.5" />}
                </span>
                <span>{isAr ? rule.labelAr : rule.labelEn}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
