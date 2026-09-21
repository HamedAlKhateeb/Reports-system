'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Trash2,
  Send,
  MessageSquare,
  Clock,
  User as UserIcon,
  Link2,
  ExternalLink,
  Archive,
  ArchiveRestore,
  UserCheck,
  Timer,
} from 'lucide-react';
import { IssueItem, CommentItem, ReportItem } from '@/lib/types';
import { getComments, addComment, updateIssue, deleteIssue, unarchiveIssue, isArchivedIssue } from '@/lib/db';
import { archiveIssue } from '@/lib/db-intelligence';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { useProject } from '@/lib/project-context';
import { usePomodoro } from '@/lib/pomodoro-context';
import { createNotification } from '@/lib/notifications-db';
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
import { useConfirm } from '@/components/ui/confirm-dialog';
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
  const { team } = useProject();
  const { activeTask, isRunning, startTaskPomodoro } = usePomodoro();
  const teamMembers = team?.members || [];

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmNode, askConfirm] = useConfirm();

  // Editable fields
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [status, setStatus] = useState<IssueStatus>(normalizeStatus(issue.status));
  const [severity, setSeverity] = useState<IssueSeverity>(normalizeSeverity(issue.severity));
  const [linkedReportId, setLinkedReportId] = useState<string>(issue.linkedReportId || (issue as any).reportId || '');
  const [assigneeEmail, setAssigneeEmail] = useState<string>(issue.assigneeEmail || '');

  const loadComments = useCallback(async () => {
    try {
      setLoadingComments(true);
      const data = await getComments(issue.id);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments', err);
    } finally {
      setLoadingComments(false);
    }
  }, [issue.id]);

  useEffect(() => {
    setTitle(issue.title);
    setDescription(issue.description);
    setStatus(normalizeStatus(issue.status));
    setSeverity(normalizeSeverity(issue.severity));
    setLinkedReportId(issue.linkedReportId || (issue as any).reportId || '');
    setAssigneeEmail(issue.assigneeEmail || '');
    loadComments();
  }, [issue, loadComments]);

  const handleFieldChange = async (updates: Partial<IssueItem>) => {
    const updated = { ...issue, ...updates };
    onUpdated(updated);
    await updateIssue(issue.id, updates);

    // 1. Task Assignment Notification: when assigned to someone other than current user
    if (
      updates.assigneeEmail &&
      updates.assigneeEmail !== user?.email
    ) {
      void createNotification({
        recipientUid: updates.assigneeUid || updates.assigneeEmail,
        recipientEmail: updates.assigneeEmail || undefined,
        senderUid: user?.uid || 'user',
        senderName: user?.displayName || user?.email?.split('@')[0] || (lang === 'ar' ? 'أحد الأعضاء' : 'A Member'),
        type: 'task_assigned',
        title: lang === 'ar' ? 'تم تعيين مهمة جديدة لك' : 'New task assigned to you',
        body: lang === 'ar'
          ? `قام ${user?.displayName || user?.email?.split('@')[0] || 'أحد الأعضاء'} بتعيين المهمة "${issue.title}" لك.`
          : `${user?.displayName || user?.email?.split('@')[0] || 'A member'} assigned task "${issue.title}" to you.`,
        link: '/dashboard',
        entityId: issue.id,
      });
    }

    // 2. Task Update Notification: when status or severity changes
    if ((updates.status || updates.severity) && issue.assigneeUid && issue.assigneeUid !== user?.uid) {
      void createNotification({
        recipientUid: issue.assigneeUid,
        recipientEmail: issue.assigneeEmail || undefined,
        senderUid: user?.uid || 'user',
        senderName: user?.displayName || user?.email?.split('@')[0] || (lang === 'ar' ? 'أحد الأعضاء' : 'A Member'),
        type: 'task_updated',
        title: lang === 'ar' ? 'تحديث على المهمة' : 'Task updated',
        body: lang === 'ar'
          ? `تم تحديث تفاصيل المهمة "${issue.title}".`
          : `Task "${issue.title}" details were updated.`,
        link: '/dashboard',
        entityId: issue.id,
      });
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const commentBody = newCommentBody.trim();
    if (!commentBody || !user) return;

    try {
      setSubmittingComment(true);
      const comment = await addComment(issue.id, {
        body: commentBody,
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

      // 3. Comments & Mentions Notifications
      const recipientsToNotify = new Set<string>();
      if (issue.assigneeUid && issue.assigneeUid !== user.uid) {
        recipientsToNotify.add(issue.assigneeUid);
      }
      if (issue.ownerUid && issue.ownerUid !== user.uid) {
        recipientsToNotify.add(issue.ownerUid);
      }

      // Check for mentions: e.g. @email or @name
      teamMembers.forEach((m) => {
        const mUid = m.userId || m.email;
        if (mUid && mUid !== user.uid && m.email !== user.email) {
          if (
            commentBody.includes(`@${m.email}`) ||
            (m.name && commentBody.includes(`@${m.name}`))
          ) {
            recipientsToNotify.delete(mUid); // Don't send both mention & comment to same person
            void createNotification({
              recipientUid: mUid,
              recipientEmail: m.email,
              senderUid: user.uid,
              senderName: user.displayName || user.email.split('@')[0],
              type: 'mention',
              title: lang === 'ar' ? 'تمت الإشارة إليك في تعليق' : 'You were mentioned in a comment',
              body: lang === 'ar'
                ? `أشار إليك ${user.displayName || user.email.split('@')[0]} في تعليق على "${issue.title}": "${commentBody.slice(0, 60)}..."`
                : `${user.displayName || user.email.split('@')[0]} mentioned you in "${issue.title}": "${commentBody.slice(0, 60)}..."`,
              link: '/dashboard',
              entityId: issue.id,
            });
          }
        }
      });

      recipientsToNotify.forEach((recipUid) => {
        const member = teamMembers.find((m) => (m.userId || m.email) === recipUid);
        void createNotification({
          recipientUid: recipUid,
          recipientEmail: member?.email || (issue.assigneeUid === recipUid ? (issue.assigneeEmail || undefined) : undefined),
          senderUid: user.uid,
          senderName: user.displayName || user.email.split('@')[0],
          type: 'comment_added',
          title: lang === 'ar' ? 'تعليق جديد على المهمة' : 'New comment on task',
          body: lang === 'ar'
            ? `علّق ${user.displayName || user.email.split('@')[0]} على "${issue.title}": "${commentBody.slice(0, 60)}..."`
            : `${user.displayName || user.email.split('@')[0]} commented on "${issue.title}": "${commentBody.slice(0, 60)}..."`,
          link: '/dashboard',
          entityId: issue.id,
        });
      });
    } catch (err) {
      console.error('Failed to add comment', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!(await askConfirm(t('deleteIssueConfirm')))) return;
    await deleteIssue(issue.id);
    onDeleted(issue.id);
    onClose();
  };

  // Archive lifecycle (owner only — enforced in db + rules).
  const handleArchive = async () => {
    if (!user) return;
    if (!(await askConfirm(lang === 'ar' ? 'أرشفة هذه المشكلة؟ ستختفي من اللوحة ويمكن استعادتها لاحقًا.' : 'Archive this issue? It will leave the board and can be restored later.'))) {
      return;
    }
    try {
      setArchiving(true);
      await archiveIssue(issue.id, user.uid, 'Archived from dashboard');
      const now = new Date().toISOString();
      onUpdated({ ...issue, archived_at: now, archivedAt: now, updatedAt: now });
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async () => {
    if (!user) return;
    try {
      setArchiving(true);
      const res = await unarchiveIssue(issue.id, user.uid);
      if (!res.ok) return;
      onUpdated({ ...issue, archived_at: null, archivedAt: null, updatedAt: new Date().toISOString() });
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  const statuses: IssueStatus[] = ['open', 'in_progress', 'done'];
  const severities: IssueSeverity[] = ['critical', 'major', 'medium', 'normal', 'minor'];
  const linkedReport = reports.find((r) => r.id === linkedReportId);
  // Collaboration: ownership/linkage management + delete stay owner-only
  // (rules deny otherwise); editing fields and commenting stay open.
  const isIssueOwner = !!user && issue.ownerUid === user.uid;

  return (
    <>
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
            {isIssueOwner && !isArchivedIssue(issue) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="size-8 text-muted-foreground hover:bg-muted"
                title={lang === 'ar' ? 'أرشفة المشكلة' : 'Archive issue'}
              >
                <Archive className="size-4" />
              </Button>
            )}
            {isIssueOwner && isArchivedIssue(issue) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleRestore()}
                disabled={archiving}
                className="size-8 text-muted-foreground hover:bg-muted"
                title={lang === 'ar' ? 'استعادة من الأرشيف' : 'Restore from archive'}
              >
                <ArchiveRestore className="size-4" />
              </Button>
            )}
            {isIssueOwner && (
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
            )}
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

          {/* Status, Severity, Assignee & Linked Report selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 rounded-xl bg-muted/30 p-4 border border-border">
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
              <FieldLabel className="text-[11px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                <UserCheck className="size-3 text-primary" />
                <span>{lang === 'ar' ? 'المسؤول' : 'Assignee'}</span>
              </FieldLabel>
              <select
                value={assigneeEmail}
                onChange={(e) => {
                  const val = e.target.value;
                  setAssigneeEmail(val);
                  if (!val) {
                    handleFieldChange({ assigneeUid: null, assigneeEmail: null, assigneeName: null });
                  } else {
                    const member = teamMembers.find((m) => m.email === val);
                    const name = member?.name || (user?.email === val ? user.displayName : undefined) || val.split('@')[0];
                    const uid = member?.userId || (user?.email === val ? user.uid : undefined) || val;
                    handleFieldChange({ assigneeUid: uid, assigneeEmail: val, assigneeName: name });
                  }
                }}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{lang === 'ar' ? 'غير معيّنة' : 'Unassigned'}</option>
                {user?.email && (
                  <option value={user.email}>
                    {user.displayName ? `${user.displayName} (أنا / Me)` : `${user.email} (أنا / Me)`}
                  </option>
                )}
                {teamMembers
                  .filter((m) => m.email !== user?.email)
                  .map((m) => (
                    <option key={m.id} value={m.email}>
                      {m.name ? `${m.name} (${m.email})` : m.email}
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
                disabled={!isIssueOwner}
                onChange={(e) => {
                  const rId = e.target.value;
                  setLinkedReportId(rId);
                  handleFieldChange({ linkedReportId: rId || null });
                }}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                title={isIssueOwner ? undefined : (lang === 'ar' ? 'فقط مالك المشكلة يمكنه تغيير الارتباط' : 'Only the issue owner can change the linkage')}
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

          {/* Pomodoro Focus Section */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/10">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center text-lg shadow-2xs">
                🍅
              </div>
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-2">
                  <span>{lang === 'ar' ? 'جلسات بومودورو للتركيز' : 'Pomodoro Focus'}</span>
                  {activeTask?.id === issue.id && isRunning && (
                    <Badge variant="destructive" className="text-[10px] py-0 px-1.5 animate-pulse">
                      {lang === 'ar' ? 'جلسة جارية الآن' : 'Session Running'}
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {issue.pomodoroSessions && issue.pomodoroSessions > 0 ? (
                    lang === 'ar'
                      ? `تم إنجاز ${issue.pomodoroSessions} جلسة (${issue.timeSpentMinutes || 0} دقيقة من التركيز)`
                      : `Completed ${issue.pomodoroSessions} session(s) (${issue.timeSpentMinutes || 0} mins focused)`
                  ) : (
                    lang === 'ar' ? 'لم يتم تسجيل أي جلسة تركيز لهذه المهمة بعد' : 'No focus sessions recorded yet'
                  )}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant={activeTask?.id === issue.id && isRunning ? "outline" : "default"}
              size="sm"
              onClick={() => {
                startTaskPomodoro(issue.id, title || issue.title);
              }}
              className="gap-1.5 text-xs font-bold"
            >
              <Timer className="size-3.5" />
              <span>
                {activeTask?.id === issue.id && isRunning
                  ? (lang === 'ar' ? 'عرض المؤقت النشط' : 'View Active Timer')
                  : (lang === 'ar' ? 'بدء بومودورو للمهمة' : 'Start Task Pomodoro')}
              </span>
            </Button>
          </div>

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
    {confirmNode}
    </>
  );
}
