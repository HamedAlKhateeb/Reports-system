'use client';

import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  Home,
  Check,
  AlertTriangle,
  FolderTree,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { FolderItem, ReportItem } from '@/lib/types';
import { wouldCreateFolderCycle } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportToMove?: ReportItem | null;
  folderToMove?: FolderItem | null;
  folders: FolderItem[];
  onConfirmMove: (targetFolderId: string | null) => Promise<void>;
}

export function MoveToFolderModal({
  isOpen,
  onClose,
  reportToMove,
  folderToMove,
  folders,
  onConfirmMove,
}: MoveToFolderModalProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const initialTarget = reportToMove
    ? (reportToMove.folderId || null)
    : folderToMove
    ? (folderToMove.parentId || null)
    : null;

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialTarget);
  const [moving, setMoving] = useState(false);

  const handleConfirm = async () => {
    try {
      setMoving(true);
      await onConfirmMove(selectedFolderId);
      onClose();
    } catch (err: any) {
      console.error('Failed to move item', err);
      alert((isAr ? 'فشل النقل: ' : 'Failed to move: ') + err.message);
    } finally {
      setMoving(false);
    }
  };

  // Build tree hierarchy
  function renderFolderOptions(parentId: string | null = null, depth: number = 0): React.ReactNode {
    const children = folders.filter((f) => (f.parentId || null) === parentId);
    if (children.length === 0) return null;

    return (
      <div className="space-y-1">
        {children.map((f) => {
          const isCurrentParent = folderToMove ? folderToMove.parentId === f.id : reportToMove?.folderId === f.id;
          const isSameFolder = folderToMove ? folderToMove.id === f.id : false;
          const isCircular = folderToMove ? wouldCreateFolderCycle(folderToMove.id, f.id, folders) : false;
          const isDisabled = isSameFolder || isCircular;

          const isSelected = selectedFolderId === f.id;

          return (
            <React.Fragment key={f.id}>
              <div
                style={{ paddingInlineStart: `${depth * 20 + 8}px` }}
                className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed bg-muted/20'
                    : isSelected
                    ? 'bg-primary/10 border border-primary/30 font-semibold text-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  if (!isDisabled) setSelectedFolderId(f.id);
                }}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  {isCurrentParent && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal">
                      {isAr ? 'الموقع الحالي' : 'Current'}
                    </Badge>
                  )}
                  {isCircular && (
                    <span className="text-[10px] text-destructive font-normal">
                      ({isAr ? 'مجلد فرعي - حركة دائرية ممنوعة' : 'Subfolder - circular reference'})
                    </span>
                  )}
                </div>

                {isSelected && <Check className="size-4 text-primary shrink-0" />}
              </div>
              {renderFolderOptions(f.id, depth + 1)}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  const isRootSelected = selectedFolderId === null;
  const isMovingFolder = Boolean(folderToMove);
  const title = isMovingFolder
    ? (isAr ? `نقل المجلد "${folderToMove?.name}"` : `Move Folder "${folderToMove?.name}"`)
    : (isAr ? `نقل التقرير "${reportToMove?.title}"` : `Move Report "${reportToMove?.title}"`);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <FolderTree className="size-4" />
            </div>
            <div>
              <DialogTitle className="line-clamp-1">{title}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {isAr
                  ? 'اختر المجلد المستهدف من الشجرة أدناه:'
                  : 'Select the destination folder from the tree below:'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Folder Tree Selector */}
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 space-y-1 my-2">
          {/* Root Destination Option */}
          <div
            onClick={() => setSelectedFolderId(null)}
            className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
              isRootSelected
                ? 'bg-primary/10 border border-primary/30 font-semibold text-foreground'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <Home className="size-4 text-muted-foreground" />
              <span>{isAr ? 'المستوى الجذري (بدون مجلد)' : 'Root (Uncategorized)'}</span>
            </div>
            {isRootSelected && <Check className="size-4 text-primary shrink-0" />}
          </div>

          {/* Nested Folders */}
          {renderFolderOptions(null, 0)}
        </div>

        {/* Actions */}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={moving}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={moving}
            onClick={handleConfirm}
          >
            <span>{moving ? (isAr ? 'جاري النقل...' : 'Moving...') : (isAr ? 'نقل إلى هذا المجلد' : 'Move Here')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
