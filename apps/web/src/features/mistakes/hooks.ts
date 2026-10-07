'use client';

import { useQuery } from '@tanstack/react-query';
import type { MistakeDto, MistakeSummary } from '@coach/contracts';
import { api } from '@/lib/api';

export type MistakeFilter = 'open' | 'resolved';

export const useMistakes = (status: MistakeFilter) =>
  useQuery({
    queryKey: ['mistakes', status],
    queryFn: () => api<MistakeDto[]>(`/mistakes?status=${status}`),
    refetchOnMount: 'always',
  });

export const useMistakeSummary = () =>
  useQuery({ queryKey: ['mistakes', 'summary'], queryFn: () => api<MistakeSummary>('/mistakes/summary'), refetchOnMount: 'always' });