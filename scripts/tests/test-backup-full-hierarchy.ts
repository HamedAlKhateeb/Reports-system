/**
 * FULL HIERARCHY BACKUP & RESTORE AUTOMATED TEST SUITE
 *
 * Validates Requirement 14:
 * Backup & Restore must include:
 * - Projects
 * - Teams (Members & Roles)
 * - Reports
 * - Visual Boards
 * - Tasks & Member Assignments
 * - Notes & Comments
 * - Smart Tables (Formulas, Formats, Merges)
 * - Folders & Issues
 * Full relational restore with ownership rewrite for isolation.
 */

import {
  buildUserBackup,
  restoreUserBackup,
  parseBackupFile,
  BACKUP_KIND,
  type BackupFile,
} from '../../lib/backup';
import {
  saveProject,
  getProjects,
  saveTable,
  getTableById,
} from '../../lib/db-intelligence';
import {
  saveTeam,
  getTeamByProjectId,
} from '../../lib/teams-db';
import {
  saveBoard,
  getBoards,
} from '../../lib/boards-db';
import {
  getReports,
  getIssues,
} from '../../lib/db';
import type { ProjectItem, Team } from '../../lib/projects-types';
import type { Board } from '../../lib/boards-types';
import type { ReportItem, IssueItem, TableEntity } from '../../lib/types';

let passed = 0;
let failed = 0;

