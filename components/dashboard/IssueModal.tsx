'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Trash2,
  Send,
  MessageSquare,
  Clock,
  User as UserIcon,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { IssueItem, CommentItem, ReportItem } from '@/lib/types';
import { getComments, addComment, updateIssue, deleteIssue } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import {
  getStatusLabel,
  getSeverityLabel,
  normalizeSeverity,
  normalizeStatus,
  IssueSeverity,
  IssueStatus,
} from '@/lib/i18n/dictionary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FieldLabel } from '@/components/ui/field';

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
  const [status, setStatus] = useState<IssueStatus>(normalizeStatus(issue.status));
  const [severity, setSeverity] = useState<IssueSeverity>(normalizeSeverity(issue.severity));
  const [linkedReportId, setLinkedReportId] = useState<string>(issue.linkedReportId || (issue as any).reportId || '');

  useEffect(() => {
    setTitle(issue.title);
    setDescription(issue.description);
    setStatus(normalizeStatus(issue.status));
    setSeverity(normalizeSeverity(issue.severity));
    setLinkedReportId(issue.linkedReportId || (issue as any).reportId || '');
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

  const statuses: IssueStatus[] = ['open', 'in_progress', 'done'];
  const severities: IssueSeverity[] = ['critical', 'major', 'medium', 'normal', 'minor'];
  const linkedReport = reports.find((r) => r.id === linkedReportId);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Modal Header */}
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-6 py-4 bg-muted/20 space-y-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-muted-foreground">
              ID: {issue.id.slice(0, 8)}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {t('createdAt')}:{' '}
              {new Date(issue.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={t('delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title input */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleFieldChange({ title })}
              className="w-full text-xl font-bold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-1 transition-colors"
            />
          </div>

          {/* Status & Severity selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-muted/30 p-4 border border-border">
            <div>
              <FieldLabel className="text-[11px] font-bold uppercase text-muted-foreground mb-1">
                {t('issueStatus')}
              </FieldLabel>
              <select
                value={status}
                onChange={(e) => {
                  const newStatus = e.target.value as IssueStatus;
                  setStatus(newStatus);
                  handleFieldChange({ status: newStatus });
                }}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {statuses.map((st) => (
                  <option key={st} value={st}>
                    {getStatusLabel(st, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel className="text-[11px] font-bold uppercase text-muted-foreground mb-1">
                {t('issueSeverity')}
              </FieldLabel>
              <select
                value={severity}
                onChange={(e) => {
                  const newSev = e.target.value as IssueSeverity;
                  setSeverity(newSev);
                  handleFieldChange({ severity: newSev });
                }}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {severities.map((sev) => (
                  <option key={sev} value={sev}>
                    {getSeverityLabel(sev, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel className="text-[11px] font-bold uppercase text-muted-foreground mb-1">
                {t('linkedReportLabel')}
              </FieldLabel>
              <select
                value={linkedReportId}
                onChange={(e) => {
                  const rId = e.target.value;
                  setLinkedReportId(rId);
                  handleFieldChange({ linkedReportId: rId || null });
                }}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary">
              <div className="flex items-center gap-1.5 font-medium">
                <Link2 className="size-4 text-primary" />
                <span>
                  {lang === 'ar' ? 'مرتبط بالتقرير:' : 'Linked to report:'} #{linkedReport.reportNumber} - {linkedReport.title}
                </span>
              </div>
              <Link
                href={`/reports/${linkedReport.id}`}
                className="flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <span>{lang === 'ar' ? 'فتح التقرير' : 'Open Report'}</span>
                <ExternalLink className="size-3.5" />
              </Link>
            </div>
          )}

          {issue.sourceSection && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border/80 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {lang === 'ar' ? 'مصدر المشكلة:' : 'Source Section:'}
              </span>
              <span>{issue.sourceSection}</span>
            </div>
          )}

          {/* Description textarea */}
          <div>
            <FieldLabel className="text-xs font-bold uppercase text-muted-foreground mb-1.5">
              {t('issueDescriptionLabel')}
            </FieldLabel>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => handleFieldChange({ description })}
              placeholder={t('issueDescriptionPlaceholder')}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
            />
          </div>

          {/* Comments Section */}
          <div className="border-t border-border pt-5">
            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
              <MessageSquare className="size-4 text-primary" />
              <span>{t('commentsLabel')}</span>
              <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                {comments.length}
              </Badge>
            </h4>

            {/* Comments List */}
            {loadingComments ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t('loading')}</div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic mb-4">{t('noCommentsYet')}</p>
            ) : (
              <div className="space-y-3 mb-4">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-lg border border-border bg-muted/40 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <UserIcon className="size-3 text-muted-foreground" />
                        <span>{comment.authorName || comment.authorEmail}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <Clock className="size-3" />
                        <span>
                          {new Date(comment.createdAt).toLocaleTimeString(
                            lang === 'ar' ? 'ar-EG' : 'en-US',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* New Comment Input Form */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <Input
                type="text"
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                placeholder={t('writeCommentPlaceholder')}
                className="flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={submittingComment || !newCommentBody.trim()}
                className="gap-1.5 text-xs"
              >
                <Send data-icon="inline-start" />
                <span>{t('submitComment')}</span>
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
