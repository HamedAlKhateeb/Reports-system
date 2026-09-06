import { AppLanguage, IssueSeverity, IssueStatus } from './i18n/dictionary';

export interface ReportItem {
  id: string;
  reportNumber: number;
  title: string;
  language: AppLanguage; // Content language of this specific report
  author: string;
  authorTitle?: string;       // Job title / المنصب الوظيفي (e.g. مدقق جودة أول)
  organization?: string;      // Organization / Dept / الجهة أو القسم
  reviewerEmail?: string;     // Reviewer email / البريد
  signatureType?: 'text' | 'draw' | 'image'; // Type of signature
  signatureData?: string;     // Text representation, canvas data URL, or image URL
  themeColor?: string;        // 'olive' | 'blue' | 'slate' | 'emerald' | 'amber'
  backgroundColor?: string;   // 'white' | 'cream' | 'cool'
  systemUnderReview: string;
  contentJson: any; // TipTap JSON
  ownerUid: string;
  createdAt: string; // ISO string or Firestore Timestamp
  updatedAt: string;
}

export interface ReportImageItem {
  id: string;
  reportId: string;
  sequenceNumber: number; // Immutable automatic number (e.g. 1 -> صورة-1.png)
  fileName: string;       // e.g. "صورة-1.png"
  storagePath: string;
  downloadUrl: string;
  caption: string;        // Editable caption by user
  createdAt: string;
}

export interface IssueItem {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;     // 'open' | 'in_progress' | 'done'
  severity: IssueSeverity; // 'critical' | 'major' | 'minor'
  linkedReportId: string | null;
  createdAt: string;
  updatedAt: string;
  commentsCount?: number;
}

export interface CommentItem {
  id: string;
  issueId: string;
  body: string;
  authorUid: string;
  authorEmail: string;
  authorName?: string;
  createdAt: string;
}

export interface AuthorizedUser {
  email: string;
  role?: 'admin' | 'reviewer';
  addedAt?: string;
}
