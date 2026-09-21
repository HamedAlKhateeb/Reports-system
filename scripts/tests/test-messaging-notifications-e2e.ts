/**
 * MESSAGING & NOTIFICATIONS E2E TEST SUITE
 *
 * Verifies:
 * 1. Dual-identity targeting (UID and Email) in messaging.
 * 2. Accurate unread counts via getUnreadMessagesCount(uid, email).
 * 3. Clearing unread counters via markConversationAsRead(convId, uid, email).
 * 4. Notifications lifecycle: create, query, mark single read with readAt timestamp, mark all read.
 */

const store = new Map<string, string>();
(globalThis as any).window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
};

import assert from 'node:assert';
import {
  sendMessage,
  getConversations,
  getUnreadMessagesCount,
  markConversationAsRead,
} from '../../lib/messages-db';
import {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../lib/notifications-db';

async function run() {
  console.log('--- Testing Messaging & Notifications E2E ---');

  const senderUid = 'user_sender_' + Date.now();
  const senderEmail = 'sender@example.com';
  const recipientUid = 'user_recipient_' + Date.now();
  const recipientEmail = 'recipient@example.com';

  // --- Part 1: Messaging Flow ---
  // Send message targeted to recipient by email & UID
  const sendRes = await sendMessage(
    { uid: senderUid, name: 'Alice Sender', email: senderEmail },
    {
      recipientUid: recipientUid,
      recipientName: 'Bob Recipient',
      recipientEmail: recipientEmail,
      subject: 'Important update',
      content: 'Hello Bob! This is an important update.',
    }
  );

  assert(sendRes.message.id, 'Message created with ID');
  assert.strictEqual(sendRes.message.read, false, 'Message starts unread');

  // Verify recipient sees 1 unread message via UID
  const unreadByUid = await getUnreadMessagesCount(recipientUid);
  assert.strictEqual(unreadByUid, 1, 'Recipient has 1 unread message queried by UID');

  // Verify recipient sees 1 unread message via Email
  const unreadByEmail = await getUnreadMessagesCount('', recipientEmail);
  assert.strictEqual(unreadByEmail, 1, 'Recipient has 1 unread message queried by Email');

  // Verify combined query
  const unreadCombined = await getUnreadMessagesCount(recipientUid, recipientEmail);
  assert.strictEqual(unreadCombined, 1, 'Recipient has 1 unread message queried by UID + Email');

  // Mark conversation as read
  await markConversationAsRead(sendRes.conversation.id, recipientUid, recipientEmail);

  // Verify unread count is now 0
  const unreadAfter = await getUnreadMessagesCount(recipientUid, recipientEmail);
  assert.strictEqual(unreadAfter, 0, 'Unread count cleared to 0 after markConversationAsRead');

  // --- Part 2: Notifications Flow ---
  // Note: sendMessage above already triggered 1 automated 'message_received' notification
  const notif1 = await createNotification({
    recipientUid,
    recipientEmail,
    senderUid,
    senderName: 'Alice Sender',
    type: 'task_assigned',
    title: 'New Task Assigned',
    body: 'You have been assigned to review document X',
  });

  const notif2 = await createNotification({
    recipientUid,
    recipientEmail,
    senderUid,
    senderName: 'Alice Sender',
    type: 'comment_added',
    title: 'New Comment',
    body: 'Great job on the report',
  });

  assert(notif1, 'Notification 1 created');
  assert(notif2, 'Notification 2 created');

  // Query notifications (1 from message + 2 manual = 3 total)
  const notifs = await getNotifications(recipientUid, recipientEmail);
  assert.strictEqual(notifs.length, 3, 'Recipient received 3 notifications');
  assert(notifs.some((n) => n.type === 'message_received'), 'Automated message notification received');
  assert(notifs.some((n) => n.id === notif1.id && !n.read), 'Notification 1 is unread');
  assert(notifs.some((n) => n.id === notif2.id && !n.read), 'Notification 2 is unread');

  // Mark single notification as read
  await markNotificationAsRead(notif1.id, recipientUid, recipientEmail);

  const notifsAfterSingle = await getNotifications(recipientUid, recipientEmail);
  const updatedNotif1 = notifsAfterSingle.find((n) => n.id === notif1.id);
  const updatedNotif2 = notifsAfterSingle.find((n) => n.id === notif2.id);

  assert.strictEqual(updatedNotif1?.read, true, 'Notification 1 is now marked as read');
  assert(updatedNotif1?.readAt, 'Notification 1 has readAt timestamp recorded');
  assert.strictEqual(updatedNotif2?.read, false, 'Notification 2 remains unread');

  // Mark all notifications as read
  await markAllNotificationsAsRead(recipientUid, recipientEmail);

  const notifsAfterAll = await getNotifications(recipientUid, recipientEmail);
  assert(notifsAfterAll.every((n) => n.read === true), 'All notifications are now read');
  assert(notifsAfterAll.every((n) => typeof n.readAt === 'string'), 'All notifications have readAt timestamp');

  console.log('✅ ALL MESSAGING & NOTIFICATIONS E2E TESTS PASSED!');
}

run().catch((err) => {
  console.error('❌ Messaging & Notifications test failed:', err);
  process.exit(1);
});
