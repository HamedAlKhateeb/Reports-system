'use client';

import React, { useState } from 'react';
import { X, Plus, AlertCircle, Link2 } from 'lucide-react';
import { IssueItem, ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  getStatusLabel,
  getSeverityLabel,
  IssueSeverity,
  IssueStatus,
} from '@/lib/i18n/dictionary';

interface NewIssueModalProps {
  reports: ReportItem[];
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    data: Omit<IssueItem, 'id' | 'createdAt' | 'updatedAt' | 'commentsCount'>
  ) => Promise<void>;
}

export function NewIssueModal({ reports, isOpen, onClose, onCreate }: NewIssueModalProps) {
  const { lang, t } = useLanguage();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<IssueStatus>('open');
  const [severity, setSeverity] = useState<IssueSeverity>('major');
  const [linkedReportId, setLinkedReportId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setSubmitting(true);
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        status,
        severity,
        linkedReportId: linkedReportId || null,
      });
      setTitle('');
      setDescription('');
      setStatus('open');
      setSeverity('major');
      setLinkedReportId('');
      onClose();
    } catch (err) {
      console.error('Failed to create issue', err);
    } finally {
      setSubmitting(false);
    }
  };

  const statuses: IssueStatus[] = ['open', 'in_progress', 'done'];
  const severities: IssueSeverity[] = ['critical', 'major', 'minor'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('addNewIssue')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('issueTitleLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('issueTitlePlaceholder')}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('issueDescriptionLabel')}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('issueDescriptionPlaceholder')}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('issueSeverity')}
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none"
              >
                {severities.map((s) => (
                  <option key={s} value={s}>
                    {getSeverityLabel(s, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('issueStatus')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none"
              >
                {statuses.map((st) => (
                  <option key={st} value={st}>
                    {getStatusLabel(st, lang)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linked Report Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('linkedReportLabel')}
            </label>
            <select
              value={linkedReportId}
              onChange={(e) => setLinkedReportId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none"
            >
              <option value="">{t('noneLinked')}</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.reportNumber} - {r.title}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? t('loading') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
