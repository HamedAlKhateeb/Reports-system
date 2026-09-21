/**
 * TEST SUITE: BOARDS SOFT DELETE & 10-DAY TRASH RETENTION
 *
 * Verifies:
 * 1. moveToTrash sets deletedAt and trashExpiresAt (+10 days).
 * 2. getBoards filters out soft-deleted boards.
 * 3. getTrashBoards returns soft-deleted boards with remaining days calculated.
 * 4. restoreBoardFromTrash clears deletedAt/trashExpiresAt and makes board active again.
 * 5. deleteBoardPermanently removes board completely.
 * 6. Auto-purge permanently cleans up boards older than 10 days.
 */

import {
  saveBoard,
  getBoards,
  getTrashBoards,
  moveToTrash,
  restoreBoardFromTrash,
  deleteBoardPermanently,
  getRemainingDaysInTrash,
  isTrashExpired,
  TRASH_RETENTION_DAYS,
} from '../../lib/boards-db';
import type { Board } from '../../lib/boards-types';

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

async function runBoardsTrashTests() {
  console.log('=== BOARDS SOFT-DELETE & 10-DAY TRASH TEST SUITE ===\n');

  const testUser = 'user_test_trash_' + Date.now();

  // Create test board
  const board1: Board = {
    id: 'b_trash_1',
    title: 'لوحة تجربة الحذف المؤقت',
    widgets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerUid: testUser,
  };
  await saveBoard(board1);

  // Test 1: Active board shows in getBoards
  const activeList1 = await getBoards(testUser);
  assert(activeList1.some((b) => b.id === 'b_trash_1'), 'Board appears in active getBoards()');

  // Test 2: Soft delete -> moveToTrash
  await moveToTrash('b_trash_1', testUser);
  const activeList2 = await getBoards(testUser);
  assert(!activeList2.some((b) => b.id === 'b_trash_1'), 'Soft-deleted board disappears from active getBoards()');

  // Test 3: Appears in getTrashBoards with 10 days remaining
  const trashList = await getTrashBoards(testUser);
  const trashedBoard = trashList.find((b) => b.id === 'b_trash_1');
  assert(!!trashedBoard, 'Soft-deleted board appears in getTrashBoards()');
  assert(!!trashedBoard?.deletedAt, 'trashedBoard has deletedAt timestamp');
  assert(!!trashedBoard?.trashExpiresAt, 'trashedBoard has trashExpiresAt timestamp');
  const daysLeft = getRemainingDaysInTrash(trashedBoard!);
  assert(daysLeft === TRASH_RETENTION_DAYS, `Remaining days is exactly ${TRASH_RETENTION_DAYS} (got ${daysLeft})`);

  // Test 4: Restore from trash
  const restored = await restoreBoardFromTrash('b_trash_1', testUser);
  assert(!!restored && !restored.deletedAt && !restored.trashExpiresAt, 'restoreBoardFromTrash clears deletedAt & trashExpiresAt');
  const activeList3 = await getBoards(testUser);
  assert(activeList3.some((b) => b.id === 'b_trash_1'), 'Restored board is back in active getBoards()');

  // Test 5: Permanent delete
  await deleteBoardPermanently('b_trash_1', testUser);
  const activeList4 = await getBoards(testUser);
  const trashList2 = await getTrashBoards(testUser);
  assert(
    !activeList4.some((b) => b.id === 'b_trash_1') && !trashList2.some((b) => b.id === 'b_trash_1'),
    'deleteBoardPermanently deletes board completely from both active and trash'
  );

  // Test 6: Auto-purge of expired boards (> 10 days)
  const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
  const expiredBoard: Board = {
    id: 'b_expired_10d',
    title: 'لوحة منتهية الصلاحية',
    widgets: [],
    createdAt: elevenDaysAgo,
    updatedAt: elevenDaysAgo,
    deletedAt: elevenDaysAgo,
    trashExpiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    ownerUid: testUser,
  };
  await saveBoard(expiredBoard);

  assert(isTrashExpired(expiredBoard), 'isTrashExpired identifies board older than 10 days');

  // Calling getTrashBoards should automatically purge it
  const trashList3 = await getTrashBoards(testUser);
  assert(!trashList3.some((b) => b.id === 'b_expired_10d'), 'Expired board (>10 days) was auto-purged on query');

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runBoardsTrashTests().catch((err) => {
  console.error('Test run failed', err);
  process.exit(1);
});
