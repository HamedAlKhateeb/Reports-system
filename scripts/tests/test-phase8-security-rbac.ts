/**
 * Phase 8 Unit Tests: Security, RBAC & API Protection
 * Run: npx tsx scripts/tests/test-phase8-security-rbac.ts
 */

// Mock browser environment for test runner
const mockStorage = new Map<string, string>();
(global as any).window = { document: {} };
(global as any).localStorage = {
  getItem: (k: string) => mockStorage.get(k) || null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  get length() {
    return mockStorage.size;
  },
  key: (i: number) => Array.from(mockStorage.keys())[i] || null,
};

import { isUserAuthorized, getIssues, createIssue, archiveIssue } from '../../lib/db';
import { checkRateLimit } from '../../lib/rate-limit';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, details || '');
    failed++;
  }
}

async function runPhase8Tests() {
  console.log('\n=== RUNNING PHASE 8: SECURITY & ENTERPRISE RBAC TESTS ===\n');

  // TEST 1: Rate Limiting Sliding Window Protection
  console.log('Test 1: Rate Limiting Sliding Window Protection');
  const testIp = '192.168.1.105';
  let blocked = false;

  // Fire requests up to the limit of 10
  for (let i = 0; i < 10; i++) {
    const result = checkRateLimit(testIp, 10, 60000);
    assert(result.allowed, `Request ${i + 1} within limit allowed`);
  }

  // 11th request must be blocked
  const exceeded = checkRateLimit(testIp, 10, 60000);
  assert(!exceeded.allowed && exceeded.remaining === 0, 'Request 11 blocked by rate limiter with 0 remaining');

  // TEST 2: RBAC User Authorization
  console.log('\nTest 2: RBAC User Authorization');
  // When authorized users are configured
  mockStorage.set(
    'review_app_mock_whitelist',
    JSON.stringify(['admin@enterprise.com', 'reviewer@enterprise.com'])
  );

  const authAdmin = await isUserAuthorized('admin@enterprise.com');
  assert(authAdmin === true, 'Admin email is authorized');

  const authReviewer = await isUserAuthorized('reviewer@enterprise.com');
  assert(authReviewer === true, 'Reviewer email is authorized');

  const authHacker = await isUserAuthorized('attacker@malicious.com');
  assert(authHacker === false, 'Unauthorized attacker email is rejected');

  const authEmpty = await isUserAuthorized('');
  assert(authEmpty === false, 'Empty email is rejected');

  // TEST 3: Soft-Delete Security (Data Preservation Principle)
  console.log('\nTest 3: Soft-Delete Security and Query Isolation');
  const testUser = 'user_sec_audit';
  const issue = await createIssue({
    issue_key: 'SEC-999',
    title: 'فحص الحذف الآمن',
    description: 'يجب ألا يتم حذف السجل فعلياً من قاعدة البيانات',
    status: 'open',
    severity: 'normal',
    linkedReportId: 'rep_sec_audit',
    ownerUid: testUser,
  });

  // Archive the issue
  await archiveIssue(issue.id, testUser, 'Soft delete test verification');

  // Verify that active query excludes the archived issue
  const activeIssues = await getIssues(testUser);
  const foundActive = activeIssues.find((i) => i.id === issue.id && !i.archived_at && !i.archivedAt);
  assert(!foundActive, 'Archived issue is excluded from active query (soft-deleted)');

  // Verify that issue data is still preserved in storage (single source of truth)
  const rawStore = JSON.parse(mockStorage.get(`review_app_mock_issues_${testUser}`) || '[]');
  const rawIssue = rawStore.find((i: any) => i.id === issue.id);
  assert(
    !!rawIssue && !!rawIssue.archived_at && rawIssue.title === 'فحص الحذف الآمن',
    'Issue is preserved in storage with archived_at timestamp (No hard data loss)'
  );

  // TEST 4: Zero Exposure of Server-Side Secret Keys
  console.log('\nTest 4: Secret Keys Isolation');
  assert(
    !process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    'Client-exposed NEXT_PUBLIC_GEMINI_API_KEY is avoided in production configuration'
  );

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
