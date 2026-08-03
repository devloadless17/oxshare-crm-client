'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, startProactiveRefresh } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';

/**
 * Hand-written, and it should not be.
 *
 * The admin app aliases every response type out of types.gen.ts, so a backend
 * rename is a compile error. `npm run gen:api-types` is wired up here too, but
 * the identity controller carries no @ApiOkResponse DTOs — GET /auth/me is
 * documented in Swagger with `content?: never`, so there is nothing to alias.
 *
 * Replace this with `components['schemas'][...]` the moment those DTOs exist.
 * Until then this shape is an assumption, and a backend field rename fails
 * silently at runtime rather than loudly at build time.
 */
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  type: 'individual' | 'referral' | 'partner';
  status: 'active' | 'suspended' | 'pending';
  verificationLevel: 0 | 1;
  emailVerified: boolean;
  country?: string;
  phone?: string;
  createdAt: string;
}

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
