import { ReportItem } from './types';

/** Build a mailto: draft sharing the report (works without any SMTP backend). */
export function buildReportEmail(
  report: ReportItem,
  opts: { shareUrl?: string | null; issuesTotal?: number; closureRate?: number; lang?: 'ar' | 'en' }
): { mailto: string; subject: string; body: string } {
  const isAr = (opts.lang || report.language || 'ar') === 'ar';
  const title = (report.title || (isAr ? 'تقرير' : 'Report')).trim();
  const subject = isAr ? `مشاركة التقرير: ${title} - #${report.reportNumber}` : `Sharing report: ${title} - #${report.reportNumber}`;
  const lines: string[] = [];
  lines.push(isAr ? `السلام عليكم،` : `Hello,`);
  lines.push('');
  lines.push(isAr ? `أشارك معك التقرير "${title}" (#${report.reportNumber}).` : `Sharing the report "${title}" (#${report.reportNumber}).`);
  if (typeof opts.issuesTotal === 'number') {
    lines.push(
      isAr
        ? `إجمالي المشاكل: ${opts.issuesTotal}${typeof opts.closureRate === 'number' ? ` — نسبة الإغلاق: ${opts.closureRate}٪` : ''}`
        : `Total issues: ${opts.issuesTotal}${typeof opts.closureRate === 'number' ? ` — closure: ${opts.closureRate}%` : ''}`
    );
  }
  if (opts.shareUrl) {
    lines.push('');
    lines.push(isAr ? `رابط المشاركة (قراءة فقط):` : `Read-only share link:`);
    lines.push(opts.shareUrl);
  } else {
    lines.push('');
    lines.push(
      isAr
        ? `ملاحظة: التقرير خاص حاليًا — فعّل "مشاركة ويب" من التطبيق للحصول على رابط قراءة.`
        : `Note: the report is currently private — enable "Share Web" in the app to get a read link.`
    );
  }
  lines.push('');
  lines.push(isAr ? `النظام قيد المراجعة: ${report.systemUnderReview || '-'}` : `System under review: ${report.systemUnderReview || '-'}`);
  lines.push(isAr ? `المُعد: ${report.author || '-'}${report.organization ? ` — ${report.organization}` : ''}` : `Author: ${report.author || '-'}${report.organization ? ` — ${report.organization}` : ''}`);
  const body = lines.join('\n');
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { mailto, subject, body };
}

/**
 * Notify a collaborator about their invite (works without any SMTP backend).
 * IMPORTANT product note: invites are access grants, not delivered emails —
 * the invitee must register/sign in with the exact invited address, then the
 * shared report appears automatically. This draft tells them exactly that.
 */
export function buildInviteEmail(
  email: string,
  subjectName: string,
  kind: 'report' | 'folder',
  lang: 'ar' | 'en'
): { mailto: string; subject: string; body: string } {
  const isAr = lang === 'ar';
  const what = isAr ? (kind === 'report' ? 'التقرير' : 'المجلد') : kind === 'report' ? 'the report' : 'the folder';
  const subject = isAr ? `دعوة للتعاون: ${subjectName}` : `Collaboration invite: ${subjectName}`;
  const lines: string[] = [];
  lines.push(isAr ? 'السلام عليكم،' : 'Hello,');
  lines.push('');
  lines.push(
    isAr
      ? `تمت دعوتك للتعاون على ${what} "${subjectName}".`
      : `You've been invited to collaborate on ${what} "${subjectName}".`
  );
  lines.push(
    isAr
      ? `الخطوة المطلوبة: سجّل في التطبيق بهذا البريد بالضبط (${email}) وستجد المحتوى المشترك تلقائيًا في حسابك.`
      : `Required step: sign up/sign in with exactly this email (${email}) and the shared content appears automatically.`
  );
  const body = lines.join('\n');
  return { mailto: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, subject, body };
}

/** WhatsApp share link for an invite (no phone needed — user picks the chat). */
export function buildInviteWhatsApp(subject: string, body: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${subject}\n\n${body}`)}`;
}
