// Regression Test Suite for Security & Data Exposure & Persistence
import assert from 'node:assert';

console.log('🧪 Starting Security & Data Isolation Regression Tests...\n');

// Mock localStorage
const mockStorage = new Map();
global.window = {};
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
  key: (i) => Array.from(mockStorage.keys())[i] || null,
};

async function runTests() {
  const { getReports, getReportById, createReport, deleteReport, getIssues, getFolders } = await import('../lib/db.ts');

  // Seed userA and userB data into isolated local caches
  const LOCAL_REPORTS_KEY = 'review_app_mock_reports';
  const LOCAL_ISSUES_KEY = 'review_app_mock_issues';
  const LOCAL_FOLDERS_KEY = 'review_app_mock_folders';

  const userAReport = {
    id: 'rep_userA_1',
    title: 'Secret Report User A',
    ownerUid: 'user_A_123',
    folderId: 'folder_A_1',
    isShared: false,
    createdAt: new Date().toISOString(),
  };

  const userBReport = {
    id: 'rep_userB_1',
    title: 'Secret Report User B',
    ownerUid: 'user_B_456',
    folderId: null,
    isShared: false,
    createdAt: new Date().toISOString(),
  };

  const sharedReport = {
    id: 'rep_shared_1',
    title: 'Public Shared Report',
    ownerUid: 'user_A_123',
    folderId: null,
    isShared: true,
    shareToken: 'token_xyz_123',
    createdAt: new Date().toISOString(),
  };

  // Populate local storage
  localStorage.setItem(`${LOCAL_REPORTS_KEY}_user_A_123`, JSON.stringify([userAReport, sharedReport]));
  localStorage.setItem(`${LOCAL_REPORTS_KEY}_user_B_456`, JSON.stringify([userBReport]));
  // Put a report in the global unsuffixed key to test that legacy/global fallback NEVER leaks to unauthenticated users
  localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify([userAReport, userBReport, sharedReport]));

  // TEST 1: Unauthenticated getReports() must return []
  console.log('Test 1: Unauthenticated getReports() with undefined / null / empty string');
  const unauthReports1 = await getReports(undefined);
  assert.strictEqual(unauthReports1.length, 0, 'FAIL: getReports(undefined) must return []');
  const unauthReports2 = await getReports('');
  assert.strictEqual(unauthReports2.length, 0, 'FAIL: getReports("") must return []');
  const unauthReports3 = await getReports('   ');
  assert.strictEqual(unauthReports3.length, 0, 'FAIL: getReports("   ") must return []');
  console.log('  ✅ PASSED: Returns [] for all unauthenticated calls');

  // TEST 2: User A getReports() never returns User B's reports
  console.log('Test 2: Data isolation between user sessions');
  const userAReports = await getReports('user_A_123');
  assert(userAReports.some((r) => r.id === 'rep_userA_1'), 'User A reports should include rep_userA_1');
  assert(!userAReports.some((r) => r.id === 'rep_userB_1'), 'FAIL: User A reports must NEVER contain User B reports!');
  console.log('  ✅ PASSED: User A reports strictly isolated from User B');

  // TEST 3: getReportById() ownership enforcement
  console.log('Test 3: getReportById() ownership and sharing checks');
  // Unauthenticated access to private report
  const unauthRep = await getReportById('rep_userA_1', undefined);
  assert.strictEqual(unauthRep, null, 'FAIL: Unauthenticated request for private report must return null');

  // User B accessing User A's private report
  const crossUserRep = await getReportById('rep_userA_1', 'user_B_456');
  assert.strictEqual(crossUserRep, null, 'FAIL: User B accessing User A private report must return null');

  // User A accessing User A's report
  const authRep = await getReportById('rep_userA_1', 'user_A_123');
  assert.strictEqual(authRep?.id, 'rep_userA_1', 'User A should access their own report');

  // Accessing shared public report
  const sharedRep = await getReportById('rep_shared_1', undefined);
  assert.strictEqual(sharedRep?.id, 'rep_shared_1', 'Public shared report should be accessible');
  console.log('  ✅ PASSED: getReportById strictly enforces ownerUid / isShared');

  // TEST 4: getIssues() unauthenticated check
  console.log('Test 4: getIssues() unauthenticated check');
  localStorage.setItem(`${LOCAL_ISSUES_KEY}_user_A_123`, JSON.stringify([{ id: 'iss_1', title: 'Issue 1', ownerUid: 'user_A_123' }]));
  const unauthIssues = await getIssues(undefined);
  assert.strictEqual(unauthIssues.length, 0, 'FAIL: getIssues(undefined) must return []');
  console.log('  ✅ PASSED: getIssues returns [] for unauthenticated call');

  // TEST 5: getFolders() unauthenticated check
  console.log('Test 5: getFolders() unauthenticated check');
  localStorage.setItem(`${LOCAL_FOLDERS_KEY}_user_A_123`, JSON.stringify([{ id: 'fld_1', name: 'Folder 1', ownerUid: 'user_A_123' }]));
  const unauthFolders = await getFolders(undefined);
  assert.strictEqual(unauthFolders.length, 0, 'FAIL: getFolders(undefined) must return []');
  console.log('  ✅ PASSED: getFolders returns [] for unauthenticated call');

  // TEST 6: createReport with folderId: undefined sanitizes properly
  console.log('Test 6: createReport with folderId: undefined persists and sanitizes');
  const created = await createReport({
    title: 'Test Persisted Report',
    language: 'ar',
    author: 'Tester',
    systemUnderReview: 'System',
    ownerUid: 'user_A_123',
    folderId: undefined,
  });
  assert(created.id, 'Report must have an ID');
  assert.strictEqual(created.folderId, null, 'Undefined folderId must normalize to null');
  assert(created.createdAt, 'Report must have createdAt');

  // Verify it is immediately queryable via getReports('user_A_123')
  const userAReportsAfterCreate = await getReports('user_A_123');
  assert(userAReportsAfterCreate.some((r) => r.id === created.id), 'Newly created report must be immediately in getReports');
  await deleteReport(created.id);
  console.log('  ✅ PASSED: createReport sanitizes undefined fields and persists immediately');

  // TEST 7: API routes authentication & Cache-Control headers
  console.log('Test 7: API routes authentication and Cache-Control header checks');
  const { GET: getApiReports } = await import('../app/api/reports/route.ts');
  const { GET: getV1Reports } = await import('../app/api/v1/reports/route.ts');
  const { NextRequest } = await import('next/server');

  // 7a: Unauthenticated /api/reports GET
  const reqUnauth = new NextRequest('http://localhost:3000/api/reports');
  const resUnauth = await getApiReports(reqUnauth);
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated /api/reports must return 401');
  const cacheHeader = resUnauth.headers.get('cache-control') || '';
  assert(cacheHeader.includes('private') && cacheHeader.includes('no-store'), 'Must include private, no-store');
  console.log('  ✅ PASSED: /api/reports unauthenticated returns 401 with private, no-store');

  // 7b: Unauthenticated /api/v1/reports GET
  const reqV1Unauth = new NextRequest('http://localhost:3000/api/v1/reports');
  const resV1Unauth = await getV1Reports(reqV1Unauth);
  assert.strictEqual(resV1Unauth.status, 401, 'Unauthenticated /api/v1/reports must return 401');
  console.log('  ✅ PASSED: /api/v1/reports unauthenticated returns 401');

  console.log('\n🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('\n❌ REGRESSION TEST FAILED:', err);
  process.exit(1);
});
