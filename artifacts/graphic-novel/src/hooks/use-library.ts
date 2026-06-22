import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dbApi,
  LibraryImage,
  LibraryDocument,
  LibraryInstruction,
} from '@/lib/db';

// ---- Image library ----
export function useLibraryImages() {
  return useQuery({
    queryKey: ['library-images'],
    queryFn: dbApi.getLibraryImages,
  });
}

export function useSaveLibraryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: LibraryImage) => dbApi.saveLibraryImage(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-images'] }),
  });
}

export function useDeleteLibraryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dbApi.deleteLibraryImage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-images'] }),
  });
}

// ---- Document library ----
export function useLibraryDocuments() {
  return useQuery({
    queryKey: ['library-documents'],
    queryFn: dbApi.getLibraryDocuments,
  });
}

export function useSaveLibraryDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: LibraryDocument) => dbApi.saveLibraryDocument(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-documents'] }),
  });
}

export function useDeleteLibraryDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dbApi.deleteLibraryDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-documents'] }),
  });
}

// ---- Instruction library ----
export function useLibraryInstructions() {
  return useQuery({
    queryKey: ['library-instructions'],
    queryFn: dbApi.getLibraryInstructions,
  });
}

export function useSaveLibraryInstruction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: LibraryInstruction) => dbApi.saveLibraryInstruction(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-instructions'] }),
  });
}

export function useDeleteLibraryInstruction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dbApi.deleteLibraryInstruction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-instructions'] }),
  });
}
