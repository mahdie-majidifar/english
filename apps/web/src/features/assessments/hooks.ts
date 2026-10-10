'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnswerSavedDto,
  AssessmentDto,
  AssessmentKind,
  AssessmentListDto,
  AssessmentPreset,
  AssessmentResultDto,
  AssessmentSummaryDto,
} from '@coach/contracts';
import { api } from '@/lib/api';
import { dashboardKey } from '@/features/dashboard/hooks';

export const assessmentKeys = {
  list: ['assessments'] as const,
  one: (id: string) => ['assessments', id] as const,
  result: (id: string) => ['assessments', id, 'result'] as const,
};

export const useAssessments = () =>
  useQuery({ queryKey: assessmentKeys.list, queryFn: () => api<AssessmentListDto>('/assessments'), refetchOnMount: 'always' });

export function useCreateAssessment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: AssessmentKind; preset: AssessmentPreset }) =>
      api<AssessmentSummaryDto>('/assessments', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: assessmentKeys.list }),
  });
}

/** Read, without starting the clock. */
export const useAssessment = (id: string) =>
  useQuery({ queryKey: assessmentKeys.one(id), queryFn: () => api<AssessmentDto>(`/assessments/${id}`), refetchOnMount: 'always', staleTime: 0, refetchOnWindowFocus: false });

export function useStartAssessment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<AssessmentDto>(`/assessments/${id}/start`, { method: 'POST' }),
    onSuccess: (dto) => client.setQueryData(assessmentKeys.one(id), dto),
  });
}

export function useSaveAnswer(id: string) {
  return useMutation({
    mutationFn: (input: { questionId: string; response: unknown; durationMs: number }) =>
      api<AnswerSavedDto>(`/assessments/${id}/questions/${input.questionId}/answer`, {
        method: 'PUT',
        body: { response: input.response, durationMs: input.durationMs },
      }),
  });
}

export function useSubmitAssessment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<AssessmentResultDto>(`/assessments/${id}/submit`, { method: 'POST' }),
    onSuccess: (result) => {
      client.setQueryData(assessmentKeys.result(id), result);
      void client.invalidateQueries({ queryKey: assessmentKeys.list });
      void client.invalidateQueries({ queryKey: dashboardKey });
      void client.invalidateQueries({ queryKey: ['mistakes'] });
    },
  });
}

export const useAssessmentResult = (id: string) =>
  useQuery({ queryKey: assessmentKeys.result(id), queryFn: () => api<AssessmentResultDto>(`/assessments/${id}/result`), retry: false });
