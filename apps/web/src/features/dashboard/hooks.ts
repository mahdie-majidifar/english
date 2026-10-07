'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardDto } from '@coach/contracts';
import { api } from '@/lib/api';

export const dashboardKey = ['dashboard'] as const;

/** The home screen's data. It changes with every answer, so it is refetched when the page is shown. */
export const useDashboard = () =>
  useQuery({ queryKey: dashboardKey, queryFn: () => api<DashboardDto>('/dashboard'), staleTime: 0, refetchOnMount: 'always' });