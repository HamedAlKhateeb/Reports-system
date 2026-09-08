'use client';

import React, { useState, useEffect } from 'react';
import { ReportItem, IssueItem, ProjectItem, FieldOverride, OrganizationDefaultsItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  FileText,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  User,
  Building2,
  Briefcase,
  ArrowUpRight,
  RefreshCw,
  Percent,
  Activity,
  Globe,
  Mail,
  Phone,
  ExternalLink,
  RotateCcw,
  Sliders,
  Check,
  Edit2,
  BookmarkPlus,
  ShieldCheck,
  Award,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IssueMetricCard } from '@/components/reports/IssueMetricCard';
import { normalizeSeverity, normalizeStatus, isDoneStatus } from '@/lib/i18n/dictionary';
import { getOrganizationDefaults } from '@/lib/db-intelligence';
import { updateReport } from '@/lib/db';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface OverviewTabProps {
  report: ReportItem;
  project?: ProjectItem | null;
  issues: IssueItem[];
  onNavigateTab: (tabKey: string, meta?: any) => void;
  onOpenScanner: () => void;
  onOpenInspector: () => void;
  onReportUpdate?: (updatedReport: ReportItem) => void;
  userUid?: string;
  loadingIssues?: boolean;
  issuesError?: string | null;
  onRetryIssues?: () => void;
}

