/**
 * COLLABORATION (INVITES BY EMAIL) TEST SUITE
 *
 * - Email normalization + invite checks (case-insensitive).
 * - Pure report access: owner / direct invite / folder invite / none.
 * - Local-mode flows: invite → visible in getReports; revoke → hidden.
 * - Issues follow accessible reports only.
 *
 * NOTE: Firestore rules (firestore.rules / storage.rules) enforce the same
 * model server-side; they must be deployed separately and cannot be
 * unit-tested here.
 */

// Minimal browser shims for the local-storage paths in lib/db.
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

async function runCollaborationTests() {
  const {
    normalizeShareEmail,
    isEmailInvited,
    canAccessReport,
    inviteToReport,
    revokeReportInvite,
    inviteToFolder,
    revokeFolderInvite,
    getReports,
    getFolders,
    getIssues,
    createReport,
    createIssue,
    createFolder,
  } = await import('../../lib/db');

  console.log('\n=== COLLABORATION: EMAIL + ACCESS ===\n');

  eq(normalizeShareEmail('  Alice@Example.COM '), 'alice@example.com', 'invite email normalized');
  eq(normalizeShareEmail('not-an-email'), null, 'invalid email rejected');
  eq(normalizeShareEmail(''), null, 'empty email rejected');
  eq(isEmailInvited(['ALICE@EXAMPLE.COM'], 'alice@example.com'), true, 'invite check case-insensitive');
  eq(isEmailInvited(undefined, 'a@b.c'), false, 'missing list → false');

  const owner = 'owner_uid_1';
  const friend = 'friend@example.com';
  const stranger = 'stranger@example.com';
  const rep: any = { id: 'r1', ownerUid: owner, sharedWithEmails: [friend], folderId: 'f1' };
  const folder: any = { id: 'f1', ownerUid: owner, sharedWithEmails: [] };
  eq(canAccessReport(rep, owner, 'owner@example.com', folder), true, 'owner accesses');
  eq(canAccessReport(rep, 'other_uid', friend, folder), true, 'invitee accesses');
  eq(canAccessReport(rep, 'other_uid', friend.toUpperCase(), folder), true, 'invitee email case-insensitive');
  eq(canAccessReport(rep, 'other_uid', stranger, folder), false, 'stranger denied');
  eq(
    canAccessReport({ ...rep, sharedWithEmails: [] }, 'other_uid', stranger, { ...folder, ownerUid: 'x', sharedWithEmails: [stranger] }),
    true,
    'folder invitee accesses folder report'
  );
  eq(canAccessReport(rep, undefined, friend, folder), false, 'missing uid denied');

  console.log('\n=== COLLABORATION: LOCAL FLOWS ===\n');

  // Seed owner-scoped copies like the app writes them.
  const now = new Date().toISOString();
  const repRow = { id: 'rep_shared', ownerUid: owner, reportNumber: 1, title: 'Shared', folderId: 'fld_shared', sharedWithEmails: [], createdAt: now, updatedAt: now };
  const fldRow = { id: 'fld_shared', ownerUid: owner, name: 'Team', parentId: null, sharedWithEmails: [], createdAt: now, updatedAt: now };
  store.set('review_app_mock_reports', JSON.stringify([repRow]));
  store.set('review_app_mock_folders', JSON.stringify([fldRow]));
  store.set('review_app_mock_reports_owner_uid_1', JSON.stringify([repRow]));
  store.set('review_app_mock_folders_owner_uid_1', JSON.stringify([fldRow]));
  // Friend session (uid + email) for email auto-resolution.
  const setSession = (uid: string, email: string) =>
    store.set('review_app_auth_user', JSON.stringify({ uid, email }));

  const friendUid = 'friend_uid_9';
  setSession(friendUid, friend);
  const before = await getReports(friendUid, friend);
  eq(before.some((r) => r.id === 'rep_shared'), false, 'before invite: shared report hidden');

  // Owner invites the folder → report becomes visible (dynamic inheritance).
  // (Session switched to the owner: invites run from the owner's browser.)
  setSession(owner, 'owner@example.com');
  const inv = await inviteToFolder('fld_shared', friend, owner);
  eq(inv.ok, true, 'folder invite ok');
  setSession(friendUid, friend);
  const afterInvite = await getReports(friendUid, friend);
  eq(afterInvite.some((r) => r.id === 'rep_shared'), true, 'after folder invite: report visible');
  const sharedFolders = await getFolders(friendUid, friend);
  eq(sharedFolders.some((f) => f.id === 'fld_shared'), true, 'after invite: folder visible');

  // Issues linked to the shared report are visible; others are not.
  store.set(
    'review_app_mock_issues',
    JSON.stringify([
      { id: 'iss_shared', ownerUid: owner, title: 'T', description: 'd', severity: 'medium', status: 'open', linkedReportId: 'rep_shared', createdAt: now, updatedAt: now, commentsCount: 0 },
      { id: 'iss_private', ownerUid: owner, title: 'P', description: 'd', severity: 'medium', status: 'open', linkedReportId: 'rep_other', createdAt: now, updatedAt: now, commentsCount: 0 },
    ])
  );
  const friendIssues = await getIssues(friendUid, friend);
  eq(friendIssues.some((i) => i.id === 'iss_shared'), true, 'linked issue visible to collaborator');
  eq(friendIssues.some((i) => i.id === 'iss_private'), false, 'unlinked issue hidden from collaborator');

  // Revoke → hidden again.
  setSession(owner, 'owner@example.com');
  const rev = await revokeFolderInvite('fld_shared', friend, owner);
  eq(rev.ok, true, 'folder revoke ok');
  setSession(friendUid, friend);
  const afterRevoke = await getReports(friendUid, friend);
  eq(afterRevoke.some((r) => r.id === 'rep_shared'), false, 'after revoke: report hidden');

  // Direct report invite flow.
  setSession(owner, 'owner@example.com');
  const invR = await inviteToReport('rep_shared', friend, owner);
  eq(invR.ok, true, 'report invite ok');
  setSession(friendUid, friend);
  const afterDirect = await getReports(friendUid, friend);
  eq(afterDirect.some((r) => r.id === 'rep_shared'), true, 'after direct invite: visible');
  setSession(owner, 'owner@example.com');
  const revR = await revokeReportInvite('rep_shared', friend, owner);
  eq(revR.ok, true, 'report revoke ok');
  setSession(friendUid, friend);
  const afterDirectRevoke = await getReports(friendUid, friend);
  eq(afterDirectRevoke.some((r) => r.id === 'rep_shared'), false, 'after direct revoke: hidden');

  // Forbidden: non-owner cannot invite.
  setSession(friendUid, friend);
  const bad = await inviteToReport('rep_shared', stranger, friendUid);
  eq(bad.ok, false, 'non-owner invite rejected');
  setSession(owner, 'owner@example.com');
  eq((await inviteToReport('rep_shared', 'bad-email', owner)).ok, false, 'bad email rejected');

  // createReport / createIssue / createFolder smoke (no regression).
  const created = await createReport({ ownerUid: owner, title: 'Smoke', language: 'ar', author: 'a' } as any);
  eq(typeof created.id === 'string' && created.id.length > 0, true, 'createReport still works');
  const folderCreated = await createFolder({ name: 'SmokeF', parentId: null, ownerUid: owner });
  eq(typeof folderCreated.id === 'string', true, 'createFolder still works');
  const issCreated = await createIssue({ ownerUid: owner, title: 'S', description: 'd', severity: 'medium', status: 'open', linkedReportId: null } as any);
  eq(typeof issCreated.id === 'string', true, 'createIssue still works');

  console.log('\n=== COLLABORATION: TEST SUMMARY ===\n');
  console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runCollaborationTests().catch((err) => {
  console.error('Collaboration suite crashed:', err);
  process.exit(1);
});
