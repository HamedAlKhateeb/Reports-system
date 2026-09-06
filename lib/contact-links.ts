export type ContactLinkType =
  | 'phone'
  | 'email'
  | 'website'
  | 'linkedin'
  | 'twitter'
  | 'whatsapp'
  | 'telegram'
  | 'github'
  | 'other';

export interface ContactLinkItem {
  id: string;
  type: ContactLinkType;
  label?: string;
  value: string;
}

export const REPORT_CONTACT_LINKS_KEY = 'report_contact_links';

export function getReportContactLinks(userUid?: string): ContactLinkItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = userUid ? `${REPORT_CONTACT_LINKS_KEY}_${userUid}` : REPORT_CONTACT_LINKS_KEY;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    if (userUid) {
      const fallback = localStorage.getItem(REPORT_CONTACT_LINKS_KEY);
      if (fallback) return JSON.parse(fallback);
    }
    return [];
  } catch (err) {
    console.error('Failed to load contact links', err);
    return [];
  }
}

export function saveReportContactLinks(links: ContactLinkItem[], userUid?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = userUid ? `${REPORT_CONTACT_LINKS_KEY}_${userUid}` : REPORT_CONTACT_LINKS_KEY;
    localStorage.setItem(key, JSON.stringify(links));
    localStorage.setItem(REPORT_CONTACT_LINKS_KEY, JSON.stringify(links));
  } catch (err) {
    console.error('Failed to save contact links', err);
  }
}

export const CONTACT_LINK_TYPES: { type: ContactLinkType; labelAr: string; labelEn: string; placeholder: string; prefix?: string }[] = [
  { type: 'phone', labelAr: 'رقم الهاتف (واتساب مباشر)', labelEn: 'Phone Number (Direct WhatsApp)', placeholder: '+20 100 514 0086' },
  { type: 'whatsapp', labelAr: 'واتساب', labelEn: 'WhatsApp', placeholder: '+20 100 514 0086' },
  { type: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email Address', placeholder: 'auditor@example.com' },
  { type: 'website', labelAr: 'الموقع الإلكتروني', labelEn: 'Website', placeholder: 'https://example.com' },
  { type: 'linkedin', labelAr: 'لينكد إن (LinkedIn)', labelEn: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
  { type: 'twitter', labelAr: 'منصة إكس (X / Twitter)', labelEn: 'X (Twitter)', placeholder: 'https://x.com/username' },
  { type: 'telegram', labelAr: 'تيليجرام (Telegram)', labelEn: 'Telegram', placeholder: 'https://t.me/username' },
  { type: 'github', labelAr: 'جيت هاب (GitHub)', labelEn: 'GitHub', placeholder: 'https://github.com/username' },
  { type: 'other', labelAr: 'رابط آخر', labelEn: 'Other Link', placeholder: 'https://...' },
];

export function formatWhatsAppUrl(phoneOrValue: string): string {
  if (!phoneOrValue) return '';
  // Remove all non-digits
  let digits = phoneOrValue.replace(/\D/g, '');
  // Remove leading zeros (e.g. 0020100... -> 20100...)
  digits = digits.replace(/^0+/, '');
  return `https://wa.me/${digits}`;
}
