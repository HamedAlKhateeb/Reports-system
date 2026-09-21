'use client';

import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { IssueItem, ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { useProject } from '@/lib/project-context';
import { createNotification } from '@/lib/notifications-db';
import {
  getStatusLabel,
  getSeverityLabel,
  IssueSeverity,
  IssueStatus,
} from '@/lib/i18n/dictionary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
  const { user } = useAuth();
  const { team, activeProject } = useProject();
  const teamMembers = team?.members || [];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<IssueStatus>('open');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [linkedReportId, setLinkedReportId] = useState<string>('');
  const [assigneeEmail, setAssigneeEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setSubmitting(true);
      const member = teamMembers.find((m) => m.email === assigneeEmail);
      const name = member?.name || (user?.email === assigneeEmail ? user.displayName : undefined) || (assigneeEmail ? assigneeEmail.split('@')[0] : null);
      const uid = member?.userId || (user?.email === assigneeEmail ? user.uid : undefined) || (assigneeEmail || null);

      await onCreate({
        title: title.trim(),
        description: description.trim(),
        status,
        severity,
        linkedReportId: linkedReportId || null,
        assigneeUid: uid,
        assigneeEmail: assigneeEmail || null,
        assigneeName: name,
        projectId: activeProject?.id,
      });

      if ((uid || assigneeEmail) && uid !== user?.uid && assigneeEmail !== user?.email) {
        try {
          await createNotification({
            recipientUid: uid || assigneeEmail,
            recipientEmail: assigneeEmail || undefined,
            senderUid: user?.uid || null,
            senderName: user?.displayName || user?.email || 'Someone',
            type: 'task_assigned',
            title: lang === 'ar' ? 'تم تعيين مهمة جديدة لك' : 'New task assigned to you',
            titleAr: 'تم تعيين مهمة جديدة لك',
            titleEn: 'New task assigned to you',
            body: lang === 'ar'
              ? `قام ${user?.displayName || user?.email || 'مستخدم'} بتعيين المهمة "${title.trim()}" لك`
              : `${user?.displayName || user?.email || 'Someone'} assigned the task "${title.trim()}" to you`,
            bodyAr: `قام ${user?.displayName || user?.email || 'مستخدم'} بتعيين المهمة "${title.trim()}" لك`,
            bodyEn: `${user?.displayName || user?.email || 'Someone'} assigned the task "${title.trim()}" to you`,
            link: '/dashboard',
          });
        } catch (notifErr) {
          console.error('Failed to notify assignee:', notifErr);
        }
      }

      setTitle('');
      setDescription('');
      setStatus('open');
      setSeverity('medium');
      setLinkedReportId('');
      setAssigneeEmail('');
      onClose();
    } catch (err) {
      console.error('Failed to create issue', err);
    } finally {
      setSubmitting(false);
    }
  };

  const statuses: IssueStatus[] = ['open', 'in_progress', 'done'];
  const severities: IssueSeverity[] = ['critical', 'major', 'medium', 'normal', 'minor'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{t('addNewIssue')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel required>{t('issueTitleLabel')}</FieldLabel>
              <Input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('issueTitlePlaceholder')}
              />
            </Field>

            <Field>
              <FieldLabel>{t('issueDescriptionLabel')}</FieldLabel>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('issueDescriptionPlaceholder')}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t('issueSeverity')}</FieldLabel>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {severities.map((s) => (
                    <option key={s} value={s}>
                      {getSeverityLabel(s, lang)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel>{t('issueStatus')}</FieldLabel>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as IssueStatus)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {statuses.map((st) => (
                    <option key={st} value={st}>
                      {getStatusLabel(st, lang)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field>
              <FieldLabel className="flex items-center gap-1">
                <UserCheck className="size-3.5 text-primary" />
                <span>{lang === 'ar' ? 'تعيين مسؤول عن المهمة' : 'Assign to'}</span>
              </FieldLabel>
              <select
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">{lang === 'ar' ? 'غير معيّنة (بدون مسؤول)' : 'Unassigned'}</option>
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
            </Field>

            <Field>
              <FieldLabel>{t('linkedReportLabel')}</FieldLabel>
              <select
                value={linkedReportId}
                onChange={(e) => setLinkedReportId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">{t('noneLinked')}</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.reportNumber} - {r.title}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGroup>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? t('loading') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
