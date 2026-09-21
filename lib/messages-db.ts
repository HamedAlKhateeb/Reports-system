/**
 * MESSAGING PERSISTENCE & SERVICE (KHAMSAT STYLE)
 *
 * Provides dual-layer Firestore and LocalStorage persistence for user-to-user
 * messages and conversations, with Khamsat-style time formatting and unread badges.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type { MessageItem, ConversationItem, SendMessagePayload } from './messages-types';
import { createNotification } from './notifications-db';

const LOCAL_CONVERSATIONS_KEY = 'review_app_conversations';
const LOCAL_MESSAGES_KEY = 'review_app_messages';

const memoryStore = new Map<string, string>();

function getLocal<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    const mem = memoryStore.get(key);
    return mem ? JSON.parse(mem) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): boolean {
  try {
    const str = JSON.stringify(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, str);
      return true;
    }
    memoryStore.set(key, str);
    return true;
  } catch (e) {
    console.error('Failed to save messages to storage', e);
    return false;
  }
}

/**
 * Formats time difference in authentic Khamsat Arabic style:
 * e.g. "منذ 7 أشهر و23 يوم", "منذ 8 أشهر و6 أيام", "منذ 3 ساعات", "منذ 5 دقائق", "الآن"
 */
export function formatKhamsatTimeAgo(dateStr: string, isArabic: boolean | 'ar' | 'en' = true): string {
  if (!dateStr) return '';
  const isAr = isArabic === true || isArabic === 'ar';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (!isAr) {
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }

  // Arabic Khamsat Formatting
  if (diffMin < 1) {
    return 'الآن';
  }
  if (diffMin < 60) {
    if (diffMin === 1) return 'منذ دقيقة';
    if (diffMin === 2) return 'منذ دقيقتين';
    if (diffMin >= 3 && diffMin <= 10) return `منذ ${diffMin} دقائق`;
    return `منذ ${diffMin} دقيقة`;
  }
  if (diffHours < 24) {
    if (diffHours === 1) return 'منذ ساعة';
    if (diffHours === 2) return 'منذ ساعتين';
    if (diffHours >= 3 && diffHours <= 10) return `منذ ${diffHours} ساعات`;
    return `منذ ${diffHours} ساعة`;
  }
  if (diffDays < 30) {
    if (diffDays === 1) return 'منذ يوم';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays >= 3 && diffDays <= 10) return `منذ ${diffDays} أيام`;
    return `منذ ${diffDays} يوماً`;
  }

  // Months + Days combined (exact Khamsat screenshot format: "منذ 7 أشهر و23 يوم")
  const months = Math.floor(diffDays / 30);
  const remainingDays = diffDays % 30;

  let monthStr = '';
  if (months === 1) monthStr = 'شهر';
  else if (months === 2) monthStr = 'شهرين';
  else if (months >= 3 && months <= 10) monthStr = `${months} أشهر`;
  else monthStr = `${months} شهراً`;

  if (remainingDays === 0) {
    return `منذ ${monthStr}`;
  }

  let dayStr = '';
  if (remainingDays === 1) dayStr = 'يوم';
  else if (remainingDays === 2) dayStr = 'يومين';
  else if (remainingDays >= 3 && remainingDays <= 10) dayStr = `${remainingDays} أيام`;
  else dayStr = `${remainingDays} يوم`;

  return `منذ ${monthStr} و${dayStr}`;
}

