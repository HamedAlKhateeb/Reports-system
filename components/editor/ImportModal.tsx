'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { FileText, FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { validateImportFile, type ImportKind } from '@/lib/import/validation';
import { parseDocxFile, type DocxImportResult } from '@/lib/import/docx-import';
import {
  parseXlsxFile,
  sheetsToTipTapNodes,
  sheetToSmartTableEntity,
  type XlsxImportResult,
} from '@/lib/import/xlsx-import';
import { saveTable } from '@/lib/db';
import { toast } from '@/components/ui/toast';

interface ImportModalProps {
  open: boolean;
  initialKind: ImportKind | null;
  editor: Editor | null;
  reportId: string;
  onClose: () => void;
}

type Step = 'select' | 'parsing' | 'preview' | 'inserting';

function describeError(codeOrMessage: string, lang: string): string {
  const ar = lang === 'ar';
  if (codeOrMessage === 'EMPTY_FILE') return ar ? 'الملف فارغ.' : 'The file is empty.';
  if (codeOrMessage === 'EMPTY_DOCUMENT')
    return ar ? 'لم يتم العثور على محتوى قابل للاستيراد في الملف.' : 'No importable content found in the file.';
  if (codeOrMessage === 'CORRUPTED_FILE')
    return ar ? 'تعذّر تحليل الملف — قد يكون تالفًا.' : 'Could not parse the file — it may be corrupted.';
  return codeOrMessage;
}

