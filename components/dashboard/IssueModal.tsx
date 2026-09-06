'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X,
  Trash2,
  Send,
  MessageSquare,
  Clock,
  User as UserIcon,
  Link2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { IssueItem, CommentItem, ReportItem } from '@/lib/types';
import { getComments, addComment, updateIssue, deleteIssue } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import {
  getStatusLabel,
  getSeverityLabel,
  IssueSeverity,
  IssueStatus,
} from '@/lib/i18n/dictionary';

interface IssueModalProps {
  issue: IssueItem;
  reports: ReportItem[];
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updated: IssueItem) => void;
  onDeleted: (id: string) => void;
}

export function IssueModal({
  issue,
  reports,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: IssueModalProps) {
  const { lang, t } = useLanguage();
  const { user } = useAuth();

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Editable fields
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [severity, setSeverity] = useState<IssueSeverity>(issue.severity);
  const [linkedReportId, setLinkedReportId] = useState<string>(issue.linkedReportId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(issue.title);
    setDescription(issue.description);
    setStatus(issue.status);
    setSeverity(issue.severity);
    setLinkedReportId(issue.linkedReportId || '');
    loadComments();
  }, [issue]);

  const loadComments = async () => {
    try {
      setLoadingComments(true);
      const data = await getComments(issue.id);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleFieldChange = async (updates: Partial<IssueItem>) => {
    const updated = { ...issue, ...updates };
    onUpdated(updated);
    await updateIssue(issue.id, updates);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentBody.trim() || !user) return;

    try {
      setSubmittingComment(true);
      const comment = await addComment(issue.id, {
        body: newCommentBody.trim(),
        authorUid: user.uid,
        authorEmail: user.email,
        authorName: user.displayName || user.email.split('@')[0],
      });
      setComments((prev) => [...prev, comment]);
      setNewCommentBody('');
      onUpdated({
        ...issue,
        commentsCount: (issue.commentsCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to add comment', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('deleteIssueConfirm'))) return;
    await deleteIssue(issue.id);
    onDeleted(issue.id);
    onClose();
  };

  if (!isOpen) return null;

  const statuses: IssueStatus[] = ['open', 'in_progress', 'done'];
  const severities: IssueSeverity[] = ['critical', 'major', 'minor'];
  const linkedReport = reports.find((r) => r.id === linkedReportId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-400">ID: {issue.id.slice(0, 8)}</span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">
              {t('createdAt')}: {new Date(issue.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              title={t('delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title input */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleFieldChange({ title })}
              className="w-full text-xl font-bold text-slate-900 border-b border-transparent hover:border-slate-200 focus:border-teal-500 focus:outline-none py-1"
            />
          </div>

          {/* Status & Severity selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                {t('issueStatus')}
              </label>
              <select
                value={status}
                onChange={(e) => {
                  const newStatus = e.target.value as IssueStatus;
                  setStatus(newStatus);
                  handleFieldChange({ status: newStatus });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
              >
                {statuses.map((st) => (
                  <option key={st} value={st}>
                    {getStatusLabel(st, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                {t('issueSeverity')}
              </label>
              <select
                value={severity}
                onChange={(e) => {
                  const newSev = e.target.value as IssueSeverity;
                  setSeverity(newSev);
                  handleFieldChange({ severity: newSev });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
              >
                {severities.map((sev) => (
                  <option key={sev} value={sev}>
                    {getSeverityLabel(sev, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                {t('linkedReportLabel')}
              </label>
              <select
                value={linkedReportId}
                onChange={(e) => {
                  const rId = e.target.value;
                  setLinkedReportId(rId);
                  handleFieldChange({ linkedReportId: rId || null });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
              >
                <option value="">{t('noneLinked')}</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.reportNumber} - {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linked report banner with direct link */}
          {linkedReport && (
            <div className="flex items-center justify-between rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-800">
              <div className="flex items-center gap-1.5 font-medium">
                <Link2 className="h-4 w-4 text-teal-600" />
                <span>
                  {lang === 'ar' ? 'مرتبط بالتقرير:' : 'Linked to report:'} #{linkedReport.reportNumber} - {linkedReport.title}
                </span>
              </div>
              <Link
                href={`/reports/${linkedReport.id}`}
                className="flex items-center gap-1 font-semibold text-teal-700 hover:underline"
              >
                <span>{lang === 'ar' ? 'فتح التقرير' : 'Open Report'}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {/* Description textarea */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
              {t('issueDescriptionLabel')}
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => handleFieldChange({ description })}
              placeholder={t('issueDescriptionPlaceholder')}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Comments Section */}
          <div className="border-t border-slate-200 pt-5">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
              <MessageSquare className="h-4 w-4 text-teal-600" />
              <span>{t('commentsLabel')}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {comments.length}
              </span>
            </h4>

            {/* Comments List */}
            {loadingComments ? (
              <div className="py-4 text-center text-xs text-slate-400">{t('loading')}</div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-400 italic mb-4">{t('noCommentsYet')}</p>
            ) : (
              <div className="space-y-3 mb-4">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-slate-500">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <UserIcon className="h-3 w-3 text-slate-400" />
                        <span>{comment.authorName || comment.authorEmail}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <Clock className="h-3 w-3" />
                        <span>
                          {new Date(comment.createdAt).toLocaleTimeString(
                            lang === 'ar' ? 'ar-EG' : 'en-US',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* New Comment Input Form */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                placeholder={t('writeCommentPlaceholder')}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submittingComment || !newCommentBody.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{t('submitComment')}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
