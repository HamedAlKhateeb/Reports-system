'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Search,
  Trash2,
  Calendar,
  User as UserIcon,
  Cpu,
  Globe,
  Layers,
  X,
  Bug,
  Languages,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  TrendingUp,
  ListChecks,
  BarChart3,
  DollarSign,
  Scale,
  Bookmark,
  Sparkles,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Folder,
  FolderPlus,
  Move,
  FolderOpen,
  Edit2,
  AlertCircle,
  FolderTree,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import {
  getReports,
  createReport,
  deleteReport,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolderSafe,
  moveReportToFolder,
} from '@/lib/db';
import { ReportItem, FolderItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { getTemplateContent, TemplateType } from '@/components/editor/templates';
import { AppLanguage } from '@/lib/i18n/dictionary';
import {
  getCustomTemplates,
  deleteCustomTemplate,
  CustomTemplateItem,
} from '@/lib/custom-templates';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderTreeView } from '@/components/reports/FolderTreeView';
import { FolderBreadcrumb } from '@/components/reports/FolderBreadcrumb';
import { MoveToFolderModal } from '@/components/reports/MoveToFolderModal';

const COLOR_PRESETS = [
  '#2E4034', // Forest Olive
  '#1E3A8A', // Deep Blue
  '#065F46', // Emerald
  '#92400E', // Amber
  '#7C2D12', // Rust Red
  '#4C1D95', // Indigo Violet
  '#831843', // Rose
  '#374151', // Slate
];

