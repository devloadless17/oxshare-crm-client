'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, startProactiveRefresh } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';

import type { components } from '@/lib/api/types.gen';

/**
 * Aliased from the schema generated out of the backend's Swagger, so a backend
 * rename is a compile error rather than a runtime surprise.
 *
 * This was hand-written until GET /auth/me gained a `UserProfileDto`. The
 * hand-written copy had already drifted in three places: it declared
 * `type: 'referral' | 'partner'` (the backend enum is `individual | corporate`),
 * a `status: 'pending'` that does not exist, and `verificationLevel: 0 | 1`
 * where the backend returns a plain number.
 */
export type UserProfile = components['schemas']['UserProfileDto'];

interface UserContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refetchUser: async () => {},
  logout: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // A query, not useEffect + useState: a signed-out visitor gets one 401 and
  // stays settled, instead of a render pass driven from an effect.
  const { data, isPending } = useQuery({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<UserProfile>('/auth/me');
      startProactiveRefresh();
      return res.data;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const user = data ?? null;

  const refetchUser = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
  }, [queryClient]);

  // /login is a redirect stub for /auth/login; go straight to the real page.
  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.clear();
    window.location.href = '/auth/login';
  }, [queryClient]);

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading: isPending,
        isAuthenticated: !!user,
        refetchUser,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
