'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  FolderKanban,
  FileText,
  User as UserIcon,
  RefreshCw,
  Plus,
  ExternalLink,
  Trash2,
  Sparkles,
  BarChart3,
  PieChart,
  Hash,
  Table as TableIcon,
  AlertOctagon,
  CheckCircle2,
  Clock,
  HelpCircle,
  Eye,
  Info,
  FileDown,
} from 'lucide-react';
import {
  DashboardEntity,
  WidgetEntity,
  InsightEntity,
  ProjectItem,
  ReportItem,
  IssueItem,
  DashboardScope,
  WidgetSourceType,
} from '@/lib/types';
import {
  getDashboards,
  saveDashboard,
  getWidgets,
  saveWidget,
  deleteWidget,
  getInsights,
  getProjects,
  getReports,
  getIssues,
  createReport,
  updateReport,
} from '@/lib/db';
import { recalculateDashboard } from '@/lib/issue-intelligence-engine';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { normalizeSeverity, normalizeStatus, isDoneStatus } from '@/lib/i18n/dictionary';
import { InsightHelpPopover } from '@/components/ui/InsightHelpPopover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CreateWidgetFromElementModal,
  WidgetCreationSourceTarget,
} from '@/components/reports/CreateWidgetFromElementModal';

interface MultiLevelDashboardViewProps {
  userUid?: string;
}

