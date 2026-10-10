'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttemptResult, PracticeRun } from '@coach/contracts';
import { api } from '@/lib/api';
import { catalogKeys } from '@/features/catalog/hooks';
import { dashboardKey } from '@/features/dashboard/hooks';

export interface PracticeParams {
  scope: 'current' | 'all' | 'lesson' | 'unit' | 'type' | 'item' | 'due' | 'mistakes' | 'weak';
  lessonId?: string;
  unitId?: string;
  itemId?: string;
  type?: string;
  count: number;
}

/** Builds a fresh set of exercises. It is a POST because it stores exercises, even though it reads like a query. */
export function usePracticeRun() {
  return useMutation({
    mutationFn: (params: PracticeParams) => api<PracticeRun>('/practice', { method: 'POST', body: params }),
  });
}

export interface AttemptInput {
  clientAttemptId: string;
  exerciseId: string;
  response: unknown;
  durationMs?: number;
  /** Set when the answer belongs to a slot of the daily session. */
  sessionItemId?: string;
}

export function useSubmitAttempt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AttemptInput) => api<AttemptResult>('/attempts', { method: 'POST', body }),
    // Every answer moves XP, reviews and mistakes, so the home screen must not show stale numbers.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: dashboardKey });
      void client.invalidateQueries({ queryKey: ['mistakes'] });
    },
  });
}

export function useGenerateExercises(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ created: number; rejected: number }>(`/items/${itemId}/generate-exercises`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: catalogKeys.current }),
  });
}
