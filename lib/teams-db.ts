import { collection, doc, getDoc, getDocs, setDoc, query, where, deleteDoc } from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import type { Team, ProjectMember, ProjectInvitation, ProjectRole, ProjectItem } from './projects-types';
import { getProjects, getProjectById } from './db-intelligence';
import { createNotification } from './notifications-db';

export const LOCAL_TEAMS_KEY = 'review_app_teams';
const memoryStore = new Map<string, string>();

function getLocal<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    const mem = memoryStore.get(key);
    return mem ? JSON.parse(mem) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  try {
    const str = JSON.stringify(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, str);
      return;
    }
    memoryStore.set(key, str);
  } catch (e) {
    console.warn('Failed to save team data to storage', e);
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Get Team for a project. If none exists, creates default team with project owner.
 */
export async function getTeamByProjectId(projectId: string, ownerUid?: string, ownerEmail?: string): Promise<Team> {
  if (!projectId) {
    throw new Error('projectId is required');
  }

  // 1. Try Firestore
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'teams'), where('projectId', '==', projectId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const teamData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Team;
        expireInvitationsInTeam(teamData);
        return teamData;
      }
    } catch (e) {
      console.warn('Firestore getTeamByProjectId error:', e);
    }
  }

  // 2. Try LocalStorage
  const allTeams = getLocal<Team[]>(LOCAL_TEAMS_KEY, []);
  const found = allTeams.find((t) => t.projectId === projectId);
  if (found) {
    expireInvitationsInTeam(found);
    return found;
  }

  // 3. Create default team for the project
  return await getOrCreateDefaultTeam(projectId, ownerUid, ownerEmail);
}

function expireInvitationsInTeam(team: Team): boolean {
  if (!team.invitations || team.invitations.length === 0) return false;
  const now = new Date().toISOString();
  let changed = false;
  team.invitations.forEach((inv) => {
    if (inv.status === 'pending' && inv.expiresAt && inv.expiresAt < now) {
      inv.status = 'expired';
      changed = true;
    }
  });
  return changed;
}

export async function getOrCreateDefaultTeam(projectId: string, ownerUid?: string, ownerEmail?: string): Promise<Team> {
  const currentUid = ownerUid || auth?.currentUser?.uid || 'guest';

  // Try to find project to verify owner
  const project = await getProjectById(projectId);
  const realOwnerUid = project?.owner_id || project?.ownerUid || currentUid;
  const isActorRealOwner = realOwnerUid === currentUid;
  const realOwnerEmail = isActorRealOwner
    ? (ownerEmail || auth?.currentUser?.email || (currentUid === 'guest' ? 'guest@review-app.local' : `${currentUid}@example.com`)).toLowerCase().trim()
    : `${realOwnerUid}@example.com`;

  const now = new Date().toISOString();
  const teamId = `team_${projectId}`;

  const defaultTeam: Team = {
    id: teamId,
    projectId,
    name: project ? `فريق ${project.name}` : 'فريق المشروع',
    description: 'فريق العمل الأساسي للمشروع',
    members: [
      {
        id: `mem_${realOwnerUid}`,
        projectId,
        userId: realOwnerUid,
        uid: realOwnerUid,
        email: realOwnerEmail,
        role: 'owner',
        joinedAt: now,
      },
    ],
    invitations: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveTeam(defaultTeam);
  return defaultTeam;
}

export async function saveTeam(team: Team): Promise<Team> {
  const now = new Date().toISOString();
  const memberUids = Array.from(
    new Set((team.members || []).map((m) => m.userId || m.uid).filter(Boolean) as string[])
  );
  const memberEmails = Array.from(
    new Set((team.members || []).map((m) => m.email?.toLowerCase().trim()).filter(Boolean) as string[])
  );
  const updated: Team & { memberUids?: string[]; memberEmails?: string[] } = {
    ...team,
    memberUids,
    memberEmails,
    updatedAt: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'teams', updated.id), updated, { merge: true });
    } catch (e) {
      console.warn('Firestore saveTeam failed', e);
    }
  }

  const all = getLocal<Team[]>(LOCAL_TEAMS_KEY, []);
  const idx = all.findIndex((t) => t.id === updated.id || t.projectId === updated.projectId);
  if (idx !== -1) {
    all[idx] = updated;
    setLocal(LOCAL_TEAMS_KEY, all);
  } else {
    setLocal(LOCAL_TEAMS_KEY, [updated, ...all]);
  }

  return updated;
}

