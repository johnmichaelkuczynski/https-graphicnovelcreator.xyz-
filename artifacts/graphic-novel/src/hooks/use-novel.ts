import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbApi, Panel, AudioTrack } from '@/lib/db';

export function usePanels() {
  return useQuery({
    queryKey: ['panels'],
    queryFn: dbApi.getPanels
  });
}

export function useAudioTracks() {
  return useQuery({
    queryKey: ['audio'],
    queryFn: dbApi.getAudioTracks
  });
}

export function useSavePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.savePanel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] })
  });
}

export function useDeletePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.deletePanel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] })
  });
}

export function useUpdatePanelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.updatePanelOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] })
  });
}

export function useSaveAudioTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.saveAudioTrack,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio'] })
  });
}

export function useDeleteAudioTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.deleteAudioTrack,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio'] })
  });
}

export function useUpdateAudioTrackOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbApi.updateAudioTrackOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio'] })
  });
}
