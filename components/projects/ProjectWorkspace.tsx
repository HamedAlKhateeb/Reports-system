'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileText, Plus, Search, X, FolderPlus, Archive, Calendar, Cpu, User as UserIcon } from 'lucide-react';
import {
  getReports,
  createReport,
  deleteReport,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolderSafe,
  moveReportToFolder,
  archiveReport,
  unarchiveReport,
  isArchivedReport,
  isArchivedIssue,
  getIssuesByReportId,
} from '@/lib/db';
import type { ReportItem, FolderItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { useProject } from '@/lib/project-context';
import { getTemplateContent } from '@/components/editor/templates';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { FolderTreeView } from '@/components/reports/FolderTreeView';
import { FolderBreadcrumb } from '@/components/reports/FolderBreadcrumb';
import { MoveToFolderModal } from '@/components/reports/MoveToFolderModal';
import { PageLoading } from '@/components/ui/loading';

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { lang, t, defaultReportLang } = useLanguage();
  const isAr = lang === 'ar';
  const { user, loading: authLoading } = useAuth();
  const { projects, switchProjectById } = useProject();
  const project = projects.find((p) => p.id === projectId) || null;

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [archivedReports, setArchivedReports] = useState<ReportItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'all'>('all');
  const [archiveView, setArchiveView] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmNode, askConfirm] = useConfirm();

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<FolderItem | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [itemToMove, setItemToMove] = useState<{ type: 'report'; item: ReportItem } | { type: 'folder'; item: FolderItem } | null>(null);

  const loadData = async () => {
    if (authLoading || !user) return;
    try {
      setLoading(true);
      const [allReports, foldersData] = await Promise.all([
        getReports(user.uid, user.email, { includeArchived: true, projectId }),
        getFolders(user.uid, user.email, projectId),
      ]);
      setReports(allReports.filter((r) => !isArchivedReport(r)));
      setArchivedReports(allReports.filter(isArchivedReport));
      setFolders(foldersData);
    } catch (err) {
      console.error('Failed to load project workspace', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    void switchProjectById(projectId).catch(() => {});
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading, projectId]);

  const leaveArchiveAndSelect = (id: string | null | 'all') => {
    setArchiveView(false);
    setSelectedFolderId(id);
    setSearchQuery('');
  };

  const handleCreateReport = async (folderId?: string) => {
    if (!user || creating) return;
    try {
      setCreating(true);
      let orgDefaults: any = null;
      try {
        const { getOrganizationDefaults } = await import('@/lib/db-intelligence');
        orgDefaults = await getOrganizationDefaults(user.uid);
      } catch {}

      const defaultAuthor =
        (orgDefaults && orgDefaults.autoApplyToNewReports !== false && orgDefaults.author?.trim()) ||
        user.displayName ||
        user.email.split('@')[0];

      const targetFolderId = folderId || (selectedFolderId && selectedFolderId !== 'all' ? selectedFolderId : undefined);

      const created = await createReport({
        title: isAr ? 'تقرير مراجعة جديد' : 'New Report',
        language: defaultReportLang,
        author: defaultAuthor,
        organization: orgDefaults?.organization || undefined,
        department: orgDefaults?.department || undefined,
        authorTitle: orgDefaults?.authorTitle || undefined,
        reviewerName: orgDefaults?.reviewerName || undefined,
        reviewerTitle: orgDefaults?.reviewerTitle || undefined,
        systemUnderReview: isAr ? 'النظام والمشروع العام' : 'Core System & Project',
        contentJson: getTemplateContent('problem_report', defaultReportLang),
        ownerUid: user.uid,
        folderId: targetFolderId,
        projectId,
      });
      router.push(`/reports/${created.id}`);
    } catch (err) {
      console.error('Failed to create report', err);
      toast.error(isAr ? 'فشل إنشاء التقرير' : 'Failed to create report');
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    let openCount = 0;
    try {
      openCount = (await getIssuesByReportId(id, user.uid)).length;
    } catch {}
    if (!(await askConfirm(isAr ? `أرشفة هذا التقرير؟${openCount > 0 ? ` ستُؤرشف معه ${openCount} مشكلة.` : ''}` : 'Archive this report?'))) return;
    const res = await archiveReport(id, user.uid);
    if (!res.ok) {
      setDeleteError(isAr ? 'فشل الأرشفة.' : 'Archive failed.');
      return;
    }
    toast.success(isAr ? 'تمت الأرشفة' : 'Archived');
    void loadData();
  };

  const handleRestore = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    if (!(await askConfirm(isAr ? 'استعادة هذا التقرير؟' : 'Restore this report?'))) return;
    await unarchiveReport(id, user.uid);
    void loadData();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    let activeCount = 0;
    try {
      const linked = await getIssuesByReportId(id, user?.uid, { includeArchived: true });
      activeCount = linked.filter((i) => !isArchivedIssue(i)).length;
    } catch {}
    if (activeCount > 0) {
      setDeleteError(isAr ? `لا يمكن الحذف: توجد ${activeCount} مشكلة نشطة مرتبطة.` : `Cannot delete: ${activeCount} active linked issue(s).`);
      return;
    }
    if (!(await askConfirm(isAr ? 'حذف نهائي؟ لا يمكن التراجع.' : 'Delete permanently?'))) return;
    const res = await deleteReport(id);
    if (!res.success) {
      setDeleteError(res.error || 'Failed to delete report');
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
    setArchivedReports((prev) => prev.filter((r) => r.id !== id));
    toast.success(isAr ? 'تم حذف التقرير' : 'Report deleted');
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !user) return;
    try {
      setCreatingFolder(true);
      await createFolder({ name: newFolderName.trim(), parentId: createFolderParentId, ownerUid: user.uid, projectId });
      setFolders(await getFolders(user.uid, user.email, projectId));
      setShowCreateFolderModal(false);
      setNewFolderName('');
    } catch (err: any) {
      toast.error((isAr ? 'فشل إنشاء المجلد: ' : 'Failed to create folder: ') + err?.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderToEdit || !renameFolderName.trim()) return;
    try {
      setSavingFolder(true);
      await updateFolder(folderToEdit.id, { name: renameFolderName.trim() });
      setFolders(await getFolders(user?.uid, user?.email, projectId));
      setFolderToEdit(null);
    } catch (err: any) {
      toast.error((isAr ? 'فشل إعادة التسمية: ' : 'Failed to rename: ') + err?.message);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      setDeletingFolder(true);
      await deleteFolderSafe(folderToDelete.id);
      const [updatedReports, updatedFolders] = await Promise.all([
        getReports(user?.uid, user?.email, { projectId }),
        getFolders(user?.uid, user?.email, projectId),
      ]);
      setReports(updatedReports.filter((r) => !isArchivedReport(r)));
      setArchivedReports(updatedReports.filter(isArchivedReport));
      setFolders(updatedFolders);
      if (selectedFolderId === folderToDelete.id) leaveArchiveAndSelect(folderToDelete.parentId || null);
      setFolderToDelete(null);
    } catch (err: any) {
      toast.error((isAr ? 'فشل حذف المجلد: ' : 'Failed to delete folder: ') + err?.message);
    } finally {
      setDeletingFolder(false);
    }
  };

  const handleDropReportOnFolder = async (reportId: string, targetFolderId: string | null) => {
    try {
      await moveReportToFolder(reportId, targetFolderId);
      setReports(await getReports(user?.uid, user?.email, { projectId }).then((all) => all.filter((r) => !isArchivedReport(r))));
    } catch (err) {
      console.error('Failed to move report', err);
    }
  };

  const isSearching = searchQuery.trim().length > 0;
  const scoped = archiveView ? archivedReports : reports;
  const filtered = scoped.filter((r) => {
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return (
        (r.title || '').toLowerCase().includes(q) ||
        (r.systemUnderReview || '').toLowerCase().includes(q) ||
        (r.author || '').toLowerCase().includes(q)
      );
    }
    if (selectedFolderId === 'all') return true;
    if (selectedFolderId === null) return !r.folderId;
    return r.folderId === selectedFolderId;
  });
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const currentFolder = folders.find((f) => f.id === selectedFolderId);
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  if (authLoading || (loading && reports.length === 0 && folders.length === 0)) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="h-8 w-fit gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <Link href="/projects">
            <BackIcon className="h-4 w-4" />
            <span>{isAr ? 'المشاريع' : 'Projects'}</span>
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
              <FileText className="h-7 w-7 text-olive-700 dark:text-olive-400" />
              <span>{project?.name || (isAr ? 'المشروع' : 'Project')}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {project?.description || (isAr ? 'مجلدات وتقارير هذا المشروع' : 'Folders and reports of this project')}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button type="button" variant="outline" onClick={() => { setCreateFolderParentId(selectedFolderId && selectedFolderId !== 'all' ? selectedFolderId : null); setNewFolderName(''); setShowCreateFolderModal(true); }}>
              <FolderPlus data-icon="inline-start" />
              <span>{isAr ? 'مجلد جديد' : 'New Folder'}</span>
            </Button>
            <Button type="button" onClick={() => void handleCreateReport()} disabled={creating}>
              <Plus data-icon="inline-start" />
              <span>{creating ? (isAr ? 'جارٍ الإنشاء…' : 'Creating…') : t('createNewReport')}</span>
            </Button>
          </div>
        </div>
      </div>

      {deleteError && (
        <Alert variant="destructive" className="mb-6 flex items-center justify-between">
          <AlertDescription>{deleteError}</AlertDescription>
          <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteError(null)} className="size-7">
            <X className="size-4" />
          </Button>
        </Alert>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <aside className="w-full lg:w-72 shrink-0">
          <div className="sticky top-20">
            <FolderTreeView
              folders={folders}
              reports={reports}
              selectedFolderId={selectedFolderId}
              currentUid={user?.uid}
              onSelectFolder={(id) => leaveArchiveAndSelect(id)}
              onCreateFolder={(parentId) => { setCreateFolderParentId(parentId); setNewFolderName(''); setShowCreateFolderModal(true); }}
              onRenameFolder={(f) => { setFolderToEdit(f); setRenameFolderName(f.name); }}
              onMoveFolder={(f) => setItemToMove({ type: 'folder', item: f })}
              onDeleteFolder={(f) => setFolderToDelete(f)}
              onDropReportOnFolder={handleDropReportOnFolder}
              onNewReportInFolder={(fid) => void handleCreateReport(fid)}
            />
          </div>
        </aside>

        <main className="flex-1 min-w-0 w-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/60">
            <FolderBreadcrumb
              currentFolderId={selectedFolderId === 'all' ? null : selectedFolderId}
              folders={folders}
              onNavigate={(fId) => leaveArchiveAndSelect(fId)}
            />
            <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5 rounded-md w-fit">
              {isAr ? `${filtered.length} تقرير` : `${filtered.length} reports`}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث في تقارير هذا المشروع…' : 'Search this project reports…'}
                className="ps-9 pe-9 h-9 text-xs rounded-lg"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              type="button"
              variant={archiveView ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setArchiveView(!archiveView); setSearchQuery(''); setSelectedFolderId('all'); }}
              className="h-9 gap-1.5 shrink-0 rounded-lg text-xs font-semibold"
            >
              <Archive className="size-3.5" />
              <span>{isAr ? 'الأرشيف' : 'Archive'}</span>
              {archivedReports.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono">{archivedReports.length}</span>
              )}
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="p-5 space-y-3">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </Card>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>
                  {isSearching ? (isAr ? 'لا توجد نتائج مطابقة' : 'No matching reports') : currentFolder ? (isAr ? `المجلد "${currentFolder.name}" فارغ` : `Folder "${currentFolder.name}" is empty`) : t('noReportsFound')}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" size="sm" onClick={() => void handleCreateReport()} disabled={creating}>
                  <Plus data-icon="inline-start" />
                  <span>{t('createNewReport')}</span>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sorted.map((report) => {
                const reportDate = new Date(report.updatedAt || report.createdAt);
                const dateStr = reportDate.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                const reportFolder = folders.find((f) => f.id === report.folderId);
                return (
                  <Card
                    key={report.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/report-id', report.id);
                      e.dataTransfer.setData('text/plain', report.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => router.push(`/reports/${report.id}`)}
                    className="group relative flex flex-col justify-between hover:border-primary/50 hover:shadow-md transition-all cursor-pointer select-none"
                  >
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="secondary" className="gap-1.5 font-bold">
                          <FileText data-icon="inline-start" />
                          <span>{isAr ? `التقرير ${report.reportNumber}` : `Report #${report.reportNumber}`}</span>
                        </Badge>
                        {reportFolder && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <span className="truncate max-w-[80px]">{reportFolder.name}</span>
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base font-bold group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                        {report.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 pb-3 flex flex-col gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Cpu className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate font-medium">{report.systemUnderReview || (isAr ? 'المشروع العام' : 'General Project')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserIcon className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{report.author || (isAr ? 'المراجع' : 'Reviewer')}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="p-5 pt-3 border-t border-border/70 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Calendar className="size-3.5 opacity-70" />
                        <span>{dateStr}</span>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {!archiveView ? (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={(e) => void handleArchive(e, report.id)}>
                            <Archive className="size-3.5" />
                            <span>{isAr ? 'أرشفة' : 'Archive'}</span>
                          </Button>
                        ) : (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={(e) => void handleRestore(e, report.id)}>
                            <span>{isAr ? 'استعادة' : 'Restore'}</span>
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive" onClick={(e) => void handleDelete(e, report.id)}>
                          <span>{isAr ? 'حذف' : 'Delete'}</span>
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {itemToMove && (
        <MoveToFolderModal
          isOpen={Boolean(itemToMove)}
          onClose={() => setItemToMove(null)}
          folders={folders}
          reportToMove={itemToMove.type === 'report' ? itemToMove.item : null}
          folderToMove={itemToMove.type === 'folder' ? itemToMove.item : null}
          onConfirmMove={async (targetFolderId: string | null) => {
            if (!itemToMove) return;
            if (itemToMove.type === 'report') {
              await moveReportToFolder(itemToMove.item.id, targetFolderId);
              setReports(await getReports(user?.uid, user?.email, { projectId }).then((all) => all.filter((r) => !isArchivedReport(r))));
            } else {
              await updateFolder(itemToMove.item.id, { parentId: targetFolderId });
              setFolders(await getFolders(user?.uid, user?.email, projectId));
            }
            setItemToMove(null);
          }}
        />
      )}

      <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? 'مجلد جديد' : 'New Folder'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFolderSubmit} className="space-y-3 py-2">
            <Input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder={isAr ? 'اسم المجلد…' : 'Folder name…'} dir="auto" className="h-9 text-sm" />
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateFolderModal(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button type="submit" size="sm" disabled={creatingFolder || !newFolderName.trim()}>{creatingFolder ? (isAr ? 'جارٍ الإنشاء…' : 'Creating…') : (isAr ? 'إنشاء' : 'Create')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(folderToEdit)} onOpenChange={(o) => { if (!o) setFolderToEdit(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? 'إعادة تسمية المجلد' : 'Rename Folder'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameFolderSubmit} className="space-y-3 py-2">
            <Input autoFocus value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} dir="auto" className="h-9 text-sm" />
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFolderToEdit(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button type="submit" size="sm" disabled={savingFolder}>{savingFolder ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ' : 'Save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(folderToDelete)} onOpenChange={(o) => { if (!o) setFolderToDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? `حذف المجلد "${folderToDelete?.name}"؟` : `Delete folder "${folderToDelete?.name}"?`}</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-xs text-muted-foreground">{isAr ? 'التقارير داخله ستصبح بدون مجلد. لا يمكن التراجع.' : 'Reports inside become uncategorized. This cannot be undone.'}</p>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFolderToDelete(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="button" size="sm" variant="destructive" disabled={deletingFolder} onClick={() => void handleConfirmDeleteFolder()}>{deletingFolder ? (isAr ? 'جارٍ الحذف…' : 'Deleting…') : (isAr ? 'حذف' : 'Delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  );
}
