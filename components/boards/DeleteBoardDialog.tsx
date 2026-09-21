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
import { Trash2, Archive, AlertTriangle } from 'lucide-react';

interface DeleteBoardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  boardTitle: string;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
  lang?: 'ar' | 'en';
}

export function DeleteBoardDialog({
  isOpen,
  onClose,
  boardTitle,
  onSoftDelete,
  onPermanentDelete,
  lang = 'ar',
}: DeleteBoardDialogProps) {
  const isAr = lang === 'ar';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-6" dir={isAr ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
            <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-950/50">
              <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <DialogTitle className="text-base font-bold">
              {isAr ? `حذف اللوحة: ${boardTitle}` : `Delete Board: ${boardTitle}`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-2 leading-relaxed">
            {isAr
              ? 'هل ترغب في نقل اللوحة إلى سلة المحذوفات أم حذفها نهائياً؟'
              : 'Do you want to move this board to trash or delete it permanently?'}
          </DialogDescription>
        </DialogHeader>

        {/* Options Explanation */}
        <div className="flex flex-col gap-2.5 my-3">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-amber-700 dark:text-amber-300 block mb-0.5">
                {isAr ? 'حذف مؤقت (سلة المحذوفات - 10 أيام)' : 'Move to Trash (10-day retention)'}
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {isAr
                  ? 'تنتقل اللوحة إلى سلة المحذوفات ويمكنك استعادتها في أي وقت خلال 10 أيام، وبعد انقضاء المهلة تُحذف تلقائياً.'
                  : 'Board moves to trash where it can be restored within 10 days. Automatically purged after 10 days.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-rose-700 dark:text-rose-300 block mb-0.5">
                {isAr ? 'حذف نهائي الآن' : 'Permanent Delete'}
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {isAr
                  ? 'يتم مسح اللوحة ومحتوياتها وعناصرها بالكامل فوراً ولا يمكن استرجاعها.'
                  : 'Permanently destroys the board and all its visual elements immediately. Cannot be undone.'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onSoftDelete();
              onClose();
            }}
            className="text-xs gap-1.5 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{isAr ? 'نقل للسلة (10 أيام)' : 'Move to Trash (10d)'}</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onPermanentDelete();
              onClose();
            }}
            className="text-xs gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isAr ? 'حذف نهائي' : 'Delete Permanently'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
