/**
 * ARCHIVE LIFECYCLE TEST SUITE
 *
 * Methodology: active → archived (soft, reversible) → restore | delete.
 * - Archived items leave default lists/boards.
 * - Archiving a report cascades to its OPEN linked issues.
 * - Restore never cascades.
 * - Delete allowed only with no ACTIVE linked issues; archived ones cascade.
 */

const store = new Map<string, string>();
(globalThis as any).window = {};
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

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function runArchivingTests() {
  const {
    isArchivedReport,
    isArchivedIssue,
    archiveReport,
    unarchiveReport,
    unarchiveIssue,
    deleteReport,
    getReports,
    getIssues,
    getIssuesByReportId,
  } = await import('../../lib/db');

  const uid = 'arch_uid_1';
  const now = new Date().toISOString();
  store.set(
    'review_app_mock_reports_arch_uid_1',
    JSON.stringify([
      { id: 'repA', ownerUid: uid, reportNumber: 1, title: 'A', status: 'published', createdAt: now, updatedAt: now },
      { id: 'repB', ownerUid: uid, reportNumber: 2, title: 'B', status: 'draft', createdAt: now, updatedAt: now },
    ])
  );
  store.set(
    'review_app_mock_reports',
    JSON.stringify([
      { id: 'repA', ownerUid: uid, reportNumber: 1, title: 'A', status: 'published', createdAt: now, updatedAt: now },
      { id: 'repB', ownerUid: uid, reportNumber: 2, title: 'B', status: 'draft', createdAt: now, updatedAt: now },
    ])
  );
  store.set(
    'review_app_mock_issues_arch_uid_1',
    JSON.stringify([
      { id: 'iss1', ownerUid: uid, title: 'I1', description: 'd', severity: 'medium', status: 'open', linkedReportId: 'repA', createdAt: now, updatedAt: now, commentsCount: 0 },
      { id: 'iss2', ownerUid: uid, title: 'I2', description: 'd', severity: 'medium', status: 'done', linkedReportId: 'repB', createdAt: now, updatedAt: now, commentsCount: 0 },
    ])
  );
  store.set(
    'review_app_mock_issues',
    JSON.stringify([
      { id: 'iss1', ownerUid: uid, title: 'I1', description: 'd', severity: 'medium', status: 'open', linkedReportId: 'repA', createdAt: now, updatedAt: now, commentsCount: 0 },
      { id: 'iss2', ownerUid: uid, title: 'I2', description: 'd', severity: 'medium', status: 'done', linkedReportId: 'repB', createdAt: now, updatedAt: now, commentsCount: 0 },
    ])
  );

  console.log('\n=== ARCHIVE: REPORT LIFECYCLE ===\n');

  eq(isArchivedReport({ status: 'archived' } as any), true, 'status archived detected');
  eq(isArchivedReport({ archived_at: now } as any), true, 'archived_at detected');
  eq(isArchivedReport({ status: 'draft' } as any), false, 'draft not archived');
  eq(isArchivedIssue({ archivedAt: now } as any), true, 'issue archivedAt detected');
  eq(isArchivedIssue({} as any), false, 'plain issue not archived');

  // Delete blocked while ACTIVE linked issues exist.
  const blocked = await deleteReport('repA');
  eq(blocked.success, false, 'delete blocked with active linked issues');

  // Archive cascades to open linked issues.
  const arch = await archiveReport('repA', uid);
  eq(arch.ok, true, 'archive ok');
  eq(arch.archivedIssues, 1, 'one open linked issue cascaded');

  const visibleReports = await getReports(uid);
  eq(visibleReports.some((r) => r.id === 'repA'), false, 'archived report leaves default list');
  eq(visibleReports.some((r) => r.id === 'repB'), true, 'active report stays');
  const allReports = await getReports(uid, undefined, { includeArchived: true });
  eq(allReports.some((r) => r.id === 'repA'), true, 'archived report visible opt-in');

  const visibleIssues = await getIssues(uid);
  eq(visibleIssues.some((i) => i.id === 'iss1'), false, 'cascaded issue leaves board');
  eq(visibleIssues.some((i) => i.id === 'iss2'), true, 'unrelated issue stays');
  const repAIssues = await getIssuesByReportId('repA', uid, { includeArchived: true });
  eq(repAIssues.some((i) => i.id === 'iss1'), true, 'archived issue listed opt-in');

  // Restore revives the report (status preserved) but NOT the issues.
  const un = await unarchiveReport('repA', uid);
  eq(un.ok, true, 'restore ok');
  const afterRestore = await getReports(uid);
  const repRestored = afterRestore.find((r) => r.id === 'repA');
  eq(repRestored?.status, 'published', 'pre-archive status preserved');
  const issuesAfterRestore = await getIssues(uid);
  eq(issuesAfterRestore.some((i) => i.id === 'iss1'), false, 'restore does not cascade to issues');

  // Restore the issue explicitly.
  const unIss = await unarchiveIssue('iss1', uid);
  eq(unIss.ok, true, 'issue restore ok');
  eq((await getIssues(uid)).some((i) => i.id === 'iss1'), true, 'issue back on board');

  // Re-archive, then delete: cascade removes archived linked issues.
  await archiveReport('repA', uid);
  const del = await deleteReport('repA');
  eq(del.success, true, 'delete after archive ok');
  const afterDelete = await getReports(uid, undefined, { includeArchived: true });
  eq(afterDelete.some((r) => r.id === 'repA'), false, 'report gone permanently');
  const issuesAfterDelete = await getIssues(uid, undefined, { includeArchived: true });
  eq(issuesAfterDelete.some((i) => i.id === 'iss1'), false, 'archived linked issue cascade-deleted');

  // Forbidden paths.
  eq((await archiveReport('repB', 'other_uid')).ok, false, 'non-owner archive rejected');
  eq((await unarchiveReport('repB', 'other_uid')).ok, false, 'non-owner restore rejected');
  eq((await unarchiveIssue('iss2', 'other_uid')).ok, false, 'non-owner issue restore rejected');

  console.log('\n=== ARCHIVE: TEST SUMMARY ===\n');
  console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runArchivingTests().catch((err) => {
  console.error('Archiving suite crashed:', err);
  process.exit(1);
});

export {};
