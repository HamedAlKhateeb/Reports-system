/**
 * BOARDS DATA & PERSISTENCE AUTOMATED TEST SUITE
 *
 * Validates:
 * 1. Board creation and widget manipulation (Task, Note, Comment)
 * 2. Spatial coordinates and resize dimensions
 * 3. Board persistence (save, fetch, update)
 * 4. Archiving and unarchiving lifecycle
 * 5. Permanent deletion
 * 6. Browser tab session persistence (open tabs, active tab)
 * 7. Multi-user isolation
 */

import type { Board, BoardWidget, BoardSession } from '../../lib/boards-types';
import {
  saveBoard,
  getBoards,
  getBoardById,
  archiveBoard,
  getArchivedBoards,
  restoreBoard,
  deleteBoardPermanently,
  saveBoardSession,
  getBoardSession,
  generateBoardId,
} from '../../lib/boards-db';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

function eq(actual: any, expected: any, msg: string) {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg} -> expected ${eStr}, got ${aStr}`);
    failed++;
  }
}

// In Node.js environment, mock localStorage if window is not defined
if (typeof window === 'undefined') {
  const store = new Map<string, string>();
  (global as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

async function run() {
  console.log('=== BOARDS DATA & PERSISTENCE TESTS ===\n');

  const testUser = 'user_test_123';
  const otherUser = 'user_other_456';

  // ----------------------------------------------------
  // 1. Board Creation & Widget Structure
  // ----------------------------------------------------
  console.log('--- 1. Board Creation & Widget Structure ---');

  const boardId = generateBoardId('test_board');
  const taskWidget: BoardWidget = {
    id: generateBoardId('w'),
    type: 'task',
    x: 150,
    y: 120,
    width: 260,
    height: 180,
    title: 'تطوير واجهة اللوحات',
    data: {
      status: 'in-progress',
      priority: 'high',
      description: 'إنجاز التبويبات والمساحة المكانية الحرة',
      dueDate: '2026-10-01',
    },
  };

  const noteWidget: BoardWidget = {
    id: generateBoardId('w'),
    type: 'note',
    x: 450,
    y: 120,
    width: 220,
    height: 200,
    title: 'ملاحظة مهمة',
    data: {
      content: 'تصميم Excalidraw-like مع إمكانية التكبير والتصغير',
      color: 'yellow',
    },
  };

  const commentWidget: BoardWidget = {
    id: generateBoardId('w'),
    type: 'comment',
    x: 700,
    y: 120,
    width: 240,
    height: 140,
    title: 'تعليق مراجع',
    data: {
      text: 'يبدو الأداء سلساً وسريعاً جداً!',
      author: 'حامد الخطيب',
      createdAt: new Date().toISOString(),
    },
  };

  const initialBoard: Board = {
    id: boardId,
    title: 'لوحة المشاريع الاستراتيجية',
    widgets: [taskWidget, noteWidget, commentWidget],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerUid: testUser,
  };

  // Save board
  await saveBoard(initialBoard);
  const fetched = await getBoardById(boardId, testUser);
  assert(fetched !== null, 'Board saved and retrieved by ID');
  eq(fetched?.title, 'لوحة المشاريع الاستراتيجية', 'Board title matches');
  eq(fetched?.widgets.length, 3, 'Board contains 3 widgets');
  eq(fetched?.widgets[0].type, 'task', 'Widget 0 is task');
  eq(fetched?.widgets[1].type, 'note', 'Widget 1 is note');
  eq(fetched?.widgets[2].type, 'comment', 'Widget 2 is comment');

  // ----------------------------------------------------
  // 2. Spatial Manipulation (Move & Resize)
  // ----------------------------------------------------
  console.log('\n--- 2. Spatial Manipulation ---');

  // Move task widget and resize note widget
  const updatedWidgets = [...(fetched?.widgets || [])];
  updatedWidgets[0] = { ...updatedWidgets[0], x: 300, y: 250 };
  updatedWidgets[1] = { ...updatedWidgets[1], width: 320, height: 260 };

  const updatedBoard: Board = {
    ...fetched!,
    widgets: updatedWidgets,
  };
  await saveBoard(updatedBoard);

  const afterMove = await getBoardById(boardId, testUser);
  eq(afterMove?.widgets[0].x, 300, 'Widget moved to X: 300');
  eq(afterMove?.widgets[0].y, 250, 'Widget moved to Y: 250');
  eq(afterMove?.widgets[1].width, 320, 'Widget resized to W: 320');
  eq(afterMove?.widgets[1].height, 260, 'Widget resized to H: 260');

  // ----------------------------------------------------
  // 3. User Isolation
  // ----------------------------------------------------
  console.log('\n--- 3. User Isolation ---');

  const otherUserBoards = await getBoards(otherUser);
  eq(otherUserBoards.length, 0, 'Other user cannot see test user boards');

  const testUserBoards = await getBoards(testUser);
  eq(testUserBoards.length, 1, 'Test user sees exactly their 1 board');

  // ----------------------------------------------------
  // 4. Archive & Restore Lifecycle
  // ----------------------------------------------------
  console.log('\n--- 4. Archive & Restore Lifecycle ---');

  // Archive
  await archiveBoard(boardId, testUser);
  const activeAfterArchive = await getBoards(testUser);
  eq(activeAfterArchive.length, 0, 'Archived board no longer appears in active boards');

  const archivedList = await getArchivedBoards(testUser);
  eq(archivedList.length, 1, 'Archived board appears in archived boards list');
  eq(archivedList[0].id, boardId, 'Archived board ID matches');

  // Restore
  await restoreBoard(boardId, testUser);
  const activeAfterRestore = await getBoards(testUser);
  eq(activeAfterRestore.length, 1, 'Restored board appears back in active boards');
  const archivedAfterRestore = await getArchivedBoards(testUser);
  eq(archivedAfterRestore.length, 0, 'Restored board removed from archived list');

  // ----------------------------------------------------
  // 5. Tab Session Management
  // ----------------------------------------------------
  console.log('\n--- 5. Tab Session Management ---');

  const session: BoardSession = {
    openBoardIds: [boardId, 'board_2', 'board_3'],
    activeBoardId: boardId,
  };
  saveBoardSession(session, testUser);

  const loadedSession = getBoardSession(testUser);
  eq(loadedSession.openBoardIds, [boardId, 'board_2', 'board_3'], 'Open board IDs persisted in session');
  eq(loadedSession.activeBoardId, boardId, 'Active board ID persisted in session');

  // ----------------------------------------------------
  // 6. Permanent Deletion
  // ----------------------------------------------------
  console.log('\n--- 6. Permanent Deletion ---');

  await deleteBoardPermanently(boardId, testUser);
  const afterDelete = await getBoardById(boardId, testUser);
  eq(afterDelete, null, 'Board permanently deleted and cannot be found');

  const sessionAfterDelete = getBoardSession(testUser);
  assert(!sessionAfterDelete.openBoardIds.includes(boardId), 'Deleted board removed from open tabs session');

  console.log(`\n========================================`);
  console.log(`Boards Tests Finished: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
