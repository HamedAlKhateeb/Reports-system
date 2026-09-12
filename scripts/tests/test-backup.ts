/**
 * BACKUP / RESTORE TEST SUITE
 *
 * Methodology: pure round-trip on the guest (local-only) path.
 * - parseBackupFile rejects non-backup / corrupt / bad-version payloads.
 * - restoreUserBackup(guest) merges reports+folders+issues into user-scoped
 *   localStorage keys and rewrites ownership to the restoring user.
 * - Merge preserves pre-existing docs with other ids (nothing deleted).
 */
import { BACKUP_KIND, parseBackupFile, restoreUserBackup } from '../../lib/backup';

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
// backup.ts guards on window.localStorage — expose the mock there too.
(globalThis as any).window.localStorage = (globalThis as any).localStorage;

let passed = 0;
let failed = 0;

function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function expectThrow(fn: () => void, msg: string) {
  try {
    fn();
    ok(false, `${msg} (did not throw)`);
  } catch {
    ok(true, msg);
  }
}

const UID = 'guest_backup_1';

const sample = {
  kind: BACKUP_KIND,
  version: 1,
  exportedAt: new Date().toISOString(),
  exportedByUid: 'someone_else',
  counts: { reports: 1, folders: 1, issues: 1, images: 0, comments: 0 },
  reports: [{ id: 'rep_1', ownerUid: 'someone_else', title: 'R1', contentJson: { type: 'doc', content: [] } }],
  folders: [{ id: 'fold_1', ownerUid: 'someone_else', name: 'F1' }],
  issues: [{ id: 'iss_1', ownerUid: 'someone_else', title: 'I1', linkedReportId: 'rep_1' }],
  images: [],
  comments: [],
};

async function main() {
  console.log('BACKUP SUITE: validation');
  expectThrow(() => parseBackupFile('not-json{{{'), 'rejects invalid JSON');
  expectThrow(() => parseBackupFile(JSON.stringify({ kind: 'other', version: 1 })), 'rejects wrong kind');
  expectThrow(() => parseBackupFile(JSON.stringify({ kind: BACKUP_KIND, version: 99 })), 'rejects unsupported version');
  expectThrow(
    () => parseBackupFile(JSON.stringify({ kind: BACKUP_KIND, version: 1, reports: [], folders: [] })),
    'rejects missing issues array'
  );
  const parsed = parseBackupFile(JSON.stringify(sample));
  ok(parsed.reports.length === 1 && parsed.issues.length === 1, 'accepts a valid backup file');

  console.log('BACKUP SUITE: guest merge-restore');
  // Pre-existing doc must survive the restore.
  store.set(`review_app_mock_reports_${UID}`, JSON.stringify([{ id: 'rep_keep', ownerUid: UID, title: 'Keep' }]));
  await restoreUserBackup(UID, parsed);
  const reports = JSON.parse(store.get(`review_app_mock_reports_${UID}`) || '[]');
  const folders = JSON.parse(store.get(`review_app_mock_folders_${UID}`) || '[]');
  const issues = JSON.parse(store.get(`review_app_mock_issues_${UID}`) || '[]');
  ok(reports.length === 2 && reports.some((r: any) => r.id === 'rep_keep'), 'merge preserves pre-existing reports');
  ok(reports.some((r: any) => r.id === 'rep_1' && r.ownerUid === UID), 'restored reports rewritten to restoring user');
  ok(folders.length === 1 && folders[0].ownerUid === UID, 'restores folders with ownership rewrite');
  ok(issues.length === 1 && (issues[0] as any).linkedReportId === 'rep_1', 'restores issues keeping report links');

  console.log(`\nBACKUP SUITE: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('BACKUP SUITE ERROR', e);
  process.exit(1);
});
