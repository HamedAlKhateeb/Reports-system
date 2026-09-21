'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Board, BoardWidget } from '@/lib/boards-types';
import {
  getBoards,
  saveBoard,
  moveToTrash,
  deleteBoardPermanently,
  getBoardSession,
  saveBoardSession,
  generateBoardId,
} from '@/lib/boards-db';
import { BoardTabs } from '@/components/boards/BoardTabs';
import { BoardCanvas } from '@/components/boards/BoardCanvas';
import { ArchivedBoardsModal } from '@/components/boards/ArchivedBoardsModal';
import { DeleteBoardDialog } from '@/components/boards/DeleteBoardDialog';
import { ArchiveBoardDialog } from '@/components/boards/ArchiveBoardDialog';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useProject } from '@/lib/project-context';
import { getIssues, createIssue } from '@/lib/db';
import type { IssueItem } from '@/lib/types';
import { Loader2, KanbanSquare, Plus, Table2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

interface PendingTable {
  kind?: 'smart' | 'native';
  tableId: string;
  reportId?: string;
  name?: string;
  snapshot?: { headers: string[]; rows: string[][] };
  at: string;
}

export function TrackingWorkspace() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { activeProject } = useProject();
  const ownerUid = user?.uid;
  const isAr = lang === 'ar';

  const [boards, setBoards] = useState<Board[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [pendingTables, setPendingTables] = useState<PendingTable[]>([]);
  const [sideOpen, setSideOpen] = useState(true);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueSeverity, setNewIssueSeverity] = useState('medium');
  const [creatingIssue, setCreatingIssue] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const readPending = () => {
    try {
      const raw = window.localStorage.getItem('pending_tracking_tables');
      const list = raw ? JSON.parse(raw) : [];
      setPendingTables(Array.isArray(list) ? list : []);
    } catch {
      setPendingTables([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const loaded = await getBoards(ownerUid, activeProject?.id);
        if (!mounted) return;
        const session = getBoardSession(ownerUid, activeProject?.id);
        if (loaded.length === 0) {
          const b: Board = {
            id: generateBoardId('track'),
            title: isAr ? 'board' : 'Tracking board',
            widgets: [],
            whiteboard: { elements: [] },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ownerUid,
            projectId: activeProject?.id,
          };
          await saveBoard(b);
          setBoards([b]);
          setOpenIds([b.id]);
          setActiveId(b.id);
          saveBoardSession({ openBoardIds: [b.id], activeBoardId: b.id }, ownerUid, activeProject?.id);
        } else {
          setBoards(loaded);
          const valid = session.openBoardIds.filter((id) => loaded.some((x) => x.id === id));
          const init = valid.length ? valid : [loaded[0].id];
          setOpenIds(init);
          setActiveId(session.activeBoardId && init.includes(session.activeBoardId) ? session.activeBoardId : init[0]);
        }
        try {
          const iss = await getIssues(ownerUid, user?.email, { projectId: activeProject?.id });
          if (mounted) setIssues(iss);
        } catch {}
        readPending();
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const onQ = () => readPending();
    window.addEventListener('tracking-table-queued', onQ);
    window.addEventListener('focus', onQ);
    return () => {
      mounted = false;
      window.removeEventListener('tracking-table-queued', onQ);
      window.removeEventListener('focus', onQ);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUid, activeProject?.id]);

  const persistSession = (open: string[], active: string | null) => {
    setOpenIds(open);
    setActiveId(active);
    saveBoardSession({ openBoardIds: open, activeBoardId: active }, ownerUid, activeProject?.id);
  };

  const updateBoard = (b: Board) => {
    setBoards((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveBoard(b);
    }, 600);
  };

  const newBoard = async () => {
    const b: Board = {
      id: generateBoardId('track'),
      title: `${isAr ? 'tracking' : 'Tracking'} ${boards.length + 1}`,
      type: 'canvas',
      widgets: [],
      whiteboard: { elements: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerUid,
      projectId: activeProject?.id,
    };
    await saveBoard(b);
    setBoards((p) => [...p, b]);
    persistSession([...openIds, b.id], b.id);
  };

  const viewportCenter = () => ({ x: 240, y: 160 });

  const addWidget = (type: string, extra?: any) => {
    const board = boards.find((x) => x.id === activeId);
    if (!board) return;
    const c = viewportCenter();
    const id = generateBoardId('w');
    let w: BoardWidget;
    if (type === 'issue') {
      const iss: IssueItem | undefined = extra;
      w = {
        id,
        type: 'issue' as any,
        x: c.x,
        y: c.y,
        width: 280,
        height: 190,
        title: iss?.title || 'Issue',
        data: {
          issueId: iss?.id || id,
          title: iss?.title,
          severity: (iss as any)?.severity,
          status: (iss as any)?.status,
          description: (iss as any)?.description,
          linkedReportId: (iss as any)?.linkedReportId || (iss as any)?.reportId || null,
        },
      };
    } else if (type === 'table') {
      w = {
        id,
        type: 'table' as any,
        x: c.x,
        y: c.y,
        width: 320,
        height: 220,
        title: extra?.name || 'Tracked table',
        data: {
          tableId: extra?.tableId,
          reportId: extra?.reportId,
          tableName: extra?.name,
          kind: extra?.kind || 'smart',
          snapshot: extra?.snapshot,
        },
      };
      setPendingTables((prev) => {
        const next = prev.filter((t) => t.tableId !== extra?.tableId);
        try {
          window.localStorage.setItem('pending_tracking_tables', JSON.stringify(next));
        } catch {}
        return next;
      });
    } else if (type === 'task') {
      w = { id, type: 'task', x: c.x, y: c.y, width: 260, height: 180, title: 'New Task', data: { status: 'todo', priority: 'medium', description: '' } };
    } else if (type === 'comment') {
      w = { id, type: 'comment', x: c.x, y: c.y, width: 240, height: 150, title: 'Comment', data: { text: '', author: 'User', createdAt: new Date().toISOString() } };
    } else {
      w = { id, type: 'note', x: c.x, y: c.y, width: 220, height: 200, title: 'Note', data: { content: '', color: 'yellow' } };
    }
    updateBoard({ ...board, widgets: [...(board.widgets || []), w] });
    toast.success(isAr ? 'done' : 'Widget added to board');
  };

  const createNewIssue = async () => {
    if (!newIssueTitle.trim()) return;
    try {
      setCreatingIssue(true);
      const created = (await createIssue({
        title: newIssueTitle.trim(),
        description: '',
        severity: newIssueSeverity as any,
        status: 'open' as any,
        linkedReportId: null,
        ownerUid,
        projectId: activeProject?.id,
      } as any)) as any;
      setIssues((p) => [created as IssueItem, ...p]);
      setNewIssueTitle('');
      addWidget('issue', created as any);
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'error' : 'Failed to create issue');
    } finally {
      setCreatingIssue(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Loading...</span>
      </div>
    );
  }

  const openBoards = boards.filter((b) => openIds.includes(b.id));
  const active = boards.find((b) => b.id === activeId) || openBoards[0] || null;

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden bg-background">
      <BoardTabs
        openBoards={openBoards}
        activeBoardId={active ? active.id : null}
        allBoards={boards}
        onSelectTab={(id) => persistSession(openIds, id)}
        onCloseTab={(id) => {
          const next = openIds.filter((x) => x !== id);
          persistSession(next, activeId === id ? next[0] || null : activeId);
        }}
        onNewBoard={() => void newBoard()}
        onRenameBoard={async (id, t) => {
          const b = boards.find((x) => x.id === id);
          if (!b) return;
          const u = { ...b, title: t };
          setBoards((p) => p.map((x) => (x.id === id ? u : x)));
          await saveBoard(u);
        }}
        onArchiveBoard={(id) => setArchivingId(id)}
        onDeleteBoard={(id) => setDeletingId(id)}
        onOpenArchivedModal={() => setArchivedOpen(true)}
        onOpenExistingBoard={(id) => persistSession(openIds.includes(id) ? openIds : [...openIds, id], id)}
        onOpenShareBoard={() => {}}
        lang={lang}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {active ? (
            <BoardCanvas key={active.id} board={active} onUpdateBoard={updateBoard} lang={lang} onArchive={() => setArchivingId(active.id)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <KanbanSquare className="h-8 w-8 opacity-50" />
              <p>No board open.</p>
              <Button onClick={() => void newBoard()} size="sm">New board</Button>
            </div>
          )}
        </div>
        <aside className={`${sideOpen ? 'w-72' : 'w-10'} hidden shrink-0 flex-col border-s border-border/70 bg-card/40 md:flex`}>
          <button type="button" onClick={() => setSideOpen((s) => !s)} className="flex h-9 items-center justify-center border-b border-border/60 text-muted-foreground hover:text-foreground">
            {sideOpen ? <X className="h-4 w-4" /> : <KanbanSquare className="h-4 w-4" />}
          </button>
          {sideOpen ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              <div>
                <div className="mb-1.5 text-xs font-bold">Add widget</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => addWidget('task')}>Task</Button>
                  <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => addWidget('note')}>Note</Button>
                  <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => addWidget('comment')}>Comment</Button>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                  <Table2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Tables from editor</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-mono">{pendingTables.length}</span>
                </div>
                {pendingTables.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-2 text-[11px] text-muted-foreground">From any smart table press Track.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {pendingTables.map((t) => (
                      <div key={t.tableId} className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card p-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-bold">{t.name || t.tableId}</div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">{t.tableId}</div>
                        </div>
                        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => addWidget('table', t)}>
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Issues as widgets</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-mono">{issues.length}</span>
                </div>
                <div className="mb-1.5 flex items-center gap-1">
                  <input
                    value={newIssueTitle}
                    onChange={(e) => setNewIssueTitle(e.target.value)}
                    placeholder="New issue..."
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:border-primary"
                  />
                  <select value={newIssueSeverity} onChange={(e) => setNewIssueSeverity(e.target.value)} className="h-8 rounded-md border border-border bg-background px-1 text-[11px] font-bold">
                    <option value="critical">critical</option>
                    <option value="major">major</option>
                    <option value="medium">medium</option>
                    <option value="normal">normal</option>
                    <option value="minor">minor</option>
                  </select>
                  <Button size="sm" className="h-8 px-2 text-[11px]" disabled={!newIssueTitle.trim() || creatingIssue} onClick={() => void createNewIssue()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {issues.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-2 text-[11px] text-muted-foreground">No issues yet.</p>
                ) : (
                  <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                    {issues.slice(0, 60).map((iss) => (
                      <div key={iss.id} className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card p-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-bold">{iss.title}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {String((iss as any).severity || '')} - {String((iss as any).status || '')}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => addWidget('issue', iss)}>
                          <Plus className="h-3 w-3" /> Card
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      <ArchivedBoardsModal
        isOpen={archivedOpen}
        onClose={() => setArchivedOpen(false)}
        ownerUid={ownerUid}
        projectId={activeProject?.id}
        lang={lang}
        onRestored={(r) => {
          setBoards((p) => [...p, r]);
          persistSession([...openIds, r.id], r.id);
        }}
      />
      {archivingId && (
        <ArchiveBoardDialog
          isOpen={!!archivingId}
          onClose={() => setArchivingId(null)}
          boardTitle={boards.find((b) => b.id === archivingId)?.title || ''}
          onConfirmArchive={async () => {
            await moveToTrash(archivingId, ownerUid);
            setBoards((p) => p.filter((b) => b.id !== archivingId));
            const next = openIds.filter((x) => x !== archivingId);
            persistSession(next, next[0] || null);
            setArchivingId(null);
          }}
          lang={lang}
        />
      )}
      {deletingId && (
        <DeleteBoardDialog
          isOpen={!!deletingId}
          onClose={() => setDeletingId(null)}
          boardTitle={boards.find((b) => b.id === deletingId)?.title || ''}
          onSoftDelete={async () => {
            await moveToTrash(deletingId, ownerUid);
            setBoards((p) => p.filter((b) => b.id !== deletingId));
            const next = openIds.filter((x) => x !== deletingId);
            persistSession(next, next[0] || null);
            setDeletingId(null);
          }}
          onPermanentDelete={async () => {
            await deleteBoardPermanently(deletingId, ownerUid);
            setBoards((p) => p.filter((b) => b.id !== deletingId));
            const next = openIds.filter((x) => x !== deletingId);
            persistSession(next, next[0] || null);
            setDeletingId(null);
          }}
          lang={lang}
        />
      )}
    </div>
  );
}
