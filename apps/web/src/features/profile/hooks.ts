'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile, UpdateProfile } from '@coach/contracts';
import { api } from '@/lib/api';
import { meKey } from '@/features/auth/use-auth';

export const profileKey = ['profile'] as const;

export const useProfile = () => useQuery({ queryKey: profileKey, queryFn: () => api<Profile>('/me/profile') });

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfile) => api<Profile>('/me/profile', { method: 'PATCH', body }),
    onSuccess: (profile) => {
      client.setQueryData(profileKey, profile);
      // The name is shown in the sidebar and the greeting.
      void client.invalidateQueries({ queryKey: meKey });
      // Difficulty changes what the next session contains.
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
