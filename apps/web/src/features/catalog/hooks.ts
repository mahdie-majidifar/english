'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookDetail,
  BookSummary,
  CreateBook,
  CreateLesson,
  CreateUnit,
  CurrentContext,
  ImportStructureResult,
  UpdateBook,
} from '@coach/contracts';
import { api } from '@/lib/api';

export const catalogKeys = {
  books: ['books'] as const,
  book: (id: string) => ['books', id] as const,
  current: ['current'] as const,
};

export const useBooks = () =>
  useQuery({ queryKey: catalogKeys.books, queryFn: () => api<BookSummary[]>('/books') });

export const useBook = (id: string | undefined) =>
  useQuery({
    queryKey: catalogKeys.book(id ?? ''),
    queryFn: () => api<BookDetail>(`/books/${id}`),
    enabled: Boolean(id),
  });

export const useCurrent = () =>
  useQuery({
    queryKey: catalogKeys.current,
    queryFn: async () => (await api<{ current: CurrentContext | null }>('/me/current')).current,
  });

/** Structure and current-lesson changes affect several screens, so refresh all catalog data. */
function useInvalidateCatalog() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: catalogKeys.books }),
      client.invalidateQueries({ queryKey: catalogKeys.current }),
    ]);
}

export function useCreateBook() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: CreateBook) => api<BookSummary>('/books', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateBook(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: UpdateBook) => api<void>(`/books/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteBook() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/books/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateUnit(bookId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: CreateUnit) => api<{ id: string }>(`/books/${bookId}/units`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteUnit() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (unitId: string) => api<void>(`/units/${unitId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateLesson(unitId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: CreateLesson) =>
      api<{ id: string }>(`/units/${unitId}/lessons`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteLesson() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (lessonId: string) => api<void>(`/lessons/${lessonId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useImportStructure(bookId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (text: string) =>
      api<ImportStructureResult>(`/books/${bookId}/import-structure`, { method: 'POST', body: { text } }),
    onSuccess: invalidate,
  });
}

export function useSetCurrentLesson() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (lessonId: string) =>
      api<CurrentContext>('/me/current-lesson', { method: 'PUT', body: { lessonId } }),
    onSuccess: invalidate,
  });
}