export default function ReportsPage() {
  const router = useRouter();
  const { lang, defaultReportLang, t } = useLanguage();
  const isAr = lang === 'ar';
  const { user, loading: authLoading } = useAuth();

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Folder selection: 'all' = all reports, null = root / uncategorized, string = specific folder ID
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'all'>('all');

  // Modals state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('problem_report');
  const [newReportLang, setNewReportLang] = useState<AppLanguage>(defaultReportLang);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedReportId, setCopiedReportId] = useState<string | null>(null);

  // Folder Modals state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#2E4034');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [folderToEdit, setFolderToEdit] = useState<FolderItem | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const [itemToMove, setItemToMove] = useState<
    | { type: 'report'; item: ReportItem }
    | { type: 'folder'; item: FolderItem }
    | null
  >(null);

  // Custom Templates states
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateItem[]>([]);
  const [templateTab, setTemplateTab] = useState<'builtin' | 'custom'>('builtin');
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState<string | null>(null);

  const loadData = async () => {
    if (authLoading) return;
    if (!user) {
      setReports([]);
      setFolders([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [reportsData, foldersData] = await Promise.all([
        getReports(user.uid),
        getFolders(user.uid),
      ]);
      setReports(reportsData);
      setFolders(foldersData);
    } catch (err) {
      console.error('Failed to load reports and folders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    loadData();
    setCustomTemplates(getCustomTemplates(user?.uid));

    const handleReportsChanged = () => {
      loadData();
    };

    window.addEventListener('report-updated', handleReportsChanged);
    window.addEventListener('report-created', handleReportsChanged);
    window.addEventListener('report-deleted', handleReportsChanged);
    return () => {
      window.removeEventListener('report-updated', handleReportsChanged);
      window.removeEventListener('report-created', handleReportsChanged);
      window.removeEventListener('report-deleted', handleReportsChanged);
    };
  }, [user?.uid, authLoading]);

  const handleCopyLink = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/reports/${id}`;
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(url);
      }
      setCopiedReportId(id);
      setTimeout(() => setCopiedReportId(null), 2000);
    }
  };

  const handleOpenTemplateModal = () => {
    setNewReportLang(defaultReportLang);
    const tmpls = getCustomTemplates(user?.uid);
    setCustomTemplates(tmpls);
    if (tmpls.length > 0 && !selectedCustomTemplateId) {
      setSelectedCustomTemplateId(tmpls[0].id);
    }
    setShowTemplateModal(true);
  };

  const handleCreateReport = async () => {
    if (!user) return;
    try {
      setCreating(true);
      const targetFolderId = selectedFolderId && selectedFolderId !== 'all' ? selectedFolderId : undefined;

      // If user selected a custom template
      if (templateTab === 'custom' && selectedCustomTemplateId) {
        const customTpl = customTemplates.find((ct) => ct.id === selectedCustomTemplateId);
        if (customTpl) {
          const created = await createReport({
            title: customTpl.name,
            language: newReportLang || customTpl.language,
            author: user.displayName || user.email.split('@')[0],
            systemUnderReview: isAr ? 'النظام والمشروع العام' : 'Core System & Project',
            contentJson: customTpl.contentJson,
            themeColor: customTpl.themeColor || 'olive',
            backgroundColor: customTpl.backgroundColor || 'white',
            ownerUid: user.uid,
            folderId: targetFolderId,
          });

          setShowTemplateModal(false);
          router.push(`/reports/${created.id}`);
          return;
        }
      }

      let defaultTitle = isAr ? 'تقرير مراجعة جديد' : 'New Report';

      switch (selectedTemplate) {
        case 'problem_report':
          defaultTitle = isAr ? 'تقرير وتحليل المشاكل والأخطاء' : 'Problem Report & Analysis';
          break;
        case 'freelancer_work':
          defaultTitle = isAr ? 'تقرير أعمال المستقلين والمتعاقدين' : 'Freelancer Work Report';
          break;
        case 'market_competitor':
          defaultTitle = isAr ? 'دراسة وتحليل السوق والمنافسين' : 'Market & Competitor Analysis';
          break;
        case 'requirements_product':
          defaultTitle = isAr ? 'تحليل المتطلبات والمنتج' : 'Requirements & Product Analysis';
          break;
        case 'product_performance':
          defaultTitle = isAr ? 'تقرير أداء المنتج والمستخدمين' : 'Product Performance Report';
          break;
        case 'financial_performance':
          defaultTitle = isAr ? 'تقرير الأداء المالي والميزانية' : 'Financial Performance Report';
          break;
        case 'decision_recommendation':
          defaultTitle = isAr ? 'تقرير دراسة القرارات والتوصيات' : 'Decision & Recommendation Report';
          break;
        case 'bug_report':
          defaultTitle = isAr ? 'تقرير أخطاء النظام' : 'Software Defects Report';
          break;
        case 'translation_review':
          defaultTitle = isAr ? 'مراجعة جودة الترجمة (MQM)' : 'Translation Quality Review (MQM)';
          break;
        case 'combined':
          defaultTitle = isAr ? 'تقرير المراجعة الشامل' : 'Comprehensive Review Report';
          break;
        default:
          defaultTitle = isAr ? 'تقرير جديد' : 'New Report';
      }

      const initialContent = getTemplateContent(selectedTemplate, newReportLang);

      const created = await createReport({
        title: defaultTitle,
        language: newReportLang,
        author: user.displayName || user.email.split('@')[0],
        systemUnderReview: isAr ? 'النظام والمشروع العام' : 'Core System & Project',
        contentJson: initialContent,
        ownerUid: user.uid,
        folderId: targetFolderId,
      });

      setShowTemplateModal(false);
      router.push(`/reports/${created.id}`);
    } catch (err) {
      console.error('Failed to create report', err);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateReportInFolder = async (folderId: string) => {
    if (!user) return;
    try {
      setCreating(true);
      const defaultTitle = isAr ? 'تقرير جديد' : 'New Report';
      const initialContent = getTemplateContent('problem_report', defaultReportLang);

      const created = await createReport({
        title: defaultTitle,
        language: defaultReportLang,
        author: user.displayName || user.email.split('@')[0],
        systemUnderReview: isAr ? 'النظام والمشروع العام' : 'Core System & Project',
        contentJson: initialContent,
        ownerUid: user.uid,
        folderId: folderId,
      });

      router.push(`/reports/${created.id}`);
    } catch (err) {
      console.error('Failed to create report in folder', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);

    if (!confirm(t('deleteReportConfirm'))) {
      return;
    }

    try {
      const res = await deleteReport(id);
      if (!res.success) {
        if (res.error === 'reportCannotBeDeletedHasIssues') {
          setDeleteError(t('reportCannotBeDeletedHasIssues'));
        } else {
          setDeleteError(res.error || 'Failed to delete report');
        }
        return;
      }

      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      console.error('Delete error:', err);
      setDeleteError(err?.message || 'Failed to delete report');
    }
  };

  // Folder Operations
  const handleOpenCreateFolderModal = (parentId: string | null = null) => {
    setCreateFolderParentId(parentId);
    setNewFolderName('');
    setNewFolderColor('#2E4034');
    setShowCreateFolderModal(true);
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !user) return;
    try {
      setCreatingFolder(true);
      await createFolder({
        name: newFolderName.trim(),
        parentId: createFolderParentId,
        color: newFolderColor,
        ownerUid: user.uid,
      });
      const updated = await getFolders(user.uid);
      setFolders(updated);
      setShowCreateFolderModal(false);
      setNewFolderName('');
    } catch (err: any) {
      console.error('Failed to create folder:', err);
      alert((isAr ? 'فشل إنشاء المجلد: ' : 'Failed to create folder: ') + err?.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderToEdit || !renameFolderName.trim()) return;
    try {
      setSavingFolder(true);
      await updateFolder(folderToEdit.id, { name: renameFolderName.trim() });
      const updated = await getFolders(user?.uid);
      setFolders(updated);
      setFolderToEdit(null);
    } catch (err: any) {
      console.error('Failed to rename folder:', err);
      alert((isAr ? 'فشل إعادة تسمية المجلد: ' : 'Failed to rename folder: ') + err?.message);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      setDeletingFolder(true);
      await deleteFolderSafe(folderToDelete.id);
      const [updatedReports, updatedFolders] = await Promise.all([
        getReports(user?.uid),
        getFolders(user?.uid),
      ]);
      setReports(updatedReports);
      setFolders(updatedFolders);
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(folderToDelete.parentId || null);
      }
      setFolderToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete folder:', err);
      alert((isAr ? 'فشل حذف المجلد: ' : 'Failed to delete folder: ') + err?.message);
    } finally {
      setDeletingFolder(false);
    }
  };

  const handleDropReportOnFolder = async (reportId: string, targetFolderId: string | null) => {
    try {
      await moveReportToFolder(reportId, targetFolderId);
      const updatedReports = await getReports(user?.uid);
      setReports(updatedReports);
    } catch (err) {
      console.error('Failed to move report to folder on drop:', err);
    }
  };

  const handleConfirmMoveModal = async (targetFolderId: string | null) => {
    if (!itemToMove) return;
    if (itemToMove.type === 'report') {
      await moveReportToFolder(itemToMove.item.id, targetFolderId);
      const updatedReports = await getReports(user?.uid);
      setReports(updatedReports);
    } else {
      await updateFolder(itemToMove.item.id, { parentId: targetFolderId });
      const updatedFolders = await getFolders(user?.uid);
      setFolders(updatedFolders);
    }
  };

  // Filter Logic:
  // When search query is entered -> Global search across ALL reports regardless of folder
  // When no search query -> Filter by current folder selection
  const isSearching = searchQuery.trim().length > 0;
  const filteredReports = reports.filter((r) => {
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return (
        (r.title || '').toLowerCase().includes(q) ||
        (r.systemUnderReview || '').toLowerCase().includes(q) ||
        (r.author || '').toLowerCase().includes(q) ||
        String(r.reportNumber).includes(q)
      );
    }

    if (selectedFolderId === 'all') {
      return true;
    }
    if (selectedFolderId === null) {
      return !r.folderId;
    }
    return r.folderId === selectedFolderId;
  });

  const currentFolder = folders.find((f) => f.id === selectedFolderId);

  const templateOptions = [
    {
      type: 'problem_report' as TemplateType,
      title: t('templateProblemReport'),
      desc: t('templateProblemReportDesc'),
      icon: AlertTriangle,
    },
    {
      type: 'freelancer_work' as TemplateType,
      title: t('templateFreelancerWork'),
      desc: t('templateFreelancerWorkDesc'),
      icon: Briefcase,
    },
    {
      type: 'market_competitor' as TemplateType,
      title: t('templateMarketCompetitor'),
      desc: t('templateMarketCompetitorDesc'),
      icon: TrendingUp,
    },
    {
      type: 'requirements_product' as TemplateType,
      title: t('templateRequirementsProduct'),
      desc: t('templateRequirementsProductDesc'),
      icon: ListChecks,
    },
    {
      type: 'product_performance' as TemplateType,
      title: t('templateProductPerformance'),
      desc: t('templateProductPerformanceDesc'),
      icon: BarChart3,
    },
    {
      type: 'financial_performance' as TemplateType,
      title: t('templateFinancialPerformance'),
      desc: t('templateFinancialPerformanceDesc'),
      icon: DollarSign,
    },
    {
      type: 'decision_recommendation' as TemplateType,
      title: t('templateDecisionRecommendation'),
      desc: t('templateDecisionRecommendationDesc'),
      icon: Scale,
    },
    {
      type: 'empty' as TemplateType,
      title: t('templateEmpty'),
      desc: t('templateEmptyDesc'),
      icon: FileText,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <FileText className="h-7 w-7 text-olive-700 dark:text-olive-400" />
            <span>{t('reports')}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? 'إدارة وتوثيق تقارير المراجعة، تنظيمها في مجلدات، وتدقيق الجودة'
              : 'Manage and organize review reports in nested folders and QA documentation'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenCreateFolderModal(selectedFolderId && selectedFolderId !== 'all' ? selectedFolderId : null)}
          >
            <FolderPlus data-icon="inline-start" />
            <span>{isAr ? 'مجلد جديد' : 'New Folder'}</span>
          </Button>

          <Button
            type="button"
            onClick={handleOpenTemplateModal}
          >
            <Plus data-icon="inline-start" />
            <span>{t('createNewReport')}</span>
          </Button>
        </div>
      </div>

      {/* Delete Error Alert */}
      {deleteError && (
        <Alert variant="destructive" className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle data-icon="inline-start" />
            <AlertDescription>{deleteError}</AlertDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDeleteError(null)}
            className="size-7"
          >
            <X className="size-4" />
          </Button>
        </Alert>
      )}

      {/* Two-Column Responsive Layout: Folder Tree Sidebar & Main Reports View */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Sidebar: Folder Tree View */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="sticky top-20">
            <FolderTreeView
              folders={folders}
              reports={reports}
              selectedFolderId={selectedFolderId}
              onSelectFolder={(id) => {
                setSelectedFolderId(id);
                setSearchQuery('');
              }}
              onCreateFolder={(parentId) => handleOpenCreateFolderModal(parentId)}
              onRenameFolder={(f) => {
                setFolderToEdit(f);
                setRenameFolderName(f.name);
              }}
              onMoveFolder={(f) => {
                setItemToMove({ type: 'folder', item: f });
              }}
              onDeleteFolder={(f) => {
                setFolderToDelete(f);
              }}
              onDropReportOnFolder={handleDropReportOnFolder}
              onNewReportInFolder={handleCreateReportInFolder}
            />
          </div>
        </aside>

        {/* Main Panel */}
        <main className="flex-1 min-w-0 w-full space-y-4">
          {/* Breadcrumb Navigation & Folder Information */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs">
            <FolderBreadcrumb
              currentFolderId={selectedFolderId === 'all' ? null : selectedFolderId}
              folders={folders}
              onNavigate={(fId) => {
                setSelectedFolderId(fId);
                setSearchQuery('');
              }}
            />

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5 rounded-md">
                {isSearching
                  ? isAr
                    ? `نتائج البحث: ${filteredReports.length}`
                    : `Search results: ${filteredReports.length}`
                  : isAr
                  ? `${filteredReports.length} تقرير`
                  : `${filteredReports.length} reports`}
              </Badge>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAr
                    ? 'بحث شامل في جميع المجلدات (العنوان، النظام، الكاتب، رقم التقرير)...'
                    : 'Global search across all folders (Title, system, author, report #)...'
                }
                className="ps-9 pe-9 h-9 text-xs rounded-lg"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search Scope Notice */}
          {isSearching && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-olive-500/10 border border-olive-500/20 text-xs text-olive-800 dark:text-olive-300">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>
                {isAr
                  ? 'يتم البحث حالياً بشكل شامل في كافة المجلدات والمستويات'
                  : 'Searching globally across all folders and levels'}
              </span>
            </div>
          )}

          {/* Reports Grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="p-5 space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="pt-3 border-t flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <Card className="flex flex-col items-center justify-center border-dashed p-12 text-center">
              <FileText className="size-12 text-muted-foreground/50 mb-3" />
              <p className="text-base font-medium text-foreground">
                {isSearching
                  ? isAr
                    ? 'لم يتم العثور على أي تقارير تطابق بحثك'
                    : 'No reports match your search'
                  : currentFolder
                  ? isAr
                    ? `المجلد "${currentFolder.name}" فارغ حالياً`
                    : `Folder "${currentFolder.name}" is currently empty`
                  : t('noReportsFound')}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleOpenTemplateModal}
                >
                  <Plus data-icon="inline-start" />
                  <span>{t('createNewReport')}</span>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredReports.map((report) => {
                const reportDate = new Date(report.updatedAt || report.createdAt);
                const dateStr = reportDate.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });
                const isCopied = copiedReportId === report.id;
                const reportFolder = folders.find((f) => f.id === report.folderId);

                return (
                  <Card
                    key={report.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/report-id', report.id);
                      e.dataTransfer.setData('text/plain', report.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => router.push(`/reports/${report.id}`)}
                    className="group relative flex flex-col justify-between hover:border-primary/50 hover:shadow-md transition-all cursor-pointer select-none"
                  >
                    <CardHeader className="p-5 pb-3">
                      {/* Top Bar: Report # and Folder / Language Pills */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="secondary" className="gap-1.5 font-bold">
                          <FileText data-icon="inline-start" />
                          <span>
                            {isAr ? `التقرير ${report.reportNumber}` : `Report #${report.reportNumber}`}
                          </span>
                        </Badge>

                        <div className="flex items-center gap-1.5">
                          {reportFolder && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFolderId(reportFolder.id);
                              }}
                            >
                              <Badge variant="outline" className="gap-1 text-[10px] hover:bg-muted transition-colors">
                                <Folder className="size-3 text-muted-foreground" />
                                <span className="truncate max-w-[80px]">{reportFolder.name}</span>
                              </Badge>
                            </button>
                          )}

                          <Badge variant="outline" className="gap-1 text-[10px] uppercase font-mono">
                            <Globe className="size-3" />
                            <span>{report.language || 'ar'}</span>
                          </Badge>
                        </div>
                      </div>

                      {/* Title */}
                      <CardTitle className="text-base font-bold group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                        {report.title}
                      </CardTitle>
                    </CardHeader>

                    {/* Metadata Chips: System & Author */}
                    <CardContent className="p-5 pt-0 pb-3 flex flex-col gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Cpu className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate font-medium">
                          {report.systemUnderReview || (isAr ? 'المشروع العام' : 'General Project')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <UserIcon className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">
                          {report.author || (isAr ? 'المراجع' : 'Reviewer')}
                          {report.authorTitle ? ` · ${report.authorTitle}` : ''}
                        </span>
                      </div>
                    </CardContent>

                    {/* Footer: Date & Official DropdownMenu Actions */}
                    <CardFooter className="p-5 pt-3 border-t border-border/70 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Calendar className="size-3.5 opacity-70" />
                        <span>{dateStr}</span>
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              title={isAr ? 'خيارات التقرير' : 'Report options'}
                            >
                              <MoreVertical className="size-4" />
                              <span className="sr-only">{isAr ? 'خيارات التقرير' : 'Report options'}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => router.push(`/reports/${report.id}`)}
                                className="gap-2 cursor-pointer text-xs font-medium"
                              >
                                <ExternalLink className="size-3.5 text-muted-foreground" />
                                <span>{isAr ? 'فتح التقرير' : 'Open Report'}</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => setItemToMove({ type: 'report', item: report })}
                                className="gap-2 cursor-pointer text-xs font-medium"
                              >
                                <Move className="size-3.5 text-muted-foreground" />
                                <span>{isAr ? 'نقل إلى مجلد...' : 'Move to folder...'}</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={(e) => handleCopyLink(e, report.id)}
                                className="gap-2 cursor-pointer text-xs font-medium"
                              >
                                {isCopied ? (
                                  <Check className="size-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="size-3.5 text-muted-foreground" />
                                )}
                                <span>
                                  {isCopied
                                    ? isAr
                                      ? 'تم نسخ الرابط'
                                      : 'Link Copied'
                                    : isAr
                                    ? 'نسخ رابط التقرير'
                                    : 'Copy Report Link'}
                                </span>
                              </DropdownMenuItem>
                            </DropdownMenuGroup>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={(e) => handleDelete(e, report.id)}
                              className="gap-2 cursor-pointer text-xs font-medium text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Trash2 className="size-3.5" />
                              <span>{t('delete')}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Open Arrow Button */}
                        <span
                          className="p-1 text-muted-foreground group-hover:text-primary transition-colors cursor-pointer"
                          onClick={() => router.push(`/reports/${report.id}`)}
                          title={isAr ? 'فتح التقرير' : 'Open Report'}
                        >
                          {isAr ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
                        </span>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <FolderPlus className="size-4" />
              </div>
              <div>
                <DialogTitle>
                  {createFolderParentId
                    ? isAr
                      ? 'إنشاء مجلد فرعي'
                      : 'Create Subfolder'
                    : isAr
                    ? 'إنشاء مجلد جديد'
                    : 'Create New Folder'}
                </DialogTitle>
                <DialogDescription>
                  {isAr
                    ? 'أدخل اسم المجلد ولونه المفضل لتنظيم تقاريرك.'
                    : 'Enter folder name and color accent to organize your reports.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="folderName">
                  {isAr ? 'اسم المجلد' : 'Folder Name'}
                </FieldLabel>
                <Input
                  id="folderName"
                  type="text"
                  required
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={isAr ? 'مثال: تقارير الأداء المالي، تدقيق 2026...' : 'e.g. Financial Reports, Q1 QA...'}
                />
              </Field>

              <Field>
                <FieldLabel>{isAr ? 'لون المجلد' : 'Folder Color'}</FieldLabel>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewFolderColor(c)}
                      className={`size-7 rounded-full border-2 transition-all flex items-center justify-center ${
                        newFolderColor === c ? 'border-foreground scale-110 shadow-xs' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {newFolderColor === c && <Check className="size-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </Field>
            </FieldGroup>

            {createFolderParentId && (
              <div className="p-2.5 rounded-lg bg-muted text-xs text-muted-foreground flex items-center gap-2">
                <Folder className="size-3.5 shrink-0" />
                <span>
                  {isAr ? 'سيتم إنشاؤه داخل: ' : 'Will be created inside: '}
                  <strong className="text-foreground">
                    {folders.find((f) => f.id === createFolderParentId)?.name}
                  </strong>
                </span>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateFolderModal(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creatingFolder || !newFolderName.trim()}
              >
                {creatingFolder ? t('loading') : isAr ? 'إنشاء المجلد' : 'Create Folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={Boolean(folderToEdit)} onOpenChange={(open) => !open && setFolderToEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Edit2 className="size-4" />
              </div>
              <div>
                <DialogTitle>
                  {isAr ? 'إعادة تسمية المجلد' : 'Rename Folder'}
                </DialogTitle>
                <DialogDescription>
                  {isAr ? 'تعديل اسم المجلد الحالي' : 'Change the current folder name'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleRenameFolderSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="renameFolder">
                  {isAr ? 'اسم المجلد الجديد' : 'New Folder Name'}
                </FieldLabel>
                <Input
                  id="renameFolder"
                  type="text"
                  required
                  autoFocus
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                />
              </Field>
            </FieldGroup>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFolderToEdit(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingFolder || !renameFolderName.trim()}
              >
                {savingFolder ? t('loading') : isAr ? 'حفظ التعديل' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Safe Delete Folder Dialog */}
      <Dialog open={Boolean(folderToDelete)} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                <AlertCircle className="size-5" />
              </div>
              <div>
                <DialogTitle>
                  {isAr ? 'تأكيد حذف المجلد' : 'Confirm Folder Deletion'}
                </DialogTitle>
                <DialogDescription>
                  {isAr ? `المجلد: ${folderToDelete?.name}` : `Folder: ${folderToDelete?.name}`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Alert variant="warning" className="my-2">
            <AlertDescription className="space-y-1">
              <p className="font-semibold">
                {isAr ? 'حذف آمن بدون فقدان أي تقارير:' : 'Safe deletion with zero data loss:'}
              </p>
              <p className="leading-relaxed">
                {isAr
                  ? 'سيتم نقل جميع التقارير والمجلدات الفرعية الموجودة داخل هذا المجلد تلقائياً إلى المجلد الأب (أو إلى الجذر). لن يتم حذف أي تقرير مطلقاً.'
                  : 'All reports and subfolders inside this folder will be safely reparented to the parent folder (or root). No reports will be deleted.'}
              </p>
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFolderToDelete(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deletingFolder}
              onClick={handleConfirmDeleteFolder}
            >
              {deletingFolder ? t('loading') : isAr ? 'حذف المجلد بأمان' : 'Delete Safely'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Item Modal */}
      {itemToMove && (
        <MoveToFolderModal
          isOpen={Boolean(itemToMove)}
          onClose={() => setItemToMove(null)}
          folders={folders}
          reportToMove={itemToMove.type === 'report' ? itemToMove.item : null}
          folderToMove={itemToMove.type === 'folder' ? itemToMove.item : null}
          onConfirmMove={handleConfirmMoveModal}
        />
      )}

      {/* New Report Dialog with Templates */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-xl font-bold">{t('chooseTemplate')}</DialogTitle>
              {selectedFolderId && selectedFolderId !== 'all' && currentFolder && (
                <p className="text-xs text-primary font-medium">
                  {isAr
                    ? `سيتم حفظ التقرير الجديد داخل المجلد: "${currentFolder.name}"`
                    : `Report will be saved inside folder: "${currentFolder.name}"`}
                </p>
              )}
            </div>
          </DialogHeader>

          {/* Language Selector for the new report */}
          <div className="rounded-lg bg-muted/40 p-3 border border-border">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              {t('reportLanguage')}
            </label>
            <Tabs
              value={newReportLang}
              onValueChange={(val) => setNewReportLang(val as AppLanguage)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ar">العربية (RTL)</TabsTrigger>
                <TabsTrigger value="en">English (LTR)</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Template Tabs: Standard vs Custom */}
          <Tabs
            value={templateTab}
            onValueChange={(v) => {
              if (v === 'custom') setCustomTemplates(getCustomTemplates(user?.uid));
              setTemplateTab(v as 'builtin' | 'custom');
            }}
            className="w-full"
          >
            <TabsList className="w-full justify-start">
              <TabsTrigger value="builtin" className="gap-1.5">
                <Sparkles data-icon="inline-start" />
                <span>{isAr ? 'القوالب الرسمية المعيارية' : 'Standard Templates'}</span>
                <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-[10px]">
                  {templateOptions.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5">
                <Bookmark data-icon="inline-start" />
                <span>{isAr ? 'قوالبي المخصصة المحفوظة' : 'My Custom Templates'}</span>
                <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-[10px]">
                  {customTemplates.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Template options */}
          {templateTab === 'builtin' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto p-1">
              {templateOptions.map((tpl) => {
                const Icon = tpl.icon;
                const isSelected = selectedTemplate === tpl.type;
                return (
                  <div
                    key={tpl.type}
                    onClick={() => setSelectedTemplate(tpl.type)}
                    className={`flex flex-col text-start rounded-xl border p-4 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary'
                        : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon className="size-4" />
                      </div>
                      {isSelected && <CheckCircle2 className="size-5 text-primary" />}
                    </div>
                    <span className="text-sm font-bold text-foreground">{tpl.title}</span>
                    <span className="mt-1 text-xs text-muted-foreground leading-relaxed">{tpl.desc}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="max-h-[380px] overflow-y-auto p-1">
              {customTemplates.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-10 text-center border-dashed">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
                    <Bookmark className="size-6" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {isAr ? 'لا توجد قوالب مخصصة محفوظة بعد' : 'No custom templates saved yet'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    {isAr
                      ? 'يمكنك إنشاء أي تقرير مخصص وحفظ هيكله كقالب دائم بالضغط على زر "حفظ كقالب" في صفحة التقرير.'
                      : 'You can create a report and save its structure as a permanent template by clicking "Save as Template" in the report page.'}
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customTemplates.map((ct) => {
                    const isSelected = selectedCustomTemplateId === ct.id;
                    return (
                      <div
                        key={ct.id}
                        onClick={() => setSelectedCustomTemplateId(ct.id)}
                        className={`relative flex flex-col text-start rounded-xl border p-4 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary'
                            : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                            <Bookmark className="size-4" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isSelected && <CheckCircle2 className="size-5 text-primary" />}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    isAr
                                      ? 'هل أنت متأكد من حذف هذا القالب المخصص نهائياً؟'
                                      : 'Are you sure you want to delete this custom template?'
                                  )
                                ) {
                                  deleteCustomTemplate(ct.id, user?.uid);
                                  const updated = getCustomTemplates(user?.uid);
                                  setCustomTemplates(updated);
                                  if (selectedCustomTemplateId === ct.id) {
                                    setSelectedCustomTemplateId(updated[0]?.id || null);
                                  }
                                }
                              }}
                              className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title={isAr ? 'حذف القالب' : 'Delete Template'}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-foreground">{ct.name}</span>
                        <span className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {ct.description}
                        </span>
                        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
                          <span>
                            {new Date(ct.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                          </span>
                          <Badge variant="outline" className="uppercase text-[10px] font-semibold">
                            {ct.language}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Dialog Actions */}
          <DialogFooter className="gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateModal(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={creating}
              onClick={handleCreateReport}
            >
              {creating ? t('loading') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