export function ImportModal({ open, initialKind, editor, reportId, onClose }: ImportModalProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>(initialKind || 'docx');
  const [step, setStep] = useState<Step>('select');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [docxResult, setDocxResult] = useState<DocxImportResult | null>(null);
  const [xlsxResult, setXlsxResult] = useState<XlsxImportResult | null>(null);
  const [asSmartTable, setAsSmartTable] = useState(false);

  useEffect(() => {
    if (open) {
      setKind(initialKind || 'docx');
      setStep('select');
      setError(null);
      setDocxResult(null);
      setXlsxResult(null);
      setFileName('');
      setAsSmartTable(false);
    }
  }, [open, initialKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickFile = (nextKind: ImportKind) => {
    setKind(nextKind);
    setError(null);
    const input = fileInputRef.current;
    if (input) {
      input.accept = nextKind === 'docx' ? '.docx' : '.xlsx';
      input.click();
    }
  };

  const handleFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDocxResult(null);
    setXlsxResult(null);
    const validation = await validateImportFile(file);
    if (!validation.ok) {
      setError(isAr ? validation.errorAr! : validation.errorEn!);
      return;
    }
    const detected = validation.kind!;
    setKind(detected);
    setFileName(file.name);
    setStep('parsing');
    try {
      if (detected === 'docx') {
        const parsed = await parseDocxFile(file);
        setDocxResult(parsed);
      } else {
        const parsed = await parseXlsxFile(file);
        setXlsxResult(parsed);
      }
      setStep('preview');
    } catch (err: any) {
      console.error('Import parse failed:', err);
      setError(describeError(err?.message || 'CORRUPTED_FILE', lang));
      setStep('select');
    }
  };

  const handleConfirmInsert = async () => {
    if (!editor) {
      setError(isAr ? 'المحرر غير جاهز بعد.' : 'The editor is not ready yet.');
      return;
    }
    setStep('inserting');
    try {
      if (docxResult) {
        editor.chain().focus().insertContent(docxResult.nodes).run();
        toast.success(isAr ? `تم استيراد ${fileName} بنجاح` : `Imported ${fileName} successfully`);
      } else if (xlsxResult) {
        if (asSmartTable) {
          // Smart Table path: persist each sheet with the existing model, then
          // embed via the existing smartTable node (sequential to keep order).
          for (const sheet of xlsxResult.sheets) {
            const tableId = `tbl_${reportId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            const entity = sheetToSmartTableEntity(sheet, reportId, tableId, isAr);
            await saveTable(entity);
            (editor.chain().focus() as any)
              .insertSmartTable({ tableId, reportId, displayMode: 'embedded-edit' })
              .run();
            editor.chain().focus().insertContent({ type: 'paragraph' }).run();
          }
          toast.success(isAr ? `تم استيراد ${xlsxResult.sheets.length} ورقة كجداول ذكية` : `Imported ${xlsxResult.sheets.length} sheets as smart tables`);
        } else {
          const nodes = sheetsToTipTapNodes(xlsxResult.sheets);
          editor.chain().focus().insertContent(nodes).run();
          toast.success(isAr ? `تم استيراد ${fileName} بنجاح` : `Imported ${fileName} successfully`);
        }
      }
      onClose();
    } catch (err: any) {
      console.error('Import insert failed:', err);
      setError(isAr ? 'فشل إدراج المحتوى في التقرير. لم يتغير تقريرك الحالي.' : 'Failed to insert content. Your current report was not changed.');
      setStep('preview');
    }
  };

  const totalXlsxCells = xlsxResult
    ? xlsxResult.sheets.reduce((sum, s) => sum + s.rowCount * Math.max(s.colCount, 0), 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && step !== 'parsing' && step !== 'inserting') onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? 'استيراد ملف' : 'Import file'}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          handleFileChosen(f);
        }}
      />
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">{isAr ? 'استيراد إلى التقرير' : 'Import into report'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? 'اختر ملف Word أو Excel لمعاينته ثم إدراجه في موضع المؤشر. لن يتغير تقريرك قبل التأكيد.'
                : 'Pick a Word or Excel file to preview, then insert at the cursor. Nothing changes until you confirm.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === 'parsing' || step === 'inserting'}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          {[isAr ? 'اختيار' : 'Select', isAr ? 'تحليل' : 'Parse', isAr ? 'معاينة' : 'Preview', isAr ? 'إدراج' : 'Insert'].map(
            (label, i) => {
              const order: Step[] = ['select', 'parsing', 'preview', 'inserting'];
              const active = order.indexOf(step) >= i;
              return (
                <React.Fragment key={label}>
                  <span className={active ? 'text-primary' : ''}>{label}</span>
                  {i < 3 && <span className="opacity-40">←→</span>}
                </React.Fragment>
              );
            }
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 'select' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => pickFile('docx')}
              className="flex items-center gap-3 rounded-xl border border-border p-3.5 text-start hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">{isAr ? 'مستند Word' : 'Word document'}</div>
                <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">.docx</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => pickFile('xlsx')}
              className="flex items-center gap-3 rounded-xl border border-border p-3.5 text-start hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">{isAr ? 'جدول Excel' : 'Excel workbook'}</div>
                <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">.xlsx</div>
              </div>
            </button>
          </div>
        )}

        {(step === 'parsing' || step === 'inserting') && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>
              {step === 'parsing'
                ? isAr ? `جاري تحليل ${fileName}...` : `Parsing ${fileName}...`
                : isAr ? 'جاري الإدراج في التقرير...' : 'Inserting into report...'}
            </span>
          </div>
        )}

        {step === 'preview' && docxResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span dir="auto">{fileName}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
              {[
                [isAr ? 'فقرات' : 'Paragraphs', docxResult.summary.paragraphs],
                [isAr ? 'عناوين' : 'Headings', docxResult.summary.headings],
                [isAr ? 'قوائم' : 'Lists', docxResult.summary.lists],
                [isAr ? 'جداول' : 'Tables', docxResult.summary.tables],
                [isAr ? 'روابط' : 'Links', docxResult.summary.links],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-sm font-bold text-foreground font-mono">{value as number}</div>
                  <div className="text-[10px] text-muted-foreground">{label as string}</div>
                </div>
              ))}
            </div>
            {docxResult.warnings.length > 0 && (
              <ul className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                {docxResult.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
            <div className="rounded-xl border border-border bg-muted/20 p-3 max-h-48 overflow-y-auto text-xs space-y-1.5">
              {docxResult.nodes.slice(0, 12).map((n, i) => (
                <PreviewRow key={i} node={n} />
              ))}
              {docxResult.nodes.length > 12 && (
                <div className="text-muted-foreground text-[11px]">
                  {isAr ? `... و ${docxResult.nodes.length - 12} عناصر أخرى` : `... and ${docxResult.nodes.length - 12} more blocks`}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'preview' && xlsxResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span dir="auto">{fileName}</span>
              <span className="text-muted-foreground font-normal">
                ({xlsxResult.sheets.length} {isAr ? 'ورقة' : 'sheets'} • {totalXlsxCells} {isAr ? 'خلية' : 'cells'})
              </span>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {xlsxResult.sheets.map((sheet) => (
                <div key={sheet.name} className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-bold flex items-center justify-between gap-2">
                    <span className="truncate" dir="auto">{sheet.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {sheet.rowCount}×{sheet.colCount}
                      {sheet.truncated ? ' • ✂' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {sheet.rows.slice(0, 5).map((row, r) => (
                          <tr key={r} className={r === 0 ? 'bg-muted/30 font-bold' : ''}>
                            {row.slice(0, 6).map((cell, c) => (
                              <td key={c} className="border-t border-border/60 px-2 py-1 max-w-[120px] truncate" dir="auto">
                                {cell || <span className="opacity-30">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            {xlsxResult.warnings.length > 0 && (
              <ul className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                {xlsxResult.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={asSmartTable}
                onChange={(e) => setAsSmartTable(e.target.checked)}
                className="h-4 w-4 accent-[#2E4034]"
              />
              <span>{isAr ? 'استيراد كجداول ذكية (تدعم المعادلات)' : 'Import as smart tables (formula support)'}</span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={step === 'parsing' || step === 'inserting'}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <div className="flex items-center gap-2">
            {step === 'preview' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep('select');
                  setDocxResult(null);
                  setXlsxResult(null);
                  setError(null);
                }}
              >
                <Upload className="h-3.5 w-3.5 me-1.5" />
                {isAr ? 'اختيار ملف آخر' : 'Choose another'}
              </Button>
            )}
            {step === 'preview' && (
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmInsert}
                className="bg-[#2E4034] text-white hover:bg-[#24382F]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 me-1.5" />
                {isAr ? 'تأكيد وإدراج' : 'Confirm & insert'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ node }: { node: any }) {
  const textOf = (n: any): string => {
    if (!n) return '';
    if (typeof n.text === 'string') return n.text;
    if (Array.isArray(n.content)) return n.content.map(textOf).join(' ');
    return '';
  };
  const label =
    node.type === 'heading'
      ? `H${node.attrs?.level || 1}`
      : node.type === 'bulletList'
      ? '•'
      : node.type === 'orderedList'
      ? '1.'
      : node.type === 'table'
      ? '▦'
      : '¶';
  const text = textOf(node).slice(0, 140) || (node.type === 'table' ? `Table (${node.content?.length || 0} rows)` : '…');
  return (
    <div className="flex items-start gap-2">
      <span className="font-mono font-bold text-primary shrink-0 w-6">{label}</span>
      <span className="text-foreground/90 line-clamp-2" dir="auto">
        {text}
      </span>
    </div>
  );
}
