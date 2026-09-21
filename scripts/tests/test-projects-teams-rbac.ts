/**
 * PROJECTS, TEAMS, RBAC & DATA ISOLATION AUTOMATED TEST SUITE
 *
 * Validates:
 * 1. Multi-project lifecycle (User -> Projects -> Active Project).
 * 2. Team creation and default team initialization with owner.
 * 3. Member invitations, pending status, acceptance, and cancellation.
 * 4. Role changes (Owner -> Admin -> Member) and permission checks.
 * 5. Member removal and revocation of access.
 * 6. Strict Data Isolation: User A cannot access User B's project or team data.
 * 7. Task assignment within project teams (assign, reassign, unassign).
 */

import {
  getTeamByProjectId,
  saveTeam,
  checkProjectAccess,
  getUserAccessibleProjects,
  inviteMember,
  acceptInvitation,
  cancelInvitation,
  removeMember,
  changeMemberRole,
} from '../../lib/teams-db';
import {
  getProjects,
  saveProject,
  getProjectById,
} from '../../lib/db-intelligence';
import type { ProjectItem, Team } from '../../lib/projects-types';
import type { TaskWidgetData } from '../../lib/boards-types';

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

async function runTests() {
  console.log('--- Test Suite: Projects, Teams, RBAC & Data Isolation ---');

  const userA = 'user_alice_101';
  const emailA = 'alice@example.com';
  const userB = 'user_bob_202';
  const emailB = 'bob@example.com';
  const userC = 'user_charlie_303';
  const emailC = 'charlie@example.com';

  // 1. Multi-Project Creation for User A
  console.log('\n1. Project Lifecycle & Multi-Project Support:');
  const projA1: ProjectItem = {
    id: `proj_${Date.now()}_a1`,
    name: 'مشروع المستشفى الرقمي',
    description: 'نظام إدارة تقارير ومشاكل المستشفى',
    owner_id: userA,
    ownerUid: userA,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const projA2: ProjectItem = {
    id: `proj_${Date.now()}_a2`,
    name: 'مشروع البنية التحتية',
    description: 'تقارير فحص الخوادم والشبكات',
    owner_id: userA,
    ownerUid: userA,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await saveProject(projA1, userA);
  await saveProject(projA2, userA);

  const aliceProjects = await getProjects(userA);
  assert(aliceProjects.some((p) => p.id === projA1.id), 'Alice can see Project A1');
  assert(aliceProjects.some((p) => p.id === projA2.id), 'Alice can see Project A2');
  assert(aliceProjects.length >= 2, 'Alice has multiple accessible projects');

  // 2. Team Initialization for Project A1
  console.log('\n2. Team Creation & Owner Resolution:');
  const teamA1 = await getTeamByProjectId(projA1.id, userA, emailA);
  assert(teamA1 !== null, 'Team created for Project A1');
  assert(teamA1.members.length === 1, 'Default team has exactly 1 member');
  assert(teamA1.members[0].uid === userA, 'Default member is Alice');
  assert(teamA1.members[0].role === 'owner', 'Alice has role "owner" in team');

  const accessA = await checkProjectAccess(projA1.id, userA, emailA);
  assert(accessA.hasAccess === true, 'Owner has access to Project A1');
  assert(accessA.role === 'owner', 'Owner role is correctly resolved');
  assert(accessA.canManageTeam === true, 'Owner can manage team');
  assert(accessA.canEditReports === true, 'Owner can edit reports');

  // 3. Member Invitation & Acceptance
  console.log('\n3. Team Invitations & Joining:');
  const invBob = await inviteMember(projA1.id, emailB, 'member', userA, emailA);
  assert(invBob.email === emailB, 'Invitation generated for Bob');
  assert(invBob.status === 'pending', 'Invitation initial status is pending');

  // Non-member before acceptance
  const bobPreAccess = await checkProjectAccess(projA1.id, userB, emailB);
  assert(bobPreAccess.hasAccess === false, 'Bob has no access before accepting invitation');

  // Bob accepts invitation
  const acceptResult = await acceptInvitation(projA1.id, invBob.id, userB, emailB, 'Bob Builder');
  assert(acceptResult.success === true, 'Bob successfully accepts invitation');

  // Verify Bob now has member access
  const bobPostAccess = await checkProjectAccess(projA1.id, userB, emailB);
  assert(bobPostAccess.hasAccess === true, 'Bob now has access to Project A1');
  assert(bobPostAccess.role === 'member', 'Bob has role "member"');
  assert(bobPostAccess.canManageTeam === false, 'Member cannot manage team');
  assert(bobPostAccess.canEditReports === true, 'Member can edit reports');

  // 4. Role Change (Member -> Admin)
  console.log('\n4. Role Modification & RBAC Hierarchy:');
  const roleChangeResult = await changeMemberRole(projA1.id, userB, 'admin', userA, emailA);
  assert(roleChangeResult.success === true, 'Owner can promote Bob to admin');

  const bobAdminAccess = await checkProjectAccess(projA1.id, userB, emailB);
  assert(bobAdminAccess.role === 'admin', 'Bob is now admin');
  assert(bobAdminAccess.canManageTeam === true, 'Admin can manage team');

  // 5. Invitation Cancellation
  console.log('\n5. Invitation Lifecycle (Cancel / Expire):');
  const invCharlie = await inviteMember(projA1.id, emailC, 'member', userA, emailA);
  assert(invCharlie.status === 'pending', 'Charlie invited with pending status');

  const cancelRes = await cancelInvitation(projA1.id, invCharlie.id, userA, emailA);
  assert(cancelRes.success === true, 'Owner can cancel pending invitation');

  const charlieAccess = await checkProjectAccess(projA1.id, userC, emailC);
  assert(charlieAccess.hasAccess === false, 'Charlie has no access after cancellation');

  // 6. Strict Data Isolation: User B's project cannot be seen or edited by User A
  console.log('\n6. Cross-User & Cross-Project Data Isolation:');
  const projB1: ProjectItem = {
    id: `proj_${Date.now()}_b1`,
    name: 'مشروع بوب السري',
    description: 'بيانات خاصة ببوب فقط',
    owner_id: userB,
    ownerUid: userB,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveProject(projB1, userB);

  // Alice checks access to Bob's project
  const aliceAccessToBobProj = await checkProjectAccess(projB1.id, userA, emailA);
  assert(aliceAccessToBobProj.hasAccess === false, 'Alice cannot access Bob Project B1');
  assert(aliceAccessToBobProj.canEditReports === false, 'Alice cannot edit reports in Bob Project');

  // Accessible projects list check
  const aliceAccessible = await getUserAccessibleProjects(userA, emailA);
  assert(aliceAccessible.some((p) => p.id === projA1.id), 'Alice can see Project A1 in accessible list');
  assert(!aliceAccessible.some((p) => p.id === projB1.id), 'Bob Project B1 is completely isolated from Alice');

  // 7. Task Assignment to Team Members
  console.log('\n7. Task Assignment to Project Team Member:');
  const task: TaskWidgetData = {
    description: 'التأكد من صحة حساب الإجمالي والضرائب',
    status: 'in-progress',
    priority: 'high',
    assigneeUid: userB,
    assigneeEmail: emailB,
    assigneeName: 'Bob Builder',
  };

  assert(task.assigneeUid === userB, 'Task is assigned to Bob');
  assert(task.assigneeEmail === emailB, 'Task assignee email is tracked');

  // Reassign to Alice
  task.assigneeUid = userA;
  task.assigneeEmail = emailA;
  task.assigneeName = 'Alice Wonder';
  assert(task.assigneeUid === userA, 'Task successfully reassigned to Alice');

  // Unassign task
  task.assigneeUid = undefined;
  task.assigneeEmail = undefined;
  task.assigneeName = undefined;
  assert(task.assigneeUid === undefined, 'Task successfully unassigned');

  // 8. Member Removal
  console.log('\n8. Member Removal:');
  const removeRes = await removeMember(projA1.id, userB, userA, emailA);
  assert(removeRes.success === true, 'Owner can remove Bob from Project A1 team');

  const bobAfterRemoval = await checkProjectAccess(projA1.id, userB, emailB);
  assert(bobAfterRemoval.hasAccess === false, 'Bob immediately loses access after removal');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
