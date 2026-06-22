import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbApi } from '@/lib/db';
import { useProjectContext } from '@/lib/project-context';

export function usePanels() {
  const { currentProjectId } = useProjectContext();
  return useQuery({
    queryKey: ['panels', currentProjectId],
    queryFn: () => dbApi.getPanels(currentProjectId!),
    enabled: !!currentProjectId,
  });
}

export function useAudioTracks() {
  const { currentProjectId } = useProjectContext();
  return useQuery({
    queryKey: ['audio', currentProjectId],
    queryFn: () => dbApi.getAudioTracks(currentProjectId!),
    enabled: !!currentProjectId,
  });
}

export function useSavePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.savePanel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] }),
  });
}

export function useDeletePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.deletePanel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] }),
  });
}

export function useUpdatePanelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.updatePanelOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] }),
  });
}

export function useSaveAudioTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.saveAudioTrack,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio'] }),
  });
}

export function useDeleteAudioTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.deleteAudioTrack,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio'] }),
  });
}

export function useUpdateAudioTrackOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.updateAudioTrackOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio'] }),
  });
}
