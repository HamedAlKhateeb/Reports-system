'use client';

import React, { useRef, useState } from 'react';
import { AlertTriangle, Check, DatabaseBackup, Download, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  buildUserBackup,
  downloadBackup,
  estimateUserDataSize,
  parseBackupFile,
  restoreUserBackup,
  type BackupProgress,
} from '@/lib/backup';

function formatBytes(n: number, isAr: boolean): string {
  if (n < 0) return isAr ? 'غير معروف' : 'unknown';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupSettings() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isAr = lang === 'ar';
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [size, setSize] = useState<number | null>(null);
  const [busy, setBusy] = useState<'idle' | 'estimating' | 'exporting' | 'importing'>('idle');
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onProgress = (p: BackupProgress) => setProgress(p);

  const handleEstimate = async () => {
    if (!user || busy !== 'idle') return;
    setBusy('estimating');
    setNotice(null);
    try {
      const bytes = await estimateUserDataSize(user.uid, (user as any).email);
      setSize(bytes);
    } finally {
      setBusy('idle');
    }
  };

  const handleExport = async () => {
    if (!user || busy !== 'idle') return;
    setBusy('exporting');
    setNotice(null);
    setProgress(null);
    try {
      const file = await buildUserBackup(user.uid, (user as any).email, onProgress);
      downloadBackup(file, lang);
      setNotice({
        kind: 'ok',
        text: isAr
          ? `تم تنزيل النسخة الاحتياطية (${file.counts.reports} تقارير، ${file.counts.issues} مشاكل، ${file.counts.folders} مجلدات، ${file.counts.images} صور).`
          : `Backup downloaded (${file.counts.reports} reports, ${file.counts.issues} issues, ${file.counts.folders} folders, ${file.counts.images} images).`,
      });
    } catch (e: any) {
      setNotice({ kind: 'err', text: isAr ? `فشل التصدير: ${e?.message || e}` : `Export failed: ${e?.message || e}` });
    } finally {
      setBusy('idle');
      setProgress(null);
    }
  };

  const handleImportFile = async (f: File) => {
    if (!user || busy !== 'idle') return;
    setBusy('importing');
    setNotice(null);
    setProgress(null);
    try {
      const text = await f.text();
      const parsed = parseBackupFile(text);
      await restoreUserBackup(user.uid, parsed, onProgress);
      setNotice({
        kind: 'ok',
        text: isAr
          ? `تمت الاستعادة بالدمج (${parsed.counts.reports} تقارير، ${parsed.counts.issues} مشاكل). حدّث الصفحات لرؤية البيانات.`
          : `Merge-restore done (${parsed.counts.reports} reports, ${parsed.counts.issues} issues). Refresh pages to see the data.`,
      });
      try {
        window.dispatchEvent(new CustomEvent('report-updated', { detail: {} }));
        window.dispatchEvent(new CustomEvent('issue-updated', { detail: {} }));
      } catch {}
    } catch (e: any) {
      const msg = String(e?.message || e);
      const friendly =
        msg === 'invalid-json'
          ? isAr ? 'الملف ليس JSON صالحًا.' : 'File is not valid JSON.'
          : msg === 'not-a-backup-file'
            ? isAr ? 'هذا الملف ليس نسخة احتياطية من هذا التطبيق.' : 'Not a backup file from this app.'
            : msg === 'unsupported-backup-version'
              ? isAr ? 'إصدار النسخة غير مدعوم — حدّث التطبيق أولًا.' : 'Unsupported backup version — update the app first.'
              : msg === 'storage-full'
                ? isAr ? 'مساحة التخزين ممتلئة — الاستعادة المحلية فشلت.' : 'Local storage full — restore failed.'
                : isAr ? `فشلت الاستعادة: ${msg}` : `Restore failed: ${msg}`;
      setNotice({ kind: 'err', text: friendly });
    } finally {
      setBusy('idle');
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in min-w-0">
      <Card className="p-5 sm:p-6 min-w-0">
        <div className="flex items-center gap-2.5 mb-1.5">
          <DatabaseBackup className="size-5 text-primary shrink-0" />
          <h2 className="text-sm font-bold text-foreground">
            {isAr ? 'النسخ الاحتياطي للبيانات' : 'Data backup'}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {isAr
            ? 'نزّل نسخة كاملة (تقارير + مجلدات + مشاكل + صور + تعليقات) كملف JSON، واستعدها بالدمج في أي وقت. الاستعادة لا تحذف شيئًا — تدمج فقط.'
            : 'Download a full snapshot (reports + folders + issues + images + comments) as JSON, and merge-restore it anytime. Restore never deletes — it only merges.'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy !== 'idle' || !user} onClick={handleEstimate}>
            {busy === 'estimating' ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {isAr ? 'حساب الحجم' : 'Estimate size'}
          </Button>
          {size !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {isAr ? 'الحجم التقريبي: ' : 'Approx size: '}{formatBytes(size, isAr)}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={busy !== 'idle' || !user} onClick={handleExport}>
            {busy === 'exporting' ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {isAr ? 'تنزيل نسخة احتياطية' : 'Download backup'}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy !== 'idle' || !user} onClick={() => fileRef.current?.click()}>
            {busy === 'importing' ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {isAr ? 'استعادة من ملف' : 'Restore from file'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
        </div>

        {progress && busy !== 'idle' && (
          <p className="mt-3 text-[11px] text-muted-foreground" role="status" aria-live="polite">
            {isAr ? `جارٍ العمل: ${progress.stage} (${progress.done}/${progress.total})…` : `Working: ${progress.stage} (${progress.done}/${progress.total})…`}
          </p>
        )}

        {notice && (
          <div
            role={notice.kind === 'err' ? 'alert' : 'status'}
            className={
              notice.kind === 'err'
                ? 'mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive'
                : 'mt-3 flex items-start gap-2 rounded-lg border border-emerald-300/40 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'
            }
          >
            {notice.kind === 'err' ? <AlertTriangle className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        {!user && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {isAr ? 'سجّل الدخول أولًا لاستخدام النسخ الاحتياطي.' : 'Sign in first to use backup.'}
          </p>
        )}
      </Card>
    </div>
  );
}
