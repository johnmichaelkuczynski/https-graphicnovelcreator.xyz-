import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dbApi, getProjectSelectionKey, Project } from '@/lib/db';
import { developmentPreview, useAuth } from '@/hooks/use-auth';


interface ProjectContextValue {
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  isReady: boolean;
  setCurrentProjectId: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function reconcileSelection(projects: Project[], current: string | null, stored: string | null, pending: string | null) {
  if (current && projects.some((p) => p.id === current)) return { kind: 'valid' as const, id: current };
  if (current && pending === current) return { kind: 'pending' as const, id: current };
  return { kind: 'fallback' as const, id: stored && projects.some((p) => p.id === stored) ? stored : projects[0]?.id ?? null };
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const storageKey = getProjectSelectionKey(String(user!.id), developmentPreview);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const pendingSelection = useRef<string | null>(null);

  const { data: projects = [], isLoading, error: projectError } = useQuery({
    queryKey: ['projects'],
    queryFn: dbApi.getProjects,
  });

  // Ensure there is always at least one project, and a valid selection.
  useEffect(() => {
    if (isLoading || projectError) return;

    if (projects.length === 0) {
      // Guard against duplicate auto-creates: the effect can re-run (state
      // changes, refetch latency) while the projects list is still empty, so we
      // keep the flag set until a project actually shows up (reset below).
      if (creatingRef.current) return;
      creatingRef.current = true;
      (async () => {
        try {
          // Re-read straight from IndexedDB before creating. The react-query
          // cache can transiently read empty (e.g. a version-change/blocked
          // open, or refetch latency with multiple tabs) even though projects
          // really exist — auto-creating off that stale empty was producing a
          // flood of duplicate "My First Project" entries. Only create when the
          // database itself is genuinely empty.
          const existing = await dbApi.getProjects();
          if (existing.length > 0) {
            await queryClient.invalidateQueries({ queryKey: ['projects'] });
            const stored = localStorage.getItem(storageKey);
            const valid = stored && existing.some((p) => p.id === stored);
            const next = valid ? stored! : existing[0].id;
            if (pendingSelection.current) return;
            setCurrentProjectIdState(next);
            localStorage.setItem(storageKey, next);
            return;
          }
          const project = await dbApi.createProject('My First Project');
          await queryClient.invalidateQueries({ queryKey: ['projects'] });
          if (!pendingSelection.current) {
            setCurrentProjectIdState(project.id);
            localStorage.setItem(storageKey, project.id);
          }
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

    const stored = localStorage.getItem(storageKey);
    const selection = reconcileSelection(projects, currentProjectId, stored, pendingSelection.current);

    if (selection.kind !== 'valid') {
      // A newly committed project can be selected before React Query's old
      // project-list snapshot is replaced. Do not revert that selection.
      if (selection.kind === 'pending' && currentProjectId) {
        void dbApi.getProjects().then((latest) => {
          if (pendingSelection.current !== currentProjectId) return;
          pendingSelection.current = null;
          if (latest.some((p) => p.id === currentProjectId)) {
            queryClient.setQueryData(['projects'], latest);
          } else {
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            setCurrentProjectIdState(null);
          }
        });
        return;
      }
      const next = selection.id!;
      setCurrentProjectIdState(next);
      localStorage.setItem(storageKey, next);
    } else {
      pendingSelection.current = null;
    }
  }, [projects, isLoading, projectError, currentProjectId, queryClient, storageKey]);

  const setCurrentProjectId = (id: string) => {
    pendingSelection.current = id;
    setCurrentProjectIdState(id);
    localStorage.setItem(storageKey, id);
  };

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const isReady = !isLoading && currentProjectId != null;

  if (projectError) return <div role="alert" className="p-8">Could not load your projects: {projectError.message}. Your local data was not deleted. Reload to retry.</div>;

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
