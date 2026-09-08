'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  WidgetEntity,
  WidgetSourceType,
  WidgetVisualizationType,
  ReportItem,
  IssueItem,
  TableEntity,
} from '@/lib/types';
import { saveWidget } from '@/lib/db';
import { recalculateDashboard } from '@/lib/issue-intelligence-engine';
import { toast } from '@/components/ui/toast';
import {
  Sparkles,
  BarChart3,
  PieChart,
  Table as TableIcon,
  Hash,
  Layers,
  ArrowRight,
  ExternalLink,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WidgetCreationSourceTarget {
  type: 'report_table' | 'report_issues' | 'project_issues' | 'custom_element';
  reportId?: string;
  projectId?: string;
  table?: TableEntity;
  issues?: IssueItem[];
  elementName?: string;
}

interface CreateWidgetFromElementModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTarget: WidgetCreationSourceTarget;
  report?: ReportItem | null;
  userUid?: string;
  onWidgetCreated?: (widget: WidgetEntity) => void;
}

export function CreateWidgetFromElementModal({
  isOpen,
  onClose,
  sourceTarget,
  report,
  userUid,
  onWidgetCreated,
}: CreateWidgetFromElementModalProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const defaultReportId = report?.id || sourceTarget.reportId || '';
  const defaultProjectId = report?.project_id || report?.projectId || sourceTarget.projectId || 'proj_default';

  // Target Dashboard selection
  const [targetDashboardType, setTargetDashboardType] = useState<'report' | 'project' | 'personal'>('report');
  const targetDashboardId =
    targetDashboardType === 'report'
      ? `dash_${defaultReportId}`
      : targetDashboardType === 'project'
      ? `dash_proj_${defaultProjectId}`
      : `dash_user_${userUid || 'me'}`;

  // Widget Metadata
  const defaultTitle =
    sourceTarget.type === 'report_table'
      ? `${isAr ? 'مؤشر جدول:' : 'Widget:'} ${sourceTarget.table?.name || (isAr ? 'جدول البيانات' : 'Data Table')}`
      : sourceTarget.type === 'report_issues'
      ? `${isAr ? 'توزيع مشاكل التقرير' : 'Report Issues Distribution'}`
      : `${isAr ? 'مؤشر المشاكل' : 'Issues Metric'}`;

  const [title, setTitle] = useState(defaultTitle);
  const [visualizationType, setVisualizationType] = useState<WidgetVisualizationType>('bar');
  const [dimension, setDimension] = useState<string>('severity');
  const [measure, setMeasure] = useState<'count' | 'sum' | 'avg'>('count');
  const [measureField, setMeasureField] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Available Dimensions from Source
  const availableDimensions = useMemo(() => {
    if (sourceTarget.type === 'report_table' && sourceTarget.table) {
      return sourceTarget.table.columns_data.map((c) => ({
        id: c.id,
        label: `${c.name} (${c.id})`,
      }));
    }
    // Default Issue dimensions
    return [
      { id: 'severity', label: isAr ? 'درجة الخطورة (Severity)' : 'Severity' },
      { id: 'category', label: isAr ? 'التصنيف (Category)' : 'Category' },
      { id: 'status', label: isAr ? 'حالة المشكلة (Status)' : 'Status' },
      { id: 'aspect', label: isAr ? 'الجانب المتأثر (Aspect)' : 'Aspect' },
    ];
  }, [sourceTarget, isAr]);

  // Set initial dimension if table
  React.useEffect(() => {
    if (availableDimensions.length > 0 && !availableDimensions.some((d) => d.id === dimension)) {
      setDimension(availableDimensions[0].id);
    }
  }, [availableDimensions]);

  // Compute live preview dataset
  const previewData = useMemo(() => {
    let dataset: any[] = [];
    if (sourceTarget.type === 'report_table' && sourceTarget.table) {
      dataset = sourceTarget.table.rows_data || [];
    } else if (sourceTarget.issues) {
      dataset = sourceTarget.issues;
    }

    if (measure === 'count') {
      const counts: Record<string, number> = {};
      dataset.forEach((item) => {
        const key = item[dimension] || (isAr ? 'غير محدد' : 'Unspecified');
        counts[key] = (counts[key] || 0) + 1;
      });
      return counts;
    } else {
      return { [isAr ? 'الإجمالي' : 'Total']: dataset.length };
    }
  }, [sourceTarget, dimension, measure, isAr]);

  // Save Widget Handler
  const handleSaveWidget = async () => {
    if (!title.trim()) return;
    try {
      setIsSaving(true);
      const widgetId = `wgt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();

      const newWidget: WidgetEntity = {
        id: widgetId,
        dashboard_id: targetDashboardId,
        dashboardId: targetDashboardId,
        title: title.trim(),
        source_type:
          sourceTarget.type === 'report_table'
            ? 'report_table'
            : sourceTarget.type === 'report_issues'
            ? 'report_issues'
            : 'project_issues',
        source_config: {
          tableId: sourceTarget.table?.id,
          tableName: sourceTarget.table?.name,
          reportId: defaultReportId,
          projectId: defaultProjectId,
        },
        query_config: {
          source: {
            type:
              sourceTarget.type === 'report_table'
                ? 'report_table'
                : sourceTarget.type === 'report_issues'
                ? 'report_issues'
                : 'project_issues',
            reportId: defaultReportId,
            projectId: defaultProjectId,
            tableId: sourceTarget.table?.id,
          },
          dimension,
          measure,
          measureField: measureField || undefined,
          visualization: visualizationType,
          refreshMode: 'live',
        },
        visualization_type: visualizationType,
        refresh_mode: 'live',
        last_calculated_at: now,
        calculation_status: 'success',
        cached_result: previewData,
        created_at: now,
        updated_at: now,
      };

      await saveWidget(newWidget);
      await recalculateDashboard(targetDashboardId, userUid);

      toast.success(isAr ? 'تم إضافة المؤشر إلى لوحة المؤشرات بنجاح!' : 'Widget created successfully!');
      if (onWidgetCreated) {
        onWidgetCreated(newWidget);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to create widget from element', err);
      toast.error(isAr ? 'فشل حفظ المؤشر' : 'Failed to save widget');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-olive-700 dark:text-olive-400">
            <Sparkles className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-foreground">
              {isAr ? 'تحويل العنصر إلى مؤشر في لوحة المتابعة' : 'Convert Element to Dashboard Widget'}
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isAr
              ? 'إنشاء مؤشر تفاعلي ذكي مرتبط بمصدر البيانات مباشرة مع إمكانية تتبع المصدر.'
              : 'Create a live traceable dashboard widget connected directly to this source data.'}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* 1. Source Element Lineage Badge */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300">
                {sourceTarget.type === 'report_table' ? <TableIcon className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  {sourceTarget.type === 'report_table'
                    ? `${isAr ? 'جدول البيانات:' : 'Table:'} ${sourceTarget.table?.name || ''}`
                    : `${isAr ? 'مشاكل التقرير المعتمدة' : 'Report Issues'}`}
                </span>
                <p className="text-[11px] text-muted-foreground">
                  {sourceTarget.type === 'report_table'
                    ? `${sourceTarget.table?.rows_data?.length || 0} ${isAr ? 'صفوف بيانات' : 'rows'}`
                    : `${sourceTarget.issues?.length || 0} ${isAr ? 'مشاكل مسجلة' : 'issues'}`}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Traceable Lineage
            </Badge>
          </div>

          {/* 2. Target Dashboard */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'لوحة المؤشرات المستهدفة (Target Dashboard):' : 'Target Dashboard:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'report', label: isAr ? 'لوحة التقرير الحالي' : 'Report Dashboard' },
                { id: 'project', label: isAr ? 'لوحة المشروع العام' : 'Project Dashboard' },
                { id: 'personal', label: isAr ? 'لوحتي الشخصية' : 'Personal Dashboard' },
              ].map((dt) => (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => setTargetDashboardType(dt.id as any)}
                  className={cn(
                    'rounded-lg border p-2 text-center text-xs font-semibold transition-all cursor-pointer',
                    targetDashboardType === dt.id
                      ? 'border-[#2E4034] bg-[#2E4034]/10 text-[#2E4034] dark:border-emerald-400 dark:text-emerald-300 shadow-2xs font-bold'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  )}
                >
                  {dt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Title */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'عنوان المؤشر:' : 'Widget Title:'}
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isAr ? 'اكتب عنواناً معبراً للمؤشر...' : 'Enter widget title...'}
              className="text-xs h-8"
            />
          </div>

          {/* 4. Visualization Type */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'طريقة العرض البياني:' : 'Visualization Type:'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'bar', label: isAr ? 'شريطي' : 'Bar', icon: BarChart3 },
                { id: 'donut', label: isAr ? 'دائري' : 'Donut', icon: PieChart },
                { id: 'kpi', label: isAr ? 'رقمي (KPI)' : 'KPI Card', icon: Hash },
                { id: 'table', label: isAr ? 'جدول' : 'Table', icon: TableIcon },
              ].map((vis) => {
                const Icon = vis.icon;
                return (
                  <button
                    key={vis.id}
                    type="button"
                    onClick={() => setVisualizationType(vis.id as any)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition-all cursor-pointer',
                      visualizationType === vis.id
                        ? 'border-[#2E4034] bg-[#2E4034]/10 text-[#2E4034] dark:border-emerald-400 dark:text-emerald-300 shadow-2xs'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{vis.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Dimension & Aggregation */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                {isAr ? 'تجميع حسب (Dimension):' : 'Group By Dimension:'}
              </label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:border-olive-600"
              >
                {availableDimensions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                {isAr ? 'دالة الحساب (Measure):' : 'Aggregation Measure:'}
              </label>
              <select
                value={measure}
                onChange={(e) => setMeasure(e.target.value as any)}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:border-olive-600"
              >
                <option value="count">{isAr ? 'العدد (COUNT)' : 'Count'}</option>
                <option value="sum">{isAr ? 'المجموع (SUM)' : 'Sum'}</option>
                <option value="avg">{isAr ? 'المتوسط (AVERAGE)' : 'Average'}</option>
              </select>
            </div>
          </div>

          {/* 6. Live Interactive Preview */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-olive-600" />
                <span>{isAr ? 'معاينة فورية للنتيجة المحسوبة:' : 'Live Calculated Preview:'}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {visualizationType.toUpperCase()}
              </Badge>
            </div>

            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 min-h-[100px] flex flex-col justify-center">
              {visualizationType === 'kpi' ? (
                <div className="text-center py-2">
                  <div className="text-3xl font-black font-mono text-foreground">
                    {Object.values(previewData).reduce((a, b) => Number(a) + Number(b), 0)}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium mt-1 inline-block">
                    {title}
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(previewData).map(([key, val]) => {
                    const numVal = Number(val) || 0;
                    const maxVal = Math.max(...Object.values(previewData).map(Number), 1);
                    const pct = Math.round((numVal / maxVal) * 100);

                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-foreground">{key}</span>
                          <span className="font-mono text-muted-foreground font-bold">{numVal}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-[#2E4034] dark:bg-emerald-400 rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!title.trim() || isSaving}
            onClick={handleSaveWidget}
            className="h-9 gap-1.5 rounded-xl bg-[#2E4034] text-white hover:bg-[#24382F]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'إضافة إلى لوحة المؤشرات' : 'Add to Dashboard')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