export function generateMessageId(): string {
  return 'msg_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

export function generateConversationId(): string {
  return 'conv_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

/**
 * Fetch all conversations for a user.
 */
export async function getConversations(userUid: string, userEmail?: string): Promise<ConversationItem[]> {
  if (!userUid && !userEmail) return [];

  let remoteList: ConversationItem[] = [];
  if (isFirebaseConfigured && db) {
    try {
      if (userUid) {
        const q = query(
          collection(db, 'conversations'),
          where('participantUids', 'array-contains', userUid)
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          remoteList.push({ id: d.id, ...(d.data() as any) });
        });
      }

      if (userEmail) {
        const normEmail = userEmail.toLowerCase().trim();
        const qEmail = query(
          collection(db, 'conversations'),
          where('participantEmails', 'array-contains', normEmail)
        );
        const snapEmail = await getDocs(qEmail);
        snapEmail.forEach((d) => {
          if (!remoteList.some((item) => item.id === d.id)) {
            remoteList.push({ id: d.id, ...(d.data() as any) });
          }
        });

        // Also check if participantUids contains the normalized email
        const qUidEmail = query(
          collection(db, 'conversations'),
          where('participantUids', 'array-contains', normEmail)
        );
        const snapUidEmail = await getDocs(qUidEmail);
        snapUidEmail.forEach((d) => {
          if (!remoteList.some((item) => item.id === d.id)) {
            remoteList.push({ id: d.id, ...(d.data() as any) });
          }
        });
      }
    } catch (e) {
      console.warn('getConversations: Firestore read failed, fallback to local', e);
    }
  }

  const localList = getLocal<ConversationItem[]>(LOCAL_CONVERSATIONS_KEY, []);

  // Merge remote and local by ID
  const map = new Map<string, ConversationItem>();
  localList.forEach((c) => {
    const hasUid = userUid && c.participantUids.includes(userUid);
    const hasEmail = userEmail && (
      c.participantEmails?.includes(userEmail.toLowerCase().trim()) ||
      c.participantUids?.includes(userEmail.toLowerCase().trim())
    );
    if (hasUid || hasEmail) {
      map.set(c.id, c);
    }
  });
  remoteList.forEach((c) => {
    const ex = map.get(c.id);
    if (!ex || new Date(c.updatedAt).getTime() >= new Date(ex.updatedAt).getTime()) {
      map.set(c.id, c);
    }
  });

  const result = Array.from(map.values());
  // Sort descending by lastMessageAt
  result.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return result;
}

/**
 * Fetch messages for a specific conversation.
 * Note: query without composite orderBy to ensure zero-config index-free execution in Firestore.
 */
export async function getMessages(conversationId: string): Promise<MessageItem[]> {
  if (!conversationId) return [];

  let remoteMsgs: MessageItem[] = [];
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => {
        remoteMsgs.push({ id: d.id, ...(d.data() as any) });
      });
    } catch (e) {
      console.warn('getMessages: Firestore read failed, fallback to local', e);
    }
  }

  const allLocal = getLocal<MessageItem[]>(LOCAL_MESSAGES_KEY, []);
  const localForConv = allLocal.filter((m) => m.conversationId === conversationId);

  const map = new Map<string, MessageItem>();
  localForConv.forEach((m) => map.set(m.id, m));
  remoteMsgs.forEach((m) => map.set(m.id, m));

  const result = Array.from(map.values());
  result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return result;
}

/**
 * Send a new message (creates or updates conversation).
 */
