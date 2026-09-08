'use client';

import React, { useState, useEffect } from 'react';
import { ReportItem, WidgetEntity, InsightEntity, IssueItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  BarChart3,
  Sparkles,
  RefreshCw,
  Plus,
  ExternalLink,
  HelpCircle,
  Lightbulb,
  Layers,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Percent,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getDashboards,
  saveDashboard,
  getWidgets,
  saveWidget,
  getInsights,
  saveInsight,
} from '@/lib/db';
import { recalculateDashboard } from '@/lib/issue-intelligence-engine';
import {
  normalizeSeverity,
  normalizeStatus,
  isDoneStatus,
  getSeverityLabel,
  getStatusLabel,
} from '@/lib/i18n/dictionary';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { InsightHelpPopover } from '@/components/ui/InsightHelpPopover';
import { getMetricHelpDetails } from '@/lib/insight-help-data';

interface AnalyticsTabProps {
  report: ReportItem;
  issues: IssueItem[];
  onOpenCreateWidgetModal?: () => void;
  userUid?: string;
}

export function AnalyticsTab({
  report,
  issues,
  onOpenCreateWidgetModal,
  userUid,
}: AnalyticsTabProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [widgets, setWidgets] = useState<WidgetEntity[]>([]);
  const [insights, setInsights] = useState<InsightEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const dashboardId = `dash_${report.id}`;

  // Instant Baseline KPI Counters
  const totalCount = issues.length;
  const criticalCount = issues.filter((i) => normalizeSeverity(i.severity) === 'critical').length;
  const majorCount = issues.filter((i) => normalizeSeverity(i.severity) === 'major').length;
  const criticalAndMajor = criticalCount + majorCount;
  const openCount = issues.filter((i) => normalizeStatus(i.status) === 'open').length;
  const closedCount = issues.filter((i) => isDoneStatus(i.status)).length;
  const closureRate = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

  useEffect(() => {
    loadAnalytics();
  }, [report.id]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      // Ensure report dashboard exists
      await saveDashboard({
        id: dashboardId,
        name: `${isAr ? 'لوحة تحليلات تقرير' : 'Analytics for Report'} #${report.reportNumber || 1}`,
        scope_type: 'report',
        scope_id: report.id,
        ownerUid: userUid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      let currentWidgets = await getWidgets(dashboardId);
      if (currentWidgets.length === 0) {
        // Bootstrap default KPI and Severity widgets
        const w1 = await saveWidget({
          id: `wid_${report.id}_1`,
          dashboard_id: dashboardId,
          title: isAr ? 'توزيع المشاكل حسب الخطورة' : 'Issues by Severity',
          source_type: 'report_issues',
          query_config: {
            source: { type: 'report_issues', reportId: report.id },
            dimension: 'severity',
            measure: 'count',
            visualization: 'bar',
            refreshMode: 'live',
          },
          visualization_type: 'bar',
          refresh_mode: 'live',
          last_calculated_at: new Date().toISOString(),
          calculation_status: 'success',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const w2 = await saveWidget({
          id: `wid_${report.id}_2`,
          dashboard_id: dashboardId,
          title: isAr ? 'حالات معالجة المشاكل' : 'Issues by Status',
          source_type: 'report_issues',
          query_config: {
            source: { type: 'report_issues', reportId: report.id },
            dimension: 'status',
            measure: 'count',
            visualization: 'donut',
            refreshMode: 'live',
          },
          visualization_type: 'donut',
          refresh_mode: 'live',
          last_calculated_at: new Date().toISOString(),
          calculation_status: 'success',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        currentWidgets = [w1, w2];
      }

      setWidgets(currentWidgets);

      // Load insights
      const currentInsights = await getInsights(dashboardId);
      setInsights(currentInsights);
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true);
      const updated = await recalculateDashboard(dashboardId, userUid);
      setWidgets(updated);
      toast.success(isAr ? 'تمت إعادة حساب المؤشرات والويدجات بنجاح' : 'Recalculated successfully');
    } catch (e: any) {
      console.error('Failed to recalculate:', e);
      toast.error(isAr ? 'فشلت إعادة الحساب' : 'Failed to recalculate');
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Header Bar with Recalculate & Add Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 sm:p-5 rounded-xl border border-border shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-olive-50 dark:bg-olive-950/60 text-olive-700 dark:text-olive-300">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {isAr ? 'لوحة تحليلات التقرير والمؤشرات اللحظية' : 'Report Analytics & Live Metrics'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'ويدجات واستبصارات ديناميكية متصلة بمصادرها الحية ويعاد حسابها لحظياً.'
                : 'Dynamic query-driven widgets and insights connected to live data.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="h-8 gap-1.5 text-xs font-semibold shadow-2xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRecalculating && 'animate-spin')} />
            <span>
              {isRecalculating
                ? isAr
                  ? 'جاري الحساب...'
                  : 'Calculating...'
                : isAr
                ? 'إعادة الحساب'
                : 'Recalculate'}
            </span>
          </Button>

          {onOpenCreateWidgetModal && (
            <Button
              size="sm"
              onClick={onOpenCreateWidgetModal}
              className="h-8 gap-1.5 text-xs font-semibold bg-[#2E4034] text-white hover:bg-[#24382F] shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isAr ? 'إضافة Widget' : 'Add Widget'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. BASELINE KPI COUNTERS (Immediate baseline before charts) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span>{isAr ? 'إجمالي المشاكل' : 'Total Issues'}</span>
              <InsightHelpPopover helpKey="total" />
            </div>
            <Layers className="h-4 w-4 text-olive-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground">{totalCount}</p>
          <span className="text-[11px] text-muted-foreground block">
            {isAr ? 'خاصة بهذا التقرير' : 'Scoped to report'}
          </span>
        </div>

        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-red-600 dark:text-red-400 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span>{isAr ? 'حرجة وكبيرة' : 'Critical & Major'}</span>
              <InsightHelpPopover helpKey="criticalAndMajor" />
            </div>
            <AlertOctagon className="h-4 w-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400">
            {criticalAndMajor}
          </p>
          <span className="text-[11px] text-muted-foreground block">
            {isAr ? `حرجة: ${criticalCount} • كبيرة: ${majorCount}` : `Crit: ${criticalCount} • Maj: ${majorCount}`}
          </span>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span>{isAr ? 'مفتوحة / قيد الانتظار' : 'Open / Pending'}</span>
              <InsightHelpPopover helpKey="open" />
            </div>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {openCount}
          </p>
          <span className="text-[11px] text-muted-foreground block">
            {isAr ? 'بانتظار المعالجة' : 'Pending start'}
          </span>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span>{isAr ? 'نسبة الإغلاق' : 'Closure Rate'}</span>
              <InsightHelpPopover helpKey="closureRate" />
            </div>
            <Percent className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {closureRate}%
          </p>
          <span className="text-[11px] text-muted-foreground block">
            {closedCount} {isAr ? `من أصل ${totalCount} مغلقة` : `of ${totalCount} closed`}
          </span>
        </div>
      </div>

      {/* 3. WIDGETS SECTION (Clear Separation from Insights) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-olive-600" />
            <h4 className="text-sm font-bold text-foreground">
              {isAr ? 'لوحات البيانات والرسوم البيانية (Widgets)' : 'Data Charts & Query Widgets'}
            </h4>
            <Badge variant="secondary" className="text-xs font-mono">
              {widgets.length}
            </Badge>
          </div>
        </div>

        {widgets.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground border-dashed border-border bg-card space-y-3">
            <BarChart3 className="h-6 w-6 mx-auto text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground text-sm">
                {isAr ? 'لا توجد أدوات تحليل مضافة بعد' : 'No widgets added yet'}
              </p>
              <p className="max-w-sm mx-auto">
                {isAr
                  ? 'يمكنك إضافة أدوات تحليل جديدة من الجداول الذكية أو عبر زر "إضافة Widget".'
                  : 'You can create widgets from smart tables or using the Add Widget button.'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {widgets.map((widget) => {
              // Dynamic calculation with normalized taxonomy
              const counts: Record<string, number> = {};
              const dim = widget.query_config?.dimension || 'severity';

              issues.forEach((iss) => {
                let label = '';
                if (dim === 'status') {
                  label = getStatusLabel(iss.status, lang);
                } else {
                  label = getSeverityLabel(iss.severity, lang);
                }
                counts[label] = (counts[label] || 0) + 1;
              });

              return (
                <Card key={widget.id} className="border-border/80 bg-card shadow-2xs">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-olive-600" />
                      <span>{widget.title}</span>
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {widget.visualization_type}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px]',
                          widget.calculation_status === 'success'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-muted'
                        )}
                      >
                        {widget.calculation_status === 'success'
                          ? isAr
                            ? 'نشط'
                            : 'Active'
                          : widget.calculation_status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="space-y-2.5">
                      {Object.keys(counts).length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          {isAr ? 'لا توجد بيانات لحساب هذا المؤشر' : 'No data to compute'}
                        </div>
                      ) : (
                        Object.entries(counts).map(([label, count]) => {
                          const total = totalCount || 1;
                          const pct = Math.round((count / total) * 100);
                          return (
                            <div key={label} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span className="text-foreground">{label}</span>
                                <span className="text-muted-foreground font-mono">
                                  {count} ({pct}%)
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-[#2E4034] dark:bg-olive-500 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {isAr ? 'آخر حساب:' : 'Last Calculated:'}{' '}
                        {widget.last_calculated_at
                          ? new Date(widget.last_calculated_at).toLocaleTimeString(
                              isAr ? 'ar-SA' : 'en-US',
                              { hour: '2-digit', minute: '2-digit' }
                            )
                          : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          toast.info(
                            `${isAr ? 'مصدر الاستعلام:' : 'Query Source:'} ${widget.query_config?.source?.type || 'report_issues'} • البُعد: ${dim}`
                          )
                        }
                        className="text-olive-700 dark:text-olive-400 font-semibold hover:underline flex items-center gap-1"
                      >
                        <span>{isAr ? 'عرض المصدر' : 'View Source'}</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. INSIGHTS SECTION (Evidence-backed Intelligence) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-bold text-foreground">
              {isAr
                ? 'الاستبصارات والتحليلات المعتمدة بالأدلة (Evidence-backed Insights)'
                : 'Evidence-backed Insights'}
            </h4>
            <Badge variant="secondary" className="text-xs font-mono">
              {insights.length}
            </Badge>
          </div>
        </div>

        {insights.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-border bg-card text-center text-xs text-muted-foreground space-y-2">
            <Sparkles className="h-6 w-6 mx-auto text-amber-500 mb-1" />
            <p className="font-semibold text-foreground text-sm">
              {isAr
                ? 'لا توجد استبصارات معتمدة بعد لهذا التقرير'
                : 'No approved insights generated yet'}
            </p>
            <p className="max-w-md mx-auto leading-relaxed">
              {isAr
                ? 'الاستبصارات تعتمد على تحليل عميق لبيانات المشاكل وربطها بالأدلة الإحصائية. سيتم توليدها تلقائياً عند فحص واستخراج المشاكل.'
                : 'Insights are generated from deep evaluation of issues and linked evidence.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((ins) => (
              <Card
                key={ins.id}
                className="border-border bg-card p-4 shadow-2xs space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-foreground flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span>{ins.title}</span>
                    <InsightHelpPopover
                      helpDetails={{
                        title: ins.title,
                        whatIsIt: ins.observation,
                        dataSource: isAr ? 'استبصار تحليلي مستخرج تلقائياً بالذكاء الاصطناعي' : 'Automated AI Intelligence Insight',
                        calculation: `${isAr ? 'مستوى الثقة:' : 'Confidence:'} ${ins.confidence}`,
                        meaning: isAr ? 'تحليل مبني على تقاطع بيانات المشاكل والملاحظات الميدانية' : 'Cross-correlation of issues and logged findings',
                        howToBenefit: ins.recommendation || (isAr ? 'اتباع التوصيات المقترحة لتسريع المعالجة' : 'Follow proposed steps for faster triage'),
                      }}
                    />
                  </h4>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {ins.confidence} {isAr ? 'ثقة' : 'confidence'}
                  </Badge>
                </div>

                <p className="text-muted-foreground leading-relaxed">{ins.observation}</p>

                {ins.recommendation && (
                  <div className="rounded-lg bg-olive-50/50 dark:bg-olive-950/20 border border-olive-200/60 dark:border-olive-900/40 p-2.5 text-olive-800 dark:text-olive-300 font-medium">
                    <span className="font-bold me-1">{isAr ? 'التوصية:' : 'Recommendation:'}</span>
                    <span>{ins.recommendation}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
