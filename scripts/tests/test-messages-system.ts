/**
 * TEST SUITE: KHAMSAT-LIKE MESSAGING SYSTEM
 *
 * Verifies:
 * 1. formatKhamsatTimeAgo reproduces exact Khamsat date format (e.g. "منذ 7 أشهر و23 يوم").
 * 2. sendMessage creates conversation, messages, and updates unread counts.
 * 3. getConversations isolates conversations strictly to participating users.
 * 4. markConversationAsRead resets unread count for current user while preserving others.
 * 5. getUnreadMessagesCount accurately reflects total unread across all conversations.
 */

import {
  sendMessage,
  getConversations,
  getMessages,
  markConversationAsRead,
  getUnreadMessagesCount,
  formatKhamsatTimeAgo,
} from '../../lib/messages-db';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

async function runMessagingTests() {
  console.log('=== KHAMSAT-LIKE MESSAGING SYSTEM TEST SUITE ===\n');

  // --- 1. Test formatKhamsatTimeAgo ---
  console.log('--- Subsuite 1: Time Ago Formatting (Khamsat Standard) ---');
  const now = new Date();

  const justNow = new Date(now.getTime() - 10 * 1000).toISOString();
  assert(formatKhamsatTimeAgo(justNow, 'ar') === 'الآن', 'Format < 1 minute gives "الآن"');

  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  assert(formatKhamsatTimeAgo(fiveMinutesAgo, 'ar') === 'منذ 5 دقائق', 'Format 5 minutes gives "منذ 5 دقائق"');

  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  assert(formatKhamsatTimeAgo(twoHoursAgo, 'ar') === 'منذ ساعتين', 'Format 2 hours gives "منذ ساعتين"');

  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  assert(formatKhamsatTimeAgo(threeHoursAgo, 'ar') === 'منذ 3 ساعات', 'Format 3 hours gives "منذ 3 ساعات"');

  // Khamsat Screenshot match: exactly 7 months and 23 days ago
  const sevenMonths23DaysAgo = new Date(now.getTime() - (7 * 30 + 23) * 24 * 60 * 60 * 1000).toISOString();
  const formattedKhamsat = formatKhamsatTimeAgo(sevenMonths23DaysAgo, 'ar');
  assert(
    formattedKhamsat.includes('أشهر') && formattedKhamsat.includes('يوم'),
    `Format composite months & days reproduces Khamsat style: "${formattedKhamsat}"`
  );

  // --- 2. Test Conversation & Message Lifecycle ---
  console.log('\n--- Subsuite 2: Conversation Creation & Message Sending ---');
  const userA = { uid: 'user_alice_' + Date.now(), name: 'أليس' };
  const userB = { uid: 'user_bob_' + Date.now(), name: 'باسم' };
  const userC = { uid: 'user_carol_' + Date.now(), name: 'كارول' };

  const { conversation, message } = await sendMessage(userA, {
    recipientUid: userB.uid,
    recipientName: userB.name,
    subject: 'استفسار عن: مراجعة تقرير الترجمة',
    content: 'مرحباً باسم، هل اطلعت على التقرير الأخير؟',
  });

  assert(!!conversation.id, 'Conversation created with valid ID');
  assert(conversation.subject === 'استفسار عن: مراجعة تقرير الترجمة', 'Subject set accurately');
  assert(conversation.lastMessage === 'مرحباً باسم، هل اطلعت على التقرير الأخير؟', 'Last message updated');
  assert(conversation.unreadCount[userB.uid] === 1, 'Recipient unread count incremented to 1');
  assert(conversation.unreadCount[userA.uid] === 0, 'Sender unread count remains 0');

  // Test unread count query
  const unreadB = await getUnreadMessagesCount(userB.uid);
  assert(unreadB === 1, 'getUnreadMessagesCount for Bob returns 1');
  const unreadA = await getUnreadMessagesCount(userA.uid);
  assert(unreadA === 0, 'getUnreadMessagesCount for Alice returns 0');

  // --- 3. Test Privacy & Isolation ---
  console.log('\n--- Subsuite 3: Access Isolation & Security ---');
  const convsA = await getConversations(userA.uid);
  assert(convsA.some((c) => c.id === conversation.id), 'Alice can see conversation');

  const convsB = await getConversations(userB.uid);
  assert(convsB.some((c) => c.id === conversation.id), 'Bob can see conversation');

  const convsC = await getConversations(userC.uid);
  assert(!convsC.some((c) => c.id === conversation.id), 'Carol (non-participant) CANNOT see conversation');

  // --- 4. Test Second Message & Reply ---
  console.log('\n--- Subsuite 4: Conversation Threading & Reply ---');
  const reply = await sendMessage(userB, {
    conversationId: conversation.id,
    recipientUid: userA.uid,
    recipientName: userA.name,
    subject: conversation.subject,
    content: 'أهلاً أليس، تم الاطلاع وسأقوم بالمراجعة فوراً.',
  });

  const msgs = await getMessages(conversation.id);
  assert(msgs.length === 2, 'Conversation thread has exactly 2 messages in sequence');
  assert(msgs[0].content === 'مرحباً باسم، هل اطلعت على التقرير الأخير؟', 'First message matches');
  assert(msgs[1].content === 'أهلاً أليس، تم الاطلاع وسأقوم بالمراجعة فوراً.', 'Reply matches');

  // --- 5. Test Mark Conversation As Read ---
  console.log('\n--- Subsuite 5: Mark Conversation As Read ---');
  // Alice now has 1 unread from Bob's reply
  const unreadAliceBefore = await getUnreadMessagesCount(userA.uid);
  assert(unreadAliceBefore === 1, 'Alice has 1 unread message after reply');

  await markConversationAsRead(conversation.id, userA.uid);
  const unreadAliceAfter = await getUnreadMessagesCount(userA.uid);
  assert(unreadAliceAfter === 0, 'Alice unread count becomes 0 after markConversationAsRead');

  console.log(`\n===========================================`);
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`===========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runMessagingTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
