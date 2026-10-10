'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { LoginRequest, MeResponse, RegisterRequest, SystemStatus } from '@coach/contracts';
import { api } from '@/lib/api';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => api<MeResponse>('/auth/me'),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api<MeResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (data) => client.setQueryData(meKey, data),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequest) => api<MeResponse>('/auth/register', { method: 'POST', body }),
    onSuccess: (data) => client.setQueryData(meKey, data),
  });
}

/** Whether sign-ups are open and whether the AI is set up. Public, so it works before signing in. */
export const useSystemStatus = () =>
  useQuery({ queryKey: ['system-status'], queryFn: () => api<SystemStatus>('/system/status'), staleTime: 60_000, retry: false });

export function useLogout() {
  const client = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      client.clear();
      router.replace('/login');
    },
  });
}
