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
} from 'lucide-react';
import { getReports, createReport, deleteReport, getNextReportNumber } from '@/lib/db';
import { ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { getTemplateContent, TemplateType } from '@/components/editor/templates';
import { AppLanguage } from '@/lib/i18n/dictionary';

export default function ReportsPage() {
  const router = useRouter();
  const { lang, defaultReportLang, t } = useLanguage();
  const { user } = useAuth();

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('bug_report');
  const [newReportLang, setNewReportLang] = useState<AppLanguage>(defaultReportLang);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await getReports();
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
      let defaultTitle = isAr ? 'تقرير مراجعة جديد' : 'New Review Report';

      if (selectedTemplate === 'bug_report') {
        defaultTitle = isAr ? 'تقرير أخطاء النظام' : 'Software Defects Report';
      } else if (selectedTemplate === 'translation_review') {
        defaultTitle = isAr ? 'مراجعة جودة الترجمة (MQM)' : 'Translation Quality Review (MQM)';
      } else if (selectedTemplate === 'combined') {
        defaultTitle = isAr ? 'تقرير المراجعة الشامل' : 'Comprehensive Review Report';
      }

      const initialContent = getTemplateContent(selectedTemplate, newReportLang);

      const created = await createReport({
        title: defaultTitle,
        language: newReportLang,
        author: user.displayName || user.email.split('@')[0],
        systemUnderReview: isAr ? 'النظام الأساسي' : 'Core Platform',
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
      type: 'bug_report' as TemplateType,
      title: t('templateBugReport'),
      desc: t('templateBugReportDesc'),
      icon: Bug,
    },
    {
      type: 'translation_review' as TemplateType,
      title: t('templateTranslationReview'),
      desc: t('templateTranslationReviewDesc'),
      icon: Languages,
    },
    {
      type: 'combined' as TemplateType,
      title: t('templateCombined'),
      desc: t('templateCombinedDesc'),
      icon: Layers,
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
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <FileText className="h-7 w-7 text-teal-600" />
            <span>{t('reports')}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {lang === 'ar'
              ? 'إدارة وتوثيق تقارير المراجعة، الفحص الفني، وتدقيق جودة الترجمات'
              : 'Manage and document review reports, defect analysis, and localization QA'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewReportLang(defaultReportLang);
            setShowTemplateModal(true);
          }}
          className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-teal-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{t('createNewReport')}</span>
        </button>
      </div>

      {/* Delete Error Alert */}
      {deleteError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between">
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
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchReports')}
            className="w-full rounded-lg border border-slate-300 bg-white ps-10 pe-4 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Reports Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <FileText className="h-12 w-12 text-slate-300 mb-3" />
          <p className="text-base font-medium text-slate-700">{t('noReportsFound')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}`}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-teal-400 hover:shadow-md"
            >
              <div>
                {/* Header: Report # & Language */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                    #{report.reportNumber}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded">
                    <Globe className="h-3 w-3" />
                    <span>{report.language}</span>
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-2">
                  {report.title}
                </h2>

                {/* System under review */}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
                  <Cpu className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-medium truncate">{report.systemUnderReview || '-'}</span>
                </div>

                {/* Author */}
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <UserIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate">{report.author}</span>
                </div>
              </div>

              {/* Footer: Date and Delete button */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {new Date(report.updatedAt || report.createdAt).toLocaleDateString(
                      lang === 'ar' ? 'ar-EG' : 'en-US'
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, report.id)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title={t('delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Report Modal with Templates */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">{t('chooseTemplate')}</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Language Selector for the new report */}
            <div className="mt-4 rounded-lg bg-slate-50 p-3 border border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('reportLanguage')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewReportLang('ar')}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    newReportLang === 'ar'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  العربية (RTL)
                </button>
                <button
                  type="button"
                  onClick={() => setNewReportLang('en')}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    newReportLang === 'en'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  English (LTR)
                </button>
              </div>
            </div>

            {/* Template options */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto p-1">
              {templateOptions.map((tpl) => {
                const Icon = tpl.icon;
                const isSelected = selectedTemplate === tpl.type;
                return (
                  <button
                    key={tpl.type}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl.type)}
                    className={`flex flex-col text-start rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
                        <Icon className="h-4 w-4" />
                      </div>
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-teal-600" />}
                    </div>
                    <span className="text-sm font-bold text-slate-900">{tpl.title}</span>
                    <span className="mt-1 text-xs text-slate-500 leading-relaxed">{tpl.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={handleCreateReport}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-50"
              >
                {creating ? t('loading') : t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
