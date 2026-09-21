/**
 * MESSAGING SYSTEM DATA MODEL & TYPES
 *
 * Dedicated data model for team/user direct messaging, inspired by Khamsat.
 */

export interface MessageItem {
  id: string;
  conversationId: string;
  senderUid: string;
  senderName: string;
  senderEmail?: string;
  senderAvatar?: string;
  recipientUid: string;
  recipientName: string;
  recipientEmail?: string;
  subject: string;
  content: string;
  createdAt: string; // ISO 8601
  read: boolean;
}

export interface ConversationItem {
  id: string;
  participantUids: string[];
  participantEmails?: string[];
  participants: Array<{
    uid: string;
    name: string;
    email?: string;
    avatar?: string;
  }>;
  subject: string;
  lastMessage: string;
  lastMessageAt: string; // ISO 8601
  lastSenderUid: string;
  unreadCount: Record<string, number>; // keyed by userUid
  createdAt: string;
  updatedAt: string;
}

export interface SendMessagePayload {
  recipientUid: string;
  recipientName: string;
  recipientEmail?: string;
  subject: string;
  content: string;
  conversationId?: string;
}
