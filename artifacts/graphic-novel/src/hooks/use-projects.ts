import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dbApi } from '@/lib/db';

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => dbApi.createProject(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => dbApi.renameProject(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dbApi.deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['panels'] });
      qc.invalidateQueries({ queryKey: ['audio'] });
    },
  });
}

export function useClearProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => dbApi.clearProject(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panels'] });
      qc.invalidateQueries({ queryKey: ['audio'] });
    },
  });
}
