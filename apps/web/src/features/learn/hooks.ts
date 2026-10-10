'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExplanationResponse,
  LearnContextDto,
  SuggestLessonContent,
  SuggestLessonContentResult,
} from '@coach/contracts';
import { api } from '@/lib/api';

export const learnKeys = {
  context: (scope: { lessonId?: string; unitId?: string }) => ['learn', 'context', scope] as const,
  explanation: (itemId: string) => ['learn', 'explanation', itemId] as const,
};

export const useLearnContext = (scope: { lessonId?: string; unitId?: string }) =>
  useQuery({
    queryKey: learnKeys.context(scope),
    queryFn: () => api<LearnContextDto>(`/learn/context?${scope.lessonId ? `lessonId=${scope.lessonId}` : `unitId=${scope.unitId}`}`),
    enabled: Boolean(scope.lessonId || scope.unitId),
    retry: false,
  });

/** The kept mini-lesson for an item, or null when none was asked for yet. Costs nothing. */
export const useExplanation = (itemId: string | undefined) =>
  useQuery({
    queryKey: learnKeys.explanation(itemId ?? ''),
    queryFn: async () => (await api<ExplanationResponse>(`/items/${itemId}/explanation`)).explanation,
    enabled: Boolean(itemId),
  });

/** Asks the AI to write the mini-lesson. It is kept, so this is only paid for once per item. */
export function useExplain(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (refresh?: boolean) => api<ExplanationResponse>(`/items/${itemId}/explain${refresh ? '?refresh=1' : ''}`, { method: 'POST' }),
    onSuccess: (data) => client.setQueryData(learnKeys.explanation(itemId), data.explanation),
  });
}

export function useSuggestLessonContent(lessonId: string) {
  return useMutation({
    mutationFn: (body: SuggestLessonContent) =>
      api<SuggestLessonContentResult>(`/lessons/${lessonId}/suggest-content`, { method: 'POST', body }),
  });
}
