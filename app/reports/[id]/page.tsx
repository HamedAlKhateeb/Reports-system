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
  Share2,
  Phone,
  Mail,
  Plus,
  Trash2,
  Tag,
  Award,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getReportById, updateReport, getReportImages, getIssuesByReportId } from '@/lib/db';
import { ReportItem, ReportImageItem, IssueItem, CustomFieldItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { printReportAsPdf } from '@/lib/pdf-export-client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { saveCustomTemplate } from '@/lib/custom-templates';
import { useAuth } from '@/lib/auth-context';
import { getReportTheme, getReportBackground } from '@/lib/report-theme-config';
import { ContactLinkItem, getReportContactLinks, formatWhatsAppUrl } from '@/lib/contact-links';
import { cn } from '@/lib/utils';

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
  const [contactLinks, setContactLinks] = useState<ContactLinkItem[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([]);
  const [customFooterFields, setCustomFooterFields] = useState<CustomFieldItem[]>([]);

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
      const defaultLinks = getReportContactLinks(user?.uid);
      const activeLinks = rep.contactLinks && rep.contactLinks.length > 0 ? rep.contactLinks : defaultLinks;
      setContactLinks(activeLinks);
      setCustomFields(rep.customFields || []);
      setCustomFooterFields(rep.customFooterFields || []);
      setImages(imgs);
      setLinkedIssues(issues);
    } catch (err) {
      console.error('Failed to load report', err);
    } finally {
      setLoading(false);
    }
  }, [reportId, router, user?.uid]);

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
      contactLinks,
      systemUnderReview,
      language: reportLanguage,
      customFields,
      customFooterFields,
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
        contactLinks,
        systemUnderReview,
        language: reportLanguage,
        customFields,
        customFooterFields,
      });
    }
  };

  const handleSaveImmediately = useCallback(async () => {
    if (!report) return;
    const numVal = Number(reportNumber) || reportNumber;
    const content = latestContentRef.current || report.contentJson;
    const updatedData = {
      title,
      reportNumber: numVal,
      author,
      authorTitle,
      organization,
      signatureData,
      themeColor,
      backgroundColor,
      contactLinks,
      systemUnderReview,
      language: reportLanguage,
      contentJson: content,
      customFields,
      customFooterFields,
    };
    await updateReport(reportId, updatedData);
    setReport((prev) => (prev ? { ...prev, ...updatedData } : null));
  }, [
    report,
    reportNumber,
    reportId,
    title,
    author,
    authorTitle,
    organization,
    signatureData,
    themeColor,
    backgroundColor,
    contactLinks,
    systemUnderReview,
    reportLanguage,
    customFields,
    customFooterFields,
  ]);

  const handleAddCustomField = () => {
    const newField: CustomFieldItem = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cf_${Date.now()}`,
      label: lang === 'ar' ? 'قسم جديد' : 'New Field',
      value: '',
    };
    const updated = [...customFields, newField];
    setCustomFields(updated);
    updateReport(reportId, { customFields: updated });
    setReport((prev) => (prev ? { ...prev, customFields: updated } : null));
  };

  const handleUpdateCustomField = (id: string, key: 'label' | 'value', val: string) => {
    const updated = customFields.map((f) => (f.id === id ? { ...f, [key]: val } : f));
    setCustomFields(updated);
  };

  const handleRemoveCustomField = (id: string) => {
    const updated = customFields.filter((f) => f.id !== id);
    setCustomFields(updated);
    updateReport(reportId, { customFields: updated });
    setReport((prev) => (prev ? { ...prev, customFields: updated } : null));
  };

  const handleAddCustomFooterField = () => {
    const newField: CustomFieldItem = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cff_${Date.now()}`,
      label: lang === 'ar' ? 'اعتماد إضافي' : 'Additional Endorsement',
      value: '',
    };
    const updated = [...customFooterFields, newField];
    setCustomFooterFields(updated);
    updateReport(reportId, { customFooterFields: updated });
    setReport((prev) => (prev ? { ...prev, customFooterFields: updated } : null));
  };

  const handleUpdateCustomFooterField = (id: string, key: 'label' | 'value', val: string) => {
    const updated = customFooterFields.map((f) => (f.id === id ? { ...f, [key]: val } : f));
    setCustomFooterFields(updated);
  };

  const handleRemoveCustomFooterField = (id: string) => {
    const updated = customFooterFields.filter((f) => f.id !== id);
    setCustomFooterFields(updated);
    updateReport(reportId, { customFooterFields: updated });
    setReport((prev) => (prev ? { ...prev, customFooterFields: updated } : null));
  };

  const handleThemeChange = async (newTheme: string) => {
    setThemeColor(newTheme);
    await updateReport(reportId, { themeColor: newTheme });
    setReport((prev) => (prev ? { ...prev, themeColor: newTheme } : null));
  };

  const handleBackgroundChange = async (newBg: string) => {
    setBackgroundColor(newBg);
    await updateReport(reportId, { backgroundColor: newBg });
    setReport((prev) => (prev ? { ...prev, backgroundColor: newBg } : null));
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
        contactLinks,
        systemUnderReview,
        language: reportLanguage,
        contentJson: contentJsonToExport,
        customFields,
        customFooterFields,
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
  const currentTheme = getReportTheme(themeColor);
  const currentBg = getReportBackground(backgroundColor);

  return (
    <div className="mx-auto max-w-6xl px-2.5 sm:px-6 lg:px-8 py-6 sm:py-8 w-full max-w-full">
      {/* Top Navigation & Actions Bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground self-start rounded-lg"
        >
          <Link href="/reports">
            <BackIcon className="h-4 w-4" />
            <span>{t('reports')}</span>
          </Link>
        </Button>

        {/* Export & Action Buttons with Unified Styling */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => handleExport('md')}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"
            title={t('exportMarkdown')}
          >
            <FileCode className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Markdown (ZIP)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => handleExport('docx')}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"
            title={t('exportDocx')}
          >
            <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Word (DOCX)</span>
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={!!exporting}
            onClick={() => handleExport('pdf')}
            className="h-9 gap-1.5 rounded-lg bg-[#2E4034] hover:bg-[#24382F] text-white text-xs font-semibold shadow-xs"
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
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold border-olive-300/80 text-olive-800 dark:border-olive-800 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950 shadow-2xs"
            title={lang === 'ar' ? 'حفظ هذا التقرير كقالب مخصص دائم' : 'Save as permanent custom template'}
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" />
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
      <Card
        className="mb-6 border-border/80 bg-card text-card-foreground shadow-2xs rounded-xl overflow-hidden transition-all duration-300"
        style={{
          borderTopColor: currentTheme.primary,
          borderTopWidth: '3px',
        }}
      >
        <CardHeader className="p-4 sm:p-6 pb-4 sm:pb-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Title and Editable Report # */}
            <div className="md:col-span-8 space-y-2.5">
              <div className="flex flex-wrap items-center gap-3">
                {/* Editable Report Number Badge */}
                <div
                  className="inline-flex items-center rounded-lg border px-2.5 py-1 shadow-2xs transition-all focus-within:ring-2 focus-within:border-transparent"
                  style={{
                    backgroundColor: currentTheme.light,
                    borderColor: currentTheme.border,
                    color: currentTheme.primary,
                  }}
                >
                  <span className="text-xs font-bold me-1" style={{ color: currentTheme.primary }}>#</span>
                  <input
                    type="text"
                    value={reportNumber}
                    onChange={(e) => setReportNumber(e.target.value)}
                    onBlur={handleMetaBlur}
                    title={lang === 'ar' ? 'رقم التقرير (قابل للتعديل)' : 'Report Number (Editable)'}
                    placeholder="101"
                    className="w-16 bg-transparent text-xs font-bold outline-none focus:outline-none"
                    style={{ color: currentTheme.primary }}
                  />
                  <Edit3 className="h-3 w-3 opacity-60 ms-0.5" style={{ color: currentTheme.primary }} />
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 opacity-70" />
                  <span>
                    {new Date(report.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
              </div>

              <input
                id="report-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleMetaBlur}
                placeholder={t('reportTitle')}
                className="w-full text-xl sm:text-2xl font-bold text-foreground bg-transparent border-b border-border/50 hover:border-border focus:border-olive-600 focus:outline-none py-1 transition-colors"
              />
            </div>

            {/* Report Content Language Switcher */}
            <div className="md:col-span-4 flex md:justify-end">
              <div className="flex flex-col items-start md:items-end gap-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('reportLanguage')}
                </label>
                <Tabs
                  value={reportLanguage}
                  onValueChange={(val) => handleLanguageToggle(val as AppLanguage)}
                >
                  <TabsList className="h-8 p-0.5 bg-muted/60 rounded-lg">
                    <TabsTrigger
                      value="ar"
                      className="text-xs px-3 py-1 font-semibold data-[state=active]:bg-[#2E4034] data-[state=active]:text-white rounded-md transition-all"
                    >
                      العربية (RTL)
                    </TabsTrigger>
                    <TabsTrigger
                      value="en"
                      className="text-xs px-3 py-1 font-semibold data-[state=active]:bg-[#2E4034] data-[state=active]:text-white rounded-md transition-all"
                    >
                      English (LTR)
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>
        </CardHeader>

        <Separator className="bg-border/60" />

        <CardContent className="p-4 sm:p-6 pt-4 sm:pt-5 space-y-4">
          {/* Reviewer & System Metadata Inputs - Enhanced Visual Hierarchy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* System Under Review */}
            <div className="rounded-lg border border-border/70 bg-background/50 hover:bg-background p-3 transition-all hover:border-border hover:shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                  <Cpu className="h-3.5 w-3.5" />
                </div>
                <span>{t('systemUnderReview')}</span>
              </div>
              <Input
                type="text"
                value={systemUnderReview}
                onChange={(e) => setSystemUnderReview(e.target.value)}
                onBlur={handleMetaBlur}
                placeholder={lang === 'ar' ? 'مثال: النظام الأساسي أو بوابة الدفع v2.4' : 'e.g. Core Platform or Payment Gateway'}
                className="h-8 text-xs bg-background/80"
              />
            </div>

            {/* Author / Reviewer */}
            <div className="rounded-lg border border-border/70 bg-background/50 hover:bg-background p-3 transition-all hover:border-border hover:shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-olive-50 dark:bg-olive-950/60 text-olive-700 dark:text-olive-300">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
                <span>{t('author')}</span>
              </div>
              <Input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onBlur={handleMetaBlur}
                placeholder={lang === 'ar' ? 'اسم المدقق / المراجع' : 'Auditor / Reviewer Name'}
                className="h-8 text-xs bg-background/80"
              />
            </div>

            {/* Job Title */}
            <div className="rounded-lg border border-border/70 bg-background/50 hover:bg-background p-3 transition-all hover:border-border hover:shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  <Briefcase className="h-3.5 w-3.5" />
                </div>
                <span>{t('jobTitle')}</span>
              </div>
              <Input
                type="text"
                value={authorTitle}
                onChange={(e) => setAuthorTitle(e.target.value)}
                onBlur={handleMetaBlur}
                placeholder={t('jobTitlePlaceholder')}
                className="h-8 text-xs bg-background/80"
              />
            </div>

            {/* Organization */}
            <div className="rounded-lg border border-border/70 bg-background/50 hover:bg-background p-3 transition-all hover:border-border hover:shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <span>{t('organization')}</span>
              </div>
              <Input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                onBlur={handleMetaBlur}
                placeholder={t('organizationPlaceholder')}
                className="h-8 text-xs bg-background/80"
              />
            </div>

            {/* Custom Top Metadata Fields */}
            {customFields.map((field) => (
              <div
                key={field.id}
                className="relative rounded-lg border border-border/70 bg-background/50 hover:bg-background p-3 transition-all hover:border-border hover:shadow-2xs group/cf"
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                      <Tag className="h-3.5 w-3.5" />
                    </div>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => handleUpdateCustomField(field.id, 'label', e.target.value)}
                      onBlur={handleMetaBlur}
                      placeholder={lang === 'ar' ? 'عنوان القسم' : 'Field Title'}
                      className="w-full text-xs font-semibold text-muted-foreground bg-transparent border-b border-dashed border-transparent hover:border-border focus:border-olive-500 focus:outline-none py-0.5 truncate"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomField(field.id)}
                    className="text-muted-foreground/60 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded transition-colors"
                    title={lang === 'ar' ? 'حذف هذا القسم' : 'Delete field'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  type="text"
                  value={field.value}
                  onChange={(e) => handleUpdateCustomField(field.id, 'value', e.target.value)}
                  onBlur={handleMetaBlur}
                  placeholder={lang === 'ar' ? 'القيمة...' : 'Value...'}
                  className="h-8 text-xs bg-background/80"
                />
              </div>
            ))}

            {/* Add Custom Field Button Card */}
            <button
              type="button"
              onClick={handleAddCustomField}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/80 bg-background/30 hover:bg-background hover:border-olive-500 hover:text-olive-700 dark:hover:text-olive-300 p-3 transition-all min-h-[76px] text-muted-foreground group/add cursor-pointer"
            >
              <Plus className="h-4 w-4 transition-transform group-hover/add:scale-110 text-olive-600 dark:text-olive-400" />
              <span className="font-semibold text-xs">{lang === 'ar' ? '+ إضافة قسم' : '+ Add Field'}</span>
            </button>
          </div>

          {/* Approved Contact & Social Media Links */}
          {contactLinks && contactLinks.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-background/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Share2 className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" />
                  <span>
                    {lang === 'ar'
                      ? 'بيانات التواصل وروابط التواصل المعتمدة للتقرير:'
                      : 'Approved Contact & Social Media Links:'}
                  </span>
                </div>
                <Link
                  href="/settings"
                  className="text-[11px] font-medium text-olive-700 dark:text-olive-400 hover:underline inline-flex items-center gap-1"
                  title={lang === 'ar' ? 'تعديل في الإعدادات' : 'Edit in Settings'}
                >
                  <span>{lang === 'ar' ? 'تعديل الروابط' : 'Edit Links'}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {contactLinks.map((link) => {
                  const isPhone = link.type === 'phone' || link.type === 'whatsapp';
                  const isEmail = link.type === 'email';
                  const href = isPhone
                    ? formatWhatsAppUrl(link.value)
                    : isEmail
                    ? `mailto:${link.value}`
                    : link.value.startsWith('http')
                    ? link.value
                    : `https://${link.value}`;

                  return (
                    <a
                      key={link.id}
                      href={href}
                      target={isEmail ? undefined : '_blank'}
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-olive-400 hover:text-olive-800 dark:hover:text-olive-300 transition-colors shadow-2xs group/link"
                      title={isPhone ? (lang === 'ar' ? 'مراسلة مباشرة عبر واتساب' : 'Direct WhatsApp chat') : undefined}
                    >
                      {isPhone ? (
                        <Phone className="h-3 w-3 text-emerald-600 dark:text-emerald-400 group-hover/link:scale-110 transition-transform" />
                      ) : isEmail ? (
                        <Mail className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Globe className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                      )}
                      {link.label && <span className="font-bold text-muted-foreground">{link.label}:</span>}
                      <span
                        dir={isPhone ? 'ltr' : undefined}
                        style={isPhone ? { unicodeBidi: 'isolate' } : undefined}
                        className="font-mono text-[11px]"
                      >
                        {link.value}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <Separator className="bg-border/60" />

          {/* Signature, Custom Footer Fields & Appearance Controls */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 text-xs">
              {/* Signature Endorsement */}
              <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-foreground min-w-max">
                  <PenTool className="h-4 w-4 text-olive-700 dark:text-olive-400" />
                  <span>{t('signature')}:</span>
                </div>
                <Input
                  type="text"
                  value={signatureData}
                  onChange={(e) => setSignatureData(e.target.value)}
                  onBlur={handleMetaBlur}
                  placeholder={t('signaturePlaceholder')}
                  className="w-full sm:max-w-md h-8 text-xs italic font-serif bg-background/80"
                />
              </div>

              {/* Theme & Background Controls */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Color Palette Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{t('reportTheme')}:</span>
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
                        className={cn(
                          'h-5 w-5 rounded-full transition-all focus:outline-none cursor-pointer',
                          th.bg,
                          themeColor === th.id
                            ? 'ring-2 ring-olive-600 ring-offset-2 ring-offset-card scale-110 shadow-xs'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        )}
                        title={th.label}
                      />
                    ))}
                  </div>
                </div>

                <Separator orientation="vertical" className="hidden sm:block h-5 bg-border/60" />

                {/* Background Style Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{t('reportBackground')}:</span>
                  <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 shadow-2xs">
                    {[
                      { id: 'white', label: t('bgWhite') },
                      { id: 'cream', label: t('bgCream') },
                      { id: 'cool', label: t('bgCool') },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer',
                          backgroundColor === bg.id
                            ? 'bg-background text-foreground font-bold shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Footer / Sign-off Fields */}
            <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
              {customFooterFields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 p-1.5 px-2.5 text-xs shadow-2xs group/cff"
                >
                  <div className="flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400 shrink-0" />
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => handleUpdateCustomFooterField(field.id, 'label', e.target.value)}
                      onBlur={handleMetaBlur}
                      placeholder={lang === 'ar' ? 'العنوان' : 'Label'}
                      className="w-24 sm:w-28 text-xs font-semibold text-foreground bg-transparent border-b border-dashed border-transparent hover:border-border focus:border-olive-500 focus:outline-none py-0.5 truncate"
                    />
                  </div>
                  <span className="text-muted-foreground font-bold">:</span>
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleUpdateCustomFooterField(field.id, 'value', e.target.value)}
                    onBlur={handleMetaBlur}
                    placeholder={lang === 'ar' ? 'القيمة (مثال: الختم، الاعتماد)' : 'Value...'}
                    className="w-36 sm:w-48 h-7 text-xs px-2 rounded-md border border-border bg-background focus:outline-none focus:border-olive-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomFooterField(field.id)}
                    className="text-muted-foreground/60 hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition-colors"
                    title={lang === 'ar' ? 'حذف هذا الحقل' : 'Remove field'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddCustomFooterField}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/80 hover:border-olive-500 hover:text-olive-700 dark:hover:text-olive-300 bg-background/40 hover:bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all shadow-2xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" />
                <span>{lang === 'ar' ? '+ إضافة قسم مخصص بجانب التوقيع' : '+ Add Custom Footer Field'}</span>
              </button>
            </div>
          </div>

          {/* Linked Issues Indicator */}
          {linkedIssues.length > 0 && (
            <>
              <Separator className="bg-border/60" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Layers className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
                  <span>
                    {lang === 'ar'
                      ? `مرتبط بـ ${linkedIssues.length} مشكلة في لوحة المتابعة:`
                      : `Linked to ${linkedIssues.length} issues in tracker:`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {linkedIssues.map((iss) => (
                    <Button
                      key={iss.id}
                      asChild
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[11px] font-medium rounded-md"
                    >
                      <Link href="/dashboard">
                        {iss.title}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* TipTap Rich Text Editor */}
      <TipTapEditor
        reportId={report.id}
        initialContent={report.contentJson}
        reportLanguage={reportLanguage}
        onSave={handleEditorSave}
        onContentChange={handleContentChange}
        onSaveImmediately={handleSaveImmediately}
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
