/**
 * DUAL-LAYER NOTIFICATION PERSISTENCE & SERVICE
 *
 * Provides persistent Firestore storage with per-user LocalStorage fallback.
 * Strictly guarantees user data isolation: User A cannot read or receive
 * notifications intended for User B.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type { AppNotification, CreateNotificationPayload } from './notifications-types';

const LOCAL_NOTIF_PREFIX = 'review_app_notifications_';

function getUserKey(userUid: string): string {
  return `${LOCAL_NOTIF_PREFIX}${userUid}`;
}

function getLocalNotifications(userUid: string): AppNotification[] {
  if (typeof window === 'undefined' || !userUid) return [];
  try {
    const raw = localStorage.getItem(getUserKey(userUid));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalNotifications(userUid: string, items: AppNotification[]): void {
  if (typeof window === 'undefined' || !userUid) return;
  try {
    localStorage.setItem(getUserKey(userUid), JSON.stringify(items.slice(0, 100)));
  } catch (e) {
    console.warn('Failed to save notifications locally:', e);
  }
}

export function generateNotificationId(): string {
  return 'notif_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

/**
 * Creates a notification persistently for a recipient.
 * Prevents duplicate creation within a short time window (30s) for identical entity + type.
 */
export async function createNotification(payload: CreateNotificationPayload): Promise<AppNotification | null> {
  const recipientUid = payload.recipientUid?.trim() || '';
  const recipientEmail = payload.recipientEmail ? payload.recipientEmail.toLowerCase().trim() : undefined;
  if (!recipientUid && !recipientEmail) return null;

  // Never notify self for own actions
  if (recipientUid && payload.senderUid && payload.senderUid === recipientUid) {
    return null;
  }

  const now = new Date().toISOString();
  const id = generateNotificationId();

  const item: AppNotification = {
    id,
    recipientUid,
    recipientEmail,
    senderUid: payload.senderUid || '',
    senderName: payload.senderName || 'مستخدم',
    type: payload.type,
    title: payload.title,
    titleAr: payload.titleAr,
    titleEn: payload.titleEn,
    body: payload.body,
    bodyAr: payload.bodyAr,
    bodyEn: payload.bodyEn,
    link: payload.link,
    entityId: payload.entityId,
    read: false,
    createdAt: now,
  };

  // 1. Check duplicate locally for recipient
  const targetKey = recipientUid || recipientEmail || '';
  const localList = getLocalNotifications(targetKey);
  const isDuplicate = localList.some(
    (n) =>
      n.type === item.type &&
      n.entityId === item.entityId &&
      n.senderUid === item.senderUid &&
      Math.abs(new Date(now).getTime() - new Date(n.createdAt).getTime()) < 30000
  );
  if (isDuplicate) {
    return null;
  }

  // 2. Persist to Firestore if available
  if (isFirebaseConfigured && db) {
    try {
      const notifDocRef = doc(db, 'notifications', id);
      await setDoc(notifDocRef, item);
    } catch (err) {
      console.warn('createNotification Firestore write notice:', err);
    }
  }

  // 3. Persist to isolated local storage for recipient
  setLocalNotifications(targetKey, [item, ...localList]);
  if (recipientUid && recipientEmail) {
    setLocalNotifications(recipientEmail, [item, ...getLocalNotifications(recipientEmail)]);
  }

  // 4. Dispatch event for reactive UI update
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('notifications-updated', {
          detail: { recipientUid, recipientEmail },
        })
      );
    } catch {}
  }

  return item;
}

/**
 * Fetches all notifications for a specific user.
 * Merges Firestore remote items with user-isolated local store.
 */
export async function getNotifications(userUid: string, userEmail?: string): Promise<AppNotification[]> {
  if (!userUid && !userEmail) return [];

  const map = new Map<string, AppNotification>();

  // 1. Fetch remote from Firestore if configured
  if (isFirebaseConfigured && db) {
    try {
      // Query by recipientUid
      if (userUid) {
        const qUid = query(
          collection(db, 'notifications'),
          where('recipientUid', '==', userUid)
        );
        const snapUid = await getDocs(qUid);
        snapUid.forEach((d) => {
          map.set(d.id, { id: d.id, ...(d.data() as any) });
        });
      }

      // Query by recipientEmail if present (catches assignments/invites by email before user login)
      if (userEmail) {
        const normEmail = userEmail.toLowerCase().trim();
        const qEmail = query(
          collection(db, 'notifications'),
          where('recipientEmail', '==', normEmail)
        );
        const snapEmail = await getDocs(qEmail);
        snapEmail.forEach((d) => {
          const item = { id: d.id, ...(d.data() as any) };
          map.set(d.id, item);
          // If recipientUid wasn't set, update it in Firestore asynchronously
          const firestore = db;
          if (!item.recipientUid && userUid && firestore) {
            void updateDoc(doc(firestore, 'notifications', d.id), { recipientUid: userUid }).catch(() => {});
          }
        });
      }
    } catch (e) {
      console.warn('getNotifications: Firestore read notice, fallback to local', e);
    }
  }

  // 2. Merge with user-isolated local store
  if (userUid) {
    const localList = getLocalNotifications(userUid);
    localList.forEach((item) => {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        if (item.read) existing.read = true;
      }
    });
  }

  if (userEmail) {
    const emailList = getLocalNotifications(userEmail.toLowerCase().trim());
    emailList.forEach((item) => {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        if (item.read) existing.read = true;
      }
    });
  }

  const result = Array.from(map.values());
  // Sort descending by createdAt
  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Keep local store in sync
  setLocalNotifications(userUid, result);

  return result;
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(notificationId: string, userUid: string, userEmail?: string): Promise<void> {
  if (!notificationId || (!userUid && !userEmail)) return;
  const now = new Date().toISOString();

  // 1. Update Firestore
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, { read: true, readAt: now });
    } catch (e) {
      console.warn('markNotificationAsRead Firestore notice:', e);
    }
  }

  // 2. Update user-isolated local store
  if (userUid) {
    const localList = getLocalNotifications(userUid);
    const updated = localList.map((n) => (n.id === notificationId ? { ...n, read: true, readAt: now } : n));
    setLocalNotifications(userUid, updated);
  }
  if (userEmail) {
    const emailList = getLocalNotifications(userEmail.toLowerCase().trim());
    const updated = emailList.map((n) => (n.id === notificationId ? { ...n, read: true, readAt: now } : n));
    setLocalNotifications(userEmail.toLowerCase().trim(), updated);
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { recipientUid: userUid, recipientEmail: userEmail } }));
    } catch {}
  }
}

