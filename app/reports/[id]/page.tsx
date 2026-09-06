'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Edit3,
  Calendar,
  BookmarkPlus,
  BookmarkCheck,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getReportById, updateReport, getReportImages, getIssuesByReportId } from '@/lib/db';
import { ReportItem, ReportImageItem, IssueItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { printReportAsPdf } from '@/lib/pdf-export-client';
import { Button } from '@/components/ui/button';
import { saveCustomTemplate } from '@/lib/custom-templates';
import { useAuth } from '@/lib/auth-context';

const TipTapEditor = dynamic(
  () => import('@/components/editor/TipTapEditor').then((m) => m.TipTapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2E4034] border-t-transparent" />
      </div>
    ),
  }
);

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const { lang, t } = useLanguage();
  const { user } = useAuth();

  const [report, setReport] = useState<ReportItem | null>(null);
  const [images, setImages] = useState<ReportImageItem[]>([]);
  const [linkedIssues, setLinkedIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const latestContentRef = useRef<any>(null);

  // Metadata form states
  const [title, setTitle] = useState('');
  const [reportNumber, setReportNumber] = useState<number | string>(101);
  const [author, setAuthor] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [themeColor, setThemeColor] = useState('olive');
  const [backgroundColor, setBackgroundColor] = useState('white');
  const [systemUnderReview, setSystemUnderReview] = useState('');
  const [reportLanguage, setReportLanguage] = useState<AppLanguage>('ar');

  // Custom Template states
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [customTemplateDesc, setCustomTemplateDesc] = useState('');
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);

  const handleConfirmSaveTemplate = () => {
    if (!customTemplateName.trim() || !report) return;
    const content = latestContentRef.current || report.contentJson;
    saveCustomTemplate(
      {
        name: customTemplateName.trim(),
        description:
          customTemplateDesc.trim() ||
          (reportLanguage === 'ar'
            ? 'قالب مخصص تم حفظه من التقرير'
            : 'Custom template saved from report'),
        contentJson: content,
        themeColor,
        backgroundColor,
        language: reportLanguage,
      },
      user?.uid
    );
    setTemplateSaveSuccess(true);
    setTimeout(() => {
      setTemplateSaveSuccess(false);
      setShowSaveTemplateModal(false);
      setCustomTemplateDesc('');
    }, 1500);
  };

  const loadReportData = useCallback(async () => {
    try {
      setLoading(true);
      const [rep, imgs, issues] = await Promise.all([
        getReportById(reportId),
        getReportImages(reportId),
        getIssuesByReportId(reportId),
      ]);

      if (!rep) {
        router.push('/reports');
        return;
      }
      setReport(rep);
      latestContentRef.current = rep.contentJson;
      setTitle(rep.title || '');
      setReportNumber(rep.reportNumber ?? 101);
      setAuthor(rep.author || '');
      setAuthorTitle(rep.authorTitle || '');
      setOrganization(rep.organization || '');
      setSignatureData(rep.signatureData || '');
      setThemeColor(rep.themeColor || 'olive');
      setBackgroundColor(rep.backgroundColor || 'white');
      setSystemUnderReview(rep.systemUnderReview || '');
      setReportLanguage(rep.language || 'ar');
      setImages(imgs);
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

  // Real-time editor content tracking
  const handleContentChange = useCallback((contentJson: any) => {
    latestContentRef.current = contentJson;
  }, []);

  // Autosave TipTap JSON content
  const handleEditorSave = async (contentJson: any) => {
    latestContentRef.current = contentJson;
    await updateReport(reportId, { contentJson });
    setReport((prev) => (prev ? { ...prev, contentJson } : null));
    // refresh images in case a new image was uploaded
    const updatedImages = await getReportImages(reportId);
    setImages(updatedImages);
  };

  // Update metadata
  const handleMetaBlur = async () => {
    if (!report) return;
    const numVal = Number(reportNumber) || reportNumber;
    await updateReport(reportId, {
      title,
      reportNumber: numVal,
      author,
      authorTitle,
      organization,
      signatureData,
      themeColor,
      backgroundColor,
      systemUnderReview,
      language: reportLanguage,
    });
    if (report) {
      setReport({
        ...report,
        title,
        reportNumber: numVal,
        author,
        authorTitle,
        organization,
        signatureData,
        themeColor,
        backgroundColor,
        systemUnderReview,
        language: reportLanguage,
      });
    }
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

      const numVal = Number(reportNumber) || reportNumber;
      const currentImgs = await getReportImages(reportId);
      const contentJsonToExport = latestContentRef.current || report.contentJson;

      const currentReportData: ReportItem = {
        ...report,
        title,
        reportNumber: numVal,
        author,
        authorTitle,
        organization,
        signatureData,
        themeColor,
        backgroundColor,
        systemUnderReview,
        language: reportLanguage,
        contentJson: contentJsonToExport,
      };

      if (format === 'pdf') {
        // Direct, high-fidelity PDF print/generation with native browser rendering and 100% RTL support
        printReportAsPdf(currentReportData, currentImgs);
        setExporting(null);
        return;
      }

      const res = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: currentReportData,
          images: currentImgs,
        }),
      });

      if (!res.ok) {
        throw new Error(`Export failed with status: ${res.status}`);
      }

      // Standard binary blob download
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      
      const rawTitle = (title || report.title || (reportLanguage === 'ar' ? 'تقرير' : 'report')).trim();
      const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
      let filename = `${sanitizedTitle} - #${numVal}.${format === 'md' ? 'zip' : format}`;
      
      const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      if (match && match[1]) {
        try {
          filename = decodeURIComponent(match[1].replace(/["']/g, ''));
        } catch {
          filename = match[1].replace(/["']/g, '');
        }
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
    <div className="mx-auto max-w-6xl px-2.5 sm:px-6 lg:px-8 py-6 sm:py-8 w-full max-w-full">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => handleExport('md')}
            title={t('exportMarkdown')}
          >
            <FileCode className="h-3.5 w-3.5 text-indigo-600" />
            <span>Markdown (ZIP)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => handleExport('docx')}
            title={t('exportDocx')}
          >
            <FileText className="h-3.5 w-3.5 text-blue-600" />
            <span>Word (DOCX)</span>
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={!!exporting}
            onClick={() => handleExport('pdf')}
            title={t('exportPdf')}
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{exporting === 'pdf' ? t('exporting') : 'PDF'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCustomTemplateName(title || report.title || '');
              setShowSaveTemplateModal(true);
            }}
            className="border-olive-300 dark:border-olive-800 text-olive-800 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950"
            title={lang === 'ar' ? 'حفظ هذا التقرير كقالب مخصص دائم' : 'Save as permanent custom template'}
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400 me-1" />
            <span>{lang === 'ar' ? 'حفظ كقالب' : 'Save Template'}</span>
          </Button>
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
      <div className="mb-6 rounded-2xl border border-slate-200 dark:border-border/80 bg-white dark:bg-card p-4 sm:p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Title and Editable Report # */}
          <div className="md:col-span-8">
            <div className="flex flex-wrap items-center gap-3 mb-2.5">
              {/* Editable Report Number Badge */}
              <div className="inline-flex items-center rounded-lg border border-teal-200 dark:border-teal-800/70 bg-teal-50/90 dark:bg-teal-950/50 px-2.5 py-1 shadow-xs transition-all focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500">
                <span className="text-xs font-bold text-teal-800 dark:text-teal-300 me-1">#</span>
                <input
                  type="text"
                  value={reportNumber}
                  onChange={(e) => setReportNumber(e.target.value)}
                  onBlur={handleMetaBlur}
                  title={lang === 'ar' ? 'رقم التقرير (قابل للتعديل)' : 'Report Number (Editable)'}
                  placeholder="101"
                  className="w-16 bg-transparent text-xs font-bold text-teal-900 dark:text-teal-200 outline-none focus:outline-none"
                />
                <Edit3 className="h-3 w-3 text-teal-600 dark:text-teal-400 opacity-60 ms-0.5" />
              </div>

              {/* Date */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  {new Date(report.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </span>
              </div>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('reportTitle')}
              className="w-full text-xl sm:text-2xl font-bold text-slate-900 dark:text-foreground border-b border-transparent hover:border-slate-200 dark:hover:border-border focus:border-teal-500 focus:outline-none py-1 transition-colors"
            />
          </div>

          {/* Report Content Language Switcher */}
          <div className="md:col-span-4 flex md:justify-end">
            <div className="flex flex-col items-start md:items-end">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                {t('reportLanguage')}
              </label>
              <div className="flex rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => handleLanguageToggle('ar')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    reportLanguage === 'ar'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  العربية (RTL)
                </button>
                <button
                  type="button"
                  onClick={() => handleLanguageToggle('en')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    reportLanguage === 'en'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  English (LTR)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Reviewer & System Metadata Inputs - Spacious Responsive Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 border-t border-slate-100 dark:border-border/60 pt-4 text-xs">
          {/* System Under Review */}
          <div className="space-y-1.5 rounded-xl border border-slate-200/80 dark:border-border/60 bg-slate-50/50 dark:bg-card/40 p-3 transition-all hover:border-slate-300 dark:hover:border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Cpu className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
              <span>{t('systemUnderReview')}</span>
            </div>
            <input
              type="text"
              value={systemUnderReview}
              onChange={(e) => setSystemUnderReview(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={lang === 'ar' ? 'مثال: النظام الأساسي أو بوابة الدفع v2.4' : 'e.g. Core Platform or Payment Gateway'}
              className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-1.5 text-xs text-slate-900 dark:text-foreground placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all"
            />
          </div>

          {/* Author / Reviewer */}
          <div className="space-y-1.5 rounded-xl border border-slate-200/80 dark:border-border/60 bg-slate-50/50 dark:bg-card/40 p-3 transition-all hover:border-slate-300 dark:hover:border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <UserIcon className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
              <span>{t('author')}</span>
            </div>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={lang === 'ar' ? 'اسم المدقق / المراجع' : 'Auditor / Reviewer Name'}
              className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-1.5 text-xs text-slate-900 dark:text-foreground placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all"
            />
          </div>

          {/* Job Title */}
          <div className="space-y-1.5 rounded-xl border border-slate-200/80 dark:border-border/60 bg-slate-50/50 dark:bg-card/40 p-3 transition-all hover:border-slate-300 dark:hover:border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Briefcase className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
              <span>{t('jobTitle')}</span>
            </div>
            <input
              type="text"
              value={authorTitle}
              onChange={(e) => setAuthorTitle(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('jobTitlePlaceholder')}
              className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-1.5 text-xs text-slate-900 dark:text-foreground placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all"
            />
          </div>

          {/* Organization */}
          <div className="space-y-1.5 rounded-xl border border-slate-200/80 dark:border-border/60 bg-slate-50/50 dark:bg-card/40 p-3 transition-all hover:border-slate-300 dark:hover:border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Building2 className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
              <span>{t('organization')}</span>
            </div>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('organizationPlaceholder')}
              className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-1.5 text-xs text-slate-900 dark:text-foreground placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Signature & Appearance Controls */}
        <div className="mt-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-t border-slate-100 dark:border-border/60 pt-4 text-xs">
          {/* Signature Endorsement */}
          <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
            <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300 min-w-max">
              <PenTool className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="font-semibold">{t('signature')}:</span>
            </div>
            <input
              type="text"
              value={signatureData}
              onChange={(e) => setSignatureData(e.target.value)}
              onBlur={handleMetaBlur}
              placeholder={t('signaturePlaceholder')}
              className="w-full sm:max-w-md rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-1.5 text-slate-800 dark:text-foreground italic font-serif focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          {/* Theme & Background Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Color Palette Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('reportTheme')}:</span>
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'olive', bg: 'bg-[#2E4034]', label: t('themeOlive') },
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
                        ? 'ring-2 ring-offset-2 ring-teal-500 scale-110'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                    title={th.label}
                  />
                ))}
              </div>
            </div>

            {/* Background Style Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('reportBackground')}:</span>
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
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
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
        onContentChange={handleContentChange}
        themeColor={themeColor}
        backgroundColor={backgroundColor}
      />

      {/* Save as Custom Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300">
                <BookmarkPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {lang === 'ar' ? 'حفظ التقرير كقالب مخصص' : 'Save as Custom Template'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === 'ar'
                    ? 'سيتم حفظ هيكل التقرير وجداوله وتنسيقاته لاستخدامه مستقبلاً في أي وقت.'
                    : 'The report structure, tables, and styles will be saved for future reports.'}
                </p>
              </div>
            </div>

            {templateSaveSuccess ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-2">
                <BookmarkCheck className="h-4 w-4 text-emerald-600" />
                <span>{lang === 'ar' ? 'تم حفظ القالب بنجاح!' : 'Template saved successfully!'}</span>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === 'ar' ? 'اسم القالب:' : 'Template Name:'}
                  </label>
                  <input
                    type="text"
                    value={customTemplateName}
                    onChange={(e) => setCustomTemplateName(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: تقرير تدقيق دوري مخصص' : 'e.g. Custom Audit Report'}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === 'ar' ? 'وصف مختصر (اختياري):' : 'Description (Optional):'}
                  </label>
                  <textarea
                    rows={3}
                    value={customTemplateDesc}
                    onChange={(e) => setCustomTemplateDesc(e.target.value)}
                    placeholder={lang === 'ar' ? 'اكتب نبذة عن استخدامات هذا القالب...' : 'Describe when to use this template...'}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSaveTemplateModal(false)}
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!customTemplateName.trim()}
                    onClick={handleConfirmSaveTemplate}
                    className="bg-[#2E4034] text-white hover:bg-[#24382F]"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5 me-1.5" />
                    <span>{lang === 'ar' ? 'حفظ القالب' : 'Save Template'}</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
