'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  Plus,
  Trash2,
  Edit2,
  TableProperties,
  Kanban,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ScanSearch,
} from 'lucide-react';
import { ReportItem, AnalysisTableRow, KanbanIssuePayload, IssueItem } from '@/lib/types';
import { createIssue, updateReport, getIssuesByReportId } from '@/lib/db';
import {
  extractIssuesFromContent,
  reconcileWithKanbanStore,
  ExtractedReportIssue,
} from '@/lib/table-issue-scanner';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AnalysisTableProps {
  report: ReportItem;
  onReportUpdate?: (updatedReport: ReportItem) => void;
  liveEditorRef?: React.RefObject<any>;
}

const LEGACY_MOCK_TITLES = [
  'تعطل استجابة الخادم أثناء ذروة التحميل اللحظي للبيانات',
  'تأخر مزامنة تحديثات التقارير بين المستخدمين في الوقت الفعلي',
  'عدم اتساق اتجاه بعض النصوص والأيقونات في واجهة RTL',
];

export function filterOutLegacyMockRows(rowsList?: AnalysisTableRow[]): AnalysisTableRow[] {
  if (!rowsList || !Array.isArray(rowsList)) return [];
  return rowsList.filter((r) => !LEGACY_MOCK_TITLES.includes(r.title?.trim()));
}

