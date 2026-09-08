'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CounterConsistencyReport,
  verifyCounterConsistency,
  syncReportIssues,
} from '@/lib/issue-intelligence-engine';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/components/ui/toast';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  TableProperties,
  Kanban,
  BarChart3,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiscrepancyInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  initialReport?: CounterConsistencyReport | null;
  onSyncComplete?: () => void;
  userUid?: string;
}

export function DiscrepancyInspectorModal({
  isOpen,
  onClose,
  reportId,
  initialReport,
  onSyncComplete,
  userUid,
}: DiscrepancyInspectorModalProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [report, setReport] = useState<CounterConsistencyReport | null>(initialReport || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const res = await verifyCounterConsistency(reportId, userUid);
      setReport(res);
    } catch (e: any) {
      toast.error(isAr ? 'فشل فحص اتساق العدادات' : 'Failed to verify counters', {
        description: e?.message,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFixAndSync = async () => {
    try {
      setIsFixing(true);
      const res = await syncReportIssues(reportId, userUid);
      toast.success(
        isAr
          ? `تمت المزامنة بنجاح! تم ربط وتحديث ${res.totalLinked} مشكلة.`
          : `Sync completed! Reconciled ${res.totalLinked} issues.`
      );
      if (onSyncComplete) onSyncComplete();
      await handleRefresh();
    } catch (e: any) {
      toast.error(isAr ? 'فشلت المزامنة' : 'Sync failed', { description: e?.message });
    } finally {
      setIsFixing(false);
    }
  };

  if (!report && isOpen) {
    handleRefresh();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        dir={isAr ? 'rtl' : 'ltr'}
        className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl bg-card text-card-foreground shadow-2xl border border-border"
      >
        <DialogHeader className="space-y-1.5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  {isAr ? 'فاحص اتساق العدادات ومصدر الحقيقة' : 'Counter Consistency & Truth Inspector'}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? 'يقارن هذا الفاحص أعداد المشاكل عبر كافة الأقسام لكشف أي فجوة أو تكرار وتفسير أسبابها.'
                    : 'Audits issue counters across document, table, links, Kanban, and widgets.'}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 gap-1.5 text-xs rounded-lg"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              <span>{isAr ? 'إعادة الفحص' : 'Re-check'}</span>
            </Button>
          </div>
        </DialogHeader>

        {report && (
          <div className="space-y-4 py-2 overflow-y-auto">
            {/* Status Header Banner */}
            <div
              className={cn(
                'rounded-xl p-3.5 border flex items-center justify-between text-xs',
                report.isConsistent
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              )}
            >
              <div className="flex items-center gap-2 font-bold">
                {report.isConsistent ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {isAr ? 'جميع العدادات متطابقة ومتسقة تماماً!' : 'All counters are perfectly consistent!'}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <span>
                      {isAr
                        ? `يوجد ${report.discrepancies.length} ملاحظة تفسيرية على اختلاف العدادات.`
                        : `${report.discrepancies.length} discrepancy notes detected across counters.`}
                    </span>
                  </>
                )}
              </div>
              <Badge
                className={cn(
                  'text-xs',
                  report.isConsistent ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                )}
              >
                {report.isConsistent ? (isAr ? 'متطابق' : 'Consistent') : isAr ? 'يحتاج مراجعة' : 'Discrepant'}
              </Badge>
            </div>

            {/* 5 Counters Visual Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className="rounded-xl border border-border bg-background p-2.5">
                <FileText className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-base font-bold text-foreground">{report.textIssuesCount}</div>
                <div className="text-[11px] text-muted-foreground">{isAr ? 'نص التقرير' : 'Text'}</div>
              </div>

              <div className="rounded-xl border border-border bg-background p-2.5">
                <TableProperties className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-base font-bold text-foreground">{report.tableIssuesCount}</div>
                <div className="text-[11px] text-muted-foreground">{isAr ? 'جدول التحليل' : 'Table'}</div>
              </div>

              <div className="rounded-xl border border-border bg-background p-2.5">
                <Link2 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-base font-bold text-foreground">{report.reportIssueRelationsCount}</div>
                <div className="text-[11px] text-muted-foreground">{isAr ? 'علاقات الربط' : 'Links'}</div>
              </div>

              <div className="rounded-xl border border-border bg-background p-2.5">
                <Kanban className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-base font-bold text-foreground">{report.kanbanActiveIssuesCount}</div>
                <div className="text-[11px] text-muted-foreground">{isAr ? 'لوحة كانبان' : 'Kanban'}</div>
              </div>

              <div className="rounded-xl border border-border bg-background p-2.5">
                <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-base font-bold text-foreground">{report.widgetIssuesCount}</div>
                <div className="text-[11px] text-muted-foreground">{isAr ? 'الويدجات' : 'Widgets'}</div>
              </div>
            </div>

            {/* Diagnostic Explanations */}
            {report.discrepancies.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-foreground">
                  {isAr ? 'تشخيص أسباب الاختلافات:' : 'Discrepancy Diagnostics:'}
                </h4>
                <div className="space-y-1.5">
                  {report.discrepancies.map((d, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-2.5 rounded-lg border text-xs flex items-start gap-2',
                        d.severity === 'warning'
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-300'
                          : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-300'
                      )}
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div>{isAr ? d.messageAr : d.messageEn}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-3 border-t border-border flex flex-row items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {isAr ? 'إغلاق' : 'Close'}
          </Button>

          <Button
            size="sm"
            onClick={handleFixAndSync}
            disabled={isFixing}
            className="bg-[#2E4034] text-white hover:bg-[#24382F] gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFixing && 'animate-spin')} />
            <span>{isAr ? 'مزامنة وإصلاح الروابط' : 'Sync & Reconcile'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
