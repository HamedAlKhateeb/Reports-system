/**
 * PROJECTS ISOLATION E2E TEST SUITE
 *
 * Verifies:
 * 1. Clean slate for fresh projects: 0 reports, 0 issues, 0 folders, 0 boards.
 * 2. Strict isolation: entities created in Project A NEVER leak into Project B.
 * 3. Board sessions and tabs are isolated per project.
 * 4. Switching projects strictly yields the active project's dataset.
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
  createReport,
  getReports,
  createIssue,
  getIssues,
  createFolder,
  getFolders,
} from '../../lib/db';
import {
  saveBoard,
  getBoards,
  saveBoardSession,
  getBoardSession,
  generateBoardId,
} from '../../lib/boards-db';

async function run() {
  console.log('--- Testing Projects Isolation E2E ---');

  const testUser = 'user_proj_iso_' + Date.now();
  const testEmail = `${testUser}@example.com`;
  const projA = 'proj_alpha_' + Date.now();
  const projB = 'proj_beta_' + Date.now();

  // Step 1: Initial state for fresh projects must be empty
  const initialReportsA = await getReports(testUser, testEmail, { projectId: projA });
  const initialIssuesA = await getIssues(testUser, testEmail, { projectId: projA });
  const initialFoldersA = await getFolders(testUser, testEmail, projA);
  const initialBoardsA = await getBoards(testUser, projA);

  assert.strictEqual(initialReportsA.length, 0, 'Project A starts with 0 reports');
  assert.strictEqual(initialIssuesA.length, 0, 'Project A starts with 0 issues');
  assert.strictEqual(initialFoldersA.length, 0, 'Project A starts with 0 folders');
  assert.strictEqual(initialBoardsA.length, 0, 'Project A starts with 0 boards');

  // Step 2: Create entities in Project A
  const repA = await createReport({
    title: 'Report Alpha',
    language: 'ar',
    author: 'Tester',
    systemUnderReview: 'System A',
    contentJson: {},
    ownerUid: testUser,
    projectId: projA,
  });

  const issA = await createIssue({
    title: 'Issue Alpha',
    description: 'Bug in Alpha',
    status: 'open',
    severity: 'high',
    ownerUid: testUser,
    projectId: projA,
    linkedReportId: null,
  });

  const folA = await createFolder({
    name: 'Folder Alpha',
    color: '#2E4034',
    ownerUid: testUser,
    projectId: projA,
    parentId: null,
  });

  const boardA = await saveBoard({
    id: generateBoardId('board'),
    title: 'Board Alpha',
    widgets: [],
    ownerUid: testUser,
    projectId: projA,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  saveBoardSession({ openBoardIds: [boardA.id], activeBoardId: boardA.id }, testUser, projA);

  // Step 3: Query Project A - all items present
  const reportsA = await getReports(testUser, testEmail, { projectId: projA });
  const issuesA = await getIssues(testUser, testEmail, { projectId: projA });
  const foldersA = await getFolders(testUser, testEmail, projA);
  const boardsA = await getBoards(testUser, projA);
  const sessionA = getBoardSession(testUser, projA);

  assert.strictEqual(reportsA.length, 1, 'Project A has 1 report');
  assert.strictEqual(reportsA[0].id, repA.id, 'Report ID matches in Project A');
  assert.strictEqual(issuesA.length, 1, 'Project A has 1 issue');
  assert.strictEqual(issuesA[0].id, issA.id, 'Issue ID matches in Project A');
  assert.strictEqual(foldersA.length, 1, 'Project A has 1 folder');
  assert.strictEqual(foldersA[0].id, folA.id, 'Folder ID matches in Project A');
  assert.strictEqual(boardsA.length, 1, 'Project A has 1 board');
  assert.strictEqual(boardsA[0].id, boardA.id, 'Board ID matches in Project A');
  assert.strictEqual(sessionA.activeBoardId, boardA.id, 'Board session preserved in Project A');

  // Step 4: Query Project B - ZERO leakage from Project A!
  const reportsB = await getReports(testUser, testEmail, { projectId: projB });
  const issuesB = await getIssues(testUser, testEmail, { projectId: projB });
  const foldersB = await getFolders(testUser, testEmail, projB);
  const boardsB = await getBoards(testUser, projB);
  const sessionB = getBoardSession(testUser, projB);

  assert.strictEqual(reportsB.length, 0, 'Project B has 0 reports (NO LEAKAGE)');
  assert.strictEqual(issuesB.length, 0, 'Project B has 0 issues (NO LEAKAGE)');
  assert.strictEqual(foldersB.length, 0, 'Project B has 0 folders (NO LEAKAGE)');
  assert.strictEqual(boardsB.length, 0, 'Project B has 0 boards (NO LEAKAGE)');
  assert.strictEqual(sessionB.openBoardIds.length, 0, 'Project B has 0 open session boards (NO LEAKAGE)');
  assert.strictEqual(sessionB.activeBoardId, null, 'Project B has null active board');

  // Step 5: Create in Project B and verify separation
  const repB = await createReport({
    title: 'Report Beta',
    language: 'en',
    author: 'Tester',
    systemUnderReview: 'System B',
    contentJson: {},
    ownerUid: testUser,
    projectId: projB,
  });

  const freshReportsA = await getReports(testUser, testEmail, { projectId: projA });
  const freshReportsB = await getReports(testUser, testEmail, { projectId: projB });
  assert.strictEqual(freshReportsA.length, 1, 'Project A still has only its 1 report');
  assert.strictEqual(freshReportsB.length, 1, 'Project B has only its 1 report');
  assert.strictEqual(freshReportsB[0].id, repB.id, 'Project B contains Report Beta');

  console.log('✅ ALL PROJECTS ISOLATION E2E TESTS PASSED!');
}

run().catch((err) => {
  console.error('❌ Project isolation test failed:', err);
  process.exit(1);
});
