'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ProjectItem, Team, ProjectRole } from './projects-types';
import { useAuth } from './auth-context';
import { getOrCreateDefaultProject, createProject, updateProject, deleteProject } from './db-intelligence';
import { getUserAccessibleProjects, getTeamByProjectId, checkProjectAccess } from './teams-db';

interface ProjectContextType {
  activeProject: ProjectItem | null;
  projects: ProjectItem[];
  team: Team | null;
  userRole: ProjectRole | null;
  loading: boolean;
  setActiveProject: (project: ProjectItem) => void;
  switchProjectById: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  createNewProject: (name: string, description?: string) => Promise<ProjectItem>;
  renameProject: (projectId: string, name: string, description?: string) => Promise<void>;
  deleteProjectById: (projectId: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ACTIVE_PROJECT_KEY = 'review_app_active_project_id';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user, isGuest } = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeProject, setActiveProjectState] = useState<ProjectItem | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [userRole, setUserRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);

  const syncActiveProject = useCallback(async (project: ProjectItem) => {
    setActiveProjectState(project);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
      // Dispatch event so other components know project switched
      window.dispatchEvent(new CustomEvent('project-switched', { detail: { project } }));
    }

    if (user?.uid) {
      try {
        const teamData = await getTeamByProjectId(project.id, user.uid, user.email);
        setTeam(teamData);
        const access = await checkProjectAccess(user.uid, user.email, project.id);
        setUserRole(access.role);
      } catch {
        setTeam(null);
        setUserRole(null);
      }
    }
  }, [user]);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setActiveProjectState(null);
      setTeam(null);
      setUserRole(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const list = await getUserAccessibleProjects(user.uid, user.email);
      let effectiveList = list;

      if (effectiveList.length === 0) {
        // Create default project
        const defaultProj = await getOrCreateDefaultProject(user.uid);
        effectiveList = [defaultProj];
      }

      setProjects(effectiveList);

      // Check stored active project
      const storedId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
      let matched = effectiveList.find((p) => p.id === storedId);
      if (!matched) {
        matched = effectiveList[0];
      }

      if (matched) {
        await syncActiveProject(matched);
      }
    } catch (e) {
      console.warn('refreshProjects error:', e);
    } finally {
      setLoading(false);
    }
  }, [user, syncActiveProject]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const switchProjectById = useCallback(
    async (projectId: string) => {
      const found = projects.find((p) => p.id === projectId);
      if (found) {
        await syncActiveProject(found);
      } else {
        // Try to fetch accessible projects again
        const fresh = await getUserAccessibleProjects(user?.uid, user?.email);
        const match = fresh.find((p) => p.id === projectId);
        if (match) {
          setProjects(fresh);
          await syncActiveProject(match);
        }
      }
    },
    [projects, syncActiveProject, user]
  );

  const createNewProject = useCallback(
    async (name: string, description?: string): Promise<ProjectItem> => {
      if (!user) throw new Error('Unauthenticated');
      const newProj = await createProject({
        name,
        description,
        ownerUid: user.uid,
      });
      // Setup team for this project
      await getTeamByProjectId(newProj.id, user.uid, user.email);
      await refreshProjects();
      await syncActiveProject(newProj);
      return newProj;
    },
    [user, refreshProjects, syncActiveProject]
  );

  const renameProject = useCallback(
    async (projectId: string, name: string, description?: string): Promise<void> => {
      if (!user) throw new Error('Unauthenticated');
      await updateProject(projectId, { name, description }, user.uid);
      await refreshProjects();
    },
    [user, refreshProjects]
  );

  const deleteProjectById = useCallback(
    async (projectId: string): Promise<void> => {
      if (!user) throw new Error('Unauthenticated');
      await deleteProject(projectId, user.uid);
      await refreshProjects();
    },
    [user, refreshProjects]
  );

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        projects,
        team,
        userRole,
        loading,
        setActiveProject: syncActiveProject,
        switchProjectById,
        refreshProjects,
        createNewProject,
        renameProject,
        deleteProjectById,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
