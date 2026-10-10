'use client';

import { useQuery } from '@tanstack/react-query';
import type { AchievementsDto, ProgressDto } from '@coach/contracts';
import { api } from '@/lib/api';

export const useProgress = (days: number) =>
  useQuery({
    queryKey: ['progress', days],
    queryFn: () => api<ProgressDto>(`/progress?days=${days}`),
    refetchOnMount: 'always',
    placeholderData: (previous) => previous,
  });

export const useAchievements = () =>
  useQuery({ queryKey: ['achievements'], queryFn: () => api<AchievementsDto>('/achievements'), refetchOnMount: 'always' });
