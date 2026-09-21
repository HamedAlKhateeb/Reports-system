/**
 * NOTIFICATION SYSTEM DATA TYPES & SCHEMAS
 */

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'comment_added'
  | 'mention'
  | 'report_shared'
  | 'team_invited'
  | 'project_invited'
  | 'message_received';

export interface AppNotification {
  id: string;
  recipientUid: string;       // Recipient user UID
  recipientEmail?: string | null;    // Recipient email (normalized lowercase)
  senderUid: string;          // Author / Actor UID
  senderName: string;         // Author / Actor Display Name
  type: NotificationType;
  title: string;              // Notification title
  titleAr?: string;
  titleEn?: string;
  body: string;               // Notification message description
  bodyAr?: string;
  bodyEn?: string;
  link?: string;              // Target navigation URL (e.g. /dashboard or /boards or /reports/...)
  entityId?: string;          // Associated entity ID (task ID, issue ID, report ID)
  read: boolean;
  readAt?: string | null;
  createdAt: string;          // ISO 8601 string
}

export interface CreateNotificationPayload {
  recipientUid?: string | null;
  recipientEmail?: string | null;
  senderUid?: string | null;
  senderName?: string | null;
  type: NotificationType;
  title: string;
  titleAr?: string;
  titleEn?: string;
  body: string;
  bodyAr?: string;
  bodyEn?: string;
  link?: string;
  entityId?: string;
}
