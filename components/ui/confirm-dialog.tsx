'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface PendingConfirm {
  message: string;
  title?: string;
  resolve: (value: boolean) => void;
}

/**
 * Shared replacement for blocking `window.confirm()` (shadcn Dialog,
 * bilingual buttons, accessible Title). Usage:
 *
 *   const [confirmNode, askConfirm] = useConfirm();
 *   const ok = await askConfirm(t('deleteReportConfirm'));
 *   if (!ok) return;
 *   ...destructive action...
 *   return (<>{confirmNode}...</>);
 */
export function useConfirm(): [React.ReactNode, (message: string, title?: string) => Promise<boolean>] {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const idRef = useRef(0);

  const ask = useCallback((message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      idRef.current++;
      setPending({ message, title, resolve });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      setPending((p) => {
        p?.resolve(value);
        return null;
      });
    },
    []
  );

  const node = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{pending?.title || (isAr ? 'تأكيد الإجراء' : 'Confirm action')}</DialogTitle>
          {pending?.message ? <DialogDescription>{pending.message}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => close(false)}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => close(true)}>
            {isAr ? 'تأكيد' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [node, ask];
}
