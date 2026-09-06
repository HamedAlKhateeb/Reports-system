'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileCode,
  FileText,
  FileDown,
  Globe,
  User as UserIcon,
  Cpu,
  Layers,
  Check,
  AlertCircle,
  Clock,
  Images,
  ExternalLink,
  Briefcase,
  Building2,
  PenTool,
  Palette,
} from 'lucide-react';
import { getReportById, updateReport, getReportImages, getIssuesByReportId } from '@/lib/db';
import { ReportItem, ReportImageItem, IssueItem } from '@/lib/types';
import { TipTapEditor } from '@/components/editor/TipTapEditor';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const { lang, t } = useLanguage();

  const [report, setReport] = useState<ReportItem | null>(null);
  const [images, setImages] = useState<ReportImageItem[]>([]);
  const [linkedIssues, setLinkedIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Metadata form states
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [themeColor, setThemeColor] = useState('olive');
  const [backgroundColor, setBackgroundColor] = useState('white');
  const [systemUnderReview, setSystemUnderReview] = useState('');
  const [reportLanguage, setReportLanguage] = useState<AppLanguage>('ar');

  const loadReportData = useCallback(async () => {
    try {
      setLoading(true);
      const rep = await getReportById(reportId);
      if (!rep) {
        router.push('/reports');
        return;
      }
      setReport(rep);
      setTitle(rep.title || '');
      setAuthor(rep.author || '');
      setAuthorTitle(rep.authorTitle || '');
      setOrganization(rep.organization || '');
      setSignatureData(rep.signatureData || '');
      setThemeColor(rep.themeColor || 'olive');
      setBackgroundColor(rep.backgroundColor || 'white');
      setSystemUnderReview(rep.systemUnderReview || '');
      setReportLanguage(rep.language || 'ar');

      const imgs = await getReportImages(reportId);
      setImages(imgs);

      const issues = await getIssuesByReportId(reportId);
      setLinkedIssues(issues);
    } catch (err) {
      console.error('Failed to load report', err);
    } finally {
      setLoading(false);
    }
  }, [reportId, router]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Autosave TipTap JSON content
  const handleEditorSave = async (contentJson: any) => {
    await updateReport(reportId, { contentJson });
    // refresh images in case a new image was uploaded
    const updatedImages = await getReportImages(reportId);
    setImages(updatedImages);
  };

  // Update metadata
  const handleMetaBlur = async () => {
    if (!report) return;
    await updateReport(reportId, {
      title,
      author,
      authorTitle,
      organization,
      signatureData,
      themeColor,
      backgroundColor,
      systemUnderReview,
      language: reportLanguage,
    });
  };

  const handleThemeChange = async (newTheme: string) => {
    setThemeColor(newTheme);
    await updateReport(reportId, { themeColor: newTheme });
  };

  const handleBackgroundChange = async (newBg: string) => {
    setBackgroundColor(newBg);
    await updateReport(reportId, { backgroundColor: newBg });
  };

  const handleLanguageToggle = async (newLang: AppLanguage) => {
    setReportLanguage(newLang);
    await updateReport(reportId, { language: newLang });
    if (report) {
      setReport({ ...report, language: newLang });
    }
  };

  // Export handlers
  const handleExport = async (format: 'md' | 'docx' | 'pdf') => {
    if (!report) return;
    try {
      setExporting(format);
      setExportNotice(null);

      const currentImgs = await getReportImages(reportId);

      const res = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: {
            ...report,
            title,
            author,
            authorTitle,
            organization,
            signatureData,
            themeColor,
            backgroundColor,
            systemUnderReview,
            language: reportLanguage,
          },
          images: currentImgs,
        }),
      });

      if (!res.ok) {
        throw new Error(`Export failed with status: ${res.status}`);
      }

      // Check if server returned a JSON fallback (e.g. PDF fallback without LibreOffice)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.fallbackToDocx && json.docxBase64) {
          // Download the fallback DOCX file
          const byteCharacters = atob(json.docxBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = json.fallbackFilename || `report-${report.reportNumber}.docx`;
          document.body.appendChild(a);
          a.click();
          a.remove();

          setExportNotice(json.message || t('pdfNoticeWithoutLibreOffice'));
          return;
        }
      }

      // Standard binary blob download
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      let filename = `report-${report.reportNumber}.${format === 'md' ? 'zip' : format}`;
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export error:', err);
      alert(t('exportError') + ': ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  if (loading || !report) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Navigation & Actions Bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/reports"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 transition-colors"
        >
          <BackIcon className="h-4 w-4" />
          <span>{t('reports')}</span>
        </Link>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!exporting}
            onClick={() => handleExport('md')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title={t('exportMarkdown')}
          >
            <FileCode className="h-3.5 w-3.5 text-indigo-600" />
            <span>Markdown (ZIP)</span>
          </button>

          <button
            type="button"
            disabled={!!exporting}
            onClick={() => handleExport('docx')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title={t('exportDocx')}
          >
            <FileText className="h-3.5 w-3.5 text-blue-600" />
            <span>Word (DOCX)</span>
          </button>

          <button
            type="button"
            disabled={!!exporting}
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-50 transition-colors"
            title={t('exportPdf')}
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{exporting === 'pdf' ? t('exporting') : 'PDF'}</span>
          </button>
        </div>
      </div>

      {/* Export Fallback Alert if applicable */}
      {exportNotice && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{exportNotice}</div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-amber-500 hover:text-amber-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Report Metadata Card */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Title and Report # */}
          <div className="md:col-span-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-md bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                #{report.reportNumber}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(report.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
              </span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('reportTitle')}
              className="w-full text-xl sm:text-2xl font-bold text-slate-900 border-b border-transparent hover:border-slate-200 focus:border-teal-500 focus:outline-none py-1 transition-colors"
            />
          </div>

          {/* Report Content Language Switcher */}
          <div className="md:col-span-4 flex md:justify-end">
            <div className="flex flex-col items-start md:items-end">
              <label className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
                {t('reportLanguage')}
              </label>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => handleLanguageToggle('ar')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    reportLanguage === 'ar'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  العربية (RTL)
                </button>
                <button
                  type="button"
                  onClick={() => handleLanguageToggle('en')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    reportLanguage === 'en'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  English (LTR)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Reviewer & System Metadata Inputs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-slate-100 dark:border-border/60 pt-4 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-medium text-slate-500 min-w-max">{t('systemUnderReview')}:</span>
            <input
              type="text"
              value={systemUnderReview}
              onChange={(e) => setSystemUnderReview(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={lang === 'ar' ? 'مثال: بوابة الدفع v2.4' : 'e.g. Payment Gateway v2.4'}
              className="flex-1 rounded border border-slate-200 dark:border-border bg-transparent px-2 py-1 text-slate-800 dark:text-foreground focus:border-olive-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-medium text-slate-500 min-w-max">{t('author')}:</span>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={lang === 'ar' ? 'اسم المدقق / المراجع' : 'Auditor / Reviewer Name'}
              className="flex-1 rounded border border-slate-200 dark:border-border bg-transparent px-2 py-1 text-slate-800 dark:text-foreground focus:border-olive-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-medium text-slate-500 min-w-max">{t('jobTitle')}:</span>
            <input
              type="text"
              value={authorTitle}
              onChange={(e) => setAuthorTitle(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('jobTitlePlaceholder')}
              className="flex-1 rounded border border-slate-200 dark:border-border bg-transparent px-2 py-1 text-slate-800 dark:text-foreground focus:border-olive-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-medium text-slate-500 min-w-max">{t('organization')}:</span>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('organizationPlaceholder')}
              className="flex-1 rounded border border-slate-200 dark:border-border bg-transparent px-2 py-1 text-slate-800 dark:text-foreground focus:border-olive-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Signature & Theme Bar */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 border-t border-slate-100 dark:border-border/60 pt-4 text-xs">
          {/* Signature Endorsement */}
          <div className="md:col-span-6 flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center gap-1.5 font-medium text-slate-500 min-w-max">
              <PenTool className="h-4 w-4 text-olive-600 dark:text-olive-400" />
              <span>{t('signature')}:</span>
            </div>
            <input
              type="text"
              value={signatureData}
              onChange={(e) => setSignatureData(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('signaturePlaceholder')}
              className="w-full rounded border border-slate-200 dark:border-border bg-transparent px-2.5 py-1 text-slate-800 dark:text-foreground italic font-serif focus:border-olive-500 focus:outline-none"
            />
          </div>

          {/* Theme & Background Controls */}
          <div className="md:col-span-6 flex flex-wrap items-center md:justify-end gap-3">
            {/* Color Palette Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">{t('reportTheme')}:</span>
              <div className="flex items-center gap-1">
                {[
                  { id: 'olive', bg: 'bg-olive-600', label: t('themeOlive') },
                  { id: 'blue', bg: 'bg-blue-600', label: t('themeBlue') },
                  { id: 'slate', bg: 'bg-slate-700', label: t('themeSlate') },
                  { id: 'emerald', bg: 'bg-emerald-600', label: t('themeEmerald') },
                ].map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleThemeChange(th.id)}
                    className={`h-5 w-5 rounded-full ${th.bg} transition-all ${
                      themeColor === th.id
                        ? 'ring-2 ring-offset-1 ring-olive-500 scale-110'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title={th.label}
                  />
                ))}
              </div>
            </div>

            {/* Background Style Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">{t('reportBackground')}:</span>
              <div className="flex rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 p-0.5">
                {[
                  { id: 'white', label: t('bgWhite') },
                  { id: 'cream', label: t('bgCream') },
                  { id: 'cool', label: t('bgCool') },
                ].map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => handleBackgroundChange(bg.id)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      backgroundColor === bg.id
                        ? 'bg-white dark:bg-card text-foreground shadow-sm font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Linked Issues Indicator */}
        {linkedIssues.length > 0 && (
          <div className="mt-4 border-t border-slate-100 dark:border-border/60 pt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-olive-600" />
            <span>
              {lang === 'ar'
                ? `مرتبط بـ ${linkedIssues.length} مشكلة في لوحة المتابعة:`
                : `Linked to ${linkedIssues.length} issues in tracker:`}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {linkedIssues.map((iss) => (
                <Link
                  key={iss.id}
                  href="/dashboard"
                  className="rounded bg-olive-50 dark:bg-olive-900/30 px-2 py-0.5 text-[11px] font-semibold text-olive-800 dark:text-olive-300 hover:bg-olive-100"
                >
                  {iss.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TipTap Rich Text Editor */}
      <TipTapEditor
        reportId={report.id}
        initialContent={report.contentJson}
        reportLanguage={reportLanguage}
        onSave={handleEditorSave}
        themeColor={themeColor}
        backgroundColor={backgroundColor}
      />
    </div>
  );
}
