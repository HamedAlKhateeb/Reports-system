'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Board } from '@/lib/boards-types';
import { getTrashBoards, restoreBoardFromTrash, deleteBoardPermanently, getRemainingDaysInTrash } from '@/lib/boards-db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Archive, RotateCcw, Trash2, Search, Calendar, Layers, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArchivedBoardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerUid?: string;
  projectId?: string;
  lang?: 'ar' | 'en';
  onRestored: (board: Board) => void;
}

export function ArchivedBoardsModal({
  isOpen,
  onClose,
  ownerUid,
  projectId,
  lang = 'ar',
  onRestored,
}: ArchivedBoardsModalProps) {
  const isArabic = lang === 'ar';
  const [boards, setBoards] = useState<Board[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getTrashBoards(ownerUid, projectId);
      setBoards(list);
    } catch (e) {
      console.error('Failed to load trash boards', e);
    } finally {
      setLoading(false);
    }
  }, [ownerUid, projectId]);

  useEffect(() => {
    if (isOpen) {
      loadArchived();
      setConfirmDeleteId(null);
      setSearch('');
    }
  }, [isOpen, loadArchived]);

  const handleRestore = async (boardId: string) => {
    const restored = await restoreBoardFromTrash(boardId, ownerUid);
    if (restored) {
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
      onRestored(restored);
    }
  };

  const handleDeletePermanent = async (boardId: string) => {
    await deleteBoardPermanently(boardId, ownerUid);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    setConfirmDeleteId(null);
  };

  const filteredBoards = boards.filter((b) =>
    (b.title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden" dir={isArabic ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Archive className="w-5 h-5" />
            <DialogTitle className="text-lg font-bold">
              {isArabic ? 'أرشفة اللوحات' : 'Archived Boards'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
            {isArabic
              ? 'تُحفظ اللوحات المؤرشفة هنا مع إمكانية استعادتها إلى اللوحة في أي وقت أو حذفها نهائياً.'
              : 'Archived boards are stored here and can be restored back to your canvas or deleted permanently.'}
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative my-3">
          <Search className="w-4 h-4 absolute start-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isArabic ? 'بحث في أرشفة اللوحات...' : 'Search archived boards...'}
            className="w-full ps-9 pe-4 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            dir="auto"
          />
        </div>

        {/* Board List */}
        <div className="flex-1 overflow-y-auto space-y-2 pe-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {isArabic ? 'جاري التحميل...' : 'Loading...'}
            </div>
          ) : filteredBoards.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <Archive className="w-8 h-8 opacity-30" />
              <span>{isArabic ? 'لا توجد لوحات مؤرشفة.' : 'No archived boards.'}</span>
            </div>
          ) : (
            filteredBoards.map((board) => {
              const daysLeft = getRemainingDaysInTrash(board);
              return (
                <div
                  key={board.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/70 hover:border-border hover:bg-muted/30 transition-all gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm truncate text-foreground">
                        {board.title || (isArabic ? 'لوحة بدون عنوان' : 'Untitled Board')}
                      </h4>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold shrink-0',
                          daysLeft <= 2
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                        )}
                        title={isArabic ? 'المهلة المتبقية قبل الحذف النهائي التلقائي' : 'Time before auto-purge'}
                      >
                        <Clock className="w-3 h-3" />
                        {isArabic
                          ? `متبقي ${daysLeft} ${daysLeft === 1 ? 'يوم' : daysLeft === 2 ? 'يومان' : 'أيام'}`
                          : `${daysLeft} days left`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {board.widgets?.length || 0} {isArabic ? 'عنصر' : 'widgets'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(board.deletedAt || board.archivedAt || board.updatedAt).toLocaleDateString(
                          isArabic ? 'ar-SA' : 'en-US'
                        )}
                      </span>
                    </div>
                  </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {confirmDeleteId === board.id ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in">
                      <span className="text-[11px] text-destructive font-medium">
                        {isArabic ? 'تأكيد الحذف؟' : 'Confirm?'}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs px-2"
                        onClick={() => handleDeletePermanent(board.id)}
                      >
                        {isArabic ? 'حذف نهائي' : 'Delete'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        {isArabic ? 'إلغاء' : 'Cancel'}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs gap-1.5 font-medium"
                        onClick={() => handleRestore(board.id)}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-primary" />
                        <span>{isArabic ? 'استعادة' : 'Restore'}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteId(board.id)}
                        title={isArabic ? 'حذف نهائي' : 'Delete Permanently'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      </DialogContent>
    </Dialog>
  );
}
