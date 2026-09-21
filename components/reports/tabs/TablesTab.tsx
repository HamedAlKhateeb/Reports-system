'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ReportItem, TableEntity } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Plus,
  FileSpreadsheet,
  Download,
  Sparkles,
  Maximize2,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  MoveRight,
  HelpCircle,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getTablesByReportId, saveTable, updateReport, deleteTableEntity, clearTableValues } from '@/lib/db';
import { toast } from '@/components/ui/toast';
import { MiniSpreadsheet } from '@/components/editor/grid/MiniSpreadsheet';

interface TablesTabProps {
  report: ReportItem;
  onAnalyzeElement?: (target: { type: string; data: any }) => void;
  userUid?: string;
  onNavigateTab?: (tabKey: string, meta?: any) => void;
  onReportUpdate?: (updatedReport: ReportItem) => void;
}

export function TablesTab({
  report,
  onAnalyzeElement,
  userUid,
  onNavigateTab,
  onReportUpdate,
}: TablesTabProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [tables, setTables] = useState<TableEntity[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const [movingToReport, setMovingToReport] = useState(false);
  const [confirmNode, askConfirm] = useConfirm();

  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getTablesByReportId(report.id);
      setTables(list);
      if (list.length > 0) {
        setActiveTableId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0].id));
      } else {
        // No auto-create: an empty report stays empty. Auto-creating a sample
        // sheet here was the "deleted values come back" bug — deleting the
        // last table instantly recreated PRB-001/002/003. The empty state
        // below offers an explicit "create" button instead.
        setActiveTableId(null);
      }
    } catch (err) {
      console.error('Failed to load tables', err);
    } finally {
      setLoading(false);
    }
  }, [report.id]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const handleAddNewTable = async () => {
    const nextIdx = tables.length + 1;
    const newTbl: TableEntity = {
      id: `tbl_${report.id}_${Date.now().toString(36)}`,
      report_id: report.id,
      name: `${isAr ? 'ورقة بيانات' : 'Sheet'} ${nextIdx}`,
      direction: report.language === 'en' ? 'ltr' : 'rtl',
      columns_data: [
        { id: 'A', name: 'A', type: 'text', width: 120 },
        { id: 'B', name: 'B', type: 'number', width: 120 },
        { id: 'C', name: 'C', type: 'text', width: 160 },
      ],
      rows_data: [
        { A: '1', B: 10, C: 'بيان 1' },
        { A: '2', B: 20, C: 'بيان 2' },
      ],
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveTable(newTbl);
    setTables([...tables, newTbl]);
    setActiveTableId(newTbl.id);
    toast.success(isAr ? 'تم إنشاء جدول جديد' : 'New table sheet created');
  };

  // Delete lives here (TablesTab) and in the editor command bar — never
  // inside the sheet itself. Embedded tables delete the entity AND strip
  // every matching smartTable node from contentJson, so nothing resurrects.
  const handleDeleteTable = async () => {
    if (!activeTable) return;
    const ok = await askConfirm(
      isAr
        ? isEmbedded
          ? `حذف «${activeTable.name}» نهائيًا من التقرير وقاعدة البيانات؟ سيُزال موضعه من المحرر أيضًا. لا يمكن التراجع.`
          : `حذف «${activeTable.name}» نهائيًا؟ لا يمكن التراجع.`
        : isEmbedded
          ? `Permanently delete "${activeTable.name}" from the report and database? Its editor block will be removed too.`
          : `Permanently delete "${activeTable.name}"? This cannot be undone.`
    );
    if (!ok) return;
    try {
      const deletedId = activeTable.id;
      await deleteTableEntity(deletedId);
      // If embedded, strip its node(s) from the document so the editor never
      // re-shows a ghost block pointing at a deleted entity.
      if (isEmbedded) {
        try {
          let docObj: any = null;
          if (typeof report.contentJson === 'string') {
            try {
              docObj = JSON.parse(report.contentJson);
            } catch {
              docObj = null;
            }
          } else if (report.contentJson && typeof report.contentJson === 'object') {
            docObj = JSON.parse(JSON.stringify(report.contentJson));
          }
          if (docObj && Array.isArray(docObj.content)) {
            const before = docObj.content.length;
            docObj.content = docObj.content.filter(
              (n: any) => !(n && n.type === 'smartTable' && String(n.attrs?.tableId || '') === deletedId)
            );
            if (docObj.content.length !== before) {
              await updateReport(report.id, { contentJson: docObj, updatedAt: new Date().toISOString() });
              onReportUpdate?.({ ...report, contentJson: docObj, updatedAt: new Date().toISOString() });
            }
          }
        } catch (e) {
          console.warn('Embedded node strip failed (entity already deleted)', e);
        }
      }
      // Reload from the source of truth (freshest-wins + tombstones) —
      // never trust a locally filtered list after a delete.
      const fresh = await getTablesByReportId(report.id);
      setTables(fresh);
      setActiveTableId(fresh.length ? fresh[0].id : null);
      toast.success(isAr ? 'تم حذف الجدول نهائيًا' : 'Table deleted permanently');
    } catch (err) {
      console.error('Delete table failed', err);
      toast.error(isAr ? 'فشل حذف الجدول' : 'Failed to delete table');
    }
  };

  // Explicit "empty the sheet" action — clears every value/formula/merge
  // while keeping the table itself (the user asked for a way to delete the
  // values that kept coming back).
  const handleClearValues = async () => {
    if (!activeTable) return;
    const ok = await askConfirm(
      isAr
        ? `مسح كل القيم داخل «${activeTable.name}»؟ سيبقى الجدول فارغًا. لا يمكن التراجع.`
        : `Clear all values inside "${activeTable.name}"? The sheet stays but becomes empty.`
    );
    if (!ok) return;
    try {
      const done = await clearTableValues(activeTable.id);
      if (!done) throw new Error('clear failed');
      const fresh = await getTablesByReportId(report.id);
      setTables(fresh);
      toast.success(isAr ? 'تم مسح قيم الجدول' : 'Table values cleared');
    } catch (err) {
      console.error('Clear table values failed', err);
      toast.error(isAr ? 'فشل مسح القيم' : 'Failed to clear values');
    }
  };

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];

  // Rule: Check if active table is already embedded in report content
  const isEmbedded = useMemo(() => {
    if (!activeTableId || !report.contentJson) return false;
    let str = '';
    if (typeof report.contentJson === 'string') {
      str = report.contentJson;
    } else {
      try {
        str = JSON.stringify(report.contentJson);
      } catch {
        return false;
      }
    }
    return (
      str.includes(`"tableId":"${activeTableId}"`) ||
      str.includes(`"tableId": "${activeTableId}"`)
    );
  }, [activeTableId, report.contentJson]);

  // Move table into report editor (preserving tableId)
  const handleMoveToReport = async () => {
    if (!activeTable) return;
    try {
      setMovingToReport(true);
      let docObj: any;
      if (typeof report.contentJson === 'string') {
        try {
          docObj = JSON.parse(report.contentJson);
        } catch {
          docObj = { type: 'doc', content: [] };
        }
      } else if (report.contentJson && typeof report.contentJson === 'object') {
        docObj = JSON.parse(JSON.stringify(report.contentJson));
      } else {
        docObj = { type: 'doc', content: [] };
      }

      if (!docObj.content) {
        docObj.content = [];
      }

      // Add smartTable node to document content
      docObj.content.push({
        type: 'smartTable',
        attrs: {
          tableId: activeTable.id,
          reportId: report.id,
          displayMode: 'embedded-edit',
        },
      });

      const updatedReport: ReportItem = {
        ...report,
        contentJson: docObj,
        updatedAt: new Date().toISOString(),
      };

      await updateReport(report.id, {
        contentJson: docObj,
        updatedAt: updatedReport.updatedAt,
      });

      if (onReportUpdate) {
        onReportUpdate(updatedReport);
      }

      toast.success(
        isAr
          ? 'تم نقل وتضمين الجدول داخل التقرير بنجاح'
          : 'Table moved and embedded into report successfully'
      );
    } catch (err) {
      console.error('Failed to move table to report:', err);
      toast.error(isAr ? 'فشل نقل الجدول إلى التقرير' : 'Failed to move table to report');
    } finally {
      setMovingToReport(false);
    }
  };

  const handleExportCsv = (tbl: TableEntity) => {
    if (!tbl) return;
    const header = tbl.columns_data.map((c) => `"${(c.name || c.id).replace(/"/g, '""')}"`).join(',');
    const rows = (tbl.rows_data || [])
      .map((r) =>
        tbl.columns_data
          .map((c) => `"${String(r[c.id] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`\uFEFF${header}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tbl.name || 'table'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(isAr ? 'تم تصدير الجدول كـ CSV' : 'Exported table as CSV');
  };

  return (
    <div className="space-y-4">
      {/* Table Header & Sheet Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-2xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tables.map((tbl) => {
            const tblEmbedded =
              report.contentJson &&
              JSON.stringify(report.contentJson).includes(`"tableId":"${tbl.id}"`);
            return (
              <button
                key={tbl.id}
                type="button"
                onClick={() => setActiveTableId(tbl.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTable?.id === tbl.id
                    ? 'bg-[#2E4034] text-white shadow-2xs'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>{tbl.name}</span>
                {tblEmbedded && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ms-0.5" />
                )}
              </button>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddNewTable}
            className="h-8 gap-1 text-xs text-olive-700 dark:text-olive-400 font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? 'إضافة جدول' : 'Add Sheet'}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {activeTable && onAnalyzeElement && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onAnalyzeElement({
                  type: 'report_table',
                  data: { tableId: activeTable.id, tableName: activeTable.name },
                })
              }
              className="h-8 gap-1.5 text-xs font-semibold border-olive-400 dark:border-olive-800 text-olive-800 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950/40"
            >
              <Sparkles className="h-3.5 w-3.5 text-olive-600" />
              <span>{isAr ? 'تحليل هذا الجدول للداشبورد' : 'Analyze Table to Dashboard'}</span>
            </Button>
          )}

          {activeTable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleExportCsv(activeTable)}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
              title={isAr ? 'تصدير كملف CSV' : 'Export as CSV'}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
            </Button>
          )}

          {activeTable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearValues}
              className="h-8 gap-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              title={isAr ? 'مسح كل القيم داخل الجدول (يبقى الجدول فارغًا)' : 'Clear all values inside the table (keeps an empty sheet)'}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isAr ? 'مسح القيم' : 'Clear values'}</span>
            </Button>
          )}

          {activeTable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDeleteTable}
              className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              title={
                isEmbedded
                  ? isAr ? 'حذف الجدول نهائيًا مع إزالته من المحرر' : 'Delete the table permanently and remove it from the editor'
                  : isAr ? 'حذف الجدول' : 'Delete table'
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isAr ? 'حذف الجدول' : 'Delete'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center text-xs text-muted-foreground border border-border rounded-xl bg-card">
          <PageLoading label={isAr ? 'جاري تحميل الجداول...' : 'Loading tables...'} className="flex-col" spinnerClassName="size-6" />
        </div>
      ) : !activeTable ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <p className="text-sm font-bold text-foreground">
            {isAr ? 'لا توجد جداول في هذا التقرير' : 'No tables in this report'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {isAr
              ? 'حذفت كل الجداول — ولن تعود من تلقاء نفسها. أنشئ جدولًا جديدًا متى احتجت.'
              : 'All tables are deleted — nothing will come back on its own. Create a new sheet whenever you need one.'}
          </p>
          <Button type="button" size="sm" onClick={handleAddNewTable} className="h-9 gap-1.5 text-xs font-semibold">
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? 'إنشاء جدول جديد' : 'Create new sheet'}</span>
          </Button>
        </div>
      ) : activeTable ? (
        isEmbedded ? (
          /* EMBEDDED TABLE MANAGEMENT HUB (Rule: Do NOT show duplicate editable grid) */
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-200/60 dark:border-emerald-900/40 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    {isAr ? 'مضمّن في محرر التقرير' : 'Embedded in Report Editor'}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    ID: {activeTable.id}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2 pt-1">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span>{activeTable.name}</span>
                </h3>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => onNavigateTab?.('content')}
                  className="bg-[#2E4034] text-white hover:bg-[#24382F] gap-1.5 text-xs font-semibold shadow-2xs"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>{isAr ? 'الانتقال لموضع الجدول في التقرير' : 'Jump to Table in Report'}</span>
                  {isAr ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullScreenOpen(true)}
                  className="gap-1.5 text-xs font-semibold border-border bg-card hover:bg-muted"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{isAr ? 'فتح في وضع Spreadsheet الكامل' : 'Open Fullscreen Spreadsheet'}</span>
                </Button>
              </div>
            </div>

            {/* Explanatory Message & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-4 space-y-1 shadow-2xs">
                <span className="text-xs text-muted-foreground">{isAr ? 'عدد الأعمدة' : 'Columns'}</span>
                <p className="text-xl font-bold font-mono text-foreground">
                  {activeTable.columns_data?.length || 0}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-1 shadow-2xs">
                <span className="text-xs text-muted-foreground">{isAr ? 'عدد الصفوف' : 'Rows'}</span>
                <p className="text-xl font-bold font-mono text-foreground">
                  {activeTable.rows_data?.length || 0}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-1 shadow-2xs">
                <span className="text-xs text-muted-foreground">{isAr ? 'آخر تحديث' : 'Last Updated'}</span>
                <p className="text-xs font-semibold text-foreground pt-1">
                  {activeTable.updated_at
                    ? new Date(activeTable.updated_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
                        dateStyle: 'medium',
                      })
                    : '-'}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-card/80 border border-border/80 p-4 text-xs text-muted-foreground leading-relaxed flex items-start gap-3">
              <HelpCircle className="h-4 w-4 text-olive-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-foreground mb-1">
                  {isAr
                    ? 'قاعدة النقل وعدم التكرار (Single Source of Truth)'
                    : 'Single Source of Truth Principle'}
                </p>
                <p>
                  {isAr
                    ? 'هذا الجدول تم نقله وتضمينه في متن التقرير (محرر المستند). للحفاظ على وحدة البيانات وتجنب الازدواجية، يتم تحريره مباشرة داخل موضعه الأصيل في التقرير، أو من خلال فتح وضع Spreadsheet الكامل (ملء الشاشة).'
                    : 'This table has been moved and embedded into the report content. To ensure data integrity and avoid duplication, it is edited directly in its place inside the report editor, or via the Fullscreen Spreadsheet mode.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* NOT EMBEDDED YET: Offer Move button + show spreadsheet preview */
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300 text-xs">
                    {isAr ? 'جدول مستقل غير مضمّن' : 'Standalone Sheet (Not Embedded)'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? 'هذا الجدول لم يُضمّن بعد في متن التقرير. يمكنك نقله وتضمينه بضغطة زر ليصبح جزءاً أصيلاً من التقرير.'
                    : 'This table is not yet embedded into the report body. Move and embed it with one click.'}
                </p>
              </div>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleMoveToReport}
                disabled={movingToReport}
                className="bg-[#2E4034] text-white hover:bg-[#24382F] gap-2 text-xs font-semibold shadow-2xs shrink-0"
              >
                <MoveRight className="h-3.5 w-3.5" />
                <span>
                  {movingToReport
                    ? isAr
                      ? 'جاري النقل والتضمين...'
                      : 'Moving...'
                    : isAr
                    ? 'نقل وتضمين هذا الجدول داخل التقرير'
                    : 'Move and Embed Table into Report'}
                </span>
              </Button>
            </div>

            {/* Render MiniSpreadsheet directly */}
            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <MiniSpreadsheet tableId={activeTable.id} reportId={report.id} />
            </div>
          </div>
        )
      ) : null}

      {/* FULLSCREEN SPREADSHEET MODAL */}
      {isFullScreenOpen && activeTable && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col p-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-sm font-semibold">{activeTable.name || (isAr ? 'الجدول' : 'Table')}</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsFullScreenOpen(false);
                  onNavigateTab?.('content');
                }}
              >
                {isAr ? 'الانتقال إلى محتوى التقرير' : 'Go to Report Content'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setIsFullScreenOpen(false);
                  loadTables();
                }}
              >
                {isAr ? 'إغلاق ملء الشاشة' : 'Close Fullscreen'}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden pt-3">
            <MiniSpreadsheet tableId={activeTable.id} reportId={report.id} />
          </div>
        </div>
      )}
      {confirmNode}
    </div>
  );
}