export function AnalysisTable({ report, onReportUpdate, liveEditorRef }: AnalysisTableProps) {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const isAr = lang === 'ar';

  const [rows, setRows] = useState<AnalysisTableRow[]>(() => {
    return filterOutLegacyMockRows(report.analysisRows);
  });

  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const hasAutoScannedRef = useRef(false);

  // Modal state for Add/Edit row
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AnalysisTableRow | null>(null);
  const [formCategory, setFormCategory] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSeverity, setFormSeverity] = useState<AnalysisTableRow['severity']>('متوسطة');
  const [formAspect, setFormAspect] = useState('');
  const [formImpact, setFormImpact] = useState('');
  const [formRecommendation, setFormRecommendation] = useState('');
  const [formAttachment, setFormAttachment] = useState('');

  // Sync state if report prop updates from outside
  useEffect(() => {
    setRows(filterOutLegacyMockRows(report.analysisRows));
  }, [report.analysisRows]);

  const severityCounts = useMemo(() => {
    return {
      critical: rows.filter((r) => r.severity === 'حرجة').length,
      major: rows.filter((r) => r.severity === 'كبيرة').length,
      medium: rows.filter((r) => r.severity === 'متوسطة').length,
      normal: rows.filter((r) => r.severity === 'عادية').length,
      minor: rows.filter((r) => r.severity === 'طفيفة').length,
    };
  }, [rows]);

  const syncedRowsCount = useMemo(() => {
    return rows.filter((r) => !!r.syncedIssueId).length;
  }, [rows]);

  const unsyncedRowsCount = useMemo(() => {
    return rows.filter((r) => !r.syncedIssueId).length;
  }, [rows]);

  const saveRowsToReport = useCallback(
    async (updatedRows: AnalysisTableRow[]) => {
      setRows(updatedRows);
      try {
        await updateReport(report.id, { analysisRows: updatedRows });
        if (onReportUpdate) {
          onReportUpdate({ ...report, analysisRows: updatedRows });
        }
      } catch (err) {
        console.error('Failed to persist analysis rows to report', err);
      }
    },
    [report, onReportUpdate]
  );

  /**
   * SAFEGUARD #3: Live Editor Content Access
   * Reads directly from the live TipTap editor instance via ref to avoid stale state.
   */
  const handleScan = useCallback(
    async (isManual: boolean = false) => {
      if (!report?.id) return;
      if (isManual) setIsScanning(true);

      try {
        const liveJson = liveEditorRef?.current?.getJSON ? liveEditorRef.current.getJSON() : null;
        const content = liveJson || report.contentJson || (report as any).content || '';

        const extracted: ExtractedReportIssue[] = extractIssuesFromContent(content, report.id);

        if (extracted.length === 0) {
          if (isManual) {
            toast.info(
              isAr
                ? 'لم يتم العثور على جداول مشاكل في محتوى التقرير.'
                : 'No issue tables detected in report content.'
            );
          }
          return;
        }

        let kanbanIssues: IssueItem[] = [];
        try {
          kanbanIssues = await getIssuesByReportId(report.id, user?.uid);
        } catch (e) {
          console.warn('Could not fetch kanban issues for reconciliation', e);
        }

        const reconciled = reconcileWithKanbanStore(extracted, kanbanIssues);

        const currentRows = rows;
        const mergedRows: AnalysisTableRow[] = reconciled.map((ext) => {
          const match = currentRows.find(
            (cr) =>
              cr.id === ext.id ||
              cr.title.trim().toLowerCase() === ext.title.trim().toLowerCase()
          );

          return {
            id: ext.id,
            title: ext.title,
            category: ext.category || 'عام',
            severity: ext.severity,
            aspect: ext.aspect,
            impact: ext.impact || '',
            recommendation: ext.recommendation || '',
            attachment: ext.attachment,
            syncedIssueId: ext.syncedIssueId || match?.syncedIssueId,
          };
        });

        const manualRows = filterOutLegacyMockRows(currentRows).filter(
          (cr) =>
            !mergedRows.some(
              (mr) =>
                mr.id === cr.id ||
                mr.title.trim().toLowerCase() === cr.title.trim().toLowerCase()
            )
        );

        const allRows = [...mergedRows, ...manualRows];
        await saveRowsToReport(allRows);

        if (isManual) {
          toast.success(
            isAr
              ? `تم اكتشاف ${extracted.length} مشاكل من جدول التقرير بنجاح.`
              : `Successfully detected ${extracted.length} issues from report table.`
          );
        }
      } catch (err: any) {
        console.error('Scan error:', err);
        if (isManual) {
          toast.error(isAr ? 'فشل فحص جدول التقرير' : 'Failed to scan report table', {
            description: err?.message || '',
          });
        }
      } finally {
        if (isManual) setIsScanning(false);
      }
    },
    [report, liveEditorRef, isAr, user?.uid, rows, saveRowsToReport]
  );

  // Auto-scan once on mount
  useEffect(() => {
    if (!hasAutoScannedRef.current && report?.id) {
      hasAutoScannedRef.current = true;
      const t = setTimeout(() => {
        handleScan(false);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [report?.id, handleScan]);

  // Listen for global custom event 'scan-report-tables'
  useEffect(() => {
    const onScanEvent = () => handleScan(true);
    window.addEventListener('scan-report-tables', onScanEvent);
    return () => window.removeEventListener('scan-report-tables', onScanEvent);
  }, [handleScan]);

  /**
   * Helper to build Kanban description from row fields
   */
  const buildIssueDescription = (row: AnalysisTableRow) => {
    const parts: string[] = [];
    if (row.aspect && row.aspect.trim()) {
      parts.push(`**الجانب الخاضع للمراجعة:** ${row.aspect.trim()}`);
    }
    if (row.impact && row.impact.trim()) {
      parts.push(`**الأثر:** ${row.impact.trim()}`);
    }
    if (row.recommendation && row.recommendation.trim()) {
      parts.push(`**التوصية:** ${row.recommendation.trim()}`);
    }
    if (row.attachment && row.attachment.trim()) {
      parts.push(`**الشكل / المرفق:** ${row.attachment.trim()}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : `**الأثر:** ${row.impact}\n\n**التوصية:** ${row.recommendation}`;
  };

  /**
   * Push single row to Kanban
   */
  const handlePushToKanban = async (row: AnalysisTableRow) => {
    if (syncingRowId || syncingAll) return;
    try {
      setSyncingRowId(row.id);

      const payload: KanbanIssuePayload = {
        title: row.title,
        severity: row.severity,
        description: buildIssueDescription(row),
        status: 'مفتوحة',
        reportId: report.id,
        sourceSection: `جدول البيانات والتحليل - تصنيف: ${row.category}`,
      };

      const createdIssue = await createIssue({
        title: payload.title,
        description: payload.description,
        severity: payload.severity,
        status: payload.status,
        linkedReportId: payload.reportId,
        reportId: payload.reportId,
        sourceSection: payload.sourceSection,
        ownerUid: user?.uid,
      });

      const updatedRows = rows.map((r) =>
        r.id === row.id ? { ...r, syncedIssueId: createdIssue.id } : r
      );

      await saveRowsToReport(updatedRows);

      toast.success(isAr ? 'تم نقل المشكلة بنجاح' : 'Issue synced successfully', {
        description: isAr
          ? `أُضيفت المشكلة "${row.title}" إلى لوحة الكانبان.`
          : `Issue "${row.title}" has been added to the Kanban board.`,
      });
    } catch (err: any) {
      console.error('Failed to push issue to Kanban', err);
      toast.error(isAr ? 'فشل نقل المشكلة إلى الكانبان' : 'Failed to sync issue to Kanban', {
        description: err.message || '',
      });
    } finally {
      setSyncingRowId(null);
    }
  };

  /**
   * Bulk push all unsynced rows to Kanban
   */
  const handleSyncAllUnsynced = useCallback(async () => {
    const unsynced = rows.filter((r) => !r.syncedIssueId);
    if (unsynced.length === 0 || syncingAll) return;

    try {
      setSyncingAll(true);
      const syncedMap = new Map<string, string>();

      for (const row of unsynced) {
        const payload: KanbanIssuePayload = {
          title: row.title,
          severity: row.severity,
          description: buildIssueDescription(row),
          status: 'مفتوحة',
          reportId: report.id,
          sourceSection: `جدول البيانات والتحليل - تصنيف: ${row.category}`,
        };

        const createdIssue = await createIssue({
          title: payload.title,
          description: payload.description,
          severity: payload.severity,
          status: payload.status,
          linkedReportId: payload.reportId,
          reportId: payload.reportId,
          sourceSection: payload.sourceSection,
          ownerUid: user?.uid,
        });

        syncedMap.set(row.id, createdIssue.id);
      }

      const updatedRows = rows.map((r) => {
        if (syncedMap.has(r.id)) {
          return { ...r, syncedIssueId: syncedMap.get(r.id) };
        }
        return r;
      });

      await saveRowsToReport(updatedRows);

      const count = unsynced.length;
      toast.success(
        isAr
          ? `تم نقل ${count} مشاكل إلى لوحة المشاكل بنجاح.`
          : `Successfully synced ${count} issues to the Kanban Board.`
      );
    } catch (err: any) {
      console.error('Failed to batch sync issues', err);
      toast.error(isAr ? 'حدث خطأ أثناء نقل المشاكل' : 'Batch sync failed', {
        description: err.message || '',
      });
    } finally {
      setSyncingAll(false);
    }
  }, [rows, syncingAll, report.id, user?.uid, isAr, saveRowsToReport]);

  const handleOpenAddModal = useCallback(() => {
    setEditingRow(null);
    setFormCategory('أداء النظام');
    setFormTitle('');
    setFormSeverity('متوسطة');
    setFormAspect('');
    setFormImpact('');
    setFormRecommendation('');
    setFormAttachment('');
    setIsModalOpen(true);
  }, []);

  const handleOpenEditModal = (row: AnalysisTableRow) => {
    setEditingRow(row);
    setFormCategory(row.category);
    setFormTitle(row.title);
    setFormSeverity(row.severity);
    setFormAspect(row.aspect || '');
    setFormImpact(row.impact);
    setFormRecommendation(row.recommendation);
    setFormAttachment(row.attachment || '');
    setIsModalOpen(true);
  };

  const handleSaveRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formCategory.trim()) return;

    if (editingRow) {
      const updated = rows.map((r) =>
        r.id === editingRow.id
          ? {
              ...r,
              category: formCategory.trim(),
              title: formTitle.trim(),
              severity: formSeverity,
              aspect: formAspect.trim() || undefined,
              impact: formImpact.trim(),
              recommendation: formRecommendation.trim(),
              attachment: formAttachment.trim() || undefined,
            }
          : r
      );
      await saveRowsToReport(updated);
    } else {
      const newRow: AnalysisTableRow = {
        id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: formCategory.trim(),
        title: formTitle.trim(),
        severity: formSeverity,
        aspect: formAspect.trim() || undefined,
        impact: formImpact.trim(),
        recommendation: formRecommendation.trim(),
        attachment: formAttachment.trim() || undefined,
      };
      await saveRowsToReport([...rows, newRow]);
    }

    setIsModalOpen(false);
  };

  const handleDeleteRow = async (rowId: string) => {
    if (!confirm(isAr ? 'هل أنت متأكد من حذف هذا البند من جدول التحليل؟' : 'Delete this row from the analysis table?')) {
      return;
    }
    const filtered = rows.filter((r) => r.id !== rowId);
    await saveRowsToReport(filtered);
  };

  // External triggers from the unified IssuesTab Action Center (single source
  // of truth for problem actions — no duplicated buttons here).
  useEffect(() => {
    const onAddEvent = () => handleOpenAddModal();
    const onSyncAllEvent = () => handleSyncAllUnsynced();
    window.addEventListener('analysis-add-request', onAddEvent);
    window.addEventListener('analysis-sync-all-request', onSyncAllEvent);
    return () => {
      window.removeEventListener('analysis-add-request', onAddEvent);
      window.removeEventListener('analysis-sync-all-request', onSyncAllEvent);
    };
  }, [handleOpenAddModal, handleSyncAllUnsynced]);

  const getSeverityBadgeClass = (sev: AnalysisTableRow['severity']) => {
    switch (sev) {
      case 'حرجة':
        return 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800';
      case 'كبيرة':
        return 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800';
      case 'متوسطة':
        return 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800';
      case 'عادية':
        return 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800';
      case 'طفيفة':
      default:
        return 'border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-700';
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-border/90 bg-card p-4 sm:p-5 shadow-xs transition-all overflow-hidden">
      {/* Table Header / Toolbar Area */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <TableProperties className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                {isAr ? 'جدول البيانات والتحليل' : 'Data & Analysis Table'}
              </h2>
              <Badge variant="secondary" className="px-2 py-0.5 text-xs font-semibold">
                {rows.length} {isAr ? 'بند' : 'items'}
              </Badge>
              {unsyncedRowsCount > 0 && (
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 text-[11px] font-semibold border-amber-400 bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                >
                  {unsyncedRowsCount} {isAr ? 'غير مسجلة' : 'unsynced'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? 'فحص تلقائي لمشاكل التقرير ورصد بنود المعالجة مع إمكانية المزامنة المباشرة مع لوحة المشاكل (Kanban).'
                : 'Automated table scanner & issue tracker with direct instant sync to Kanban.'}
            </p>
          </div>
        </div>

        {/* Action Buttons — kept minimal on purpose: scan / add / sync live in the
            unified IssuesTab Action Center above (single source of truth) and reach
            this table via 'scan-report-tables' / 'analysis-add-request' /
            'analysis-sync-all-request' window events. */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {/* Link to Kanban */}
          <Button
            size="sm"
            variant="ghost"
            asChild
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link href="/issues">
              <Kanban className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? 'لوحة المشاكل' : 'Kanban Board'}</span>
              <ExternalLink className="h-3 w-3 ms-0.5 opacity-60" />
            </Link>
          </Button>

          {/* Expand / Collapse */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={isExpanded ? (isAr ? 'طي الجدول' : 'Collapse') : isAr ? 'توسيع الجدول' : 'Expand'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Summary Bar: Breakdown by Severity Badges and Sync Counts */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 my-3 rounded-xl border border-border/70 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-foreground text-xs">
            {isAr ? 'إحصائيات المشاكل:' : 'Issue Stats:'}
          </span>
          <Badge variant="outline" className="font-mono font-bold text-xs bg-background/80">
            {isAr ? 'الإجمالي:' : 'Total:'} {rows.length}
          </Badge>
          <Badge
            variant="outline"
            className="border-red-500/60 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 font-semibold text-[11px]"
          >
            {isAr ? 'حرجة:' : 'Critical:'} {severityCounts.critical}
          </Badge>
          <Badge
            variant="outline"
            className="border-orange-500/60 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 font-semibold text-[11px]"
          >
            {isAr ? 'كبيرة:' : 'Major:'} {severityCounts.major}
          </Badge>
          <Badge
            variant="outline"
            className="border-amber-500/60 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-semibold text-[11px]"
          >
            {isAr ? 'متوسطة:' : 'Medium:'} {severityCounts.medium}
          </Badge>
          <Badge
            variant="outline"
            className="border-blue-500/60 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-semibold text-[11px]"
          >
            {isAr ? 'عادية:' : 'Normal:'} {severityCounts.normal}
          </Badge>
          <Badge
            variant="outline"
            className="border-slate-400/60 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400 font-semibold text-[11px]"
          >
            {isAr ? 'طفيفة:' : 'Minor:'} {severityCounts.minor}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge
            variant="outline"
            className="border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold text-[11px] gap-1"
          >
            <Check className="h-3 w-3 text-emerald-600" />
            <span>{isAr ? 'مسجلة في الكانبان:' : 'Synced to Kanban:'} {syncedRowsCount}</span>
          </Badge>
          {unsyncedRowsCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/60 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-semibold text-[11px]"
            >
              {isAr ? 'بانتظار المزامنة:' : 'Pending Sync:'} {unsyncedRowsCount}
            </Badge>
          )}
        </div>
      </div>

      {/* Table Content */}
      {isExpanded && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border/70 bg-background/50">
          <Table className="text-xs">
            <TableHeader className="bg-muted/40 font-semibold">
              <TableRow className="border-b border-border/80">
                <TableHead className="w-12 text-center py-2.5 font-bold">#</TableHead>
                <TableHead className="w-36 py-2.5 text-start font-bold">
                  {isAr ? 'التصنيف' : 'Category'}
                </TableHead>
                <TableHead className="min-w-[200px] py-2.5 text-start font-bold">
                  {isAr ? 'المشكلة / الحالة المرصودة' : 'Issue / Observation'}
                </TableHead>
                <TableHead className="w-28 py-2.5 text-start font-bold">
                  {isAr ? 'درجة المشكلة' : 'Severity'}
                </TableHead>
                <TableHead className="min-w-[200px] py-2.5 text-start font-bold">
                  {isAr ? 'الأثر على المستخدم / الجودة' : 'User / Quality Impact'}
                </TableHead>
                <TableHead className="min-w-[200px] py-2.5 text-start font-bold">
                  {isAr ? 'التوصية المقترحة' : 'Proposed Recommendation'}
                </TableHead>
                <TableHead className="w-48 py-2.5 text-center font-bold">
                  {isAr ? 'الإجراء' : 'Action'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                    <p className="text-xs">
                      {isAr
                        ? 'لا توجد مشاكل مسجلة في جدول التحليل حالياً. اضغط على "فحص واكتشاف المشاكل" لاستخراجها من التقرير.'
                        : 'No rows in analysis table. Click "Scan & Detect Issues" to extract from document.'}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleScan(true)}
                        className="text-xs gap-1.5"
                      >
                        <ScanSearch className="h-3.5 w-3.5 text-primary" />
                        <span>{isAr ? 'فحص واكتشاف المشاكل' : 'Scan Issues'}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenAddModal}
                        className="text-xs gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{isAr ? 'إضافة مشكلة يدوية' : 'Add Manual Issue'}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  const isSyncingThis = syncingRowId === row.id;
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        'transition-colors border-b border-border/60 hover:bg-muted/30',
                        row.syncedIssueId ? 'bg-muted/10' : ''
                      )}
                    >
                      <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        <span className="inline-block rounded-md bg-muted/60 px-2 py-0.5 text-[11px]">
                          {row.category}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-foreground leading-snug">
                        <div>{row.title}</div>
                        {(row.aspect || row.attachment) && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 font-normal text-[11px]">
                            {row.aspect && (
                              <span className="inline-block text-teal-700 dark:text-teal-400 bg-teal-50/80 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800 text-[10px]">
                                {isAr ? 'الجانب:' : 'Scope:'} {row.aspect}
                              </span>
                            )}
                            {row.attachment && (
                              <span className="inline-block text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded border border-border/60 text-[10px]">
                                {isAr ? 'المرفق:' : 'Figure:'} {row.attachment}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('text-[11px] font-bold px-2 py-0.5', getSeverityBadgeClass(row.severity))}
                        >
                          {row.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground leading-relaxed">
                        {row.impact}
                      </TableCell>
                      <TableCell className="text-muted-foreground leading-relaxed">
                        {row.recommendation}
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Sync Action */}
                          {!row.syncedIssueId ? (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={isSyncingThis || syncingAll}
                              onClick={() => handlePushToKanban(row)}
                              className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-2 shadow-2xs"
                            >
                              <ArrowUpRight className="h-3 w-3" />
                              <span>
                                {isSyncingThis
                                  ? isAr
                                    ? 'جاري النقل...'
                                    : 'Syncing...'
                                  : isAr
                                  ? 'إرسال للوحة المشاكل'
                                  : 'Push to Kanban'}
                              </span>
                            </Button>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50/80 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-[11px] font-semibold py-1 px-2"
                            >
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>{isAr ? 'مسجلة في الكانبان' : 'Synced to Kanban'}</span>
                            </Badge>
                          )}

                          {/* Row Edit & Delete Actions */}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenEditModal(row)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title={isAr ? 'تعديل البند' : 'Edit'}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteRow(row.id)}
                            className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            title={isAr ? 'حذف البند' : 'Delete'}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal: Add or Edit Row */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingRow
                ? isAr
                  ? 'تعديل بند في جدول التحليل'
                  : 'Edit Analysis Item'
                : isAr
                ? 'إضافة مشكلة جديدة لجدول التحليل'
                : 'Add New Analysis Issue'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveRow} className="space-y-3.5 text-xs pt-2">
            <div>
              <label className="block font-semibold mb-1 text-foreground">
                {isAr ? 'التصنيف / المكون:' : 'Category:'}
              </label>
              <Input
                type="text"
                required
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder={isAr ? 'مثال: أداء النظام والخدمات الخلفية' : 'e.g. Backend Performance'}
                className="h-8 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-foreground">
                {isAr ? 'المشكلة / الحالة المرصودة:' : 'Issue / Observation Title:'}
              </label>
              <Input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={isAr ? 'مثال: تعطل استجابة الخادم أثناء ذروة التحميل' : 'Issue title...'}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  {isAr ? 'درجة المشكلة (الخطورة):' : 'Severity:'}
                </label>
                <select
                  value={formSeverity}
                  onChange={(e) => setFormSeverity(e.target.value as any)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="حرجة">{isAr ? 'حرجة (Critical)' : 'Critical (حرجة)'}</option>
                  <option value="كبيرة">{isAr ? 'كبيرة (Major)' : 'Major (كبيرة)'}</option>
                  <option value="متوسطة">{isAr ? 'متوسطة (Medium)' : 'Medium (متوسطة)'}</option>
                  <option value="عادية">{isAr ? 'عادية (Normal)' : 'Normal (عادية)'}</option>
                  <option value="طفيفة">{isAr ? 'طفيفة (Minor)' : 'Minor (طفيفة)'}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  {isAr ? 'الجانب الخاضع للمراجعة:' : 'Aspect / Scope:'}
                </label>
                <Input
                  type="text"
                  value={formAspect}
                  onChange={(e) => setFormAspect(e.target.value)}
                  placeholder={isAr ? 'اختياري: الجانب...' : 'Optional aspect...'}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-foreground">
                {isAr ? 'الأثر على المستخدم / الجودة:' : 'Impact on User / Quality:'}
              </label>
              <textarea
                rows={2}
                value={formImpact}
                onChange={(e) => setFormImpact(e.target.value)}
                placeholder={isAr ? 'وضح الأثر المترتب على المشكلة...' : 'Describe business or quality impact...'}
                className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-foreground">
                {isAr ? 'التوصية المقترحة للمعالجة:' : 'Proposed Recommendation:'}
              </label>
              <textarea
                rows={2}
                value={formRecommendation}
                onChange={(e) => setFormRecommendation(e.target.value)}
                placeholder={isAr ? 'التوصية أو الحل الفني المقترح...' : 'Suggested corrective action...'}
                className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-foreground">
                {isAr ? 'الشكل / المرفق (اختياري):' : 'Figure / Attachment (Optional):'}
              </label>
              <Input
                type="text"
                value={formAttachment}
                onChange={(e) => setFormAttachment(e.target.value)}
                placeholder={isAr ? 'مثال: شكل (1)' : 'e.g. Figure (1)'}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-xs"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" size="sm" className="text-xs">
                {isAr ? 'حفظ البند' : 'Save Row'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
