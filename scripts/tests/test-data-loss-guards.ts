/**
 * DATA-LOSS GUARDS TEST SUITE
 *
 * - setLocal failures are loud: createReport throws storage-full and
 *   updateReport returns false on the local-only path (never silent).
 * - findOrphanedReportOwners spots data under other uids (identity
 *   mismatch looks like "deletion").
 */

const store = new Map<string, string>();
let quotaTripped = false;
function quotaError(): Error {
  const e: any = new Error('QuotaExceededError');
  e.name = 'QuotaExceededError';
  e.code = 22;
  return e;
}
(globalThis as any).window = {
  dispatchEvent: () => {},
};
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (quotaTripped) throw quotaError();
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
(globalThis as any).CustomEvent = class {
  constructor(public type: string, public opts?: any) {}
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

async function runGuardsTests() {
  const { createReport, updateReport, findOrphanedReportOwners, isQuotaExceededError } = await import(
    '../../lib/db'
  );

  console.log('\n=== GUARDS: QUOTA DETECTION ===\n');
  eq(isQuotaExceededError(quotaError()), true, 'quota error detected');
  eq(isQuotaExceededError(new Error('nope')), false, 'plain error not quota');

  console.log('\n=== GUARDS: LOUD LOCAL FAILURE ===\n');
  const uid = 'guard_uid_1';
  const created = await createReport({ ownerUid: uid, title: 'G', language: 'ar', author: 'a' } as any);
  eq(typeof created.id === 'string', true, 'normal local create works');

  quotaTripped = true;
  let threw: any = null;
  try {
    await createReport({ ownerUid: uid, title: 'Lost?', language: 'ar', author: 'a' } as any);
  } catch (e: any) {
    threw = e;
  }
  eq(threw?.code, 'storage-full', 'create throws storage-full instead of silent loss');
  const upd = await updateReport(created.id, { title: 'Nope' });
  eq(upd, false, 'update returns false on local persist failure');
  quotaTripped = false;

  console.log('\n=== GUARDS: ORPHANED IDENTITY ===\n');
  store.set(
    'review_app_mock_reports_other_uid_9',
    JSON.stringify([{ id: 'rx', ownerUid: 'other_uid_9', reportNumber: 1, title: 'Old' }])
  );
  const orphans = findOrphanedReportOwners(uid);
  eq(orphans.some((o) => o.ownerUid === 'other_uid_9' && o.count === 1), true, 'orphaned uid spotted with count');
  eq(findOrphanedReportOwners(uid).some((o) => o.ownerUid === uid), false, 'own uid never flagged');
  eq(findOrphanedReportOwners(undefined).length, 0, 'missing uid → none');

  console.log('\n=== GUARDS: TEST SUMMARY ===\n');
  console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runGuardsTests().catch((err) => {
  console.error('Guards suite crashed:', err);
  process.exit(1);
});

export {};
