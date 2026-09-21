'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Archive, AlertCircle } from 'lucide-react';

interface ArchiveBoardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  boardTitle: string;
  onConfirmArchive: () => void;
  lang?: 'ar' | 'en';
}

export function ArchiveBoardDialog({
  isOpen,
  onClose,
  boardTitle,
  onConfirmArchive,
  lang = 'ar',
}: ArchiveBoardDialogProps) {
  const isAr = lang === 'ar';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-6" dir={isAr ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-950/50">
              <Archive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-base font-bold">
              {isAr ? `أرشفة اللوحة: ${boardTitle}` : `Archive Board: ${boardTitle}`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-2 leading-relaxed">
            {isAr
              ? 'هل ترغب بالتأكيد في أرشفة هذه اللوحة؟ ستنتقل إلى قائمة اللوحات المؤرشفة ويمكنك استعادتها إلى مساحة العمل في أي وقت.'
              : 'Are you sure you want to archive this board? It will move to Archived Boards and can be restored at any time.'}
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 my-2 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? 'الأرشفة تحفظ جميع العناصر والرسومات والملاحظات بأمان دون حذف، ويمكنك الوصول إليها واستعادتها من زر "اللوحات المؤرشفة" في الشريط العلوي.'
              : 'Archiving safely preserves all elements, drawings, and notes without deletion. Access and restore them anytime from "Archived Boards" in the header.'}
          </p>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => {
              onConfirmArchive();
              onClose();
            }}
            className="text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{isAr ? 'تأكيد الأرشفة' : 'Archive Board'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
