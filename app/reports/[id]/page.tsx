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
  Folder,
  CheckCircle2,
  Copy,
  SlidersHorizontal,
  ScanSearch,
  RotateCcw,
  LayoutDashboard,
  AlertOctagon,
  BarChart3,
  Settings,
  Scale,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  getReportById,
  updateReport,
  getReportImages,
  getIssuesByReportId,
  createOrUpdateShareToken,
  revokeShareToken,
  getFolders,
  getReportIssues,
  getProjectById,
  DEFAULT_PROJECT_ID,
} from '@/lib/db';
import {
  extractCandidates,
  CandidateScanResult,
} from '@/lib/issue-intelligence-engine';
import {
  ReportItem,
  ReportImageItem,
  IssueItem,
  CustomFieldItem,
  FolderItem,
  ProjectItem,
  ReportIssueItem,
} from '@/lib/types';
import { MoveToFolderModal } from '@/components/reports/MoveToFolderModal';
import { AnalysisTable } from '@/components/reports/AnalysisTable';
import { CandidateReviewModal } from '@/components/reports/CandidateReviewModal';
import { DiscrepancyInspectorModal } from '@/components/reports/DiscrepancyInspectorModal';
import {
  CreateWidgetFromElementModal,
  WidgetCreationSourceTarget,
} from '@/components/reports/CreateWidgetFromElementModal';
import { OverviewTab } from '@/components/reports/tabs/OverviewTab';
import { ContentTab } from '@/components/reports/tabs/ContentTab';
import { IssuesTab } from '@/components/reports/tabs/IssuesTab';
import { AnalyticsTab } from '@/components/reports/tabs/AnalyticsTab';
import { SettingsTab } from '@/components/reports/tabs/SettingsTab';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { printReportAsPdf } from '@/lib/pdf-export-client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { saveCustomTemplate } from '@/lib/custom-templates';
import { useAuth } from '@/lib/auth-context';
import { getReportTheme, getReportBackground } from '@/lib/report-theme-config';
import { ContactLinkItem, getReportContactLinks, formatWhatsAppUrl } from '@/lib/contact-links';
import { cn } from '@/lib/utils';
import { useAIContext } from '@/lib/ai-context';

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
  const { user, loading: authLoading } = useAuth();
  const { setActiveReportInfo, updateActiveReportContent } = useAIContext();

  const [report, setReport] = useState<ReportItem | null>(null);
  const [images, setImages] = useState<ReportImageItem[]>([]);
  const [linkedIssues, setLinkedIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const latestContentRef = useRef<any>(null);
  const liveEditorRef = useRef<any>(null);

  // Tab navigation state
  const [activeMainTab, setActiveMainTab] = useState<'overview' | 'content' | 'issues' | 'analytics' | 'settings'>('overview');
  const [activeIssueFilter, setActiveIssueFilter] = useState<{ severity?: string; status?: string; search?: string } | null>(null);

  const handleNavigateTab = (tabKey: string, meta?: any) => {
    const targetTab = tabKey === 'tables' ? 'content' : tabKey;
    setActiveMainTab(targetTab as any);
    if (targetTab === 'issues' && meta) {
      setActiveIssueFilter(meta);
    }
  };

  // Intelligence Modals & relations state
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [candidateScanResult, setCandidateScanResult] = useState<CandidateScanResult | null>(null);
  const [isScanningCandidates, setIsScanningCandidates] = useState(false);
  const [showInspectorModal, setShowInspectorModal] = useState(false);
  const [showCreateWidgetModal, setShowCreateWidgetModal] = useState(false);
  const [widgetCreationSource, setWidgetCreationSource] = useState<WidgetCreationSourceTarget | null>(null);
  const [reportIssues, setReportIssues] = useState<ReportIssueItem[]>([]);
  const [project, setProject] = useState<ProjectItem | null>(null);

  // Metadata form states
  const [title, setTitle] = useState('');
  const [reportNumber, setReportNumber] = useState<number | string>(1);
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
  const [savingTemplate, setSavingTemplate] = useState(false);
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

  // Folder states
  const [folders, setFolders] = useState<FolderItem[]>([]);

  // AI Pre-mutation Backup state
  const [hasAiBackup, setHasAiBackup] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && reportId) {
      const backup = localStorage.getItem(`report_ai_backup_${reportId}`);
      setHasAiBackup(Boolean(backup));
    }
    const handleSnapshotSaved = (e: any) => {
      if (e.detail?.reportId === reportId) {
        setHasAiBackup(true);
      }
    };
    window.addEventListener('ai-report-snapshot-saved', handleSnapshotSaved);
    return () => window.removeEventListener('ai-report-snapshot-saved', handleSnapshotSaved);
  }, [reportId]);

  const handleRestoreAiBackup = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ai-revert-report-content', {
          detail: {},
        })
      );
    }
  };

  const handleScanCandidates = async () => {
    if (!report) return;
    try {
      setIsScanningCandidates(true);
      const scanResult = await extractCandidates(reportId, user?.uid);
      setCandidateScanResult(scanResult);
      setShowCandidateModal(true);
    } catch (err: any) {
      console.error('Candidate scan error:', err);
      alert((lang === 'ar' ? 'فشل فحص المرشحين: ' : 'Candidate scan failed: ') + err.message);
    } finally {
      setIsScanningCandidates(false);
    }
  };

  const handleOpenInspector = () => {
    setShowInspectorModal(true);
  };

  const [showFolderModal, setShowFolderModal] = useState(false);

  // Web Sharing states
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingAction, setSharingAction] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const handleCreateShareLink = async () => {
    if (!report) return;
    try {
      setSharingAction(true);
      const token = await createOrUpdateShareToken(reportId);
      setReport((prev) => (prev ? { ...prev, shareToken: token, isShared: true, sharedAt: new Date().toISOString() } : null));
    } catch (err: any) {
      console.error('Failed to create share link', err);
      alert((lang === 'ar' ? 'فشل إنشاء رابط المشاركة: ' : 'Failed to create share link: ') + err.message);
    } finally {
      setSharingAction(false);
    }
  };

  const handleRevokeShareLink = async () => {
    if (!report) return;
    if (!confirm(lang === 'ar' ? 'هل أنت متأكد من إلغاء المشاركة؟ سيتوقف الرابط القديم عن العمل فوراً.' : 'Are you sure you want to revoke this link? The current link will immediately stop working.')) {
      return;
    }
    try {
      setSharingAction(true);
      await revokeShareToken(reportId);
      setReport((prev) => (prev ? { ...prev, shareToken: null, isShared: false, sharedAt: null } : null));
    } catch (err: any) {
      console.error('Failed to revoke share link', err);
      alert((lang === 'ar' ? 'فشل إلغاء المشاركة: ' : 'Failed to revoke share link: ') + err.message);
    } finally {
      setSharingAction(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!report?.shareToken) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/share/${report.shareToken}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
    }
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  const handleMoveReportToFolder = async (targetFolderId: string | null) => {
    await updateReport(reportId, { folderId: targetFolderId });
    setReport((prev) => (prev ? { ...prev, folderId: targetFolderId } : null));
  };

  const loadReportData = useCallback(async () => {
    if (authLoading) return;
    try {
      setLoading(true);
      if (!user) {
        router.push('/reports');
        return;
      }
      const [rep, imgs, issues, flds, rIssues] = await Promise.all([
        getReportById(reportId, user.uid),
        getReportImages(reportId),
        getIssuesByReportId(reportId, user.uid),
        getFolders(user.uid),
        getReportIssues(reportId),
      ]);

      if (!rep) {
        router.push('/reports');
        return;
      }
      setReport(rep);
      setFolders(flds);
      setReportIssues(rIssues);

      // Load project details if available
      const projId = rep.project_id || rep.projectId || DEFAULT_PROJECT_ID;
      getProjectById(projId, user.uid).then(setProject).catch(() => {});
      latestContentRef.current = rep.contentJson;
      setTitle(rep.title || '');
      setReportNumber(rep.reportNumber ?? 1);
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

      // Register active report with AI Context bridge
      setActiveReportInfo({
        id: rep.id,
        title: rep.title || '',
        contentJson: rep.contentJson,
        folder: rep.folderId || 'root',
        createdAt: rep.createdAt,
        updatedAt: rep.updatedAt,
        issues: issues.map((iss) => ({
          id: iss.id,
          title: iss.title,
          severity: iss.severity,
          status: iss.status,
        })),
      });
    } catch (err) {
      console.error('Failed to load report', err);
    } finally {
      setLoading(false);
    }
  }, [reportId, router, user, authLoading, setActiveReportInfo]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Sync state in real time when AI assistant or background tasks update this report or its issues
  useEffect(() => {
    const handleReportUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ reportId: string; updates: any }>;
      if (customEvent.detail?.reportId === reportId) {
        const { updates } = customEvent.detail;
        if (updates.title !== undefined) setTitle(updates.title);
        if (updates.systemUnderReview !== undefined) setSystemUnderReview(updates.systemUnderReview);
        if (updates.summary !== undefined) {
          loadReportData();
        } else {
          setReport((prev) => (prev ? { ...prev, ...updates } : null));
        }
      }
    };

    const handleIssuesChanged = () => {
      getIssuesByReportId(reportId).then(setLinkedIssues).catch(() => {});
    };

    window.addEventListener('report-updated', handleReportUpdated);
    window.addEventListener('issue-updated', handleIssuesChanged);
    window.addEventListener('issue-created', handleIssuesChanged);
    return () => {
      window.removeEventListener('report-updated', handleReportUpdated);
      window.removeEventListener('issue-updated', handleIssuesChanged);
      window.removeEventListener('issue-created', handleIssuesChanged);
    };
  }, [reportId, loadReportData]);

  // Real-time editor content tracking synced with AIContext
  const handleContentChange = useCallback(
    (contentJson: any) => {
      latestContentRef.current = contentJson;
      updateActiveReportContent(contentJson);
    },
    [updateActiveReportContent]
  );

  // Autosave TipTap JSON content
  const handleEditorSave = async (contentJson: any) => {
    latestContentRef.current = contentJson;
    updateActiveReportContent(contentJson);
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
        <div className="flex items-center gap-2">
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

          {/* Folder Selector */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowFolderModal(true)}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground shadow-2xs"
            title={lang === 'ar' ? 'نقل التقرير إلى مجلد' : 'Move report to folder'}
          >
            <Folder className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" />
            <span>
              {folders.find((f) => f.id === report.folderId)?.name ||
                (lang === 'ar' ? 'بدون مجلد' : 'Uncategorized')}
            </span>
          </Button>
        </div>

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
            onClick={() => setShowShareModal(true)}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950"
            title={lang === 'ar' ? 'مشاركة التقرير كصفحة ويب مستقلة' : 'Share report as standalone web page'}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>{lang === 'ar' ? 'مشاركة' : 'Share'}</span>
            {report.isShared && report.shareToken && (
              <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950 animate-pulse" />
            )}
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

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleScanCandidates}
            disabled={isScanningCandidates}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10 shadow-2xs"
            title={lang === 'ar' ? 'فحص واكتشاف مرشحي المشاكل في التقرير' : 'Scan document for issue candidates'}
          >
            <ScanSearch className={cn("h-3.5 w-3.5 text-primary", isScanningCandidates && "animate-spin")} />
            <span>{isScanningCandidates ? (lang === 'ar' ? 'جاري الفحص...' : 'Scanning...') : (lang === 'ar' ? 'فحص المشاكل' : 'Scan Issues')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenInspector}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 shadow-2xs"
            title={lang === 'ar' ? 'فاحص اتساق العدادات والمشاكل' : 'Counter Consistency Inspector'}
          >
            <Scale className="h-3.5 w-3.5 text-amber-600" />
            <span>{lang === 'ar' ? 'فاحص المطابقة' : 'Inspector'}</span>
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

      {/* AI Pre-modification Backup Notification Banner */}
      {hasAiBackup && (
        <div className="mb-6 rounded-xl border border-olive-300 dark:border-olive-800 bg-olive-50/70 dark:bg-olive-950/40 p-3.5 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-2xs">
          <div className="flex items-center gap-2 text-olive-950 dark:text-olive-100">
            <RotateCcw className="h-4 w-4 text-olive-700 dark:text-olive-400 shrink-0" />
            <span className="font-medium">
              {lang === 'ar'
                ? 'توجد نسخة احتياطية محفوظة لهذا التقرير تم أخذها تلقائياً قبل تعديل المساعد الذكي.'
                : 'An automatic backup of this report exists from before the AI assistant modification.'}
            </span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRestoreAiBackup}
              className="h-7 text-xs font-semibold gap-1.5 border-olive-400 dark:border-olive-700 hover:bg-olive-100 dark:hover:bg-olive-900 shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t('restorePreAiBackup')}</span>
            </Button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem(`report_ai_backup_${reportId}`);
                  setHasAiBackup(false);
                }
              }}
              className="text-muted-foreground hover:text-foreground p-1 text-xs rounded-md hover:bg-black/5 dark:hover:bg-white/5"
              title={lang === 'ar' ? 'إخفاء التنبيه وحذف النسخة الاحتياطية' : 'Dismiss backup'}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Modern Intelligence Tab Navigation Bar */}
      <div className="mb-6 border-b border-border/80 pb-px">
        <nav className="-mb-px flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar" aria-label="Tabs">
          {[
            { id: 'overview', label: lang === 'ar' ? 'نظرة عامة' : 'Overview', icon: LayoutDashboard },
            { id: 'content', label: lang === 'ar' ? 'المحتوى والتحرير' : 'Content & Editor', icon: FileText },
            { id: 'issues', label: lang === 'ar' ? 'المشاكل والمطابقة' : 'Issues & Deduplication', icon: AlertOctagon, badge: linkedIssues.length },
            { id: 'analytics', label: lang === 'ar' ? 'التحليلات والمؤشرات' : 'Analytics', icon: BarChart3 },
            { id: 'settings', label: lang === 'ar' ? 'الإعدادات والتصدير' : 'Settings & Export', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id as any)}
                className={cn(
                  'group inline-flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer rounded-t-lg',
                  isActive
                    ? 'border-[#2E4034] text-[#2E4034] dark:border-emerald-400 dark:text-emerald-300 bg-[#2E4034]/5 font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30'
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-[#2E4034] dark:text-emerald-400' : 'text-muted-foreground')} />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={cn(
                      'ms-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                      isActive ? 'bg-[#2E4034] text-white' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      <div className="transition-all duration-200">
        {activeMainTab === 'overview' && (
          <OverviewTab
            report={report}
            project={project}
            issues={linkedIssues}
            userUid={user?.uid}
            onNavigateTab={handleNavigateTab}
            onReportUpdate={(updatedReport) => setReport(updatedReport)}
            onOpenScanner={handleScanCandidates}
            onOpenInspector={handleOpenInspector}
          />
        )}

        {activeMainTab === 'content' && (
          <div className="space-y-6">
            {/* Quick Title & Report # Header for Content Tab */}
            <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <span className="text-xs font-bold text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={reportNumber}
                    onChange={(e) => setReportNumber(e.target.value)}
                    onBlur={handleMetaBlur}
                    placeholder="101"
                    className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleMetaBlur}
                    placeholder={t('reportTitle')}
                    className="w-full text-lg sm:text-xl font-bold bg-transparent border-b border-transparent hover:border-border focus:border-olive-600 focus:outline-none py-1 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {reportLanguage === 'ar' ? 'العربية (RTL)' : 'English (LTR)'}
                  </Badge>
                </div>
              </div>
            </div>

            <ContentTab
              report={report}
              reportLanguage={reportLanguage}
              themeColor={themeColor}
              backgroundColor={backgroundColor}
              onEditorSave={handleEditorSave}
              onContentChange={handleContentChange}
              onSaveImmediately={handleSaveImmediately}
              onEditorReady={(ed) => {
                liveEditorRef.current = ed;
              }}
            />
          </div>
        )}

        {activeMainTab === 'issues' && (
          <IssuesTab
            report={report}
            issues={linkedIssues}
            reportIssues={reportIssues}
            liveEditorRef={liveEditorRef}
            onReportUpdate={(updatedReport) => setReport(updatedReport)}
            onOpenScanner={handleScanCandidates}
            onOpenInspector={handleOpenInspector}
            onRefreshIssues={loadReportData}
            activeFilter={activeIssueFilter}
            onClearActiveFilter={() => setActiveIssueFilter(null)}
          />
        )}


        {activeMainTab === 'analytics' && (
          <AnalyticsTab
            report={report}
            issues={linkedIssues}
            userUid={user?.uid}
            onOpenCreateWidgetModal={() => {
              setWidgetCreationSource({
                type: 'report_issues',
                reportId: report.id,
                projectId: report.projectId,
                issues: linkedIssues,
                elementName: report.title,
              });
              setShowCreateWidgetModal(true);
            }}
          />
        )}

        {activeMainTab === 'settings' && (
          <SettingsTab
            report={report}
            reportLanguage={reportLanguage}
            themeColor={themeColor}
            backgroundColor={backgroundColor}
            signatureData={signatureData}
            signatureType="text"
            customFields={customFields}
            customFooterFields={customFooterFields}
            exporting={exporting}
            onLanguageChange={handleLanguageToggle}
            onThemeChange={handleThemeChange}
            onBackgroundChange={handleBackgroundChange}
            onSignatureChange={setSignatureData}
            onExport={handleExport}
            onSaveTemplate={() => {
              setCustomTemplateName(title || report.title || '');
              setShowSaveTemplateModal(true);
            }}
            onOpenShareModal={() => setShowShareModal(true)}
            onAddCustomField={handleAddCustomField}
            onRemoveCustomField={handleRemoveCustomField}
            onUpdateCustomField={handleUpdateCustomField}
            onAddCustomFooterField={handleAddCustomFooterField}
            onRemoveCustomFooterField={handleRemoveCustomFooterField}
            onUpdateCustomFooterField={handleUpdateCustomFooterField}
          />
        )}
      </div>

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
      {/* Share Report Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl text-card-foreground animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                <Share2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground">
                  {lang === 'ar' ? 'مشاركة التقرير كصفحة ويب' : 'Share Report as Web Page'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === 'ar'
                    ? 'رابط ويب مستقل (للقراءة فقط) بتصميم احترافي يتيح تصدير PDF و Word مباشرة.'
                    : 'A standalone read-only web page allowing direct PDF and Word exports.'}
                </p>
              </div>
            </div>

            {report.isShared && report.shareToken ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{lang === 'ar' ? 'المشاركة مفعّلة حالياً' : 'Sharing is currently active'}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-emerald-100 dark:bg-emerald-900 border-emerald-300">
                    {lang === 'ar' ? 'نشط' : 'Active'}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === 'ar' ? 'رابط المشاركة المباشر:' : 'Share Link:'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      dir="ltr"
                      value={typeof window !== 'undefined' ? `${window.location.origin}/share/${report.shareToken}` : ''}
                      className="w-full rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs font-mono text-foreground focus:outline-none select-all"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCopyShareLink}
                      className="h-9 px-3 shrink-0 rounded-xl bg-[#2E4034] text-white hover:bg-[#24382F]"
                    >
                      {copiedShareLink ? (
                        <>
                          <Check className="h-3.5 w-3.5 me-1 text-emerald-400" />
                          <span>{lang === 'ar' ? 'تم النسخ' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 me-1" />
                          <span>{lang === 'ar' ? 'نسخ' : 'Copy'}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
                  <div>
                    {lang === 'ar'
                      ? 'يمكن لأي شخص معاه الرابط الاطلاع على التقرير بدون تسجيل دخول. الرابط غير مفهرس في محركات البحث.'
                      : 'Anyone with this link can view the report without logging in. The link is not indexed by search engines.'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={sharingAction}
                    onClick={handleRevokeShareLink}
                    className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
                  >
                    <Trash2 className="h-3.5 w-3.5 me-1" />
                    <span>{lang === 'ar' ? 'إلغاء المشاركة (Revoke)' : 'Revoke Link'}</span>
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-8 text-xs"
                    >
                      <a
                        href={`/share/${report.shareToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 me-1" />
                        <span>{lang === 'ar' ? 'فتح الصفحة' : 'Open Page'}</span>
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowShareModal(false)}
                      className="h-8 text-xs bg-[#2E4034] text-white hover:bg-[#24382F]"
                    >
                      {lang === 'ar' ? 'إغلاق' : 'Close'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-dashed border-border p-4 text-center">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {lang === 'ar'
                      ? 'هذا التقرير خاص حالياً ولا يمكن الوصول إليه إلا من خلال حسابك. اضغط أدناه لإنشاء رابط مشاركة عام مستقل.'
                      : 'This report is currently private. Click below to generate an unguessable public share link.'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={sharingAction}
                    onClick={handleCreateShareLink}
                    className="h-9 gap-1.5 rounded-xl bg-[#2E4034] text-white hover:bg-[#24382F]"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>{sharingAction ? (lang === 'ar' ? 'جاري التوليد...' : 'Generating...') : (lang === 'ar' ? 'إنشاء رابط المشاركة' : 'Generate Share Link')}</span>
                  </Button>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowShareModal(false)}
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move to Folder Modal */}
      {showFolderModal && (
        <MoveToFolderModal
          isOpen={showFolderModal}
          onClose={() => setShowFolderModal(false)}
          reportToMove={report}
          folders={folders}
          onConfirmMove={handleMoveReportToFolder}
        />
      )}

      {/* Candidate Review Modal (Single Source of Truth) */}
      {showCandidateModal && candidateScanResult && (
        <CandidateReviewModal
          isOpen={showCandidateModal}
          onClose={() => setShowCandidateModal(false)}
          scanResult={candidateScanResult}
          userUid={user?.uid}
          onApprovalComplete={async () => {
            await loadReportData();
          }}
        />
      )}

      {/* Discrepancy Inspector Modal (Counter Consistency) */}
      {showInspectorModal && (
        <DiscrepancyInspectorModal
          isOpen={showInspectorModal}
          onClose={() => setShowInspectorModal(false)}
          reportId={reportId}
          userUid={user?.uid}
          onSyncComplete={async () => {
            await loadReportData();
          }}
        />
      )}

      {/* Create Widget From Element Modal (Selection to Widget Pipeline) */}
      {showCreateWidgetModal && widgetCreationSource && (
        <CreateWidgetFromElementModal
          isOpen={showCreateWidgetModal}
          onClose={() => {
            setShowCreateWidgetModal(false);
            setWidgetCreationSource(null);
          }}
          sourceTarget={widgetCreationSource}
          report={report}
          userUid={user?.uid}
          onWidgetCreated={async () => {
            setShowCreateWidgetModal(false);
            setWidgetCreationSource(null);
            await loadReportData();
          }}
        />
      )}
    </div>
  );
}

