'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IN_PROGRESS_STATUSES,
  type CommitMaterial,
  type CommitResult,
  type CreateTeacherSession,
  type MaterialCategory,
  type MaterialDto,
  type TeacherSessionDetail,
  type TeacherSessionSummary,
} from '@coach/contracts';
import { api } from '@/lib/api';
import { catalogKeys } from '@/features/catalog/hooks';
import { contentKeys } from '@/features/content/hooks';

export const teacherKeys = {
  sessions: ['teacher', 'sessions'] as const,
  session: (id: string) => ['teacher', 'sessions', id] as const,
  material: (id: string) => ['teacher', 'materials', id] as const,
};

export const useSessions = () =>
  useQuery({ queryKey: teacherKeys.sessions, queryFn: () => api<TeacherSessionSummary[]>('/teacher-sessions') });

export const useSession = (id: string | undefined) =>
  useQuery({
    queryKey: teacherKeys.session(id ?? ''),
    queryFn: () => api<TeacherSessionDetail>(`/teacher-sessions/${id}`),
    enabled: Boolean(id),
  });

/** Polls while the coach is still reading the material, then stops by itself. */
export const useMaterial = (id: string | undefined) =>
  useQuery({
    queryKey: teacherKeys.material(id ?? ''),
    queryFn: () => api<MaterialDto>(`/teacher-materials/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && IN_PROGRESS_STATUSES.includes(status) ? 1500 : false;
    },
  });

function useInvalidateTeacher() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['teacher'] });
}

export function useCreateSession() {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: (body: CreateTeacherSession) =>
      api<TeacherSessionSummary>('/teacher-sessions', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteSession() {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/teacher-sessions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export type MaterialInput =
  | { kind: 'text'; text: string; category: MaterialCategory; title?: string }
  | { kind: 'file'; file: File; category: MaterialCategory; title?: string };

export function useAddMaterial() {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: MaterialInput }) => {
      if (input.kind === 'text') {
        return api<MaterialDto>(`/teacher-sessions/${sessionId}/materials/text`, {
          method: 'POST',
          body: { text: input.text, category: input.category, title: input.title || undefined },
        });
      }
      const form = new FormData();
      form.set('file', input.file);
      form.set('category', input.category);
      if (input.title) form.set('title', input.title);
      return api<MaterialDto>(`/teacher-sessions/${sessionId}/materials/file`, { method: 'POST', body: form });
    },
    onSuccess: invalidate,
  });
}
export function useReparse(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<MaterialDto>(`/teacher-materials/${id}/reparse`, { method: 'POST' }),
    onSuccess: (data) => client.setQueryData(teacherKeys.material(id), data),
  });
}

export function useDiscard(id: string) {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: () => api<void>(`/teacher-materials/${id}/discard`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useCommit(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CommitMaterial) =>
      api<CommitResult>(`/teacher-materials/${id}/commit`, { method: 'POST', body }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['teacher'] }),
        client.invalidateQueries({ queryKey: contentKeys.all }),
        client.invalidateQueries({ queryKey: catalogKeys.books }),
        client.invalidateQueries({ queryKey: catalogKeys.current }),
      ]),
  });
}
