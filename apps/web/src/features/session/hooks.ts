'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DailySessionEnvelope, SessionResultDto } from '@coach/contracts';
import { api } from '@/lib/api';
import { dashboardKey } from '@/features/dashboard/hooks';

/** Today's session: the one in progress, a new one, or (with `extra`) another after finishing. */
export function useOpenSession() {
  return useMutation({
    mutationFn: (extra: boolean) => api<DailySessionEnvelope>('/daily-sessions', { method: 'POST', body: { extra } }),
  });
}

export function useCompleteSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<SessionResultDto>(`/daily-sessions/${sessionId}/complete`, { method: 'POST' }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: dashboardKey }), client.invalidateQueries({ queryKey: ['mistakes'] })]),
  });
}