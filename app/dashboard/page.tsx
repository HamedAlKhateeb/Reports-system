'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Kanban,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  Circle,
  Printer,
  ArrowUpDown,
  SlidersHorizontal,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { getIssues, getReports, updateIssue, createIssue, reorderIssues, getSeverityConfig } from '@/lib/db';
import { IssueItem, ReportItem, SeverityConfigItem } from '@/lib/types';
import { IssueCard } from '@/components/dashboard/IssueCard';
import { IssueModal } from '@/components/dashboard/IssueModal';
import { NewIssueModal } from '@/components/dashboard/NewIssueModal';
import { SeverityConfigModal } from '@/components/dashboard/SeverityConfigModal';
import { MultiLevelDashboardView } from '@/components/dashboard/MultiLevelDashboardView';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import {
  getStatusLabel,
  getSeverityLabel,
  normalizeSeverity,
  normalizeStatus,
  IssueSeverity,
  IssueStatus,
} from '@/lib/i18n/dictionary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

function isStatusInColumn(issueStatus: string, colStatus: IssueStatus): boolean {
  return normalizeStatus(issueStatus) === normalizeStatus(colStatus);
}

export default function DashboardPage() {
  const { lang, t } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [severityConfig, setSeverityConfig] = useState<SeverityConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardMode, setDashboardMode] = useState<'kanban' | 'intelligence'>('kanban');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Modals
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSeverityModal, setShowSeverityModal] = useState(false);

  // Drag & drop state
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
  const [dragOverIssueId, setDragOverIssueId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const loadData = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setIssues([]);
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [fetchedIssues, fetchedReports] = await Promise.all([
        getIssues(user.uid),
        getReports(user.uid),
      ]);
      setIssues(fetchedIssues);
      setReports(fetchedReports);
      setSeverityConfig(getSeverityConfig(user.uid));
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    loadData();

    const handleDashboardSync = () => {
      loadData();
    };

    window.addEventListener('issue-updated', handleDashboardSync);
    window.addEventListener('issue-created', handleDashboardSync);
    window.addEventListener('report-updated', handleDashboardSync);
    return () => {
      window.removeEventListener('issue-updated', handleDashboardSync);
      window.removeEventListener('issue-created', handleDashboardSync);
      window.removeEventListener('report-updated', handleDashboardSync);
    };
  }, [loadData]);

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIssueId(issueId);
  };

  const handleDragOver = (e: React.DragEvent, columnStatus: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnStatus) {
      setDragOverColumn(columnStatus);
    }

  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleCardDragOver = (e: React.DragEvent, targetIssueId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIssueId === targetIssueId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';

    if (dragOverIssueId !== targetIssueId || dropPosition !== pos) {
      setDragOverIssueId(targetIssueId);
      setDropPosition(pos);
    }
  };

  const handleCardDragLeave = () => {
    setDragOverIssueId(null);
    setDropPosition(null);
  };

  const handleDropOnCard = async (
    e: React.DragEvent,
    targetIssueId: string,
    position: 'before' | 'after'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceId = e.dataTransfer.getData('text/plain') || draggedIssueId;
    setDraggedIssueId(null);
    setDragOverIssueId(null);
    setDropPosition(null);
    setDragOverColumn(null);

    if (!sourceId || sourceId === targetIssueId) return;

    const sourceIssue = issues.find((i) => i.id === sourceId);
    const targetIssue = issues.find((i) => i.id === targetIssueId);
    if (!sourceIssue || !targetIssue) return;

    const targetStatus = targetIssue.status;

    // Filter target column issues without the dragged issue
    const colList = issues
      .filter((i) => i.status === targetStatus && i.id !== sourceId);

    const targetIndex = colList.findIndex((i) => i.id === targetIssueId);
    if (targetIndex === -1) return;

    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    const reorderedList = [
      ...colList.slice(0, insertIndex),
      { ...sourceIssue, status: targetStatus },
      ...colList.slice(insertIndex),
    ];

    const updates: { id: string; order: number; status: IssueItem['status'] }[] = [];
    const newMap = new Map<string, IssueItem>();

    reorderedList.forEach((iss, idx) => {
      const updated = { ...iss, order: idx, status: targetStatus };
      newMap.set(iss.id, updated);
      updates.push({ id: iss.id, order: idx, status: targetStatus });
    });

    setIssues((prev) =>
      prev.map((iss) => (newMap.has(iss.id) ? newMap.get(iss.id)! : iss))
    );

    try {
      await reorderIssues(updates);
    } catch (err) {
      console.error('Failed to save reordered issues', err);
      loadData();
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDragOverIssueId(null);
    setDropPosition(null);
    const issueId = e.dataTransfer.getData('text/plain') || draggedIssueId;
    if (!issueId) return;

    const colIssues = issues.filter((i) => i.status === targetStatus && i.id !== issueId);
    const maxOrder = colIssues.length > 0 ? Math.max(...colIssues.map((i) => i.order ?? 0)) : -1;
    const newOrder = maxOrder + 1;

    setIssues((prev) =>
      prev.map((iss) =>
        iss.id === issueId ? { ...iss, status: targetStatus, order: newOrder } : iss
      )
    );

    try {
      await updateIssue(issueId, { status: targetStatus, order: newOrder });
    } catch (err) {
      console.error('Failed to update issue status on drop', err);
      loadData();
    }
  };

  // Move issue 1 step up or down
  const handleMoveIssue = async (issueId: string, direction: 'up' | 'down') => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const colList = issues
      .filter((i) => (['open', 'in_progress', 'done'] as IssueStatus[]).some((col) => isStatusInColumn(i.status, col) && isStatusInColumn(issue.status, col)));

    const currentIndex = colList.findIndex((i) => i.id === issueId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= colList.length) return;

    const otherIssue = colList[targetIndex];

    const currentOrder = issue.order ?? currentIndex;
    const otherOrder = otherIssue.order ?? targetIndex;

    const updates = [
      { id: issue.id, order: otherOrder, status: issue.status },
      { id: otherIssue.id, order: currentOrder, status: otherIssue.status },
    ];

    setIssues((prev) =>
      prev.map((iss) => {
        if (iss.id === issue.id) return { ...iss, order: otherOrder };
        if (iss.id === otherIssue.id) return { ...iss, order: currentOrder };
        return iss;
      })
    );

    try {
      await reorderIssues(updates);
    } catch (err) {
      console.error('Failed to move issue', err);
      loadData();
    }
  };

  // Sort entire board by severity number (1 to 5)
  const handleSortAllBySeverity = async () => {
    const rankMap = new Map<string, number>(severityConfig.map((c) => [c.id, c.order]));

    const updates: { id: string; order: number; status: IssueItem['status'] }[] = [];
    const newMap = new Map<string, IssueItem>();

    (['open', 'in_progress', 'done'] as IssueStatus[]).forEach((status) => {
      const colList = issues
        .filter((i) => isStatusInColumn(i.status, status))
        .sort((a, b) => {
          const normA = normalizeSeverity(a.severity);
          const normB = normalizeSeverity(b.severity);
          const rankA = rankMap.get(normA) ?? rankMap.get(a.severity) ?? 99;
          const rankB = rankMap.get(normB) ?? rankMap.get(b.severity) ?? 99;
          if (rankA !== rankB) return rankA - rankB;
          return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime();
        });

      colList.forEach((iss, idx) => {
        const updated = { ...iss, order: idx };
        newMap.set(iss.id, updated);
        updates.push({ id: iss.id, order: idx, status: iss.status as IssueStatus });
      });
    });

    setIssues((prev) =>
      prev.map((iss) => (newMap.has(iss.id) ? newMap.get(iss.id)! : iss))
    );

    try {
      await reorderIssues(updates);
    } catch (err) {
      console.error('Failed to sort by severity', err);
      loadData();
    }
  };

  // Create issue handler
  const handleCreateIssue = async (
    data: Omit<IssueItem, 'id' | 'createdAt' | 'updatedAt' | 'commentsCount'>
  ) => {
    const created = await createIssue({
      ...data,
      ownerUid: user?.uid,
    });
    setIssues((prev) => [created, ...prev]);
  };

  // Update issue handler
  const handleIssueUpdated = (updated: IssueItem) => {
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    if (selectedIssue && selectedIssue.id === updated.id) {
      setSelectedIssue(updated);
    }
  };

  // Delete issue handler
  const handleIssueDeleted = (id: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== id));
    setSelectedIssue(null);
  };

  // Filter issues
  const filteredIssues = issues.filter((iss) => {
    const matchesSearch =
      (iss.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (iss.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const normSev = normalizeSeverity(iss.severity);
    const matchesSeverity =
      severityFilter === 'all' ||
      iss.severity === severityFilter ||
      normSev === severityFilter ||
      normSev === normalizeSeverity(severityFilter);
    return matchesSearch && matchesSeverity;
  });

  const columns: { status: IssueStatus; title: string; color: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      status: 'open',
      title: getStatusLabel('open', lang),
      color: 'border-t-blue-500 bg-blue-50/15 dark:bg-blue-950/10',
      icon: Circle,
    },
    {
      status: 'in_progress',
      title: getStatusLabel('in_progress', lang),
      color: 'border-t-amber-500 bg-amber-50/15 dark:bg-amber-950/10',
      icon: Clock,
    },
    {
      status: 'done',
      title: getStatusLabel('done', lang),
      color: 'border-t-emerald-500 bg-emerald-50/15 dark:bg-emerald-950/10',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Kanban className="size-7 text-primary" />
            <span>{t('issuesDashboardTitle')}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === 'ar'
              ? 'تتبع المشاكل والأخطاء المكتشفة، إدارتها وسحبها بين مراحل الإنجاز وإضافة الملاحظات'
              : 'Track software defects, drag between workflow stages, link to reports and collaborate'}
          </p>
        </div>

        <div className="no-print flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSeverityModal(true)}
            className="text-xs font-semibold"
            title={lang === 'ar' ? 'إدارة وترتيب درجات الخطورة' : 'Manage Severity Levels'}
          >
            <SlidersHorizontal data-icon="inline-start" />
            <span>{lang === 'ar' ? 'ترتيب الخطورة' : 'Severity Order'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSortAllBySeverity}
            className="text-xs font-semibold"
            title={t('sortBySeverity')}
          >
            <ArrowUpDown data-icon="inline-start" />
            <span>{t('sortBySeverity')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="text-xs font-semibold"
            title={t('printDashboard')}
          >
            <Printer data-icon="inline-start" />
            <span>{t('printDashboard')}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setShowNewModal(true)}
            className="text-xs font-semibold"
          >
            <Plus data-icon="inline-start" />
            <span>{t('addNewIssue')}</span>
          </Button>
        </div>
      </div>

      {/* Dashboard Mode Switcher */}
      <div className="no-print mb-6 border-b border-border/80 pb-px">
        <nav className="-mb-px flex space-x-2 overflow-x-auto" aria-label="Dashboard Mode">
          <button
            type="button"
            onClick={() => setDashboardMode('kanban')}
            className={cn(
              'group inline-flex items-center gap-2 py-2.5 px-4 border-b-2 font-semibold text-xs sm:text-sm transition-all rounded-t-lg',
              dashboardMode === 'kanban'
                ? 'border-[#2E4034] text-[#2E4034] dark:border-emerald-400 dark:text-emerald-300 bg-[#2E4034]/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <Kanban className="h-4 w-4" />
            <span>{lang === 'ar' ? 'لوحة المهام (Kanban)' : 'Kanban Board'}</span>
            <Badge variant="outline" className="ms-1.5 text-[10px]">
              {issues.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setDashboardMode('intelligence')}
            className={cn(
              'group inline-flex items-center gap-2 py-2.5 px-4 border-b-2 font-semibold text-xs sm:text-sm transition-all rounded-t-lg',
              dashboardMode === 'intelligence'
                ? 'border-[#2E4034] text-[#2E4034] dark:border-emerald-400 dark:text-emerald-300 bg-[#2E4034]/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <BarChart3 className="h-4 w-4" />
            <span>{lang === 'ar' ? 'لوحة المؤشرات الذكية المتعددة' : 'Multi-Level Intelligence Analytics'}</span>
            <Sparkles className="h-3 w-3 text-amber-500 animate-pulse" />
          </button>
        </nav>
      </div>

      {dashboardMode === 'intelligence' ? (
        <MultiLevelDashboardView userUid={user?.uid} />
      ) : (
        <>
          {/* Printable Report View (Visible only during window.print()) */}
      <div className="hidden print:block mb-8">
        <div className="border-b-2 border-slate-800 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('appName')}</h1>
              <h2 className="text-lg font-semibold text-slate-700 mt-1">{t('printViewTitle')}</h2>
            </div>
            <div className="text-end text-xs text-slate-500">
              <p>
                <strong>{t('printDate')}:</strong>{' '}
                {new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="mt-0.5">
                <strong>{t('totalIssuesSummary')}:</strong> {filteredIssues.length}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar for Print */}
          <div className="grid grid-cols-4 gap-3 mt-4 text-center text-xs">
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getStatusLabel('open', lang)}</span>
              <span className="text-base font-bold text-blue-700">
                {filteredIssues.filter((i) => isStatusInColumn(i.status, 'open')).length}
              </span>
            </div>
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getStatusLabel('in_progress', lang)}</span>
              <span className="text-base font-bold text-amber-700">
                {filteredIssues.filter((i) => isStatusInColumn(i.status, 'in_progress')).length}
              </span>
            </div>
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getStatusLabel('done', lang)}</span>
              <span className="text-base font-bold text-emerald-700">
                {filteredIssues.filter((i) => isStatusInColumn(i.status, 'done')).length}
              </span>
            </div>
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getSeverityLabel('critical', lang)}</span>
              <span className="text-base font-bold text-red-700">
                {filteredIssues.filter((i) => normalizeSeverity(i.severity) === 'critical').length}
              </span>
            </div>
          </div>
        </div>

        {/* Print Table */}
        <div className="rounded-lg border border-slate-300 overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-b-2 border-slate-800 bg-slate-100 text-slate-800">
                <TableHead className="w-10 py-2 px-2 text-start font-bold text-slate-800">#</TableHead>
                <TableHead className="py-2 px-2 text-start font-bold text-slate-800">{t('issueTitleLabel')}</TableHead>
                <TableHead className="py-2 px-2 text-start font-bold text-slate-800">{t('issueStatus')}</TableHead>
                <TableHead className="py-2 px-2 text-start font-bold text-slate-800">{t('issueSeverity')}</TableHead>
                <TableHead className="py-2 px-2 text-start font-bold text-slate-800">{t('linkedReportLabel')}</TableHead>
                <TableHead className="py-2 px-2 text-start font-bold text-slate-800">{t('issueDescriptionLabel')}</TableHead>
                <TableHead className="py-2 px-2 text-start font-bold text-slate-800">{t('updatedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIssues.map((iss, idx) => {
                const linked = reports.find((r) => r.id === iss.linkedReportId);
                return (
                  <TableRow key={iss.id} className="break-inside-avoid border-b border-slate-200">
                    <TableCell className="py-2 px-2 font-mono font-semibold">{idx + 1}</TableCell>
                    <TableCell className="py-2 px-2 font-bold text-slate-900">{iss.title}</TableCell>
                    <TableCell className="py-2 px-2 font-medium">{getStatusLabel(iss.status, lang)}</TableCell>
                    <TableCell className="py-2 px-2 font-bold">{getSeverityLabel(iss.severity, lang)}</TableCell>
                    <TableCell className="py-2 px-2">{linked ? `#${linked.reportNumber} - ${linked.title}` : '-'}</TableCell>
                    <TableCell className="py-2 px-2 text-slate-600 max-w-xs">{iss.description || '-'}</TableCell>
                    <TableCell className="py-2 px-2 whitespace-nowrap">
                      {new Date(iss.updatedAt || iss.createdAt).toLocaleDateString(
                        lang === 'ar' ? 'ar-EG' : 'en-US'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="no-print mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
            <Search className="size-4" />
          </div>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchIssues')}
            className="ps-9 h-9 text-xs"
          />
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="size-4 text-muted-foreground shrink-0" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{t('allSeverities')}</option>
            <option value="critical">{getSeverityLabel('critical', lang)}</option>
            <option value="major">{getSeverityLabel('major', lang)}</option>
            <option value="medium">{getSeverityLabel('medium', lang)}</option>
            <option value="normal">{getSeverityLabel('normal', lang)}</option>
            <option value="minor">{getSeverityLabel('minor', lang)}</option>
          </select>
        </div>
      </div>

      {/* Kanban Board Columns */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden items-start">
          {columns.map((col) => {
            const Icon = col.icon;
            const rankMap = new Map<string, number>(severityConfig.map((c) => [c.id, c.order]));

            const columnIssues = filteredIssues
              .filter((i) => isStatusInColumn(i.status, col.status))
              .sort((a, b) => {
                if (typeof a.order === 'number' && typeof b.order === 'number') {
                  return a.order - b.order;
                }
                if (typeof a.order === 'number') return -1;
                if (typeof b.order === 'number') return 1;

                const normA = normalizeSeverity(a.severity);
                const normB = normalizeSeverity(b.severity);
                const rankA = rankMap.get(normA) ?? rankMap.get(a.severity) ?? 99;
                const rankB = rankMap.get(normB) ?? rankMap.get(b.severity) ?? 99;
                if (rankA !== rankB) return rankA - rankB;

                return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime();
              });

            const isDragOver = dragOverColumn === col.status;

            return (
              <div
                key={col.status}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.status)}
                className={cn(
                  'kanban-column flex flex-col rounded-xl border border-border border-t-4 p-4 transition-colors',
                  col.color,
                  isDragOver ? 'ring-2 ring-primary bg-primary/10' : ''
                )}
              >
                {/* Column Header */}
                <div className="mb-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 font-bold text-foreground text-sm">
                    <Icon className="size-4" />
                    <span>{col.title}</span>
                  </div>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs font-bold">
                    {columnIssues.length}
                  </Badge>
                </div>

                {/* Cards Container with independent vertical scroll */}
                <div className="kanban-card-list flex flex-col gap-3 pe-1.5">
                  {columnIssues.map((issue, idx) => {
                    const linked = reports.find((r) => r.id === issue.linkedReportId);
                    return (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        linkedReport={linked}
                        onClick={() => setSelectedIssue(issue)}
                        onDragStart={handleDragStart}
                        onDragOverCard={handleCardDragOver}
                        onDragLeaveCard={handleCardDragLeave}
                        onDropOnCard={handleDropOnCard}
                        isDragOverTarget={dragOverIssueId === issue.id}
                        dropPosition={dragOverIssueId === issue.id ? dropPosition : null}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < columnIssues.length - 1}
                        onMoveUp={(e) => {
                          e.stopPropagation();
                          handleMoveIssue(issue.id, 'up');
                        }}
                        onMoveDown={(e) => {
                          e.stopPropagation();
                          handleMoveIssue(issue.id, 'down');
                        }}
                      />
                    );
                  })}

                  {columnIssues.length === 0 && (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground italic">
                      {lang === 'ar' ? 'اسحب المشاكل إلى هنا' : 'Drop issues here'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Detail & Comment Modal */}
      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          reports={reports}
          isOpen={true}
          onClose={() => setSelectedIssue(null)}
          onUpdated={handleIssueUpdated}
          onDeleted={handleIssueDeleted}
        />
      )}

      {/* New Issue Modal */}
      <NewIssueModal
        reports={reports}
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreateIssue}
      />

      {/* Severity Levels Management Modal */}
      <SeverityConfigModal
        isOpen={showSeverityModal}
        onClose={() => setShowSeverityModal(false)}
        userUid={user?.uid}
        onConfigSaved={(newCfg) => {
          setSeverityConfig(newCfg);
          loadData();
        }}
      />
    </div>
  );
}