function buildAnalyticsSection(
  widgets: WidgetEntity[],
  issues: IssueItem[],
  insights: InsightEntity[],
  isAr: boolean
) {
  const sectionHeadingText = isAr
    ? 'ملخص مؤشرات الأداء والنتائج التشغيلية'
    : 'Performance Indicators & Operational Results Summary';

  // Calculate canonical metrics
  const totalCount = issues.length;
  const criticalCount = issues.filter((i) => normalizeSeverity(i.severity) === 'critical').length;
  const majorCount = issues.filter((i) => normalizeSeverity(i.severity) === 'major').length;
  const mediumCount = issues.filter((i) => normalizeSeverity(i.severity) === 'medium').length;
  const normalCount = issues.filter((i) => normalizeSeverity(i.severity) === 'normal').length;
  const minorCount = issues.filter((i) => normalizeSeverity(i.severity) === 'minor').length;
  const criticalAndMajor = criticalCount + majorCount;

  const openCount = issues.filter((i) => normalizeStatus(i.status) === 'open').length;
  const inProgressCount = issues.filter((i) => normalizeStatus(i.status) === 'in_progress').length;
  const closedCount = issues.filter((i) => isDoneStatus(i.status)).length;
  const closureRate = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

  const kpiItems = [
    `${isAr ? 'إجمالي المشاكل المرصودة' : 'Total Logged Issues'}: ${totalCount}`,
    `${isAr ? 'المشاكل عالية الخطورة (حرجة وكبيرة)' : 'High-Risk Issues (Critical & Major)'}: ${criticalAndMajor} (${isAr ? 'حرجة' : 'Critical'}: ${criticalCount} • ${isAr ? 'كبيرة' : 'Major'}: ${majorCount})`,
    `${isAr ? 'نسبة الإغلاق والإنجاز' : 'Closure Rate'}: ${closureRate}% (${closedCount} ${isAr ? 'من أصل' : 'of'} ${totalCount})`,
    `${isAr ? 'المشاكل قيد المعالجة' : 'In Progress Issues'}: ${inProgressCount}`,
    `${isAr ? 'المشاكل المفتوحة بانتظار التعيين' : 'Open Issues Pending Triage'}: ${openCount}`,
  ];

  // Severity Table
  const severityRows = [
    { label: isAr ? 'حرجة (Critical)' : 'Critical', count: criticalCount },
    { label: isAr ? 'كبيرة (Major)' : 'Major', count: majorCount },
    { label: isAr ? 'متوسطة (Medium)' : 'Medium', count: mediumCount },
    { label: isAr ? 'عادية (Normal)' : 'Normal', count: normalCount },
    { label: isAr ? 'طفيفة (Minor)' : 'Minor', count: minorCount },
  ];

  const severityTableNode = {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'مستوى الخطورة' : 'Severity Level' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'العدد' : 'Count' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'النسبة المئوية' : 'Percentage' }] }] },
        ],
      },
      ...severityRows.map((item) => {
        const pct = totalCount > 0 ? `${Math.round((item.count / totalCount) * 100)}%` : '0%';
        return {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: item.label }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: String(item.count) }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: pct }] }] },
          ],
        };
      }),
    ],
  };

  // Status Table
  const statusRows = [
    { label: isAr ? 'مفتوحة (Open)' : 'Open', count: openCount },
    { label: isAr ? 'قيد المعالجة (In Progress)' : 'In Progress', count: inProgressCount },
    { label: isAr ? 'مكتملة ومغلقة (Done)' : 'Done / Closed', count: closedCount },
  ];

  const statusTableNode = {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'حالة المشكلة' : 'Issue Status' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'العدد' : 'Count' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'النسبة المئوية' : 'Percentage' }] }] },
        ],
      },
      ...statusRows.map((item) => {
        const pct = totalCount > 0 ? `${Math.round((item.count / totalCount) * 100)}%` : '0%';
        return {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: item.label }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: String(item.count) }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: pct }] }] },
          ],
        };
      }),
    ],
  };

  const contentNodes: any[] = [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: sectionHeadingText }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: isAr
            ? `تم استخراج وتوثيق هذه المؤشرات التحليلية تلقائياً بتاريخ ${new Date().toLocaleDateString('ar-EG')} بناءً على بيانات الرصد الميداني.`
            : `These analytical indicators were automatically generated on ${new Date().toLocaleDateString('en-US')} based on logged findings.`,
        },
      ],
    },
    {
      type: 'bulletList',
      content: kpiItems.map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    },
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: isAr ? 'جدول توزيع المشاكل حسب الخطورة' : 'Issues Distribution by Severity' }],
    },
    severityTableNode,
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: isAr ? 'جدول توزيع المشاكل حسب الحالة' : 'Issues Distribution by Status' }],
    },
    statusTableNode,
  ];

  // AI Insights
  if (insights.length > 0) {
    contentNodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: isAr ? 'توصيات ورؤى الذكاء الاصطناعي التشغيلية' : 'Operational AI Insights & Recommendations' }],
    });

    insights.forEach((ins) => {
      const recs = ins.recommendations && ins.recommendations.length > 0
        ? ` — ${isAr ? 'التوصيات:' : 'Recommendations:'} ${ins.recommendations.join('; ')}`
        : '';
      contentNodes.push({
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'bold' }], text: `• ${ins.summary || ins.title}` },
          { type: 'text', text: ` (${isAr ? 'مستوى الثقة:' : 'Confidence:'} ${ins.confidence || '90%'})` },
          ...(recs ? [{ type: 'text', text: recs }] : []),
        ],
      });
    });
  }

  // Calculated Widget Metrics
  const calculatedWidgets = widgets.filter(
    (w) => w.cached_result !== null && w.cached_result !== undefined
  );
  if (calculatedWidgets.length > 0) {
    contentNodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: isAr ? 'مؤشرات إضافية من لوحات البيانات (Widgets)' : 'Additional Calculated Widget Metrics' }],
    });
    const widgetMetrics = calculatedWidgets.flatMap((widget) => {
      const value = widget.cached_result;
      if (typeof value === 'object' && value !== null) {
        return Object.entries(value).map(([k, v]) => `${widget.title} (${k}): ${String(v)}`);
      }
      return [`${widget.title}: ${String(value)}`];
    });
    contentNodes.push({
      type: 'bulletList',
      content: widgetMetrics.map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    });
  }

  return {
    type: 'doc',
    content: contentNodes,
  };
}

function upsertAnalyticsSection(existingDoc: any, newSection: any, isAr: boolean) {
  const headingText = isAr
    ? 'ملخص مؤشرات الأداء والنتائج التشغيلية'
    : 'Performance Indicators & Operational Results';

  if (!existingDoc || !Array.isArray(existingDoc.content) || existingDoc.content.length === 0) {
    return newSection;
  }

  const existingContent: any[] = [...existingDoc.content];
  // Find where the section heading starts
  const sectionIdx = existingContent.findIndex(
    (node) =>
      node.type === 'heading' &&
      JSON.stringify(node.content || '').includes(headingText)
  );

  if (sectionIdx === -1) {
    // Append to the end
    return {
      ...existingDoc,
      content: [...existingContent, ...newSection.content],
    };
  }

  // If found, find where the section ends (next heading of level 1 or 2, or end of document)
  let endIdx = existingContent.length;
  for (let i = sectionIdx + 1; i < existingContent.length; i++) {
    const node = existingContent[i];
    if (node.type === 'heading' && (node.attrs?.level === 1 || node.attrs?.level === 2)) {
      endIdx = i;
      break;
    }
  }

  // Replace that slice with newSection.content
  const updatedContent = [
    ...existingContent.slice(0, sectionIdx),
    ...newSection.content,
    ...existingContent.slice(endIdx),
  ];

  return {
    ...existingDoc,
    content: updatedContent,
  };
}

