export type ProjectRole = 'owner' | 'admin' | 'member';

export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  owner_id?: string;
  ownerUid?: string;
  status?: 'active' | 'archived' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId?: string;
  uid?: string;
  email: string;
  name?: string;
  displayName?: string;
  role: ProjectRole;
  joinedAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';

export interface ProjectInvitation {
  id: string;
  projectId: string;
  projectName?: string;
  email: string;
  role: ProjectRole;
  invitedByUid: string;
  invitedByEmail?: string;
  token: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface Team {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  members: ProjectMember[];
  invitations?: ProjectInvitation[];
  createdAt: string;
  updatedAt: string;
}