export function OverviewTab({
  report,
  project,
  issues,
  onNavigateTab,
  onOpenScanner,
  onOpenInspector,
  onReportUpdate,
  userUid,
  loadingIssues = false,
  issuesError = null,
  onRetryIssues,
}: OverviewTabProps) {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [orgDefaults, setOrgDefaults] = useState<OrganizationDefaultsItem | null>(null);
  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    organization: report.organization || '',
    department: report.department || '',
    author: report.author || '',
    authorTitle: report.authorTitle || '',
    reviewerName: report.reviewerName || '',
    reviewerTitle: report.reviewerTitle || '',
    email: report.email || '',
    phone: report.phone || '',
    website: report.website || '',
    projectUrl: report.projectUrl || '',
    repoUrl: report.repoUrl || '',
    ticketsUrl: report.ticketsUrl || '',
    docsUrl: report.docsUrl || '',
  });

  useEffect(() => {
    getOrganizationDefaults(userUid).then((defs) => {
      setOrgDefaults(defs);
    });
  }, [userUid]);

  useEffect(() => {
    setMetadataForm({
      organization: report.organization || '',
      department: report.department || '',
      author: report.author || '',
      authorTitle: report.authorTitle || '',
      reviewerName: report.reviewerName || '',
      reviewerTitle: report.reviewerTitle || '',
      email: report.email || '',
      phone: report.phone || '',
      website: report.website || '',
      projectUrl: report.projectUrl || '',
      repoUrl: report.repoUrl || '',
      ticketsUrl: report.ticketsUrl || '',
      docsUrl: report.docsUrl || '',
    });
  }, [report]);

  // Accurate Issue Metrics Calculation with Unified Taxonomy
  const totalCount = issues.length;

  const criticalCount = issues.filter((i) => normalizeSeverity(i.severity) === 'critical').length;
  const majorCount = issues.filter((i) => normalizeSeverity(i.severity) === 'major').length;
  const criticalAndMajor = criticalCount + majorCount;

  const openCount = issues.filter((i) => normalizeStatus(i.status) === 'open').length;
  const inProgressCount = issues.filter((i) => normalizeStatus(i.status) === 'in_progress').length;
  const closedCount = issues.filter((i) => isDoneStatus(i.status)).length;

  const closureRate = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

  // Apply Organization Defaults to Current Report with Non-destructive Overrides
  const handleApplyOrgDefaults = async () => {
    if (!orgDefaults) {
      toast.error(
        isAr
          ? 'لم يتم ضبط بيانات افتراضية للمؤسسة بعد. يمكنك ضبطها من الإعدادات.'
          : 'No organization defaults configured yet.'
      );
      return;
    }

    try {
      setApplyingDefaults(true);
      const previousOverrides: Record<string, FieldOverride> = report.fieldOverrides || {};
      const newOverrides: Record<string, FieldOverride> = { ...previousOverrides };
      const now = new Date().toISOString();

      const fieldsToApply: Array<keyof typeof metadataForm> = [
        'organization',
        'department',
        'author',
        'authorTitle',
        'reviewerName',
        'reviewerTitle',
        'email',
        'phone',
        'website',
        'projectUrl',
        'repoUrl',
        'ticketsUrl',
        'docsUrl',
      ];

      const updates: Partial<ReportItem> = {};

      for (const field of fieldsToApply) {
        const defaultVal = (orgDefaults as any)[field];
        if (defaultVal) {
          const currentVal = (report as any)[field];
          newOverrides[field] = {
            field,
            previousValue: currentVal ?? null,
            previousSource: (newOverrides[field]?.sourceAfterApply || 'report') as any,
            newValue: defaultVal,
            sourceAfterApply: 'organization_default',
            appliedAt: now,
          };
          (updates as any)[field] = defaultVal;
        }
      }

      updates.fieldOverrides = newOverrides;
      updates.updatedAt = now;

      await updateReport(report.id, updates);
      const updated = { ...report, ...updates };
      if (onReportUpdate) {
        onReportUpdate(updated);
      }
      toast.success(
        isAr
          ? 'تم تطبيق البيانات الافتراضية للمؤسسة بنجاح'
          : 'Organization defaults applied successfully'
      );
    } catch (err) {
      console.error('Failed to apply org defaults:', err);
      toast.error(isAr ? 'فشل تطبيق البيانات الافتراضية' : 'Failed to apply defaults');
    } finally {
      setApplyingDefaults(false);
    }
  };

  // Safe Rollback to Previous Values
  const handleRollbackDefaults = async () => {
    if (!report.fieldOverrides || Object.keys(report.fieldOverrides).length === 0) {
      return;
    }

    try {
      setApplyingDefaults(true);
      const updates: Partial<ReportItem> = {};
      const now = new Date().toISOString();

      for (const [field, override] of Object.entries(report.fieldOverrides)) {
        (updates as any)[field] = override.previousValue ?? '';
      }

      updates.fieldOverrides = {};
      updates.updatedAt = now;

      await updateReport(report.id, updates);
      const updated = { ...report, ...updates };
      if (onReportUpdate) {
        onReportUpdate(updated);
      }
      toast.success(
        isAr
          ? 'تمت استعادة القيم السابقة لبيانات المؤسسة'
          : 'Reverted back to previous values'
      );
    } catch (err) {
      console.error('Failed to rollback:', err);
      toast.error(isAr ? 'فشل استرجاع القيم السابقة' : 'Failed to rollback values');
    } finally {
      setApplyingDefaults(false);
    }
  };

  // Save Direct Edit Metadata
  const handleSaveMetadataForm = async () => {
    try {
      const now = new Date().toISOString();
      const updates: Partial<ReportItem> = {
        ...metadataForm,
        updatedAt: now,
      };

      await updateReport(report.id, updates);
      const updated = { ...report, ...updates };
      if (onReportUpdate) {
        onReportUpdate(updated);
      }
      setIsEditingMetadata(false);
      toast.success(isAr ? 'تم حفظ بيانات المؤسسة والاعتماد' : 'Metadata saved successfully');
    } catch (err) {
      console.error('Failed to save metadata:', err);
      toast.error(isAr ? 'فشل حفظ البيانات' : 'Failed to save metadata');
    }
  };

  const hasOverrides = report.fieldOverrides && Object.keys(report.fieldOverrides).length > 0;

  return (
    <div className="space-y-8">
      {/* 1. DEDICATED ISSUES SUMMARY SECTION (Scoped to reportId) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-olive-600" />
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              {isAr ? 'ملخص المشاكل في التقرير' : 'Report Issues Summary'}
            </h2>
            <Badge variant="outline" className="text-xs font-mono">
              {isAr ? `خاص بالتقرير #${report.reportNumber || 1}` : `Report #${report.reportNumber || 1}`}
            </Badge>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onNavigateTab('issues')}
            className="h-8 text-xs text-olive-700 dark:text-olive-400 font-semibold gap-1 hover:underline"
          >
            <span>{isAr ? 'عرض جدول المشاكل الكامل' : 'View Full Issues Table'}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 6 ACCURATE KPI METRIC CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: Total Issues */}
          <IssueMetricCard
            title={isAr ? 'إجمالي المشاكل' : 'Total Issues'}
            count={totalCount}
            helpKey="total"
            breakdown={
              totalCount > 0
                ? isAr
                  ? `${criticalAndMajor} حرجة/كبيرة • ${openCount} مفتوحة`
                  : `${criticalAndMajor} crit/major • ${openCount} open`
                : undefined
            }
            emptyLabel={isAr ? 'لا توجد مشاكل مرتبطة بهذا التقرير' : 'No issues linked to report'}
            icon={<Layers className="h-4 w-4" />}
            variant="default"
            loading={loadingIssues}
            error={issuesError}
            onRetry={onRetryIssues}
            onClick={() => onNavigateTab('issues', { filter: 'all' })}
          />

          {/* Card 2: Critical or Major */}
          <IssueMetricCard
            title={isAr ? 'حرجة أو كبيرة' : 'Critical or Major'}
            count={criticalAndMajor}
            helpKey="criticalAndMajor"
            breakdown={
              criticalAndMajor > 0
                ? `${isAr ? 'حرجة' : 'Crit'}: ${criticalCount} | ${isAr ? 'كبيرة' : 'Maj'}: ${majorCount}`
                : undefined
            }
            emptyLabel={isAr ? 'لا توجد مشاكل حرجة أو كبيرة' : 'No critical/major issues'}
            icon={<AlertOctagon className="h-4 w-4" />}
            variant="danger"
            loading={loadingIssues}
            error={issuesError}
            onRetry={onRetryIssues}
            onClick={() => onNavigateTab('issues', { severity: 'critical_or_major' })}
          />

          {/* Card 3: Open */}
          <IssueMetricCard
            title={isAr ? 'مفتوحة' : 'Open'}
            count={openCount}
            helpKey="open"
            breakdown={
              openCount > 0 ? (isAr ? 'بانتظار بدء المعالجة' : 'Awaiting start') : undefined
            }
            emptyLabel={isAr ? 'لا توجد مشاكل مفتوحة' : 'No open issues'}
            icon={<Clock className="h-4 w-4" />}
            variant="warning"
            loading={loadingIssues}
            error={issuesError}
            onRetry={onRetryIssues}
            onClick={() => onNavigateTab('issues', { status: 'open' })}
          />

          {/* Card 4: In Progress */}
          <IssueMetricCard
            title={isAr ? 'قيد المعالجة' : 'In Progress'}
            count={inProgressCount}
            helpKey="inProgress"
            breakdown={
              inProgressCount > 0 ? (isAr ? 'جاري العمل عليها حالياً' : 'Currently being resolved') : undefined
            }
            emptyLabel={isAr ? 'لا توجد مشاكل قيد المعالجة' : 'None in progress'}
            icon={<Activity className="h-4 w-4" />}
            variant="info"
            loading={loadingIssues}
            error={issuesError}
            onRetry={onRetryIssues}
            onClick={() => onNavigateTab('issues', { status: 'in_progress' })}
          />

          {/* Card 5: Closed */}
          <IssueMetricCard
            title={isAr ? 'مغلقة ومكتملة' : 'Closed'}
            count={closedCount}
            helpKey="done"
            breakdown={
              closedCount > 0 ? (isAr ? 'تم التحقق والإغلاق' : 'Verified and closed') : undefined
            }
            emptyLabel={isAr ? 'لا توجد مشاكل مغلقة' : 'No closed issues'}
            icon={<CheckCircle2 className="h-4 w-4" />}
            variant="success"
            loading={loadingIssues}
            error={issuesError}
            onRetry={onRetryIssues}
            onClick={() => onNavigateTab('issues', { status: 'done' })}
          />

          {/* Card 6: Closure Rate % */}
          <IssueMetricCard
            title={isAr ? 'نسبة الإغلاق' : 'Closure Rate'}
            count={closedCount}
            percentage={closureRate}
            helpKey="closureRate"
            breakdown={
              totalCount > 0
                ? `${closedCount} ${isAr ? 'من أصل' : 'of'} ${totalCount}`
                : undefined
            }
            emptyLabel={isAr ? 'لا توجد بيانات لاحتساب النسبة' : 'No data to calculate'}
            icon={<Percent className="h-4 w-4" />}
            variant={closureRate >= 80 ? 'success' : closureRate >= 50 ? 'info' : 'warning'}
            loading={loadingIssues}
            error={issuesError}
            onRetry={onRetryIssues}
            onClick={() => onNavigateTab('issues', { status: 'done' })}
          />
        </div>
      </section>

      {/* 2. CORPORATE & REVIEWER METADATA (بيانات المؤسسة والاعتماد) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-olive-600" />
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              {isAr ? 'بيانات المؤسسة والاعتماد والتوثيق' : 'Corporate, Reviewer & Project Metadata'}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasOverrides && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRollbackDefaults}
                disabled={applyingDefaults}
                className="h-8 gap-1.5 text-xs text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isAr ? 'استعادة القيم السابقة' : 'Revert Values'}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyOrgDefaults}
              disabled={applyingDefaults}
              className="h-8 gap-1.5 text-xs border-olive-300 dark:border-olive-800 text-olive-800 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950/40"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-olive-600" />
              <span>
                {applyingDefaults
                  ? isAr
                    ? 'جاري التطبيق...'
                    : 'Applying...'
                  : isAr
                  ? 'تطبيق البيانات الافتراضية للمؤسسة'
                  : 'Apply Org Defaults'}
              </span>
            </Button>

            <Button
              type="button"
              variant={isEditingMetadata ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (isEditingMetadata) {
                  handleSaveMetadataForm();
                } else {
                  setIsEditingMetadata(true);
                }
              }}
              className={cn(
                'h-8 gap-1.5 text-xs font-semibold',
                isEditingMetadata && 'bg-[#2E4034] text-white hover:bg-[#24382F]'
              )}
            >
              {isEditingMetadata ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
                </>
              ) : (
                <>
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'تعديل البيانات' : 'Edit Details'}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {isEditingMetadata ? (
          /* EDIT METADATA FORM */
          <Card className="border-border bg-card p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isAr ? 'تعديل الحقول المعتمدة للتقرير' : 'Edit Report Metadata'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'اسم المؤسسة' : 'Organization'}</label>
                <input
                  type="text"
                  value={metadataForm.organization}
                  onChange={(e) => setMetadataForm({ ...metadataForm, organization: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'القسم / الإدارة' : 'Department'}</label>
                <input
                  type="text"
                  value={metadataForm.department}
                  onChange={(e) => setMetadataForm({ ...metadataForm, department: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'الموقع الإلكتروني' : 'Website'}</label>
                <input
                  type="url"
                  value={metadataForm.website}
                  onChange={(e) => setMetadataForm({ ...metadataForm, website: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'البريد الرسمي' : 'Official Email'}</label>
                <input
                  type="email"
                  value={metadataForm.email}
                  onChange={(e) => setMetadataForm({ ...metadataForm, email: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'الهاتف' : 'Phone'}</label>
                <input
                  type="text"
                  value={metadataForm.phone}
                  onChange={(e) => setMetadataForm({ ...metadataForm, phone: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'المُعِد / المدقق' : 'Author'}</label>
                <input
                  type="text"
                  value={metadataForm.author}
                  onChange={(e) => setMetadataForm({ ...metadataForm, author: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'المسمى الوظيفي للمدقق' : 'Author Title'}</label>
                <input
                  type="text"
                  value={metadataForm.authorTitle}
                  onChange={(e) => setMetadataForm({ ...metadataForm, authorTitle: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'المراجع / المعتمد' : 'Reviewer Name'}</label>
                <input
                  type="text"
                  value={metadataForm.reviewerName}
                  onChange={(e) => setMetadataForm({ ...metadataForm, reviewerName: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'المسمى الوظيفي للمعتمد' : 'Reviewer Title'}</label>
                <input
                  type="text"
                  value={metadataForm.reviewerTitle}
                  onChange={(e) => setMetadataForm({ ...metadataForm, reviewerTitle: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'رابط المشروع' : 'Project URL'}</label>
                <input
                  type="url"
                  value={metadataForm.projectUrl}
                  onChange={(e) => setMetadataForm({ ...metadataForm, projectUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'مستودع الكود' : 'Repo URL'}</label>
                <input
                  type="url"
                  value={metadataForm.repoUrl}
                  onChange={(e) => setMetadataForm({ ...metadataForm, repoUrl: e.target.value })}
                  placeholder="https://github.com/..."
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">{isAr ? 'رابط التذاكر' : 'Tickets URL'}</label>
                <input
                  type="url"
                  value={metadataForm.ticketsUrl}
                  onChange={(e) => setMetadataForm({ ...metadataForm, ticketsUrl: e.target.value })}
                  placeholder="https://jira.com/..."
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-olive-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/70">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingMetadata(false)}
                className="h-8 text-xs"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveMetadataForm}
                className="h-8 text-xs bg-[#2E4034] text-white hover:bg-[#24382F]"
              >
                {isAr ? 'حفظ التعديلات' : 'Save'}
              </Button>
            </div>
          </Card>
        ) : (
          /* READONLY METADATA DISPLAY WITH INHERITANCE BADGES */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sub-card 1: Organization */}
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-olive-600" />
                    {isAr ? 'بيانات المنظمة' : 'Organization Details'}
                  </span>
                  {report.fieldOverrides?.organization && (
                    <Badge variant="secondary" className="text-[10px] bg-olive-50 text-olive-800 dark:bg-olive-950/60 dark:text-olive-300">
                      {isAr ? 'افتراضي' : 'Default'}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">{isAr ? 'المؤسسة:' : 'Org:'}</span>
                  <p className="font-bold text-foreground">{report.organization || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">{isAr ? 'القسم / الإدارة:' : 'Department:'}</span>
                  <p className="font-medium text-foreground">{report.department || '—'}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-[11px]">
                  {report.email && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <a href={`mailto:${report.email}`} className="hover:underline text-foreground">
                        {report.email}
                      </a>
                    </span>
                  )}
                  {report.phone && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{report.phone}</span>
                    </span>
                  )}
                  {report.website && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      <a
                        href={report.website}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline text-foreground flex items-center gap-0.5"
                      >
                        <span>{report.website.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sub-card 2: Auditor & Reviewer */}
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-olive-600" />
                    {isAr ? 'التدقيق والاعتماد' : 'Audit & Endorsement'}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    #{report.reportNumber || 1}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">{isAr ? 'المُعِد / المدقق:' : 'Author / Auditor:'}</span>
                  <p className="font-bold text-foreground">
                    {report.author || '—'}
                    {report.authorTitle && (
                      <span className="text-muted-foreground font-normal ms-1">({report.authorTitle})</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">{isAr ? 'المراجع / المعتمد:' : 'Reviewer / Approver:'}</span>
                  <p className="font-bold text-foreground">
                    {report.reviewerName || '—'}
                    {report.reviewerTitle && (
                      <span className="text-muted-foreground font-normal ms-1">({report.reviewerTitle})</span>
                    )}
                  </p>
                </div>
                <div className="pt-1 text-[11px] text-muted-foreground">
                  <span>{isAr ? 'تاريخ الإنشاء: ' : 'Created: '}</span>
                  <span className="font-medium text-foreground">
                    {new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
                      dateStyle: 'medium',
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Sub-card 3: Context & Repository Links */}
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5 text-olive-600" />
                    {isAr ? 'سياق العمل والروابط' : 'Context & Links'}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {project?.name || (isAr ? 'المشروع الرئيسي' : 'Project')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">{isAr ? 'المنظومة المفحوصة:' : 'System Under Review:'}</span>
                  <p className="font-semibold text-foreground">{report.systemUnderReview || '—'}</p>
                </div>

                <div className="space-y-1.5 pt-1">
                  {report.projectUrl && (
                    <a
                      href={report.projectUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-1.5 rounded-lg border border-border/70 hover:bg-muted/50 text-[11px] text-foreground transition-colors"
                    >
                      <span className="truncate">{isAr ? 'رابط المشروع' : 'Project URL'}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </a>
                  )}

                  {report.repoUrl && (
                    <a
                      href={report.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-1.5 rounded-lg border border-border/70 hover:bg-muted/50 text-[11px] text-foreground transition-colors"
                    >
                      <span className="truncate">{isAr ? 'مستودع الكود (Repo)' : 'Code Repository'}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </a>
                  )}

                  {report.ticketsUrl && (
                    <a
                      href={report.ticketsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-1.5 rounded-lg border border-border/70 hover:bg-muted/50 text-[11px] text-foreground transition-colors"
                    >
                      <span className="truncate">{isAr ? 'نظام التذاكر / المهام' : 'Tickets Tracker'}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </a>
                  )}

                  {!report.projectUrl && !report.repoUrl && !report.ticketsUrl && (
                    <p className="text-[11px] text-muted-foreground italic">
                      {isAr ? 'لم تتم إضافة روابط سياق لهذا التقرير بعد.' : 'No context links added.'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* 3. QUICK OPERATIONS & INTEGRATIONS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onOpenScanner}
          className="h-14 justify-start p-3 bg-card border-border/80 hover:bg-olive-50 dark:hover:bg-olive-950/40 text-left shadow-2xs"
        >
          <div className="flex items-center gap-3 w-full">
            <div className="p-2 rounded-lg bg-olive-50 dark:bg-olive-950/60 text-olive-700 dark:text-olive-300 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <span className="font-bold text-xs text-foreground block truncate">
                {isAr ? 'فحص المرشحين' : 'Scan Candidates'}
              </span>
              <span className="text-[11px] text-muted-foreground block truncate">
                {isAr ? 'اكتشاف وتحديث مشاكل الجداول' : 'Detect table issues'}
              </span>
            </div>
          </div>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onOpenInspector}
          className="h-14 justify-start p-3 bg-card border-border/80 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-left shadow-2xs"
        >
          <div className="flex items-center gap-3 w-full">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <span className="font-bold text-xs text-foreground block truncate">
                {isAr ? 'فاحص العدادات' : 'Inspect Truth'}
              </span>
              <span className="text-[11px] text-muted-foreground block truncate">
                {isAr ? 'التحقق من اتساق الأرقام' : 'Verify counter integrity'}
              </span>
            </div>
          </div>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => onNavigateTab('content')}
          className="h-14 justify-start p-3 bg-card border-border/80 hover:bg-muted/50 text-left shadow-2xs"
        >
          <div className="flex items-center gap-3 w-full">
            <div className="p-2 rounded-lg bg-muted text-foreground shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <span className="font-bold text-xs text-foreground block truncate">
                {isAr ? 'محرر المستند' : 'Report Editor'}
              </span>
              <span className="text-[11px] text-muted-foreground block truncate">
                {isAr ? 'تحرير النص والجداول المضمّنة' : 'Edit body & smart tables'}
              </span>
            </div>
          </div>
        </Button>
      </section>
    </div>
  );
}
