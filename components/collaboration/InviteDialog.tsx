'use client';

import React, { useState } from 'react';
import { X, UserPlus, Trash2, Mail } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { normalizeShareEmail } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. report title or folder name shown in the header */
  subjectName: string;
  kind: 'report' | 'folder';
  emails: string[];
  busy: boolean;
  error: string | null;
  onInvite: (email: string) => Promise<void>;
  onRevoke: (email: string) => Promise<void>;
}

export function InviteDialog({
  isOpen,
  onClose,
  subjectName,
  kind,
  emails,
  busy,
  error,
  onInvite,
  onRevoke,
}: InviteDialogProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInvite = async () => {
    setLocalError(null);
    if (!normalizeShareEmail(draft)) {
      setLocalError(isAr ? 'بريد إلكتروني غير صالح.' : 'Invalid email address.');
      return;
    }
    await onInvite(draft.trim().toLowerCase());
    setDraft('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl text-card-foreground">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground">
              {isAr
                ? kind === 'report'
                  ? 'دعوة متعاونين للتقرير'
                  : 'دعوة متعاونين للمجلد'
                : kind === 'report'
                  ? 'Invite report collaborators'
                  : 'Invite folder collaborators'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="auto">
              {subjectName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          {isAr
            ? kind === 'report'
              ? 'المدعوون (بحسابات مسجلة) يمكنهم عرض هذا التقرير وتعديله والتعليق على مشاكله. لا يمكنهم حذفه أو مشاركته مع آخرين.'
              : 'المدعوون يمكنهم عرض وتعديل كل التقارير داخل هذا المجلد — الحالية والمستقبلية — والتعليق على مشاكلها المرتبطة بها فقط.'
            : kind === 'report'
              ? 'Invitees (registered accounts) can view and edit this report and comment on its issues. They cannot delete it or re-share it.'
              : 'Invitees can view and edit every report in this folder — current and future — and comment on their linked issues only.'}
        </p>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Mail className="h-3.5 w-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              dir="ltr"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleInvite();
                }
              }}
              placeholder="name@example.com"
              className="ps-9 text-xs"
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleInvite()}
            disabled={busy || !draft.trim()}
            className="h-9 shrink-0 rounded-xl bg-[#2E4034] text-white hover:bg-[#24382F]"
          >
            {busy ? (isAr ? '...' : '...') : isAr ? 'دعوة' : 'Invite'}
          </Button>
        </div>

        {(localError || error) && (
          <div className="mb-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-[11px] text-rose-700 dark:text-rose-300">
            {localError || error}
          </div>
        )}

        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {emails.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-3">
              {isAr ? 'لا يوجد متعاونون بعد.' : 'No collaborators yet.'}
            </p>
          )}
          {emails.map((email) => (
            <div
              key={email}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2"
            >
              <span className="text-xs font-mono truncate" dir="ltr">
                {email}
              </span>
              <button
                type="button"
                onClick={() => void onRevoke(email)}
                disabled={busy}
                className="text-rose-600 hover:text-rose-700 p-1 shrink-0"
                title={isAr ? 'إلغاء الدعوة' : 'Revoke invite'}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
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