function hasAnalyticsSection(content: unknown, isAr: boolean): boolean {
  const heading = isAr ? 'ملخص مؤشرات الأداء والنتائج التشغيلية' : 'Performance Indicators & Operational Results';
  return JSON.stringify(content || '').includes(heading);
}

export function MultiLevelDashboardView({ userUid }: MultiLevelDashboardViewProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const router = useRouter();

  const [currentScope, setCurrentScope] = useState<DashboardScope>('organization');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [issues, setIssues] = useState<IssueItem[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedReportId, setSelectedReportId] = useState<string>('');

  const [activeDashboard, setActiveDashboard] = useState<DashboardEntity | null>(null);
  const [widgets, setWidgets] = useState<WidgetEntity[]>([]);
  const [insights, setInsights] = useState<InsightEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Lineage / Provenance Inspection Modal
  const [lineageWidget, setLineageWidget] = useState<WidgetEntity | null>(null);

  // Add Widget Modal
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [widgetCreationSource, setWidgetCreationSource] = useState<WidgetCreationSourceTarget | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportTarget, setExportTarget] = useState<'existing' | 'new'>('existing');
  const [selectedExportReportId, setSelectedExportReportId] = useState('');
  const [newReportTitle, setNewReportTitle] = useState('');
  const [isExportingInsights, setIsExportingInsights] = useState(false);

  // Load baseline resources (Projects, Reports, Issues)
  useEffect(() => {
    async function initBaseline() {
      try {
        const [projList, repList, issList] = await Promise.all([
          getProjects(userUid),
          getReports(userUid),
          getIssues(userUid),
        ]);
        setProjects(projList);
        setReports(repList);
        setIssues(issList);

        if (projList.length > 0) {
          setSelectedProjectId(projList[0].id);
        }
        if (repList.length > 0) {
          setSelectedReportId(repList[0].id);
        }
      } catch (e) {
        console.error('Failed to init baseline resources', e);
      }
    }
    initBaseline();
  }, [userUid]);

  // Derive active scopeId
  const activeScopeId = useMemo(() => {
    switch (currentScope) {
      case 'organization':
        return 'org_main';
      case 'project':
        return selectedProjectId || 'proj_default';
      case 'report':
        return selectedReportId || 'rep_default';
      case 'personal':
        return userUid || 'user_anonymous';
      default:
        return 'org_main';
    }
  }, [currentScope, selectedProjectId, selectedReportId, userUid]);

  const dashboardId = `dash_${currentScope}_${activeScopeId}`;

  // Load or provision dashboard and its widgets for current scope
  const loadDashboardData = useCallback(async () => {
    if (!activeScopeId) return;
    try {
      setLoading(true);
      const dashboards = await getDashboards(currentScope, activeScopeId, userUid);
      let dash = dashboards.find((d) => (d.scope === currentScope || d.scope_type === currentScope) && d.scope_id === activeScopeId);

      if (!dash) {
        // Auto-provision initial dashboard with starter widgets
        const scopeTitle =
          currentScope === 'organization'
            ? isAr ? 'لوحة مؤشرات المؤسسة' : 'Organization Overview'
            : currentScope === 'project'
            ? isAr ? 'لوحة مؤشرات المشروع' : 'Project Dashboard'
            : currentScope === 'report'
            ? isAr ? 'لوحة مؤشرات التقرير' : 'Report Analytics'
            : isAr ? 'لوحتي الشخصية' : 'Personal Dashboard';

        dash = await saveDashboard({
          id: dashboardId,
          name: scopeTitle,
          title: scopeTitle,
          scope_type: currentScope,
          scope: currentScope,
          scope_id: activeScopeId,
          layout_config: { columns: 3 },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Provision initial widgets
        const starterWidgets: WidgetEntity[] = [
          {
            id: `wdg_${dashboardId}_total`,
            dashboard_id: dash.id,
            title: isAr ? 'إجمالي المشاكل والبنود النشطة' : 'Total Active Issues',
            type: 'kpi',
            visualization_type: 'kpi',
            source_type: currentScope === 'report' ? 'report_issues' : 'project_issues',
            source_id: activeScopeId,
            source_title: scopeTitle,
            query_definition: `SELECT COUNT(*) FROM issues WHERE scope = "${currentScope}"`,
            query_config: {
              source: {
                type: (currentScope === 'report' ? 'report_issues' : 'project_issues') as WidgetSourceType,
                reportId: currentScope === 'report' ? activeScopeId : undefined,
                projectId: currentScope === 'project' ? activeScopeId : undefined,
                ownerUid: currentScope === 'personal' ? userUid : undefined,
              },
              measure: 'count',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: `wdg_${dashboardId}_sev`,
            dashboard_id: dash.id,
            title: isAr ? 'توزيع المشاكل حسب الخطورة' : 'Severity Breakdown',
            type: 'donut',
            visualization_type: 'donut',
            source_type: currentScope === 'report' ? 'report_issues' : 'project_issues',
            source_id: activeScopeId,
            source_title: scopeTitle,
            query_definition: `GROUP BY severity`,
            query_config: {
              source: {
                type: (currentScope === 'report' ? 'report_issues' : 'project_issues') as WidgetSourceType,
                reportId: currentScope === 'report' ? activeScopeId : undefined,
                projectId: currentScope === 'project' ? activeScopeId : undefined,
                ownerUid: currentScope === 'personal' ? userUid : undefined,
              },
              dimension: 'severity',
              measure: 'count',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: `wdg_${dashboardId}_stat`,
            dashboard_id: dash.id,
            title: isAr ? 'توزيع حالات المعالجة' : 'Status Distribution',
            type: 'bar',
            visualization_type: 'bar',
            source_type: currentScope === 'report' ? 'report_issues' : 'project_issues',
            source_id: activeScopeId,
            source_title: scopeTitle,
            query_definition: `GROUP BY status`,
            query_config: {
              source: {
                type: (currentScope === 'report' ? 'report_issues' : 'project_issues') as WidgetSourceType,
                reportId: currentScope === 'report' ? activeScopeId : undefined,
                projectId: currentScope === 'project' ? activeScopeId : undefined,
                ownerUid: currentScope === 'personal' ? userUid : undefined,
              },
              dimension: 'status',
              measure: 'count',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];

        for (const w of starterWidgets) {
          await saveWidget(w);
        }
      }

      setActiveDashboard(dash);
      const [fetchedWidgets, fetchedInsights] = await Promise.all([
        getWidgets(dash.id),
        getInsights(activeScopeId),
      ]);
      setWidgets(fetchedWidgets);
      setInsights(fetchedInsights);

      // Trigger dynamic recalculation to populate cached results
      const recalculated = await recalculateDashboard(dash.id, userUid);
      setWidgets(recalculated);
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    } finally {
      setLoading(false);
    }
  }, [currentScope, activeScopeId, dashboardId, isAr, userUid]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Recalculate whole dashboard handler
  const handleRecalculateAll = async () => {
    if (!activeDashboard) return;
    try {
      setIsRecalculating(true);
      const updated = await recalculateDashboard(activeDashboard.id, userUid);
      setWidgets(updated);
      toast.success(isAr ? 'تم إعادة احتساب جميع المؤشرات بنجاح' : 'All widgets recalculated successfully');
    } catch (e) {
      console.error('Recalculation error', e);
      toast.error(isAr ? 'حدث خطأ أثناء الاحتساب' : 'Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Delete widget handler
  const handleDeleteWidget = async (widgetId: string) => {
    try {
      await deleteWidget(widgetId);
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
      toast.success(isAr ? 'تم حذف المؤشر' : 'Widget deleted');
    } catch (e) {
      toast.error(isAr ? 'فشل حذف المؤشر' : 'Failed to delete widget');
    }
  };

  // Trigger Add Widget Modal
  const handleOpenAddWidget = () => {
    setWidgetCreationSource({
      type: currentScope === 'report' ? 'report_issues' : 'project_issues',
      reportId: currentScope === 'report' ? activeScopeId : undefined,
      projectId: currentScope === 'project' ? activeScopeId : undefined,
      elementName: activeDashboard?.title || 'Dashboard Metric',
    });
    setShowAddWidgetModal(true);
  };

  const handleOpenExportInsights = () => {
    setSelectedExportReportId(reports[0]?.id || '');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setNewReportTitle(
      `${isAr ? 'تقرير تحليلي: مؤشرات الأداء والنتائج' : 'Analytics Report: Performance Indicators & Results'} - ${yyyy}/${mm}/${dd}`
    );
    setShowExportDialog(true);
  };

  const handleExportInsights = async () => {
    const section = buildAnalyticsSection(widgets, issues, insights, isAr);
    try {
      setIsExportingInsights(true);
      if (exportTarget === 'existing') {
        const target = reports.find((report) => report.id === selectedExportReportId);
        if (!target) {
          toast.error(isAr ? 'اختر تقريرًا أولًا' : 'Choose a report first');
          return;
        }
        const document = upsertAnalyticsSection(target.contentJson, section, isAr);
        await updateReport(target.id, { contentJson: document });
        setReports((previous) =>
          previous.map((report) =>
            report.id === target.id ? { ...report, contentJson: document } : report
          )
        );
        toast.success(
          isAr
            ? 'تم حفظ وتحديث قسم المؤشرات في التقرير بنجاح.'
            : 'Analytics indicators updated in report successfully.'
        );
      } else {
        if (!userUid) {
          toast.error(isAr ? 'تسجيل الدخول مطلوب لإنشاء تقرير.' : 'Sign in is required to create a report.');
          return;
        }
        const created = await createReport({
          title: newReportTitle.trim() || (isAr ? 'تقرير تحليلي' : 'Analytics Report'),
          language: lang,
          author: '',
          systemUnderReview: '',
          ownerUid: userUid,
          folderId: null,
          contentJson: section,
        });
        toast.success(isAr ? 'تم إنشاء التقرير التحليلي.' : 'Analytics report created.');
        router.push(`/reports/${created.id}`);
      }
      setShowExportDialog(false);
    } catch (error) {
      console.error('Failed to export dashboard insights', error);
      toast.error(isAr ? 'تعذر تصدير المؤشرات.' : 'Could not export insights.');
    } finally {
      setIsExportingInsights(false);
    }
  };

  const getSourceDisplayLink = (w: WidgetEntity) => {
    if (w.source_type === 'report_issues' || w.source_type === 'report_table') {
      return `/reports/${w.source_id}`;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Scope Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { scope: 'organization', label: isAr ? 'المؤسسة' : 'Organization', icon: Building2 },
            { scope: 'project', label: isAr ? 'المشروع' : 'Project', icon: FolderKanban },
            { scope: 'report', label: isAr ? 'التقرير' : 'Report', icon: FileText },
            { scope: 'personal', label: isAr ? 'لوحتي الشخصية' : 'Personal', icon: UserIcon },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentScope === item.scope;
            return (
              <button
                key={item.scope}
                type="button"
                onClick={() => setCurrentScope(item.scope as DashboardScope)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#2E4034] text-white shadow-2xs'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic sub-selectors for Project and Report scopes */}
        <div className="flex flex-wrap items-center gap-2">
          {currentScope === 'project' && projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-olive-600"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {currentScope === 'report' && reports.length > 0 && (
            <select
              value={selectedReportId}
              onChange={(e) => setSelectedReportId(e.target.value)}
              className="h-9 max-w-[200px] sm:max-w-[280px] truncate rounded-lg border border-border bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-olive-600"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.reportNumber || '1'} {r.title}
                </option>
              ))}
            </select>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRecalculateAll}
            disabled={isRecalculating || loading}
            className="h-9 gap-1.5 text-xs font-semibold shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? (isAr ? 'جاري الاحتساب...' : 'Recalculating...') : (isAr ? 'إعادة احتساب' : 'Recalculate')}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOpenAddWidget}
            className="h-9 gap-1.5 text-xs font-semibold bg-[#2E4034] text-white hover:bg-[#24382F] shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? 'إضافة مؤشر' : 'Add Widget'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenExportInsights}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <FileDown data-icon="inline-start" />
            <span>{isAr ? 'تصدير المؤشرات' : 'Export Insights'}</span>
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2E4034] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Widgets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {widgets.map((widget) => {
              const sourceLink = getSourceDisplayLink(widget);
              const isKpi = widget.type === 'kpi';
              const isDonut = widget.type === 'donut';
              const isBar = widget.type === 'bar';
              const isTable = widget.type === 'table';

              const res = widget.cached_result;

              return (
                <Card key={widget.id} className="rounded-2xl border-border/80 shadow-2xs flex flex-col justify-between overflow-hidden">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          {isKpi && <Hash className="h-4 w-4 text-teal-600" />}
                          {isDonut && <PieChart className="h-4 w-4 text-indigo-600" />}
                          {isBar && <BarChart3 className="h-4 w-4 text-emerald-600" />}
                          {isTable && <TableIcon className="h-4 w-4 text-amber-600" />}
                          <CardTitle className="text-sm font-bold text-foreground line-clamp-1">
                            {widget.title}
                          </CardTitle>
                          <InsightHelpPopover
                            helpDetails={{
                              title: widget.title,
                              whatIsIt: widget.query_definition || `${isAr ? 'مؤشر تحليلي' : 'Analytical widget'}: ${widget.title}`,
                              dataSource: `${isAr ? 'نوع المصدر:' : 'Source Type:'} ${widget.source_type} ${widget.source_title ? `(${widget.source_title})` : ''}`,
                              calculation: `${isAr ? 'طريقة الاحتساب:' : 'Method:'} ${widget.query_config?.measure || 'count'} (${widget.query_config?.dimension || 'all'})`,
                              meaning: isAr ? 'قياس كمي لتوزيع وتصنيف البيانات في النطاق المختار' : 'Quantitative measurement of distribution in scope',
                              howToBenefit: isAr ? 'استخدم هذا المؤشر للتعرف على تركز المشاكل ومتابعة الأداء' : 'Use to track problem concentration and progress',
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="capitalize">{widget.type}</span>
                          <span>•</span>
                          <span className={`font-semibold ${widget.calculation_status === 'success' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {widget.calculation_status || 'cached'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setLineageWidget(widget)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title={isAr ? 'عرض مصدر المؤشر والمعادلة' : 'View Source & Query Lineage'}
                        >
                          <Eye className="h-3.5 w-3.5 text-olive-600" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteWidget(widget.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 flex-1 flex flex-col justify-center">
                    {/* KPI Widget Display */}
                    {isKpi && (
                      <div className="py-4 text-center">
                        <span className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight">
                          {typeof res === 'number'
                            ? res
                            : typeof res === 'object' && res
                            ? Number(Object.values(res).reduce((a: any, b: any) => Number(a) + Number(b), 0))
                            : 0}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {widget.query_definition || (isAr ? 'إجمالي المحتويات المستخرجة' : 'Total extracted units')}
                        </p>
                      </div>
                    )}

                    {/* Donut or Bar Widget Display */}
                    {(isDonut || isBar) && (
                      <div className="space-y-2 py-2">
                        {typeof res === 'object' && res !== null && Object.keys(res).length > 0 ? (
                          Object.entries(res).map(([k, v]: [string, any]) => {
                            const val = Number(v) || 0;
                            const total = Object.values(res).reduce((acc: number, cur: any) => acc + (Number(cur) || 0), 0) || 1;
                            const pct = Math.round((val / total) * 100);

                            return (
                              <div key={k} className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-foreground capitalize">{k}</span>
                                  <span className="text-muted-foreground">
                                    {val} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      k === 'critical' || k === 'حرجة'
                                        ? 'bg-red-500'
                                        : k === 'high' || k === 'كبيرة'
                                        ? 'bg-amber-500'
                                        : k === 'medium' || k === 'متوسطة'
                                        ? 'bg-blue-500'
                                        : 'bg-[#2E4034]'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            {isAr ? 'لا توجد بيانات متاحة حالياً' : 'No breakdown data available'}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Table Widget Display */}
                    {isTable && (
                      <div className="overflow-x-auto py-1">
                        <table className="w-full text-xs text-start">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="pb-1 text-start font-medium">{isAr ? 'البند' : 'Item'}</th>
                              <th className="pb-1 text-end font-medium">{isAr ? 'القيمة' : 'Value'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeof res === 'object' && res !== null ? (
                              Object.entries(res).slice(0, 5).map(([k, v]: [string, any]) => (
                                <tr key={k} className="border-b border-border/40 last:border-0">
                                  <td className="py-1.5 font-medium text-foreground">{k}</td>
                                  <td className="py-1.5 text-end font-bold text-muted-foreground">{String(v)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} className="py-3 text-center text-muted-foreground">
                                  {isAr ? 'لا توجد بيانات' : 'No rows'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>

                  {/* Widget Footer & Lineage Trigger */}
                  <div className="border-t border-border/60 bg-muted/20 px-4 py-2 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">
                      {widget.last_calculated_at
                        ? new Date(widget.last_calculated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </span>

                    {sourceLink ? (
                      <Link
                        href={sourceLink}
                        className="flex items-center gap-1 font-semibold text-[#2E4034] dark:text-emerald-400 hover:underline"
                      >
                        <span>{isAr ? 'عرض المصدر' : 'View Source'}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLineageWidget(widget)}
                        className="flex items-center gap-1 font-semibold text-olive-700 dark:text-olive-400 hover:underline"
                      >
                        <span>{isAr ? 'تفاصيل المصدر' : 'Source Details'}</span>
                        <Info className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Empty Widgets Banner */}
          {widgets.length === 0 && (
            <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card/50 space-y-3">
              <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-sm font-bold text-foreground">
                {isAr ? 'لا توجد مؤشرات في هذه اللوحة حتى الآن' : 'No widgets in this dashboard yet'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {isAr
                  ? 'يمكنك إضافة مؤشرات جديدة من خلال فحص المشاكل أو تصدير الجداول مباشرة إلى هذه اللوحة.'
                  : 'Add widgets by inspecting report tables or issues.'}
              </p>
              <Button
                type="button"
                onClick={handleOpenAddWidget}
                size="sm"
                className="h-8 text-xs bg-[#2E4034] text-white hover:bg-[#24382F]"
              >
                <Plus className="h-3.5 w-3.5 me-1" />
                <span>{isAr ? 'إضافة أول مؤشر' : 'Add First Widget'}</span>
              </Button>
            </div>
          )}

          {/* Automated Intelligence Insights Section */}
          {insights.length > 0 && (
            <div className="space-y-3 pt-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>{isAr ? 'رؤى الذكاء الاصطناعي والتوصيات التحليلية' : 'Intelligence Insights & Recommendations'}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.map((ins) => (
                  <div
                    key={ins.id}
                    className="p-3.5 rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-800 dark:text-amber-300">
                        {ins.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(ins.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-semibold text-foreground">{ins.summary}</p>
                      <InsightHelpPopover
                        helpDetails={{
                          title: ins.summary || ins.title || (isAr ? 'استبصار تحليلي' : 'Analytical Insight'),
                          whatIsIt: ins.observation || ins.summary || '',
                          dataSource: isAr ? 'استبصار تحليلي مستخرج بالذكاء الاصطناعي' : 'Automated Intelligence Insight',
                          calculation: `${isAr ? 'النوع:' : 'Type:'} ${ins.type}`,
                          meaning: isAr ? 'تحليل مبني على تقاطع بيانات المشاكل والملاحظات' : 'Data correlation of issues and findings',
                          howToBenefit: (ins.recommendations && ins.recommendations.join('; ')) || (isAr ? 'اتباع التوصيات المرفقة' : 'Follow attached recommendations'),
                        }}
                      />
                    </div>
                    {ins.recommendations && ins.recommendations.length > 0 && (
                      <ul className="list-disc list-inside text-muted-foreground text-[11px] pt-1 space-y-0.5">
                        {ins.recommendations.map((rec: string, i: number) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Widget Provenance & Lineage Modal */}
      {lineageWidget && (
        <Dialog open={!!lineageWidget} onOpenChange={() => setLineageWidget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Eye className="h-5 w-5 text-olive-600" />
                <span>{isAr ? 'سلسلة تتبع المؤشر (Data Lineage)' : 'Widget Data Lineage'}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <span className="text-muted-foreground font-medium">{isAr ? 'عنوان المؤشر' : 'Widget Title'}</span>
                <p className="font-bold text-foreground">{lineageWidget.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground text-[11px] block">{isAr ? 'نوع المصدر' : 'Source Type'}</span>
                  <Badge variant="outline" className="mt-1 text-[11px]">
                    {lineageWidget.source_type}
                  </Badge>
                </div>
                <div className="p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground text-[11px] block">{isAr ? 'معرف المصدر' : 'Source ID'}</span>
                  <p className="font-mono text-[11px] truncate mt-1">{lineageWidget.source_id || '—'}</p>
                </div>
              </div>

              {lineageWidget.source_title && (
                <div className="p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground text-[11px] block">{isAr ? 'اسم العنصر الأصلي' : 'Original Element'}</span>
                  <p className="font-semibold text-foreground mt-0.5">{lineageWidget.source_title}</p>
                </div>
              )}

              {lineageWidget.query_definition && (
                <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] space-y-1">
                  <span className="text-slate-400 block text-[10px]">{isAr ? 'تعريف الاستعلام / المعادلة' : 'Query Definition'}</span>
                  <code>{lineageWidget.query_definition}</code>
                </div>
              )}

              <div className="text-[11px] text-muted-foreground flex justify-between pt-1">
                <span>{isAr ? 'آخر احتساب ناجح:' : 'Last successful calc:'}</span>
                <span className="font-mono">{lineageWidget.last_calculated_at || '—'}</span>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              {getSourceDisplayLink(lineageWidget) && (
                <Button
                  asChild
                  size="sm"
                  className="bg-[#2E4034] text-white hover:bg-[#24382F] text-xs"
                >
                  <Link href={getSourceDisplayLink(lineageWidget)!}>
                    <ExternalLink className="h-3.5 w-3.5 me-1" />
                    <span>{isAr ? 'الانتقال إلى المصدر' : 'Go to Source'}</span>
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLineageWidget(null)}
                className="text-xs"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? 'تصدير المؤشرات إلى تقرير' : 'Export Insights to Report'}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{isAr ? 'الوجهة' : 'Destination'}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={exportTarget === 'existing' ? 'default' : 'outline'} onClick={() => setExportTarget('existing')}>
                  {isAr ? 'تقرير موجود' : 'Existing report'}
                </Button>
                <Button type="button" size="sm" variant={exportTarget === 'new' ? 'default' : 'outline'} onClick={() => setExportTarget('new')}>
                  {isAr ? 'تقرير جديد' : 'New report'}
                </Button>
              </div>
            </Field>
            {exportTarget === 'existing' ? (
              <Field>
                <FieldLabel htmlFor="analytics-export-report">{isAr ? 'التقرير' : 'Report'}</FieldLabel>
                <Select value={selectedExportReportId} onValueChange={setSelectedExportReportId}>
                  <SelectTrigger id="analytics-export-report"><SelectValue placeholder={isAr ? 'اختر تقريرًا' : 'Choose a report'} /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {reports.map((report) => <SelectItem key={report.id} value={report.id}>#{report.reportNumber} {report.title}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="analytics-new-report-title">{isAr ? 'اسم التقرير' : 'Report name'}</FieldLabel>
                <Input id="analytics-new-report-title" value={newReportTitle} onChange={(event) => setNewReportTitle(event.target.value)} />
              </Field>
            )}
            <Field>
              <FieldLabel>{isAr ? 'المعاينة' : 'Preview'}</FieldLabel>
              <FieldDescription>{isAr ? `سيُضاف قسم تحليلي يتضمن ${widgets.length} من المؤشرات المحسوبة حاليًا، دون تعديل المحتوى الحالي.` : `An analytical section with ${widgets.length} currently calculated widgets will be appended without overwriting existing content.`}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowExportDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="button" onClick={handleExportInsights} disabled={isExportingInsights || (exportTarget === 'existing' && !selectedExportReportId)}>
              {isExportingInsights ? (isAr ? 'جارٍ التصدير...' : 'Exporting...') : (isAr ? 'تأكيد التصدير' : 'Confirm export')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Widget From Element Modal */}
      {showAddWidgetModal && widgetCreationSource && (
        <CreateWidgetFromElementModal
          isOpen={showAddWidgetModal}
          onClose={() => {
            setShowAddWidgetModal(false);
            setWidgetCreationSource(null);
          }}
          sourceTarget={widgetCreationSource}
          userUid={userUid}
          onWidgetCreated={async () => {
            setShowAddWidgetModal(false);
            setWidgetCreationSource(null);
            await loadDashboardData();
          }}
        />
      )}
    </div>
  );
}
