'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Kanban,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Clock,
  CheckCircle2,
  Circle,
  Printer,
} from 'lucide-react';
import { getIssues, getReports, updateIssue, createIssue } from '@/lib/db';
import { IssueItem, ReportItem } from '@/lib/types';
import { IssueCard } from '@/components/dashboard/IssueCard';
import { IssueModal } from '@/components/dashboard/IssueModal';
import { NewIssueModal } from '@/components/dashboard/NewIssueModal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import {
  getStatusLabel,
  getSeverityLabel,
  IssueSeverity,
  IssueStatus,
} from '@/lib/i18n/dictionary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { lang, t } = useLanguage();
  const { user } = useAuth();

  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Modals
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // Drag & drop state
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fetchedIssues, fetchedReports] = await Promise.all([
        getIssues(user?.uid),
        getReports(user?.uid),
      ]);
      setIssues(fetchedIssues);
      setReports(fetchedReports);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData('text/plain', issueId);
    setDraggedIssueId(issueId);
  };

  const handleDragOver = (e: React.DragEvent, columnStatus: IssueStatus) => {
    e.preventDefault();
    if (dragOverColumn !== columnStatus) {
      setDragOverColumn(columnStatus);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const issueId = e.dataTransfer.getData('text/plain') || draggedIssueId;
    if (!issueId) return;

    // Optimistic UI update
    setIssues((prev) =>
      prev.map((iss) => (iss.id === issueId ? { ...iss, status: targetStatus } : iss))
    );

    try {
      await updateIssue(issueId, { status: targetStatus });
    } catch (err) {
      console.error('Failed to update issue status on drop', err);
      // Revert if error
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
    const matchesSeverity = severityFilter === 'all' || iss.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const columns: { status: IssueStatus; title: string; color: string; icon: any }[] = [
    {
      status: 'open',
      title: getStatusLabel('open', lang),
      color: 'border-t-blue-500 bg-blue-50/20',
      icon: Circle,
    },
    {
      status: 'in_progress',
      title: getStatusLabel('in_progress', lang),
      color: 'border-t-amber-500 bg-amber-50/20',
      icon: Clock,
    },
    {
      status: 'done',
      title: getStatusLabel('done', lang),
      color: 'border-t-emerald-500 bg-emerald-50/20',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Kanban className="h-7 w-7 text-olive-700 dark:text-olive-400" />
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
            onClick={() => window.print()}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"
            title={t('printDashboard')}
          >
            <Printer className="h-4 w-4 text-muted-foreground" />
            <span>{t('printDashboard')}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setShowNewModal(true)}
            className="h-9 gap-1.5 rounded-lg bg-[#2E4034] hover:bg-[#24382F] text-white text-xs font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{t('addNewIssue')}</span>
          </Button>
        </div>
      </div>

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
                {filteredIssues.filter((i) => i.status === 'open').length}
              </span>
            </div>
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getStatusLabel('in_progress', lang)}</span>
              <span className="text-base font-bold text-amber-700">
                {filteredIssues.filter((i) => i.status === 'in_progress').length}
              </span>
            </div>
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getStatusLabel('done', lang)}</span>
              <span className="text-base font-bold text-emerald-700">
                {filteredIssues.filter((i) => i.status === 'done').length}
              </span>
            </div>
            <div className="rounded border border-slate-300 p-2 bg-slate-50">
              <span className="block font-semibold text-slate-500">{getSeverityLabel('critical', lang)}</span>
              <span className="text-base font-bold text-red-700">
                {filteredIssues.filter((i) => i.severity === 'critical').length}
              </span>
            </div>
          </div>
        </div>

        {/* Print Table */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-800 bg-slate-100 text-slate-800">
              <th className="py-2 px-2 text-start">#</th>
              <th className="py-2 px-2 text-start">{t('issueTitleLabel')}</th>
              <th className="py-2 px-2 text-start">{t('issueStatus')}</th>
              <th className="py-2 px-2 text-start">{t('issueSeverity')}</th>
              <th className="py-2 px-2 text-start">{t('linkedReportLabel')}</th>
              <th className="py-2 px-2 text-start">{t('issueDescriptionLabel')}</th>
              <th className="py-2 px-2 text-start">{t('updatedAt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredIssues.map((iss, idx) => {
              const linked = reports.find((r) => r.id === iss.linkedReportId);
              return (
                <tr key={iss.id} className="break-inside-avoid">
                  <td className="py-2 px-2 font-mono font-semibold">{idx + 1}</td>
                  <td className="py-2 px-2 font-bold text-slate-900">{iss.title}</td>
                  <td className="py-2 px-2 font-medium">{getStatusLabel(iss.status, lang)}</td>
                  <td className="py-2 px-2 font-bold">{getSeverityLabel(iss.severity, lang)}</td>
                  <td className="py-2 px-2">{linked ? `#${linked.reportNumber} - ${linked.title}` : '-'}</td>
                  <td className="py-2 px-2 text-slate-600 max-w-xs">{iss.description || '-'}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    {new Date(iss.updatedAt || iss.createdAt).toLocaleDateString(
                      lang === 'ar' ? 'ar-EG' : 'en-US'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Filters Bar */}
      <div className="no-print mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
            <Search className="h-4 w-4" />
          </div>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchIssues')}
            className="ps-9 h-9 text-xs rounded-lg"
          />
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs focus:border-[#2E4034] focus:outline-none"
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-olive-700 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
          {columns.map((col) => {
            const Icon = col.icon;
            const columnIssues = filteredIssues.filter((i) => i.status === col.status);
            const isDragOver = dragOverColumn === col.status;

            return (
              <div
                key={col.status}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`flex flex-col rounded-xl border border-border border-t-4 bg-muted/30 p-4 transition-colors ${
                  col.color
                } ${isDragOver ? 'ring-2 ring-olive-600 bg-olive-50/40 dark:bg-olive-950/40' : ''}`}
              >
                {/* Column Header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-foreground text-sm">
                    <Icon className="h-4 w-4" />
                    <span>{col.title}</span>
                  </div>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs font-bold">
                    {columnIssues.length}
                  </Badge>
                </div>

                {/* Cards Container */}
                <div className="flex-1 space-y-3 min-h-[400px]">
                  {columnIssues.map((issue) => {
                    const linked = reports.find((r) => r.id === issue.linkedReportId);
                    return (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        linkedReport={linked}
                        onClick={() => setSelectedIssue(issue)}
                        onDragStart={handleDragStart}
                      />
                    );
                  })}

                  {columnIssues.length === 0 && (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 italic">
                      {lang === 'ar' ? 'اسحب المشاكل إلى هنا' : 'Drop issues here'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
    </div>
  );
}