/**
 * Check user access level on a project.
 * Supports both signatures: (userUid, userEmail, projectId, role) and (projectId, userUid, userEmail, role)
 */
export async function checkProjectAccess(
  arg1?: string,
  arg2?: string,
  arg3?: string,
  arg4?: ProjectRole
): Promise<{
  allowed: boolean;
  hasAccess: boolean;
  role: ProjectRole | null;
  canManageTeam: boolean;
  canEditReports: boolean;
  reason?: string;
}> {
  let userUid: string | undefined;
  let userEmail: string | undefined;
  let projectId: string | undefined;
  let requiredRole: ProjectRole | undefined;

  // Auto-detect parameter order
  if (arg1 && (arg1.startsWith('proj_') || arg1 === 'proj_default')) {
    projectId = arg1;
    userUid = arg2;
    userEmail = arg3;
    requiredRole = arg4;
  } else if (arg3 && (arg3.startsWith('proj_') || arg3 === 'proj_default')) {
    userUid = arg1;
    userEmail = arg2;
    projectId = arg3;
    requiredRole = arg4;
  } else {
    userUid = arg1;
    userEmail = arg2;
    projectId = arg3;
    requiredRole = arg4;
  }

  if (!userUid && !userEmail) {
    return {
      allowed: false,
      hasAccess: false,
      role: null,
      canManageTeam: false,
      canEditReports: false,
      reason: 'Unauthenticated',
    };
  }
  if (!projectId) {
    return {
      allowed: false,
      hasAccess: false,
      role: null,
      canManageTeam: false,
      canEditReports: false,
      reason: 'Missing project ID',
    };
  }

  const uid = userUid || '';
  const email = (userEmail || '').toLowerCase().trim();

  // 1. Check if user owns the project directly
  const project = await getProjectById(projectId, uid);
  if (project) {
    const isOwner = (project.owner_id && project.owner_id === uid) || (project.ownerUid && project.ownerUid === uid);
    if (isOwner) {
      return {
        allowed: true,
        hasAccess: true,
        role: 'owner',
        canManageTeam: true,
        canEditReports: true,
      };
    }
  }

  // 2. Check team membership
  const team = await getTeamByProjectId(projectId, uid, email);
  const member = team.members.find(
    (m) =>
      (m.userId && m.userId === uid) ||
      (m.uid && m.uid === uid) ||
      (email && m.email.toLowerCase() === email)
  );

  if (!member) {
    return {
      allowed: false,
      hasAccess: false,
      role: null,
      canManageTeam: false,
      canEditReports: false,
      reason: 'Not a member of this project team',
    };
  }

  // Member role hierarchy: owner > admin > member
  const role = member.role;
  const canManageTeam = role === 'owner' || role === 'admin';
  const canEditReports = role === 'owner' || role === 'admin' || role === 'member';

  if (!requiredRole || requiredRole === 'member') {
    return {
      allowed: true,
      hasAccess: true,
      role,
      canManageTeam,
      canEditReports,
    };
  }
  if (requiredRole === 'admin') {
    if (role === 'owner' || role === 'admin') {
      return {
        allowed: true,
        hasAccess: true,
        role,
        canManageTeam,
        canEditReports,
      };
    }
    return {
      allowed: false,
      hasAccess: false,
      role,
      canManageTeam: false,
      canEditReports,
      reason: 'Admin role required',
    };
  }
  if (requiredRole === 'owner') {
    if (role === 'owner') {
      return {
        allowed: true,
        hasAccess: true,
        role,
        canManageTeam: true,
        canEditReports: true,
      };
    }
    return {
      allowed: false,
      hasAccess: false,
      role,
      canManageTeam: false,
      canEditReports,
      reason: 'Owner role required',
    };
  }

  return {
    allowed: false,
    hasAccess: false,
    role,
    canManageTeam,
    canEditReports,
    reason: 'Unauthorized role',
  };
}

/**
 * Get all projects a user has access to (owned or as team member).
 */
