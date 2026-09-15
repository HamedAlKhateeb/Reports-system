'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, UserPlus, FileText, CheckCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { ReportItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface InviteInboxDialogProps {
  isOpen: boolean;
  onClose: () => void;
  inbox: ReportItem[];
  unseen: string[];
  onOpenReport: (id: string) => void;
  onMarkAllSeen: () => void;
  userEmail?: string | null;
}

export function InviteInboxDialog({
  isOpen,
  onClose,
  inbox,
  unseen,
  onOpenReport,
  onMarkAllSeen,
  userEmail,
}: InviteInboxDialogProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const router = useRouter();
  if (!isOpen) return null;

  const goReport = (id: string) => {
    onOpenReport(id);
    onClose();
    router.push(`/reports/${id}`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl text-card-foreground max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 shrink-0">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground">
              {isAr ? 'دعوات المشاركة' : 'Share invites'}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {isAr
                ? `التقارير التي شاركها معك الآخرون — تظهر هنا بعد تسجيل الدخول بنفس البريد المدعو به (${userEmail || '—'}).`
                : `Reports others shared with you — they appear here after signing in with the invited email (${userEmail || '—'}).`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" title={isAr ? 'إغلاق' : 'Close'}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {inbox.length > 0 && unseen.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={onMarkAllSeen}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>{isAr ? 'تعليم الكل كمقروء' : 'Mark all read'}</span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {inbox.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold text-foreground">
                {isAr ? 'لا توجد دعوات بعد' : 'No invites yet'}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
                {isAr
                  ? 'عندما يدعوك زميل لتقرير ببريدك الحالي ستظهر الدعوة هنا وفوق جرس الإشعارات. تأكد أن الدعوة أُرسلت لنفس هذا البريد تمامًا.'
                  : 'When a colleague invites your current email to a report, it will appear here and on the bell. Make sure the invite was sent to exactly this email.'}
              </p>
            </div>
          ) : (
            inbox.map((rep) => {
              const isNew = unseen.includes(rep.id);
              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => goReport(rep.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-start hover:bg-muted/60 transition-colors"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <span className="truncate">{rep.title || (isAr ? 'تقرير' : 'Report')}</span>
                      {isNew && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
                        #{rep.reportNumber}
                      </Badge>
                      {isNew && (
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {isAr ? 'جديدة' : 'New'}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  );
}
