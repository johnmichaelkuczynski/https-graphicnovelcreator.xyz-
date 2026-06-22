import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dbApi, Project } from '@/lib/db';

export const STORAGE_KEY = 'novel-current-project-id';

interface ProjectContextValue {
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  isReady: boolean;
  setCurrentProjectId: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const creatingRef = useRef(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: dbApi.getProjects,
  });

  // Ensure there is always at least one project, and a valid selection.
  useEffect(() => {
    if (isLoading) return;

    if (projects.length === 0) {
      // Guard against duplicate auto-creates: the effect can re-run (state
      // changes, refetch latency) while the projects list is still empty, so we
      // keep the flag set until a project actually shows up (reset below).
      if (creatingRef.current) return;
      creatingRef.current = true;
      (async () => {
        try {
          const project = await dbApi.createProject('My First Project');
          await queryClient.invalidateQueries({ queryKey: ['projects'] });
          setCurrentProjectIdState(project.id);
          localStorage.setItem(STORAGE_KEY, project.id);
        } catch {
          // Allow another attempt if creation failed outright.
          creatingRef.current = false;
        }
      })();
      return;
    }

    // Projects exist — clear the guard so a future "deleted everything" state
    // can auto-create a fresh project again.
    creatingRef.current = false;

    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = stored && projects.some((p) => p.id === stored);
    const isCurrentValid = currentProjectId && projects.some((p) => p.id === currentProjectId);

    if (!isCurrentValid) {
      const next = valid ? stored! : projects[0].id;
      setCurrentProjectIdState(next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, [projects, isLoading, currentProjectId, queryClient]);

  const setCurrentProjectId = (id: string) => {
    setCurrentProjectIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const isReady = !isLoading && currentProjectId != null;

  return (
    <ProjectContext.Provider
      value={{ projects, currentProjectId, currentProject, isReady, setCurrentProjectId }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider');
  return ctx;
}