export async function getUserAccessibleProjects(userUid?: string, userEmail?: string): Promise<ProjectItem[]> {
  const uid = userUid || auth?.currentUser?.uid || '';
  const email = (userEmail || auth?.currentUser?.email || '').toLowerCase().trim();
  if (!uid && !email) return [];

  const ownedProjects = await getProjects(uid);
  const allTeams = getLocal<Team[]>(LOCAL_TEAMS_KEY, []);

  // Teams where user is an active member
  const memberProjectIds = new Set<string>();
  allTeams.forEach((t) => {
    const isMem = t.members.some(
      (m) => (uid && m.userId === uid) || (email && m.email.toLowerCase() === email)
    );
    if (isMem) memberProjectIds.add(t.projectId);
  });

  if (isFirebaseConfigured && db && email) {
    try {
      const q = query(collection(db, 'teams'));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const teamData = d.data() as Team;
        const isMem = teamData.members?.some(
          (m) => (uid && m.userId === uid) || (email && m.email?.toLowerCase() === email)
        );
        if (isMem && teamData.projectId) memberProjectIds.add(teamData.projectId);
      });
    } catch {}
  }

  const resultProjects = new Map<string, ProjectItem>();
  ownedProjects.forEach((p) => resultProjects.set(p.id, p));

  for (const pid of Array.from(memberProjectIds)) {
    if (!resultProjects.has(pid)) {
      const p = await getProjectById(pid, uid);
      if (p) resultProjects.set(p.id, p);
    }
  }

  return Array.from(resultProjects.values());
}

/**
 * Invite a user to a project team.
 */
export async function inviteMember(
  projectId: string,
  email: string,
  role: ProjectRole,
  actorUid: string,
  actorEmail?: string
): Promise<ProjectInvitation> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Valid email is required');
  }

  const access = await checkProjectAccess(actorUid, actorEmail, projectId, 'admin');
  if (!access.allowed) {
    throw new Error('Unauthorized: only Owner or Admin can invite members');
  }

  const team = await getTeamByProjectId(projectId, actorUid, actorEmail);

  // Check if user is already a member
  const existingMem = team.members.find((m) => m.email.toLowerCase() === normalizedEmail);
  if (existingMem) {
    throw new Error('User is already a member of this team');
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const project = await getProjectById(projectId, actorUid);

  const invitation: ProjectInvitation = {
    id: generateId('inv'),
    projectId,
    projectName: project?.name || 'المشروع',
    email: normalizedEmail,
    role,
    invitedByUid: actorUid,
    invitedByEmail: actorEmail,
    token: generateId('tok'),
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  team.invitations = team.invitations || [];
  // Remove existing pending invite for this email if any
  team.invitations = team.invitations.filter((i) => !(i.email.toLowerCase() === normalizedEmail && i.status === 'pending'));
  team.invitations.push(invitation);

  await saveTeam(team);

  try {
    const sender = auth?.currentUser;
    const pName = project?.name || 'مشروع جديد';
    void createNotification({
      recipientEmail: normalizedEmail,
      senderUid: actorUid,
      senderName: sender?.displayName || actorEmail || sender?.email || 'مدير المشروع',
      type: 'team_invited',
      title: `دعوة للانضمام إلى مشروع: ${pName}`,
      titleAr: `دعوة للانضمام إلى مشروع: ${pName}`,
      titleEn: `Invitation to join project: ${pName}`,
      body: `قام ${sender?.displayName || actorEmail || 'المسؤول'} بدعوتك للانضمام إلى فريق عمل مشروع "${pName}" بدور (${role}).`,
      bodyAr: `قام ${sender?.displayName || actorEmail || 'المسؤول'} بدعوتك للانضمام إلى فريق عمل مشروع "${pName}" بدور (${role}).`,
      bodyEn: `${sender?.displayName || actorEmail || 'Admin'} invited you to join project "${pName}" as (${role}).`,
      link: `/projects`,
      entityId: invitation.id,
    });
  } catch (err) {
    console.warn('Failed to send team invitation notification:', err);
  }

  return invitation;
}

/**
 * Fetch pending project invitations sent to a user's email.
 */
export async function getUserInvitations(userEmail?: string): Promise<ProjectInvitation[]> {
  const normEmail = (userEmail || auth?.currentUser?.email || '').toLowerCase().trim();
  if (!normEmail) return [];

  const invitations: ProjectInvitation[] = [];
  const now = new Date().toISOString();

  // 1. From Firestore
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'teams'));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const team = { id: d.id, ...d.data() } as Team;
        team.invitations?.forEach((inv) => {
          if (
            inv.email.toLowerCase() === normEmail &&
            inv.status === 'pending' &&
            (!inv.expiresAt || inv.expiresAt > now)
          ) {
            invitations.push(inv);
          }
        });
      });
    } catch (e) {
      console.warn('getUserInvitations Firestore read notice:', e);
    }
  }

  // 2. From LocalStorage
  const allTeams = getLocal<Team[]>(LOCAL_TEAMS_KEY, []);
  allTeams.forEach((team) => {
    team.invitations?.forEach((inv) => {
      if (
        inv.email.toLowerCase() === normEmail &&
        inv.status === 'pending' &&
        (!inv.expiresAt || inv.expiresAt > now) &&
        !invitations.some((existing) => existing.id === inv.id)
      ) {
        invitations.push(inv);
      }
    });
  });

  return invitations;
}

