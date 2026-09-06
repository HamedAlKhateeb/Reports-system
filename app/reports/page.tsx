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
  BookmarkPlus,
  Sparkles,
} from 'lucide-react';
import { getReports, createReport, deleteReport, getNextReportNumber } from '@/lib/db';
import { ReportItem } from '@/lib/types';
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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ReportsPage() {
  const router = useRouter();
  const { lang, defaultReportLang, t } = useLanguage();
  const { user } = useAuth();

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('problem_report');
  const [newReportLang, setNewReportLang] = useState<AppLanguage>(defaultReportLang);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Custom Templates states
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateItem[]>([]);
  const [templateTab, setTemplateTab] = useState<'builtin' | 'custom'>('builtin');
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
    setCustomTemplates(getCustomTemplates(user?.uid));
  }, [user?.uid]);

  const handleOpenTemplateModal = () => {
    setNewReportLang(defaultReportLang);
    const tmpls = getCustomTemplates(user?.uid);
    setCustomTemplates(tmpls);
    if (tmpls.length > 0 && !selectedCustomTemplateId) {
      setSelectedCustomTemplateId(tmpls[0].id);
    }
    setShowTemplateModal(true);
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await getReports(user?.uid);
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async () => {
    if (!user) return;
    try {
      setCreating(true);
      const isAr = newReportLang === 'ar';

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
      });

      setShowTemplateModal(false);
      router.push(`/reports/${created.id}`);
    } catch (err) {
      console.error('Failed to create report', err);
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

  const filteredReports = reports.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      (r.title || '').toLowerCase().includes(q) ||
      (r.systemUnderReview || '').toLowerCase().includes(q) ||
      (r.author || '').toLowerCase().includes(q) ||
      String(r.reportNumber).includes(q)
    );
  });

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
            {lang === 'ar'
              ? 'إدارة وتوثيق تقارير المراجعة، الفحص الفني، وتدقيق جودة الترجمات'
              : 'Manage and document review reports, defect analysis, and localization QA'}
          </p>
        </div>

        <Button
          type="button"
          onClick={handleOpenTemplateModal}
          className="h-9 gap-2 rounded-lg bg-[#2E4034] hover:bg-[#24382F] text-white text-xs font-semibold shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>{t('createNewReport')}</span>
        </Button>
      </div>

      {/* Delete Error Alert */}
      {deleteError && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-xs text-red-800 dark:text-red-300 flex items-center justify-between">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
            <Search className="h-4 w-4" />
          </div>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchReports')}
            className="ps-9 h-9 text-xs rounded-lg"
          />
        </div>
      </div>

      {/* Reports Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-olive-700 border-t-transparent" />
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-base font-medium text-foreground">{t('noReportsFound')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <Card
              key={report.id}
              className="group relative flex flex-col justify-between border-border/80 hover:border-olive-600/60 transition-all hover:shadow-md cursor-pointer overflow-hidden rounded-xl bg-card"
              onClick={() => router.push(`/reports/${report.id}`)}
            >
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div>
                  {/* Header: Report # & Language */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Badge
                      variant="outline"
                      className="border-teal-200 dark:border-teal-800/80 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold text-xs"
                    >
                      #{report.reportNumber}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="gap-1 text-[11px] uppercase font-semibold text-muted-foreground"
                    >
                      <Globe className="h-3 w-3" />
                      <span>{report.language}</span>
                    </Badge>
                  </div>

                  {/* Title */}
                  <h2 className="text-base font-bold text-foreground group-hover:text-olive-700 dark:group-hover:text-olive-400 transition-colors line-clamp-2">
                    {report.title}
                  </h2>

                  {/* System under review */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Cpu className="h-3.5 w-3.5 opacity-70" />
                    <span className="font-medium truncate">{report.systemUnderReview || '-'}</span>
                  </div>

                  {/* Author */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserIcon className="h-3.5 w-3.5 opacity-70" />
                    <span className="truncate">{report.author}</span>
                  </div>
                </div>

                {/* Footer: Date and Delete button */}
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 opacity-70" />
                    <span>
                      {new Date(report.updatedAt || report.createdAt).toLocaleDateString(
                        lang === 'ar' ? 'ar-EG' : 'en-US'
                      )}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDelete(e, report.id)}
                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                    title={t('delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Report Modal with Templates */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-3xl rounded-xl bg-card border border-border p-6 shadow-xl text-card-foreground">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <h2 className="text-lg font-bold text-foreground">{t('chooseTemplate')}</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplateModal(false)}
                className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Language Selector for the new report */}
            <div className="mt-4 rounded-lg bg-muted/40 p-3 border border-border/60">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                {t('reportLanguage')}
              </label>
              <Tabs
                value={newReportLang}
                onValueChange={(val) => setNewReportLang(val as AppLanguage)}
              >
                <TabsList className="grid w-full grid-cols-2 h-9 p-0.5 bg-muted/70 rounded-lg">
                  <TabsTrigger
                    value="ar"
                    className="text-xs font-semibold data-[state=active]:bg-[#2E4034] data-[state=active]:text-white rounded-md transition-all"
                  >
                    العربية (RTL)
                  </TabsTrigger>
                  <TabsTrigger
                    value="en"
                    className="text-xs font-semibold data-[state=active]:bg-[#2E4034] data-[state=active]:text-white rounded-md transition-all"
                  >
                    English (LTR)
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Template Tabs: Standard vs Custom */}
            <div className="mt-4">
              <Tabs
                value={templateTab}
                onValueChange={(v) => {
                  if (v === 'custom') setCustomTemplates(getCustomTemplates(user?.uid));
                  setTemplateTab(v as 'builtin' | 'custom');
                }}
              >
                <TabsList className="h-9 p-0.5 bg-muted/60 rounded-lg">
                  <TabsTrigger
                    value="builtin"
                    className="text-xs font-semibold gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground rounded-md transition-all"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
                    <span>{lang === 'ar' ? 'القوالب الرسمية المعيارية' : 'Standard Templates'}</span>
                    <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-[10px] rounded-md">
                      {templateOptions.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="custom"
                    className="text-xs font-semibold gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground rounded-md transition-all"
                  >
                    <Bookmark className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
                    <span>{lang === 'ar' ? 'قوالبي المخصصة المحفوظة' : 'My Custom Templates'}</span>
                    <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-[10px] rounded-md">
                      {customTemplates.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Template options */}
            {templateTab === 'builtin' ? (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto p-1">
                {templateOptions.map((tpl) => {
                  const Icon = tpl.icon;
                  const isSelected = selectedTemplate === tpl.type;
                  return (
                    <button
                      key={tpl.type}
                      type="button"
                      onClick={() => setSelectedTemplate(tpl.type)}
                      className={`flex flex-col text-start rounded-xl border p-4 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#2E4034] bg-[#2E4034]/5 ring-2 ring-[#2E4034]'
                          : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        {isSelected && <CheckCircle2 className="h-5 w-5 text-[#2E4034] dark:text-olive-400" />}
                      </div>
                      <span className="text-sm font-bold text-foreground">{tpl.title}</span>
                      <span className="mt-1 text-xs text-muted-foreground leading-relaxed">{tpl.desc}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 max-h-[420px] overflow-y-auto p-1">
                {customTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
                      <Bookmark className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      {lang === 'ar' ? 'لا توجد قوالب مخصصة محفوظة بعد' : 'No custom templates saved yet'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      {lang === 'ar'
                        ? 'يمكنك إنشاء أي تقرير مخصص وحفظ هيكله كقالب دائم بالضغط على زر "حفظ كقالب" في صفحة التقرير.'
                        : 'You can create a report and save its structure as a permanent template by clicking "Save as Template" in the report page.'}
                    </p>
                  </div>
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
                              ? 'border-[#2E4034] bg-[#2E4034]/5 ring-2 ring-[#2E4034]'
                              : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300">
                              <Bookmark className="h-4 w-4 text-olive-700 dark:text-olive-300" />
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isSelected && <CheckCircle2 className="h-5 w-5 text-[#2E4034] dark:text-olive-400" />}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      lang === 'ar'
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
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg"
                                title={lang === 'ar' ? 'حذف القالب' : 'Delete Template'}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-foreground">{ct.name}</span>
                          <span className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {ct.description}
                          </span>
                          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                            <span>
                              {new Date(ct.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                            </span>
                            <Badge variant="outline" className="uppercase text-[10px] font-semibold text-olive-800 dark:text-olive-300">
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

            {/* Modal Actions */}
            <div className="mt-6 flex justify-end gap-2.5 border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowTemplateModal(false)}
                className="h-9 rounded-lg text-xs"
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={creating}
                onClick={handleCreateReport}
                className="h-9 rounded-lg bg-[#2E4034] hover:bg-[#24382F] text-white text-xs font-semibold shadow-xs"
              >
                {creating ? t('loading') : t('create')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