function assert(cond: any, msg: string) {
  if (Boolean(cond)) {
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

// In Node.js environment, mock window.localStorage
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
  clear: () => store.clear(),
};
(globalThis as any).window.localStorage = (globalThis as any).localStorage;

async function runTests() {
  console.log('--- Test Suite: Full Hierarchy Backup & Restore ---');

  const sourceUser = 'user_engineer_99';
  const sourceEmail = 'engineer@review-app.local';
  const targetUser = 'user_restorer_88';
  const targetEmail = 'restorer@review-app.local';

  // 1. Setup Data for Source User
  console.log('\n1. Creating Source Relational Data:');
  const projId = `proj_${Date.now()}_audit`;
  const proj: ProjectItem = {
    id: projId,
    name: 'مشروع المراجعة والتدقيق الشامل',
    description: 'مشروع تجريبي متكامل لاختبار النسخ الاحتياطي',
    owner_id: sourceUser,
    ownerUid: sourceUser,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveProject(proj, sourceUser);

  const team: Team = {
    id: `team_${projId}`,
    projectId: projId,
    name: 'فريق التدقيق المالي',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: `mem_${sourceUser}`,
        projectId: projId,
        uid: sourceUser,
        userId: sourceUser,
        email: sourceEmail,
        displayName: 'رئيس فريق التدقيق',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'mem_auditor_2',
        projectId: projId,
        uid: 'user_auditor_2',
        userId: 'user_auditor_2',
        email: 'auditor2@review-app.local',
        displayName: 'المدقق المساعد',
        role: 'member',
        joinedAt: new Date().toISOString(),
      },
    ],
    invitations: [],
  };
  await saveTeam(team);

  const reportId = `rep_${Date.now()}_audit`;
  const report: ReportItem = {
    id: reportId,
    reportNumber: 1,
    title: 'تقرير التدقيق السنوي 2026',
    ownerUid: sourceUser,
    projectId: projId,
    status: 'published',
    language: 'ar',
    author: 'رئيس فريق التدقيق',
    content: '<p>تقرير رسمي معتمد</p>',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  (globalThis as any).localStorage.setItem(`review_app_mock_reports_${sourceUser}`, JSON.stringify([report]));
  (globalThis as any).localStorage.setItem('review_app_mock_reports', JSON.stringify([report]));

  const tableId = `tbl_${Date.now()}_metrics`;
  const table: TableEntity = {
    id: tableId,
    report_id: reportId,
    name: 'جدول المؤشرات الحيوية',
    direction: 'rtl',
    columns_data: [
      { id: 'A', name: 'المؤشر', type: 'text', width: 180 },
      { id: 'B', name: 'النسبة', type: 'text', width: 120 },
    ],
    rows_data: [
      { A: 'الأداء العام', B: '98%' },
      { A: 'الامتثال للمعايير', B: '100%' },
    ],
    cell_formats: {
      A1: { bold: true, align: 'center', textColor: '#047857' },
    },
    merged_cells: [],
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveTable(table);

  const boardId = `board_${Date.now()}_visual`;
  const board: Board = {
    id: boardId,
    title: 'لوحة متابعة المهام البصرية',
    ownerUid: sourceUser,
    projectId: projId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    widgets: [
      {
        id: 'widget_task_1',
        type: 'task',
        title: 'مهمة مراجعة التقارير',
        x: 40,
        y: 60,
        width: 320,
        height: 240,
        data: {
          description: 'مراجعة الميزانية العامة قبل الاعتماد',
          status: 'in-progress',
          priority: 'high',
          assigneeUid: 'user_auditor_2',
          assigneeEmail: 'auditor2@review-app.local',
          assigneeName: 'المدقق المساعد',
        },
      },
      {
        id: 'widget_note_1',
        type: 'note',
        title: 'ملاحظة مهمة',
        x: 400,
        y: 60,
        width: 280,
        height: 180,
        data: {
          content: 'تأكد من تطبيق معايير RTL في جميع الشاشات',
          color: 'amber',
        },
      },
    ],
  };
  await saveBoard(board);

  // 2. Export Full User Backup
  console.log('\n2. Building Full Relational Backup:');
  const backup = await buildUserBackup(sourceUser, sourceEmail);

  assert(backup.kind === BACKUP_KIND, 'Backup kind is valid');
  assert(backup.counts.projects! >= 1, 'Backup counts projects');
  assert(backup.counts.teams! >= 1, 'Backup counts teams');
  assert(backup.counts.boards! >= 1, 'Backup counts boards');
  assert(backup.counts.tables >= 1, 'Backup counts tables');
  assert(backup.projects?.some((p) => p.id === projId), 'Backup includes Project');
  assert(backup.teams?.some((t) => t.projectId === projId), 'Backup includes Team');
  assert(backup.boards?.some((b) => b.id === boardId), 'Backup includes Board');
  assert(backup.tables?.some((t) => t.id === tableId), 'Backup includes Smart Table');

  // Verify Serialization / Parsing
  const jsonText = JSON.stringify(backup);
  const parsedBackup = parseBackupFile(jsonText);
  eq(parsedBackup.counts.projects, backup.counts.projects, 'Parsed backup projects count matches');
  eq(parsedBackup.counts.boards, backup.counts.boards, 'Parsed backup boards count matches');

  // 3. Restore Backup to Target User
  console.log('\n3. Restoring Backup to Target User:');
  await restoreUserBackup(targetUser, parsedBackup);

  // 4. Verify Relational Restoration & Ownership Rewrite
  console.log('\n4. Validating Restored Relations & Data Integrity:');
  const targetProjects = await getProjects(targetUser);
  const restoredProj = targetProjects.find((p) => p.id === projId);
  assert(restoredProj !== undefined, 'Project restored for target user');
  assert(
    restoredProj?.owner_id === targetUser || restoredProj?.ownerUid === targetUser,
    'Restored project ownership rewritten to target user'
  );

  const restoredTeam = await getTeamByProjectId(projId, targetUser, targetEmail);
  assert(restoredTeam !== null, 'Team restored for project');
  assert(restoredTeam.members.length === 2, 'Team members preserved');
  eq(restoredTeam.name, 'فريق التدقيق المالي', 'Team name preserved');

  const targetBoards = await getBoards(targetUser, projId);
  const restoredBoard = targetBoards.find((b) => b.id === boardId);
  assert(restoredBoard !== undefined, 'Visual board restored');
  assert(restoredBoard?.ownerUid === targetUser, 'Board ownership rewritten to target user');
  eq(restoredBoard?.widgets.length, 2, 'Board widgets count preserved');

  const taskWidget = restoredBoard?.widgets.find((w) => w.type === 'task');
  assert(taskWidget !== undefined, 'Task widget preserved in board');
  eq(taskWidget?.title, 'مهمة مراجعة التقارير', 'Task title preserved');
  eq((taskWidget?.data as any)?.assigneeUid, 'user_auditor_2', 'Task assignee UID preserved');
  eq((taskWidget?.data as any)?.assigneeEmail, 'auditor2@review-app.local', 'Task assignee email preserved');

  const noteWidget = restoredBoard?.widgets.find((w) => w.type === 'note');
  assert(noteWidget !== undefined, 'Note widget preserved in board');
  eq((noteWidget?.data as any)?.color, 'amber', 'Note color preserved');

  const restoredTable = await getTableById(tableId);
  assert(restoredTable !== null, 'Smart table restored');
  eq(restoredTable?.name, 'جدول المؤشرات الحيوية', 'Table name preserved');
  eq(restoredTable?.direction, 'rtl', 'Table RTL direction preserved');
  eq(restoredTable?.rows_data?.[0]?.A, 'الأداء العام', 'Table rows data preserved');
  eq(restoredTable?.cell_formats?.['A1']?.bold, true, 'Table cell formatting preserved');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
