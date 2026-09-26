'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowRight, FileCode, FileText, FileDown, Share2, Archive, Check, Folder, BookmarkPlus, Building2, ShieldCheck, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getReportById,
  updateReport,
  getReportImages,
  createOrUpdateShareToken,
  revokeShareToken,
  archiveReport,
  unarchiveReport,
  isArchivedReport,
  getFolders,
} from '@/lib/db';
import type { ReportItem, ReportImageItem, FolderItem } from '@/lib/types';
import { MoveToFolderModal } from '@/components/reports/MoveToFolderModal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { AppLanguage } from '@/lib/i18n/dictionary';
import { printReportAsPdf } from '@/lib/pdf-export-client';
import { EDITOR_FONTS, DEFAULT_FONT_STACK, matchEditorFont } from '@/lib/fonts';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { saveCustomTemplate } from '@/lib/custom-templates';
import { useAuth } from '@/lib/auth-context';

const TipTapEditor = dynamic(() => import('@/components/editor/TipTapEditor').then((m) => m.TipTapEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center">
      <PageLoading />
    </div>
  ),
});

export default function ReportEditorPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;
  const { lang, t } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const [report, setReport] = useState<ReportItem | null>(null);
  const [images, setImages] = useState<ReportImageItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [confirmNode, askConfirm] = useConfirm();

  const [title, setTitle] = useState('');
  const [systemUnderReview, setSystemUnderReview] = useState('');
  const [author, setAuthor] = useState('');
  const [organization, setOrganization] = useState('');
  const [department, setDepartment] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerTitle, setReviewerTitle] = useState('');
  const [showOrgDetails, setShowOrgDetails] = useState(false);
  const [themeColor, setThemeColor] = useState('olive');
  const [backgroundColor, setBackgroundColor] = useState('white');
  const [reportLanguage, setReportLanguage] = useState<AppLanguage>('ar');
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_STACK);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingAction, setSharingAction] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const latestContentRef = useRef<any>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFailedMessage = lang === 'ar' ? 'فشل حفظ التقرير — تحقق من الاتصال ثم أعد المحاولة.' : 'Failed to save the report — check your connection and retry.';
  const isOwner = !!report && !!user && report.ownerUid === user.uid;

  const markSaved = useCallback(() => {
    setSaveStatus('saved');
    setSaveError(null);
    setHasUnsaved(false);
    setLastSavedAt(new Date().toISOString());
    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 3000);
  }, []);

  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      setLoading(true);
      if (!user) { router.push('/reports'); return; }
      const [rep, imgs, flds] = await Promise.all([
        getReportById(reportId, user.uid),
        (await import('@/lib/db')).getReportImages(reportId),
        getFolders(user.uid),
      ]);
      if (!rep) { router.push('/reports'); return; }
      setReport(rep);
      setImages(imgs);
      setFolders(flds);
      latestContentRef.current = rep.contentJson;
      setTitle(rep.title || '');
      setAuthor(rep.author || '');
      setSystemUnderReview(rep.systemUnderReview || '');
      setOrganization(rep.organization || '');
      setDepartment(rep.department || '');
      setAuthorTitle(rep.authorTitle || '');
      setReviewerName(rep.reviewerName || '');
      setReviewerTitle(rep.reviewerTitle || '');
      setThemeColor(rep.themeColor || 'olive');
      setBackgroundColor(rep.backgroundColor || 'white');
      setReportLanguage(rep.language || 'ar');
      if (rep.fontFamily) setFontFamily(rep.fontFamily);

      const hasOrg = Boolean(rep.organization || rep.department || rep.authorTitle || rep.reviewerName || rep.reviewerTitle);
      if (hasOrg) {
        setShowOrgDetails(true);
      } else {
        try {
          const { getOrganizationDefaults } = await import('@/lib/db-intelligence');
          const defs = await getOrganizationDefaults(user.uid);
          if (defs && defs.autoApplyToNewReports !== false) {
            if (defs.organization) setOrganization(defs.organization);
            if (defs.department) setDepartment(defs.department);
            if (defs.author && !rep.author) setAuthor(defs.author);
            if (defs.authorTitle) setAuthorTitle(defs.authorTitle);
            if (defs.reviewerName) setReviewerName(defs.reviewerName);
            if (defs.reviewerTitle) setReviewerTitle(defs.reviewerTitle);
            if (defs.organization || defs.reviewerName) setShowOrgDetails(true);
          }
        } catch {}
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [reportId, router, user, authLoading]);

  useEffect(() => { void load(); }, [load]);

  const persist = useCallback(async (patch: Partial<ReportItem> & { contentJson?: any }) => {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const ok = await updateReport(reportId, patch as any);
      if (!ok) throw new Error(saveFailedMessage);
      setReport((prev) => (prev ? { ...prev, ...patch } : null));
      markSaved();
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err?.message || saveFailedMessage);
      setHasUnsaved(true);
    }
  }, [reportId, markSaved, saveFailedMessage]);

  const scheduleMetaSave = useCallback(() => {
    setHasUnsaved(true);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void persist({
        title,
        author,
        systemUnderReview,
        organization,
        department,
        authorTitle,
        reviewerName,
        reviewerTitle,
        themeColor,
        backgroundColor,
        language: reportLanguage,
        fontFamily,
        contentJson: latestContentRef.current,
      });
    }, 1800);
  }, [persist, title, author, systemUnderReview, organization, department, authorTitle, reviewerName, reviewerTitle, themeColor, backgroundColor, reportLanguage, fontFamily]);

  const handleApplyOrgDefaults = async () => {
    if (!user) return;
    try {
      const { getOrganizationDefaults } = await import('@/lib/db-intelligence');
      const defs = await getOrganizationDefaults(user.uid);
      if (!defs) {
        toast.error(lang === 'ar' ? 'لم يتم العثور على إعدادات افتراضية للمؤسسة' : 'No organization defaults found');
        return;
      }
      const newOrg = defs.organization || '';
      const newDept = defs.department || '';
      const newAuthor = defs.author || author;
      const newAuthorTitle = defs.authorTitle || '';
      const newReviewerName = defs.reviewerName || '';
      const newReviewerTitle = defs.reviewerTitle || '';

      setOrganization(newOrg);
      setDepartment(newDept);
      setAuthor(newAuthor);
      setAuthorTitle(newAuthorTitle);
      setReviewerName(newReviewerName);
      setReviewerTitle(newReviewerTitle);
      setShowOrgDetails(true);
      toast.success(lang === 'ar' ? 'تم استيراد وتطبيق بيانات المؤسسة والاعتماد الافتراضية' : 'Organization defaults applied');
      void persist({
        organization: newOrg,
        department: newDept,
        author: newAuthor,
        authorTitle: newAuthorTitle,
        reviewerName: newReviewerName,
        reviewerTitle: newReviewerTitle,
        title,
        systemUnderReview,
        themeColor,
        backgroundColor,
        language: reportLanguage,
        fontFamily,
        contentJson: latestContentRef.current,
      });
    } catch (err) {
      console.error('Failed to import defaults:', err);
    }
  };

  const handleContentChange = useCallback((contentJson: any) => { latestContentRef.current = contentJson; }, []);
  const handleEditorSave = useCallback(async (contentJson: any) => {
    latestContentRef.current = contentJson;
    setSaveStatus('saving');
    try {
      const ok = await updateReport(reportId, { contentJson });
      if (!ok) throw new Error(saveFailedMessage);
      setReport((prev) => (prev ? { ...prev, contentJson } : null));
      const updatedImages = await getReportImages(reportId);
      setImages(updatedImages);
      markSaved();
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err?.message || saveFailedMessage);
      setHasUnsaved(true);
    }
  }, [reportId, markSaved, saveFailedMessage]);

  const handleSaveNow = useCallback(async () => {
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
    await persist({
      title,
      author,
      systemUnderReview,
      organization,
      department,
      authorTitle,
      reviewerName,
      reviewerTitle,
      themeColor,
      backgroundColor,
      language: reportLanguage,
      fontFamily,
      contentJson: latestContentRef.current,
    });
  }, [persist, title, author, systemUnderReview, organization, department, authorTitle, reviewerName, reviewerTitle, themeColor, backgroundColor, reportLanguage, fontFamily]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved || saveStatus === 'saving' || saveStatus === 'error') { e.preventDefault(); (e as any).returnValue = ''; }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [hasUnsaved, saveStatus]);

  const handleExport = async (format: 'md' | 'docx' | 'pdf') => {
    if (!report) return;
    try {
      setExporting(format);
      const currentImgs = await getReportImages(reportId);
      const contentJsonToExport = latestContentRef.current || report.contentJson;
      let mindmapSnaps: Record<string, { dataUrl: string; width?: number; height?: number }> = {};
      let drawingSnaps: Record<string, { dataUrl: string; width?: number; height?: number }> = {};
      try {
        const { snapshotMindmaps } = await import('@/lib/mindmap-export');
        mindmapSnaps = await snapshotMindmaps(contentJsonToExport);
      } catch { mindmapSnaps = {}; }
      try {
        const { snapshotDrawings } = await import('@/lib/drawing-export');
        drawingSnaps = await snapshotDrawings(contentJsonToExport);
      } catch { drawingSnaps = {}; }
      const current: ReportItem = {
        ...report,
        title,
        author,
        systemUnderReview,
        organization,
        department,
        authorTitle,
        reviewerName,
        reviewerTitle,
        themeColor,
        backgroundColor,
        language: reportLanguage,
        fontFamily,
        contentJson: contentJsonToExport,
      };
      if (format === 'pdf') {
        printReportAsPdf(current, currentImgs, [], mindmapSnaps, drawingSnaps as any);
        setExporting(null);
        return;
      }
      const res = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: current, images: currentImgs, mindmaps: mindmapSnaps, drawings: drawingSnaps }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safe = (title || report.title || 'report').replace(/[/\\:*?"<>|]/g, '_').trim();
      a.download = `${safe} - #${report.reportNumber}.${format === 'md' ? 'zip' : format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(t('exportError') + ': ' + (err?.message || err));
    } finally { setExporting(null); }
  };

  const handleArchive = async () => {
    if (!report || !user) return;
    if (!(await askConfirm(lang === 'ar' ? 'أرشفة هذا التقرير؟ سيختفي من القوائم ويمكن استعادته لاحقًا.' : 'Archive this report?'))) return;
    try {
      setArchiving(true);
      const res = await archiveReport(report.id, user.uid);
      if (!res.ok) { toast.error(lang === 'ar' ? 'فشل الأرشفة.' : 'Archive failed.'); return; }
      const updated = await getReportById(report.id, user.uid);
      if (updated) setReport(updated);
      toast.success(lang === 'ar' ? 'تمت الأرشفة' : 'Archived');
    } finally { setArchiving(false); }
  };
  const handleUnarchive = async () => {
    if (!report || !user) return;
    try {
      setArchiving(true);
      await unarchiveReport(report.id, user.uid);
      const updated = await getReportById(report.id, user.uid);
      if (updated) setReport(updated);
    } finally { setArchiving(false); }
  };

  if (loading || !report) {
    return <div className="flex h-screen w-full items-center justify-center"><PageLoading /></div>;
  }

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
  const archived = isArchivedReport(report);

  return (
    <div className="mx-auto w-full max-w-6xl px-2.5 py-6 sm:px-6 lg:px-8 sm:py-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground">
            <Link href="/reports"><BackIcon className="h-4 w-4" /><span>{t('reports')}</span></Link>
          </Button>
          {isOwner ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowFolderModal(true)} className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs">
              <Folder className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" />
              <span>{folders.find((f) => f.id === report.folderId)?.name || (lang === 'ar' ? 'بدون مجلد' : 'Uncategorized')}</span>
            </Button>
          ) : null}
          {archived ? <span className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-bold text-amber-700">{lang === 'ar' ? 'مؤرشف' : 'Archived'}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-1.5 py-1 shadow-2xs">
            <Button type="button" size="sm" disabled={saveStatus === 'saving'} onClick={() => void handleSaveNow()} className="h-7 gap-1 rounded-md bg-[#2E4034] px-2.5 text-[11px] font-bold text-white hover:bg-[#24382F] disabled:opacity-60">
              <Check className="h-3.5 w-3.5" /><span>{lang === 'ar' ? 'حفظ' : 'Save'}</span>
            </Button>
            <span role="status" className="flex items-center gap-1 px-1 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
              {(hasUnsaved || saveStatus === 'saving') && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
              {saveStatus === 'saved' && !hasUnsaved && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              {saveStatus === 'error' && <span className="h-2 w-2 rounded-full bg-red-500" />}
              <span>{saveStatus === 'saving' ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : saveStatus === 'error' ? (saveError || (lang === 'ar' ? 'فشل الحفظ' : 'Save failed')) : hasUnsaved ? (lang === 'ar' ? 'غير محفوظ' : 'Unsaved') : lastSavedAt ? `${lang === 'ar' ? 'حُفظ' : 'Saved'} ${new Date(lastSavedAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : (lang === 'ar' ? 'محفوظ' : 'Saved')}</span>
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!!exporting} onClick={() => handleExport('md')} className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"><FileCode className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /><span>Markdown (ZIP)</span></Button>
          <Button type="button" variant="outline" size="sm" disabled={!!exporting} onClick={() => handleExport('docx')} className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"><FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /><span>Word (DOCX)</span></Button>
          <Button type="button" size="sm" disabled={!!exporting} onClick={() => handleExport('pdf')} className="h-9 gap-1.5 rounded-lg bg-[#2E4034] text-xs font-semibold text-white hover:bg-[#24382F] shadow-xs"><FileDown className="h-3.5 w-3.5" /><span>{exporting === 'pdf' ? t('exporting') : 'PDF'}</span></Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowShareModal(true)} className="h-9 gap-1.5 rounded-lg border-teal-200 text-xs font-semibold text-teal-700 shadow-2xs dark:border-teal-800 dark:text-teal-400"><Share2 className="h-3.5 w-3.5" /><span>{lang === 'ar' ? 'مشاركة' : 'Share'}</span>{report.isShared && report.shareToken ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> : null}</Button>
          {isOwner && !archived ? <Button type="button" variant="outline" size="sm" onClick={() => void handleArchive()} disabled={archiving} className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"><Archive className="h-3.5 w-3.5 text-muted-foreground" /><span>{lang === 'ar' ? 'أرشفة' : 'Archive'}</span></Button> : null}
          {isOwner && archived ? <Button type="button" variant="outline" size="sm" onClick={() => void handleUnarchive()} disabled={archiving} className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"><Archive className="h-3.5 w-3.5" /><span>{lang === 'ar' ? 'استعادة' : 'Restore'}</span></Button> : null}
          <Button type="button" variant="outline" size="sm" onClick={() => { setCustomTemplateName(title || report.title || ''); setShowSaveTemplateModal(true); }} className="h-9 gap-1.5 rounded-lg border-olive-300/80 text-xs font-semibold text-olive-800 shadow-2xs dark:border-olive-800 dark:text-olive-300"><BookmarkPlus className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" /><span>{lang === 'ar' ? 'حفظ كقالب' : 'Save Template'}</span></Button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border/70 bg-card/60 p-3.5 backdrop-blur-xs">
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-[11px] font-bold text-muted-foreground">{lang === 'ar' ? 'عنوان التقرير' : 'Report title'}</label>
          <div className="flex items-center gap-2">
            {organization && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Building2 className="h-3 w-3" />
                <span>{organization}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowOrgDetails((prev) => !prev)}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{lang === 'ar' ? 'بيانات المؤسسة والاعتماد' : 'Org & Approval'}</span>
              {showOrgDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
        <Input id="report-title-input" value={title} onChange={(e) => { setTitle(e.target.value); scheduleMetaSave(); }} placeholder={lang === 'ar' ? 'عنوان التقرير…' : 'Report title…'} className="h-10 text-sm font-bold" />
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted-foreground">{lang === 'ar' ? 'النظام قيد المراجعة' : 'System under review'}</label>
            <Input value={systemUnderReview} onChange={(e) => { setSystemUnderReview(e.target.value); scheduleMetaSave(); }} className="h-9 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted-foreground">{lang === 'ar' ? 'الكاتب / المُعِد' : 'Author / Auditor'}</label>
            <Input value={author} onChange={(e) => { setAuthor(e.target.value); scheduleMetaSave(); }} className="h-9 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted-foreground">{lang === 'ar' ? 'اللغة / الخط / المظهر' : 'Language / Font / Theme'}</label>
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              <select value={reportLanguage} onChange={(e) => { setReportLanguage(e.target.value as AppLanguage); scheduleMetaSave(); }} className="h-9 flex-1 min-w-[75px] rounded-md border border-input bg-background px-2 text-xs font-semibold">
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
              <select
                value={matchEditorFont(fontFamily)?.id || 'cairo'}
                onChange={(e) => {
                  const found = EDITOR_FONTS.find((f) => f.id === e.target.value);
                  if (found) {
                    setFontFamily(found.stack);
                    scheduleMetaSave();
                  }
                }}
                className="h-9 flex-1 min-w-[100px] rounded-md border border-input bg-background px-2 text-xs font-semibold"
                title={lang === 'ar' ? 'الخط الأساسي للتقرير' : 'Primary Report Font'}
              >
                {EDITOR_FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'ar' ? f.labelAr : f.labelEn}
                  </option>
                ))}
              </select>
              <select value={themeColor} onChange={(e) => { setThemeColor(e.target.value); scheduleMetaSave(); }} className="h-9 flex-1 min-w-[85px] rounded-md border border-input bg-background px-2 text-xs font-semibold">
                <option value="olive">{lang === 'ar' ? 'زيتوني (افتراضي)' : 'Olive (Default)'}</option>
                <option value="blue">{lang === 'ar' ? 'أزرق هادئ' : 'Calm Blue'}</option>
                <option value="emerald">{lang === 'ar' ? 'زمردي' : 'Emerald'}</option>
                <option value="amber">{lang === 'ar' ? 'كهرماني' : 'Amber'}</option>
                <option value="slate">{lang === 'ar' ? 'رمادي داكن' : 'Slate Gray'}</option>
              </select>
              <select value={backgroundColor} onChange={(e) => { setBackgroundColor(e.target.value); scheduleMetaSave(); }} className="h-9 flex-1 min-w-[80px] rounded-md border border-input bg-background px-2 text-xs font-semibold">
                <option value="white">{lang === 'ar' ? 'أبيض ناصع' : 'Pure White'}</option>
                <option value="cream">{lang === 'ar' ? 'كريمي دافئ' : 'Warm Cream'}</option>
                <option value="cool">{lang === 'ar' ? 'رمادي بارد' : 'Cool Gray'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Collapsible Organization & Approval Section */}
        {showOrgDetails && (
          <div className="mt-3 pt-3 border-t border-border/70 space-y-2.5 animate-in fade-in-50 duration-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>{lang === 'ar' ? 'بيانات المؤسسة والتدقيق والاعتماد' : 'Organization & Approval Details'}</span>
              </span>
              <button
                type="button"
                onClick={handleApplyOrgDefaults}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors"
                title={lang === 'ar' ? 'استيراد البيانات الافتراضية من شاشة الإعدادات' : 'Import default values from settings'}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{lang === 'ar' ? 'استيراد من بيانات المؤسسة الافتراضية' : 'Inherit from Defaults'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-muted-foreground">{lang === 'ar' ? 'اسم المؤسسة / الشركة' : 'Organization'}</label>
                <Input
                  value={organization}
                  onChange={(e) => { setOrganization(e.target.value); scheduleMetaSave(); }}
                  placeholder={lang === 'ar' ? 'مثال: شركة التطوير والتقنية' : 'e.g. Acme Corp'}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-muted-foreground">{lang === 'ar' ? 'القسم / الإدارة' : 'Department'}</label>
                <Input
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); scheduleMetaSave(); }}
                  placeholder={lang === 'ar' ? 'مثال: إدارة ضمان الجودة' : 'e.g. QA Team'}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-muted-foreground">{lang === 'ar' ? 'المسمى الوظيفي للمُعد' : 'Author Title'}</label>
                <Input
                  value={authorTitle}
                  onChange={(e) => { setAuthorTitle(e.target.value); scheduleMetaSave(); }}
                  placeholder={lang === 'ar' ? 'مثال: مدقق جودة برمجيات' : 'e.g. QA Lead'}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-muted-foreground">{lang === 'ar' ? 'المراجع / المعتمد الافتراضي' : 'Reviewer / Approver'}</label>
                <Input
                  value={reviewerName}
                  onChange={(e) => { setReviewerName(e.target.value); scheduleMetaSave(); }}
                  placeholder={lang === 'ar' ? 'مثال: م. خالد المنصور' : 'e.g. Jane Smith'}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        <p className="mt-2 text-[11px] text-muted-foreground">{lang === 'ar' ? 'يفتح التقرير على المحرر مباشرة — النصوص والجداول الذكية والرسوم والخرائط الذهنية في مساحة واحدة. من أي جدول ذكي يمكنك إرسال نسخة للوحة التتبع بزر «للتتبع».' : 'The report opens directly in the unified editor — text, smart tables, drawings and mind maps in one place. From any smart table press “Track” to send a copy to the tracking board.'}</p>
      </div>

      {/* overflow-visible (not hidden): position:sticky toolbar only sticks when no ancestor clips overflow */}
      <div className="overflow-visible rounded-xl border border-border/70 bg-card shadow-2xs">
        <TipTapEditor
          reportId={reportId}
          initialContent={report.contentJson}
          reportLanguage={reportLanguage}
          reportFontFamily={fontFamily}
          onSave={handleEditorSave}
          onContentChange={handleContentChange}
          onSaveImmediately={handleSaveNow}
          themeColor={themeColor}
          backgroundColor={backgroundColor}
        />
      </div>

      {showFolderModal ? (
        <MoveToFolderModal
          isOpen={showFolderModal}
          onClose={() => setShowFolderModal(false)}
          reportToMove={report}
          folders={folders}
          onConfirmMove={async (fid: string | null) => {
            await updateReport(reportId, { folderId: fid });
            setReport((p) => (p ? { ...p, folderId: fid } : null));
            setShowFolderModal(false);
          }}
        />
      ) : null}

      {showShareModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowShareModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-bold">{lang === 'ar' ? 'مشاركة التقرير' : 'Share report'}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{lang === 'ar' ? 'رابط ويب للقراءة فقط.' : 'Read-only web link.'}</p>
            {report.shareToken ? (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px]" dir="ltr">
                <span className="min-w-0 flex-1 truncate">{typeof window !== 'undefined' ? `${window.location.origin}/share/${report.shareToken}` : ''}</span>
                <Button size="sm" className="h-7 text-[11px]" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/share/${report.shareToken}`); setCopiedShareLink(true); setTimeout(() => setCopiedShareLink(false), 1500); } catch {} }}>{copiedShareLink ? (lang === 'ar' ? 'تم' : 'Copied') : (lang === 'ar' ? 'نسخ' : 'Copy')}</Button>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {report.shareToken ? (
                <Button variant="outline" size="sm" disabled={sharingAction} onClick={async () => { setSharingAction(true); try { await revokeShareToken(reportId); setReport((p) => (p ? { ...p, shareToken: null, isShared: false } : null)); } finally { setSharingAction(false); } }}>{lang === 'ar' ? 'إلغاء الرابط' : 'Revoke'}</Button>
              ) : (
                <Button size="sm" disabled={sharingAction} onClick={async () => { setSharingAction(true); try { const token = await createOrUpdateShareToken(reportId); setReport((p) => (p ? { ...p, shareToken: token, isShared: true } : null)); } finally { setSharingAction(false); } }}>{lang === 'ar' ? 'إنشاء رابط' : 'Create link'}</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowShareModal(false)}>{lang === 'ar' ? 'إغلاق' : 'Close'}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {showSaveTemplateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSaveTemplateModal(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-bold">{lang === 'ar' ? 'حفظ كقالب مخصص' : 'Save as custom template'}</h3>
            <Input value={customTemplateName} onChange={(e) => setCustomTemplateName(e.target.value)} className="mb-3 h-9 text-xs" placeholder={lang === 'ar' ? 'اسم القالب…' : 'Template name…'} />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowSaveTemplateModal(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              <Button size="sm" disabled={!customTemplateName.trim() || savingTemplate} onClick={() => { setSavingTemplate(true); try { saveCustomTemplate({ name: customTemplateName.trim(), description: '', contentJson: latestContentRef.current || report.contentJson, themeColor, backgroundColor, language: reportLanguage }, user?.uid); toast.success(lang === 'ar' ? 'تم حفظ القالب' : 'Template saved'); setShowSaveTemplateModal(false); } finally { setSavingTemplate(false); } }}>{lang === 'ar' ? 'حفظ' : 'Save'}</Button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmNode}
    </div>
  );
}