export async function sendMessage(
  sender: { uid: string; name: string; email?: string; avatar?: string },
  payload: SendMessagePayload
): Promise<{ message: MessageItem; conversation: ConversationItem }> {
  const now = new Date().toISOString();
  let conversationId = payload.conversationId;

  const senderUid = sender.uid;
  const senderEmail = sender.email?.toLowerCase().trim();
  const recipientUid = payload.recipientUid;
  const recipientEmail = payload.recipientEmail?.toLowerCase().trim() ||
    (payload.recipientUid.includes('@') ? payload.recipientUid.toLowerCase().trim() : undefined);

  const allConversations = getLocal<ConversationItem[]>(LOCAL_CONVERSATIONS_KEY, []);
  let conv: ConversationItem | undefined;

  if (conversationId) {
    conv = allConversations.find((c) => c.id === conversationId);
  }

  // If conversation not in local store, try fetching from Firestore
  if (conversationId && !conv && isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'conversations', conversationId));
      if (snap.exists()) {
        conv = { id: snap.id, ...(snap.data() as any) };
      }
    } catch (e) {
      console.warn('sendMessage: fetch conv from Firestore notice', e);
    }
  }

  if (!conv && !conversationId) {
    // Find existing conversation between the two participants with matching subject
    conv = allConversations.find(
      (c) =>
        (c.participantUids.includes(senderUid) || (senderEmail && c.participantEmails?.includes(senderEmail))) &&
        (c.participantUids.includes(recipientUid) || (recipientEmail && c.participantEmails?.includes(recipientEmail))) &&
        c.subject === payload.subject
    );
  }

  const emails = Array.from(new Set([
    senderEmail,
    recipientEmail,
    ...(conv?.participantEmails || []),
  ].filter(Boolean))) as string[];

  const uids = Array.from(new Set([
    senderUid,
    recipientUid,
    senderEmail,
    recipientEmail,
    ...(conv?.participantUids || []),
  ].filter(Boolean))) as string[];

  const currentUnread = (recipientUid && conv?.unreadCount?.[recipientUid]) ||
    (recipientEmail && conv?.unreadCount?.[recipientEmail]) || 0;

  if (!conv) {
    conversationId = conversationId || generateConversationId();
    conv = {
      id: conversationId,
      participantUids: uids,
      participantEmails: emails,
      participants: [
        { uid: senderUid, name: sender.name, email: senderEmail, avatar: sender.avatar },
        { uid: recipientUid, name: payload.recipientName, email: recipientEmail },
      ],
      subject: payload.subject,
      lastMessage: payload.content,
      lastMessageAt: now,
      lastSenderUid: senderUid,
      unreadCount: {
        [recipientUid]: 1,
        ...(recipientEmail ? { [recipientEmail]: 1 } : {}),
        [senderUid]: 0,
        ...(senderEmail ? { [senderEmail]: 0 } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
  } else {
    conversationId = conv.id;
    const existingParticipants = conv.participants || [];
    const hasSender = existingParticipants.some((p) => p.uid === senderUid || (senderEmail && p.email?.toLowerCase() === senderEmail));
    const hasRecipient = existingParticipants.some((p) => p.uid === recipientUid || (recipientEmail && p.email?.toLowerCase() === recipientEmail));
    const updatedParticipants = [...existingParticipants];
    if (!hasSender) {
      updatedParticipants.push({ uid: senderUid, name: sender.name, email: senderEmail, avatar: sender.avatar });
    }
    if (!hasRecipient) {
      updatedParticipants.push({ uid: recipientUid, name: payload.recipientName, email: recipientEmail });
    }

    conv = {
      ...conv,
      participantUids: uids,
      participantEmails: emails,
      participants: updatedParticipants,
      lastMessage: payload.content,
      lastMessageAt: now,
      lastSenderUid: senderUid,
      unreadCount: {
        ...(conv.unreadCount || {}),
        [recipientUid]: currentUnread + 1,
        ...(recipientEmail ? { [recipientEmail]: currentUnread + 1 } : {}),
        [senderUid]: 0,
        ...(senderEmail ? { [senderEmail]: 0 } : {}),
      },
      updatedAt: now,
    };
  }

  const message: MessageItem = {
    id: generateMessageId(),
    conversationId,
    senderUid,
    senderName: sender.name,
    senderEmail,
    senderAvatar: sender.avatar,
    recipientUid,
    recipientName: payload.recipientName,
    recipientEmail,
    subject: payload.subject,
    content: payload.content,
    createdAt: now,
    read: false,
  };

  // Save conversation locally
  const cIdx = allConversations.findIndex((c) => c.id === conv!.id);
  if (cIdx !== -1) {
    allConversations[cIdx] = conv;
  } else {
    allConversations.unshift(conv);
  }
  setLocal(LOCAL_CONVERSATIONS_KEY, allConversations);

  // Save message locally
  const allMessages = getLocal<MessageItem[]>(LOCAL_MESSAGES_KEY, []);
  allMessages.push(message);
  setLocal(LOCAL_MESSAGES_KEY, allMessages);

  // Remote write if Firestore is configured
  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'conversations', conv.id), conv, { merge: true });
      await setDoc(doc(db, 'messages', message.id), message, { merge: true });
    } catch (e) {
      console.warn('sendMessage: Firestore write failed, persisted locally', e);
    }
  }

  // Instant notification for recipient (only if not viewing messages)
  try {
    void createNotification({
      recipientUid,
      recipientEmail,
      senderUid,
      senderName: sender.name || 'مستخدم',
      type: 'message_received',
      title: `رسالة جديدة من ${sender.name || 'مستخدم'}`,
      titleAr: `رسالة جديدة من ${sender.name || 'مستخدم'}`,
      titleEn: `New message from ${sender.name || 'User'}`,
      body: payload.content.slice(0, 80),
      bodyAr: payload.content.slice(0, 80),
      bodyEn: payload.content.slice(0, 80),
      link: '/messages',
      entityId: conv.id,
    });
  } catch (err) {
    console.error('Failed to create message notification', err);
  }

  // Dispatch global event for live reactive UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('messages-updated', {
        detail: { conversationId, messageId: message.id },
      })
    );
  }

  return { message, conversation: conv };
}

/**
 * Real-time subscription to a user's conversations.
 * Uses onSnapshot on Firestore + listens to local messages-updated events.
 */
export function subscribeToConversations(
  userUid: string,
  userEmail: string | undefined,
  callback: (conversations: ConversationItem[]) => void
): () => void {
  const unsubs: Array<() => void> = [];
  const normEmail = userEmail?.toLowerCase().trim();

  const triggerUpdate = async () => {
    const data = await getConversations(userUid, userEmail);
    callback(data);
  };

  if (isFirebaseConfigured && db) {
    if (userUid) {
      try {
        const qUid = query(
          collection(db, 'conversations'),
          where('participantUids', 'array-contains', userUid)
        );
        unsubs.push(onSnapshot(qUid, () => void triggerUpdate(), (err) => console.warn('sub conv uid err', err)));
      } catch (e) {
        console.warn('subscribeToConversations UID snapshot failed', e);
      }
    }

    if (normEmail) {
      try {
        const qEmail = query(
          collection(db, 'conversations'),
          where('participantEmails', 'array-contains', normEmail)
        );
        unsubs.push(onSnapshot(qEmail, () => void triggerUpdate(), (err) => console.warn('sub conv email err', err)));

        const qUidEmail = query(
          collection(db, 'conversations'),
          where('participantUids', 'array-contains', normEmail)
        );
        unsubs.push(onSnapshot(qUidEmail, () => void triggerUpdate(), (err) => console.warn('sub conv uidEmail err', err)));
      } catch (e) {
        console.warn('subscribeToConversations Email snapshot failed', e);
      }
    }
  }

  const onLocalUpdated = () => {
    void triggerUpdate();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('messages-updated', onLocalUpdated);
  }

  void triggerUpdate();

  return () => {
    unsubs.forEach((fn) => fn());
    if (typeof window !== 'undefined') {
      window.removeEventListener('messages-updated', onLocalUpdated);
    }
  };
}

