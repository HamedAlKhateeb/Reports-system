'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Board } from '@/lib/boards-types';
import { Plus, X, Layout, Archive, Trash2, MoreVertical, ChevronDown, Check, Edit2, FolderOpen, Network, Share2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface BoardTabsProps {
  openBoards: Board[];
  activeBoardId: string | null;
  allBoards: Board[];
  onSelectTab: (boardId: string) => void;
  onCloseTab: (boardId: string) => void;
  onNewBoard: () => void;
  onRenameBoard: (boardId: string, newTitle: string) => void;
  onArchiveBoard?: (boardId: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  onOpenArchivedModal: () => void;
  onOpenExistingBoard: (boardId: string) => void;
  onOpenShareBoard?: (boardId: string) => void;
  lang?: 'ar' | 'en';
}

export function BoardTabs({
  openBoards,
  activeBoardId,
  allBoards,
  onSelectTab,
  onCloseTab,
  onNewBoard,
  onRenameBoard,
  onArchiveBoard,
  onDeleteBoard,
  onOpenArchivedModal,
  onOpenExistingBoard,
  onOpenShareBoard,
  lang = 'ar',
}: BoardTabsProps) {
  const isArabic = lang === 'ar';
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const startRename = (board: Board) => {
    setEditingTabId(board.id);
    setEditTitle(board.title || '');
  };

  const commitRename = () => {
    if (editingTabId && editTitle.trim()) {
      onRenameBoard(editingTabId, editTitle.trim());
    }
    setEditingTabId(null);
  };

  // Boards not currently open in tabs
  const unopenedBoards = allBoards.filter(
    (b) => !b.archivedAt && !openBoards.some((ob) => ob.id === b.id)
  );

  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 pt-2 select-none">
      {/* Horizontal Tabs Bar */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 flex-1 pe-2">
        {openBoards.map((board) => {
          const isActive = board.id === activeBoardId;
          const isEditing = editingTabId === board.id;

          return (
            <div
              key={board.id}
              onClick={() => onSelectTab(board.id)}
              onDoubleClick={() => startRename(board)}
              className={cn(
                'group relative flex items-center gap-2 h-9 px-3 rounded-t-lg border-t border-x text-xs font-medium cursor-pointer transition-all shrink-0 max-w-[200px]',
                isActive
                  ? 'bg-background border-border text-foreground shadow-sm font-semibold'
                  : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Layout className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-primary' : 'opacity-60')} />

              {/* Title or Inline Edit Input */}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-24 bg-background px-1 py-0.5 rounded border border-primary text-xs focus:outline-none"
                  dir="auto"
                />
              ) : (
                <span className="truncate flex-1" title={board.title}>
                  {board.title || (isArabic ? 'لوحة بدون عنوان' : 'Untitled')}
                </span>
              )}

              {/* Tab Options Menu & Close Button */}
              <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                {isActive && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                        title={isArabic ? 'خيارات اللوحة' : 'Board Options'}
                      >
                        <MoreVertical className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44 text-xs">
                      {onOpenShareBoard && (
                        <>
                          <DropdownMenuItem onClick={() => onOpenShareBoard(board.id)} className="gap-2 text-primary font-semibold">
                            <Share2 className="w-3.5 h-3.5" />
                            <span>{isArabic ? 'مشاركة اللوحة' : 'Share Board'}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => startRename(board)} className="gap-2">
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{isArabic ? 'إعادة التسمية' : 'Rename'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {onArchiveBoard && (
                        <DropdownMenuItem
                          onClick={() => onArchiveBoard(board.id)}
                          className="gap-2 text-amber-600 dark:text-amber-400 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>{isArabic ? 'أرشفة اللوحة' : 'Archive Board'}</span>
                        </DropdownMenuItem>
                      )}
                      {onDeleteBoard && (
                        <DropdownMenuItem
                          onClick={() => onDeleteBoard(board.id)}
                          className="gap-2 text-rose-600 dark:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isArabic ? 'حذف اللوحة' : 'Delete Board'}</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Close tab button */}
                <button
                  type="button"
                  onClick={() => onCloseTab(board.id)}
                  title={isArabic ? 'إغلاق علامة التبويب' : 'Close tab'}
                  className="opacity-60 hover:opacity-100 p-0.5 rounded-full hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {/* New Tab Button */}
        <button
          type="button"
          onClick={onNewBoard}
          title={isArabic ? 'إنشاء لوحة جديدة (+)' : 'New Board (+)'}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Right Actions: Open existing boards dropdown & Archived boards modal */}
      <div className="flex items-center gap-1.5 shrink-0 pb-1">
        {/* Share active board button */}
        {onOpenShareBoard && activeBoardId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenShareBoard(activeBoardId)}
            className="h-7 text-xs gap-1.5 font-semibold text-primary border-primary/40 bg-primary/5 hover:bg-primary/10"
            title={isArabic ? 'مشاركة اللوحة المفتوحة' : 'Share active board'}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isArabic ? 'مشاركة' : 'Share'}</span>
          </Button>
        )}

        {/* Archive active board button */}
        {onArchiveBoard && activeBoardId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onArchiveBoard(activeBoardId)}
            className="h-7 text-xs gap-1.5 font-medium border-border/80 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors"
            title={isArabic ? 'أرشفة اللوحة الحالية' : 'Archive active board'}
          >
            <Archive className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isArabic ? 'أرشفة' : 'Archive'}</span>
          </Button>
        )}

        {unopenedBoards.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground">
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isArabic ? 'فتح لوحة' : 'Open Board'}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-64 overflow-y-auto text-xs">
              <DropdownMenuLabel>
                {isArabic ? 'اللوحات المتوفرة' : 'Available Boards'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {unopenedBoards.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => onOpenExistingBoard(b.id)}
                  className="gap-2 cursor-pointer"
                >
                  <Layout className="w-3.5 h-3.5 text-primary" />
                  <span className="truncate flex-1">{b.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(b.widgets?.length || 0) + (b.whiteboard?.elements?.length || 0)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Archived boards button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenArchivedModal}
          className="h-7 text-xs gap-1.5 font-medium border-border/80 text-muted-foreground hover:text-foreground"
          title={isArabic ? 'اللوحات المؤرشفة' : 'Archived Boards'}
        >
          <Archive className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">{isArabic ? 'اللوحات المؤرشفة' : 'Archived Boards'}</span>
        </Button>
      </div>
    </div>
  );
}
