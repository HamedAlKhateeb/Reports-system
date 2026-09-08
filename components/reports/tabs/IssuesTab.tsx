'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ReportItem, IssueItem, ReportIssueItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Search,
  Filter,
  Layers,
  Sparkles,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  X,
  AlertOctagon,
  HelpCircle,
} from 'lucide-react';
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
import { AnalysisTable } from '@/components/reports/AnalysisTable';
import {
  normalizeSeverity,
  normalizeStatus,
  getSeverityLabel,
  getStatusLabel,
} from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';

interface IssuesTabProps {
  report: ReportItem;
  issues: IssueItem[];
  reportIssues: ReportIssueItem[];
  liveEditorRef?: React.RefObject<any>;
  onReportUpdate?: (updatedReport: ReportItem) => void;
  onOpenScanner: () => void;
  onOpenInspector: () => void;
  onRefreshIssues: () => void;
  activeFilter?: { severity?: string; status?: string; search?: string } | null;
  onClearActiveFilter?: () => void;
}

export function IssuesTab({
  report,
  issues,
  reportIssues,
  liveEditorRef,
  onReportUpdate,
  onOpenScanner,
  onOpenInspector,
  onRefreshIssues,
  activeFilter,
  onClearActiveFilter,
}: IssuesTabProps) {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Synchronize incoming activeFilter from OverviewTab metric card clicks
  useEffect(() => {
    if (activeFilter) {
      if (activeFilter.severity) {
        setSeverityFilter(activeFilter.severity);
      }
      if (activeFilter.status) {
        setStatusFilter(activeFilter.status);
      }
      if (activeFilter.search) {
        setSearchQuery(activeFilter.search);
      }
    }
  }, [activeFilter]);

  // Robust Filter issues using normalized taxonomy
  const filteredIssues = useMemo(() => {
    return issues.filter((iss) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (iss.title || '').toLowerCase().includes(q);
        const matchesKey = (iss.issue_key || iss.issueKey || '').toLowerCase().includes(q);
        const matchesDesc = (iss.description || '').toLowerCase().includes(q);
        const matchesCat = (iss.category || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesKey && !matchesDesc && !matchesCat) return false;
      }

      // 2. Normalized Severity Filter
      if (severityFilter !== 'all') {
        const normSev = normalizeSeverity(iss.severity);
        if (severityFilter === 'critical_or_major') {
          if (normSev !== 'critical' && normSev !== 'major') return false;
        } else if (severityFilter === 'critical') {
          if (normSev !== 'critical') return false;
        } else if (severityFilter === 'high' || severityFilter === 'major') {
          if (normSev !== 'major') return false;
        } else if (severityFilter === 'medium') {
          if (normSev !== 'medium') return false;
        } else if (severityFilter === 'normal') {
          if (normSev !== 'normal') return false;
        } else if (severityFilter === 'minor') {
          if (normSev !== 'minor') return false;
        }
      }

      // 3. Normalized Status Filter
      if (statusFilter !== 'all') {
        const normStat = normalizeStatus(iss.status);
        if (statusFilter === 'open') {
          if (normStat !== 'open') return false;
        } else if (statusFilter === 'in_progress') {
          if (normStat !== 'in_progress') return false;
        } else if (statusFilter === 'closed' || statusFilter === 'done' || statusFilter === 'resolved') {
          if (normStat !== 'done') return false;
        }
      }

      return true;
    });
  }, [issues, searchQuery, severityFilter, statusFilter]);

  const hasActiveFilters =
    searchQuery.trim() !== '' || severityFilter !== 'all' || statusFilter !== 'all';

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSeverityFilter('all');
    setStatusFilter('all');
    if (onClearActiveFilter) {
      onClearActiveFilter();
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    const norm = normalizeSeverity(severity);
    switch (norm) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800 font-bold';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800 font-bold';
      case 'medium':
        return 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-medium';
      case 'normal':
        return 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800 font-medium';
      default:
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-medium';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const norm = normalizeStatus(status);
    switch (norm) {
      case 'open':
        return 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300';
      case 'in_progress':
        return 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300';
      case 'closed':
      case 'resolved':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Action Header: Search, Filters & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md relative">
          <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={isAr ? 'بحث في مشاكل التقرير، الرمز، أو التصنيف...' : 'Search issues by key, title, or category...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-9 h-9 text-xs bg-background"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Severity Filter Dropdown */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:border-olive-600"
          >
            <option value="all">{isAr ? 'جميع درجات الخطورة' : 'All Severities'}</option>
            <option value="critical_or_major">{isAr ? 'حرجة أو كبيرة' : 'Critical or Major'}</option>
            <option value="critical">{isAr ? 'حرجة فقط' : 'Critical Only'}</option>
            <option value="high">{isAr ? 'كبيرة فقط' : 'Major Only'}</option>
            <option value="medium">{isAr ? 'متوسطة' : 'Medium'}</option>
            <option value="normal">{isAr ? 'عادية' : 'Normal'}</option>
            <option value="minor">{isAr ? 'طفيفة' : 'Minor'}</option>
          </select>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:border-olive-600"
          >
            <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="open">{isAr ? 'مفتوحة' : 'Open'}</option>
            <option value="in_progress">{isAr ? 'قيد المعالجة' : 'In Progress'}</option>
            <option value="closed">{isAr ? 'مغلقة / مكتملة' : 'Closed'}</option>
          </select>

          {/* Issue Scanner Button */}
          <Button
            type="button"
            size="sm"
            onClick={onOpenScanner}
            className="h-9 bg-[#2E4034] text-white hover:bg-[#24382F] gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-olive-300" />
            <span>{isAr ? 'فحص المرشحين' : 'Scan Candidates'}</span>
          </Button>

          {/* Truth Inspector Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenInspector}
            className="h-9 gap-1.5 text-xs font-semibold border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 shadow-2xs"
          >
            <Scale className="h-3.5 w-3.5 text-blue-600" />
            <span>{isAr ? 'فاحص العدادات' : 'Inspect Truth'}</span>
          </Button>
        </div>
      </div>

      {/* 2. Active Filter Chips Bar */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs animate-in fade-in duration-150">
          <span className="text-muted-foreground font-medium flex items-center gap-1">
            <Filter className="h-3 w-3" />
            {isAr ? 'الفلاتر النشطة:' : 'Active Filters:'}
          </span>

          {severityFilter !== 'all' && (
            <Badge
              variant="secondary"
              className="gap-1 ps-2 pe-1 py-1 text-xs bg-olive-50 dark:bg-olive-950/60 text-olive-800 dark:text-olive-300 border border-olive-200 dark:border-olive-800"
            >
              <span>
                {isAr ? 'الخطورة: ' : 'Severity: '}
                {severityFilter === 'critical_or_major'
                  ? isAr
                    ? 'حرجة أو كبيرة'
                    : 'Critical or Major'
                  : getSeverityLabel(severityFilter, lang)}
              </span>
              <button
                type="button"
                onClick={() => setSeverityFilter('all')}
                className="rounded-full hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {statusFilter !== 'all' && (
            <Badge
              variant="secondary"
              className="gap-1 ps-2 pe-1 py-1 text-xs bg-olive-50 dark:bg-olive-950/60 text-olive-800 dark:text-olive-300 border border-olive-200 dark:border-olive-800"
            >
              <span>
                {isAr ? 'الحالة: ' : 'Status: '}
                {getStatusLabel(statusFilter, lang)}
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="rounded-full hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {searchQuery.trim() !== '' && (
            <Badge
              variant="secondary"
              className="gap-1 ps-2 pe-1 py-1 text-xs bg-muted text-foreground border border-border"
            >
              <span>
                {isAr ? 'بحث: ' : 'Query: '}
                &quot;{searchQuery}&quot;
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="rounded-full hover:bg-background p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAllFilters}
            className="h-7 text-xs text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 px-2"
          >
            {isAr ? 'مسح جميع الفلاتر' : 'Clear All Filters'}
          </Button>
        </div>
      )}

      {/* 3. Unified Issues Table View (Global Scrolling, no inner overflow-y traps) */}
      <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-border/80 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-olive-600" />
            <span className="text-sm font-bold text-foreground">
              {isAr ? 'المشاكل المسجلة في هذا التقرير' : 'Issues Linked to this Report'}
            </span>
            <Badge variant="secondary" className="text-xs font-mono">
              {filteredIssues.length} {isAr ? `من أصل ${issues.length}` : `of ${issues.length}`}
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshIssues}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5 me-1" />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </Button>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="p-12 text-center text-xs space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              {hasActiveFilters ? <Filter className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground text-sm">
                {hasActiveFilters
                  ? isAr
                    ? 'لا توجد مشاكل مطابقة لمعايير الفلترة الحالية'
                    : 'No issues match the active filter criteria'
                  : isAr
                  ? 'لا توجد مشاكل مرتبطة بهذا التقرير بعد'
                  : 'No issues linked to this report yet'}
              </p>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {hasActiveFilters
                  ? isAr
                    ? 'جرّب تعديل الفلاتر أو مسحها لعرض كافة المشاكل المسجلة.'
                    : 'Try clearing or modifying the active filters.'
                  : isAr
                  ? 'يمكنك فحص محتوى الجداول واستخراج المشاكل آلياً عبر الضغط على "فحص المرشحين".'
                  : 'You can extract candidate issues from report tables using the scanner.'}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAllFilters}
                className="h-8 text-xs font-semibold"
              >
                {isAr ? 'مسح الفلاتر' : 'Clear Filters'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onOpenScanner}
                className="h-8 bg-[#2E4034] text-white hover:bg-[#24382F] text-xs font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5 me-1 text-olive-300" />
                <span>{isAr ? 'فحص المرشحين الآن' : 'Scan Candidates Now'}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 text-center font-bold">{isAr ? 'الرمز' : 'Key'}</TableHead>
                  <TableHead className="font-bold">{isAr ? 'عنوان المشكلة' : 'Title'}</TableHead>
                  <TableHead className="w-32 font-bold">{isAr ? 'التصنيف' : 'Category'}</TableHead>
                  <TableHead className="w-28 text-center font-bold">{isAr ? 'درجة الخطورة' : 'Severity'}</TableHead>
                  <TableHead className="w-28 text-center font-bold">{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead className="w-24 text-center font-bold">{isAr ? 'نوع الربط' : 'Relation'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssues.map((iss) => {
                  const link = reportIssues.find(
                    (ri) => ri.issue_id === iss.id || ri.issueId === iss.id
                  );
                  return (
                    <TableRow key={iss.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-center font-mono font-bold text-xs text-olive-700 dark:text-olive-300">
                        {iss.issue_key || iss.issueKey || '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-foreground">
                        <div>{iss.title}</div>
                        {iss.description && (
                          <div className="text-[11px] text-muted-foreground font-normal line-clamp-1 mt-0.5">
                            {iss.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {iss.category || (isAr ? 'عام' : 'General')}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn('text-[11px] font-semibold', getSeverityBadgeClass(iss.severity))}
                        >
                          {getSeverityLabel(iss.severity, lang)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn('text-[11px] font-medium', getStatusBadgeClass(iss.status))}
                        >
                          {getStatusLabel(iss.status, lang)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-[11px] font-mono text-muted-foreground">
                        {link?.relation_type === 'reference' ? (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                            {isAr ? 'مرجع' : 'Ref'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                            {isAr ? 'أساسي' : 'Primary'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 4. Embedded Analysis Table Component */}
      <div className="pt-2">
        <AnalysisTable
          report={report}
          liveEditorRef={liveEditorRef}
          onReportUpdate={onReportUpdate}
        />
      </div>
    </div>
  );
}