/**
 * Marks all notifications for a user as read.
 */
export async function markAllNotificationsAsRead(userUid: string, userEmail?: string): Promise<void> {
  if (!userUid && !userEmail) return;
  const now = new Date().toISOString();

  const current = await getNotifications(userUid, userEmail);
  const unreadItems = current.filter((n) => !n.read);

  // 1. Update Firestore for unread items
  const firestore = db;
  if (isFirebaseConfigured && firestore && unreadItems.length > 0) {
    await Promise.all(
      unreadItems.map(async (n) => {
        try {
          const docRef = doc(firestore, 'notifications', n.id);
          await updateDoc(docRef, { read: true, readAt: now });
        } catch {}
      })
    );
  }

  // 2. Update user-isolated local store
  if (userUid) {
    const updated = current.map((n) => ({ ...n, read: true, readAt: n.readAt || now }));
    setLocalNotifications(userUid, updated);
  }
  if (userEmail) {
    const emailList = getLocalNotifications(userEmail.toLowerCase().trim());
    const updated = emailList.map((n) => ({ ...n, read: true, readAt: n.readAt || now }));
    setLocalNotifications(userEmail.toLowerCase().trim(), updated);
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { recipientUid: userUid, recipientEmail: userEmail } }));
    } catch {}
  }
}

/**
 * Marks message notifications as read for a user (optionally scoped to a specific conversation).
 * Used when the user is actively viewing the messages modal so they are not spammed with notifications.
 */
export async function markMessageNotificationsAsRead(userUid: string, conversationId?: string): Promise<void> {
  if (!userUid) return;

  const current = await getNotifications(userUid);
  const targetNotifs = current.filter(
    (n) => !n.read && n.type === 'message_received' && (!conversationId || n.entityId === conversationId)
  );
  if (targetNotifs.length === 0) return;

  const firestore = db;
  if (isFirebaseConfigured && firestore) {
    await Promise.all(
      targetNotifs.map(async (n) => {
        try {
          const docRef = doc(firestore, 'notifications', n.id);
          await updateDoc(docRef, { read: true });
        } catch {}
      })
    );
  }

  const targetIds = new Set(targetNotifs.map((n) => n.id));
  const updated = current.map((n) => (targetIds.has(n.id) ? { ...n, read: true } : n));
  setLocalNotifications(userUid, updated);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { recipientUid: userUid } }));
    } catch {}
  }
}

/**
 * Gets count of unread notifications for a user.
 */
export async function getUnreadNotificationsCount(userUid: string, userEmail?: string): Promise<number> {
  if (!userUid) return 0;
  const list = await getNotifications(userUid, userEmail);
  return list.filter((n) => !n.read).length;
}

/**
 * Subscribes to real-time notifications for a user via Firestore onSnapshot
 * with immediate callback execution upon document changes.
 */
export function subscribeToNotifications(
  userUid: string,
  userEmail: string | undefined,
  onChange: (notifications: AppNotification[]) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const unsubs: Array<() => void> = [];
  const normEmail = userEmail?.toLowerCase().trim() || '';

  const triggerUpdate = async () => {
    try {
      const list = await getNotifications(userUid, userEmail);
      onChange(list);
    } catch {}
  };

  if (isFirebaseConfigured && db) {
    try {
      if (userUid) {
        const qUid = query(collection(db, 'notifications'), where('recipientUid', '==', userUid));
        const unsub1 = onSnapshot(
          qUid,
          () => {
            void triggerUpdate();
          },
          (err) => console.warn('notif sub uid err', err)
        );
        unsubs.push(unsub1);
      }
      if (normEmail) {
        const qEmail = query(collection(db, 'notifications'), where('recipientEmail', '==', normEmail));
        const unsub2 = onSnapshot(
          qEmail,
          () => {
            void triggerUpdate();
          },
          (err) => console.warn('notif sub email err', err)
        );
        unsubs.push(unsub2);
      }
    } catch (e) {
      console.warn('subscribeToNotifications Firestore setup error:', e);
    }
  }

  // Also listen for local custom events
  const onLocal = () => void triggerUpdate();
  window.addEventListener('notifications-updated', onLocal);
  unsubs.push(() => window.removeEventListener('notifications-updated', onLocal));

  // Initial fetch
  void triggerUpdate();

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
}