/**
 * Fetch all invitations sent by a specific user across their projects.
 */
export async function getSentInvitations(userUid?: string, userEmail?: string): Promise<ProjectInvitation[]> {
  const uid = userUid || auth?.currentUser?.uid || '';
  const email = (userEmail || auth?.currentUser?.email || '').toLowerCase().trim();
  if (!uid && !email) return [];

  const map = new Map<string, ProjectInvitation>();

  // 1. From Firestore
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'teams'));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const team = { id: d.id, ...d.data() } as Team;
        team.invitations?.forEach((inv) => {
          const isSender = (uid && inv.invitedByUid === uid) || (email && inv.invitedByEmail?.toLowerCase() === email);
          if (isSender) {
            map.set(inv.id, inv);
          }
        });
      });
    } catch (e) {
      console.warn('getSentInvitations Firestore read notice:', e);
    }
  }

  // 2. From LocalStorage
  const allTeams = getLocal<Team[]>(LOCAL_TEAMS_KEY, []);
  allTeams.forEach((team) => {
    team.invitations?.forEach((inv) => {
      const isSender = (uid && inv.invitedByUid === uid) || (email && inv.invitedByEmail?.toLowerCase() === email);
      if (isSender && !map.has(inv.id)) {
        map.set(inv.id, inv);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Accept a team invitation.
 * Supports: (invitationId, uid, email, name) and (projectId, invitationId, uid, email, name)
 */
export async function acceptInvitation(
  arg1: string,
  arg2: string,
  arg3?: string,
  arg4?: string,
  arg5?: string
): Promise<{ success: boolean; team: Team; role: ProjectRole }> {
  let invitationIdOrToken: string;
  let userUid: string;
  let userEmail: string;
  let displayName: string | undefined;

  if (arg1 && arg1.startsWith('proj_') && arg2) {
    invitationIdOrToken = arg2;
    userUid = arg3 || '';
    userEmail = arg4 || '';
    displayName = arg5;
  } else {
    invitationIdOrToken = arg1;
    userUid = arg2;
    userEmail = arg3 || '';
    displayName = arg4;
  }

  const normEmail = userEmail.toLowerCase().trim();
  const allTeams = getLocal<Team[]>(LOCAL_TEAMS_KEY, []);

  let targetTeam: Team | null = null;
  let targetInv: ProjectInvitation | null = null;

  for (const t of allTeams) {
    const inv = t.invitations?.find(
      (i) => (i.id === invitationIdOrToken || i.token === invitationIdOrToken)
    );
    if (inv) {
      targetTeam = t;
      targetInv = inv;
      break;
    }
  }

  if (isFirebaseConfigured && db && (!targetTeam || !targetInv)) {
    try {
      const q = query(collection(db, 'teams'));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const t = { id: d.id, ...d.data() } as Team;
        const inv = t.invitations?.find(
          (i) => (i.id === invitationIdOrToken || i.token === invitationIdOrToken)
        );
        if (inv) {
          targetTeam = t;
          targetInv = inv;
          break;
        }
      }
    } catch {}
  }

  if (!targetTeam || !targetInv) {
    throw new Error('Invitation not found');
  }

  const now = new Date().toISOString();
  if (targetInv.status === 'cancelled') {
    throw new Error('This invitation has been cancelled');
  }
  if (targetInv.status === 'expired' || (targetInv.expiresAt && targetInv.expiresAt < now)) {
    targetInv.status = 'expired';
    await saveTeam(targetTeam);
    throw new Error('This invitation has expired');
  }
  if (targetInv.status === 'accepted') {
    throw new Error('This invitation has already been accepted');
  }

  // Check email matches
  if (targetInv.email.toLowerCase() !== normEmail) {
    throw new Error(`Invitation is intended for ${targetInv.email}, not ${normEmail}`);
  }

  targetInv.status = 'accepted';

  // Add member
  const newMember: ProjectMember = {
    id: generateId('mem'),
    projectId: targetTeam.projectId,
    userId: userUid,
    uid: userUid,
    email: normEmail,
    displayName,
    name: displayName,
    role: targetInv.role,
    joinedAt: now,
  };

  // Ensure no duplicate member
  targetTeam.members = targetTeam.members.filter((m) => m.email.toLowerCase() !== normEmail && m.userId !== userUid && m.uid !== userUid);
  targetTeam.members.push(newMember);

  await saveTeam(targetTeam);
  return { success: true, team: targetTeam, role: targetInv.role };
}

/**
 * Cancel a pending invitation.
 */
export async function cancelInvitation(
  projectId: string,
  invitationId: string,
  actorUid: string,
  actorEmail?: string
): Promise<{ success: boolean }> {
  const access = await checkProjectAccess(actorUid, actorEmail, projectId, 'admin');
  if (!access.allowed) {
    throw new Error('Unauthorized: only Owner or Admin can cancel invitations');
  }

  const team = await getTeamByProjectId(projectId, actorUid, actorEmail);
  const inv = team.invitations?.find((i) => i.id === invitationId);
  if (!inv) {
    throw new Error('Invitation not found');
  }

  inv.status = 'cancelled';
  await saveTeam(team);
  return { success: true };
}

/**
 * Remove a member from a project team.
 */
export async function removeMember(
  projectId: string,
  memberIdOrEmail: string,
  actorUid: string,
  actorEmail?: string
): Promise<{ success: boolean }> {
  const access = await checkProjectAccess(actorUid, actorEmail, projectId, 'admin');
  if (!access.allowed) {
    throw new Error('Unauthorized: only Owner or Admin can remove members');
  }

  const team = await getTeamByProjectId(projectId, actorUid, actorEmail);
  const norm = memberIdOrEmail.toLowerCase().trim();

  const targetMember = team.members.find(
    (m) =>
      m.id === memberIdOrEmail ||
      m.email.toLowerCase() === norm ||
      m.userId === memberIdOrEmail ||
      m.uid === memberIdOrEmail
  );

  if (!targetMember) {
    throw new Error('Member not found in team');
  }

  // Owner cannot be removed
  if (targetMember.role === 'owner') {
    throw new Error('Cannot remove the project owner');
  }

  // Admin cannot remove other admins unless actor is owner
  if (targetMember.role === 'admin' && access.role !== 'owner') {
    throw new Error('Only the Project Owner can remove Admins');
  }

  team.members = team.members.filter((m) => m.id !== targetMember.id);
  await saveTeam(team);
  return { success: true };
}

/**
 * Change member role in a project team.
 */
export async function changeMemberRole(
  projectId: string,
  memberIdOrEmail: string,
  newRole: ProjectRole,
  actorUid: string,
  actorEmail?: string
): Promise<{ success: boolean; team: Team }> {
  const access = await checkProjectAccess(actorUid, actorEmail, projectId, 'admin');
  if (!access.allowed) {
    throw new Error('Unauthorized: only Owner or Admin can change roles');
  }

  // Only Owner can appoint an Admin or transfer Ownership
  if ((newRole === 'admin' || newRole === 'owner') && access.role !== 'owner') {
    throw new Error('Only the Project Owner can grant Admin or Owner roles');
  }

  const team = await getTeamByProjectId(projectId, actorUid, actorEmail);
  const norm = memberIdOrEmail.toLowerCase().trim();

  const targetMember = team.members.find(
    (m) =>
      m.id === memberIdOrEmail ||
      m.email.toLowerCase() === norm ||
      m.userId === memberIdOrEmail ||
      m.uid === memberIdOrEmail
  );

  if (!targetMember) {
    throw new Error('Member not found in team');
  }

  if (targetMember.role === 'owner' && newRole !== 'owner') {
    throw new Error('Cannot demote the Project Owner directly');
  }

  targetMember.role = newRole;
  await saveTeam(team);
  return { success: true, team };
}
