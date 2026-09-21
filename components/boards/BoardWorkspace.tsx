'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Board, BoardSession } from '@/lib/boards-types';
import {
  getBoards,
  saveBoard,
  archiveBoard,
  moveToTrash,
  deleteBoardPermanently,
  getBoardSession,
  saveBoardSession,
  generateBoardId,
} from '@/lib/boards-db';
import { BoardTabs } from './BoardTabs';
import { BoardCanvas } from './BoardCanvas';
import { ShareBoardModal } from './ShareBoardModal';
import { ArchivedBoardsModal } from './ArchivedBoardsModal';
import { DeleteBoardDialog } from './DeleteBoardDialog';
import { ArchiveBoardDialog } from './ArchiveBoardDialog';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useProject } from '@/lib/project-context';
import { Loader2 } from 'lucide-react';

export function BoardWorkspace() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { activeProject } = useProject();
  const ownerUid = user?.uid;
  const isArabic = lang === 'ar';

  const [boards, setBoards] = useState<Board[]>([]);
  const [openBoardIds, setOpenBoardIds] = useState<string[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [archivingBoardId, setArchivingBoardId] = useState<string | null>(null);

  // Auto-save debounce ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial boards & session
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      try {
        const loaded = await getBoards(ownerUid, activeProject?.id);
        if (!mounted) return;

        const session = getBoardSession(ownerUid, activeProject?.id);

        if (loaded.length === 0) {
          // Create initial clean board with NO leaked cards
          const initialBoard: Board = {
            id: generateBoardId('board'),
            title: isArabic ? 'لوحة العمل' : 'Workspace',
            widgets: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ownerUid,
            projectId: activeProject?.id,
          };
          await saveBoard(initialBoard);
          setBoards([initialBoard]);
          setOpenBoardIds([initialBoard.id]);
          setActiveBoardId(initialBoard.id);
          saveBoardSession(
            { openBoardIds: [initialBoard.id], activeBoardId: initialBoard.id },
            ownerUid,
            activeProject?.id
          );
        } else {
          setBoards(loaded);
          // Filter session open boards to those still existing and not archived
          const validOpenIds = session.openBoardIds.filter((id) =>
            loaded.some((b) => b.id === id)
          );
          const initialOpen = validOpenIds.length > 0 ? validOpenIds : [loaded[0].id];
          const initialActive =
            session.activeBoardId && initialOpen.includes(session.activeBoardId)
              ? session.activeBoardId
              : initialOpen[0];

          setOpenBoardIds(initialOpen);
          setActiveBoardId(initialActive);
        }
      } catch (e) {
        console.error('Failed to initialize boards', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();
    return () => {
      mounted = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [ownerUid, activeProject?.id, isArabic]);

  // Persist session whenever open tabs or active board changes
  const updateSession = (newOpen: string[], newActive: string | null) => {
    setOpenBoardIds(newOpen);
    setActiveBoardId(newActive);
    saveBoardSession({ openBoardIds: newOpen, activeBoardId: newActive }, ownerUid, activeProject?.id);
  };

  // Switch tab
  const handleSelectTab = (boardId: string) => {
    updateSession(openBoardIds, boardId);
  };

  // Close tab
  const handleCloseTab = (boardId: string) => {
    const nextOpen = openBoardIds.filter((id) => id !== boardId);
    let nextActive = activeBoardId;
    if (activeBoardId === boardId) {
      const closedIndex = openBoardIds.indexOf(boardId);
      nextActive = nextOpen[closedIndex] || nextOpen[closedIndex - 1] || nextOpen[0] || null;
    }
    updateSession(nextOpen, nextActive);
  };

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingBoardId, setSharingBoardId] = useState<string | null>(null);

  // Open existing board in a tab
  const handleOpenExistingBoard = (boardId: string) => {
    const nextOpen = openBoardIds.includes(boardId) ? openBoardIds : [...openBoardIds, boardId];
    updateSession(nextOpen, boardId);
  };

  // Open share modal for a board
  const handleOpenShareBoard = (boardId: string) => {
    setSharingBoardId(boardId);
    setIsShareModalOpen(true);
  };

  // Create new board
  const handleNewBoard = async () => {
    const newBoard: Board = {
      id: generateBoardId('board'),
      title: `${isArabic ? 'لوحة جديدة' : 'New Board'} ${boards.length + 1}`,
      type: 'canvas',
      widgets: [],
      whiteboard: {
        elements: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerUid,
      projectId: activeProject?.id,
    };

    await saveBoard(newBoard);
    setBoards((prev) => [...prev, newBoard]);
    updateSession([...openBoardIds, newBoard.id], newBoard.id);
  };

  // Rename board
  const handleRenameBoard = async (boardId: string, newTitle: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) return;

    const updated: Board = { ...board, title: newTitle };
    setBoards((prev) => prev.map((b) => (b.id === boardId ? updated : b)));
    await saveBoard(updated);
  };

  // Archive / Soft delete board (move to trash)
  const handleArchiveBoard = async (boardId: string) => {
    await moveToTrash(boardId, ownerUid);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    handleCloseTab(boardId);
  };

  const handleSoftDeleteBoard = async (boardId: string) => {
    await moveToTrash(boardId, ownerUid);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    handleCloseTab(boardId);
  };

  const handlePermanentDeleteBoard = async (boardId: string) => {
    await deleteBoardPermanently(boardId, ownerUid);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    handleCloseTab(boardId);
  };

  // Restore board from archive modal
  const handleRestoredBoard = (restored: Board) => {
    setBoards((prev) => {
      const exists = prev.some((b) => b.id === restored.id);
      return exists ? prev.map((b) => (b.id === restored.id ? restored : b)) : [...prev, restored];
    });
    handleOpenExistingBoard(restored.id);
  };

  // Update board content (canvas widgets, positions, etc.) with debounced auto-save
  const handleUpdateBoard = (updatedBoard: Board) => {
    setBoards((prev) => prev.map((b) => (b.id === updatedBoard.id ? updatedBoard : b)));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await saveBoard(updatedBoard);
    }, 600);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-muted-foreground gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs">{isArabic ? 'جاري تحميل مساحة اللوحات...' : 'Loading workspace...'}</span>
      </div>
    );
  }

  const openBoards = boards.filter((b) => openBoardIds.includes(b.id));
  const activeBoard = boards.find((b) => b.id === activeBoardId) || openBoards[0] || null;
  const sharingBoard = boards.find((b) => b.id === sharingBoardId) || activeBoard;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-x-hidden overflow-y-auto bg-background">
      {/* Tab Navigation */}
      <BoardTabs
        openBoards={openBoards}
        activeBoardId={activeBoard ? activeBoard.id : null}
        allBoards={boards}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewBoard={handleNewBoard}
        onRenameBoard={handleRenameBoard}
        onArchiveBoard={(boardId) => setArchivingBoardId(boardId)}
        onDeleteBoard={(boardId) => setDeletingBoardId(boardId)}
        onOpenArchivedModal={() => setIsArchivedModalOpen(true)}
        onOpenExistingBoard={handleOpenExistingBoard}
        onOpenShareBoard={handleOpenShareBoard}
        lang={lang}
      />

      {/* Main Spatial Canvas */}
      {activeBoard ? (
        <BoardCanvas
          key={activeBoard.id}
          board={activeBoard}
          onUpdateBoard={handleUpdateBoard}
          lang={lang}
          onOpenShare={() => handleOpenShareBoard(activeBoard.id)}
          onArchive={() => setArchivingBoardId(activeBoard.id)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none gap-4">
          <p className="text-sm">
            {isArabic
              ? 'لا توجد علامات تبويب مفتوحة حالياً.'
              : 'No tabs are currently open.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNewBoard()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              {isArabic ? 'إنشاء لوحة جديدة' : 'Create New Board'}
            </button>
          </div>
        </div>
      )}

      {/* Archived / Trash Boards Modal */}
      <ArchivedBoardsModal
        isOpen={isArchivedModalOpen}
        onClose={() => setIsArchivedModalOpen(false)}
        ownerUid={ownerUid}
        projectId={activeProject?.id}
        lang={lang}
        onRestored={handleRestoredBoard}
      />

      {/* Archive Board Confirmation Dialog */}
      {archivingBoardId && (
        <ArchiveBoardDialog
          isOpen={!!archivingBoardId}
          onClose={() => setArchivingBoardId(null)}
          boardTitle={boards.find((b) => b.id === archivingBoardId)?.title || ''}
          onConfirmArchive={() => handleArchiveBoard(archivingBoardId)}
          lang={lang}
        />
      )}

      {/* Delete Board Dialog (Soft vs Permanent) */}
      {deletingBoardId && (
        <DeleteBoardDialog
          isOpen={!!deletingBoardId}
          onClose={() => setDeletingBoardId(null)}
          boardTitle={boards.find((b) => b.id === deletingBoardId)?.title || ''}
          onSoftDelete={() => handleSoftDeleteBoard(deletingBoardId)}
          onPermanentDelete={() => handlePermanentDeleteBoard(deletingBoardId)}
          lang={lang}
        />
      )}

      {/* Share Board Modal */}
      {sharingBoard && (
        <ShareBoardModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          board={sharingBoard}
          onUpdateBoard={handleUpdateBoard}
          lang={lang}
        />
      )}
    </div>
  );
}