/**
 * Real-time subscription to messages of an active conversation.
 * Note: query without composite orderBy to ensure index-free real-time delivery.
 */
export function subscribeToMessages(
  conversationId: string,
  callback: (messages: MessageItem[]) => void
): () => void {
  if (!conversationId) return () => {};

  let unsub: (() => void) | null = null;

  const triggerUpdate = async () => {
    const msgs = await getMessages(conversationId);
    callback(msgs);
  };

  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const remoteMsgs: MessageItem[] = [];
          snap.forEach((d) => remoteMsgs.push({ id: d.id, ...(d.data() as any) }));
          const allLocal = getLocal<MessageItem[]>(LOCAL_MESSAGES_KEY, []);
          const localForConv = allLocal.filter((m) => m.conversationId === conversationId);
          const map = new Map<string, MessageItem>();
          localForConv.forEach((m) => map.set(m.id, m));
          remoteMsgs.forEach((m) => map.set(m.id, m));
          const result = Array.from(map.values());
          result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          callback(result);
        },
        (err) => {
          console.warn('subscribeToMessages snapshot notice:', err);
        }
      );
    } catch (e) {
      console.warn('subscribeToMessages snapshot failed', e);
    }
  }

  const onLocalUpdated = (e: Event) => {
    const det = (e as CustomEvent)?.detail;
    if (!det || det.conversationId === conversationId) {
      void triggerUpdate();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('messages-updated', onLocalUpdated);
  }

  void triggerUpdate();

  return () => {
    if (unsub) unsub();
    if (typeof window !== 'undefined') {
      window.removeEventListener('messages-updated', onLocalUpdated);
    }
  };
}

/**
 * Mark a conversation as read by a user.
 */
export async function markConversationAsRead(
  conversationId: string,
  userUid: string,
  userEmail?: string
): Promise<void> {
  if (!conversationId || (!userUid && !userEmail)) return;

  const email = userEmail?.toLowerCase().trim();
  const allConversations = getLocal<ConversationItem[]>(LOCAL_CONVERSATIONS_KEY, []);
  const conv = allConversations.find((c) => c.id === conversationId);
  let cleared = false;

  if (conv && conv.unreadCount) {
    if (userUid && conv.unreadCount[userUid]) {
      conv.unreadCount[userUid] = 0;
      cleared = true;
    }
    if (email && conv.unreadCount[email]) {
      conv.unreadCount[email] = 0;
      cleared = true;
    }

    if (cleared) {
      conv.updatedAt = new Date().toISOString();
      setLocal(LOCAL_CONVERSATIONS_KEY, allConversations);

      if (isFirebaseConfigured && db) {
        try {
          await setDoc(doc(db, 'conversations', conv.id), conv, { merge: true });
        } catch (e) {
          console.warn('markConversationAsRead: Firestore write failed', e);
        }
      }
    }
  }

  // Mark local messages as read
  const allMessages = getLocal<MessageItem[]>(LOCAL_MESSAGES_KEY, []);
  let changed = false;
  allMessages.forEach((m) => {
    const isRecipient =
      (userUid && m.recipientUid === userUid) ||
      (email && m.recipientEmail?.toLowerCase().trim() === email) ||
      (email && m.recipientUid?.toLowerCase().trim() === email);
    if (m.conversationId === conversationId && isRecipient && !m.read) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) {
    setLocal(LOCAL_MESSAGES_KEY, allMessages);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('messages-updated', {
        detail: { conversationId },
      })
    );
  }
}

/**
 * Get total unread count for user across all conversations (supporting UID & Email).
 */
export async function getUnreadMessagesCount(userUid: string, userEmail?: string): Promise<number> {
  if (!userUid && !userEmail) return 0;
  const email = userEmail?.toLowerCase().trim();
  const conversations = await getConversations(userUid, email);
  return conversations.reduce((acc, c) => {
    const countUid = userUid ? (c.unreadCount?.[userUid] || 0) : 0;
    const countEmail = email ? (c.unreadCount?.[email] || 0) : 0;
    return acc + Math.max(countUid, countEmail);
  }, 0);
}
