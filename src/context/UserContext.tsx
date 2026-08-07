'use client';

import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, startProactiveRefresh } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';
import { clearKycDraft } from '@/lib/kyc-draft';
import { clearWithdrawIntent } from '@/lib/withdraw-intent';
import { announceSessionEvent, onSessionEvent } from '@/lib/session-channel';
import { isPublicPath } from '@/lib/public-paths';

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

/**
 * What we know about the session, as three states rather than two.
 *
 * `signed-out` and `unreachable` were one value — `user === null` — and
 * collapsing them is a real defect, not a tidiness point. A 500, a timeout or
 * one dropped request on the FIRST `/auth/me` of a page load was
 * indistinguishable from "no session", so `RequireAuth` redirected a signed-in
 * client to the sign-in screen. It is reachable mid-KYC: the client is on
 * `/kyc/step/3`, one request fails, and they are ejected.
 *
 * The portal cannot tell a dead session from an unreachable API by guessing, so
 * it stops guessing and says which one it saw.
 */
export type SessionState = 'loading' | 'signed-in' | 'signed-out' | 'unreachable';

interface UserContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** The full picture. `isLoading`/`isAuthenticated` remain as the two common slices of it. */
  sessionState: SessionState;
  refetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  sessionState: 'loading',
  refetchUser: async () => {},
  logout: async () => {},
});

/**
 * Did the API actually answer "you are not signed in"?
 *
 * A 401 is an answer. No response at all, or a 5xx, is the absence of one — and
 * the difference is the whole point of `SessionState`. Note that by the time an
 * error reaches here the interceptor has already tried to refresh and replay, so
 * a 401 arriving at this point means the refresh was refused too.
 */
function isUnauthenticated(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // A query, not useEffect + useState: a signed-out visitor gets one 401 and
  // stays settled, instead of a render pass driven from an effect.
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<UserProfile>('/auth/me');
      startProactiveRefresh();
      return res.data;
    },
    /*
     * A 401 is final; a transport failure gets two more goes.
     *
     * `retry: false` was right while the only outcomes were "signed in" and
     * "signed out" — retrying a 401 just delays the redirect. Now that a
     * transport failure has its own screen, retrying matters: without it a
     * SINGLE dropped request paints "Cannot reach OxShare" over a working
     * portal, and a request aborted by an ordinary navigation looks exactly
     * like one.
     *
     * The 401 case must keep failing fast, or every signed-out visitor waits
     * through two pointless retries before the sign-in form appears.
     */
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 2,
    staleTime: 5 * 60_000,
    /*
     * Re-ask when the client comes back to the tab.
     *
     * Off before, which meant a profile change never reached an open tab: KYC
     * approved, verification level raised, the account suspended — all invisible
     * until a hard reload. On a phone, where the portal is backgrounded and
     * resumed rather than closed, "an open tab" is the normal state and a reload
     * is the unusual one.
     *
     * Cheap because `staleTime` still applies: focusing the tab twice in five
     * minutes costs nothing, and the request is one small GET when it does fire.
     */
    refetchOnWindowFocus: true,
  });

  /*
   * `data` survives a failed refetch — that is React Query working as designed,
   * and it is why an unreachable API must be read from `error` rather than from
   * the absence of a user. Without this the tab would keep rendering the last
   * known profile and call it a live session.
   */
  const sessionState: SessionState = isPending
    ? 'loading'
    : error
      ? isUnauthenticated(error)
        ? 'signed-out'
        : 'unreachable'
      : data
        ? 'signed-in'
        : 'signed-out';

  const user = sessionState === 'signed-in' ? (data ?? null) : null;

  const refetchUser = useCallback(async () => {
    await refetch();
  }, [refetch]);

  /*
   * Another tab signed out, so this one is signed out too.
   *
   * Without this the other tabs keep their cache and their chrome. With
   * `staleTime` at five minutes they would not even re-ask on focus in time, so
   * the client's name, email and cached wallet balance stayed on screen
   * indefinitely on a device they believe they signed out of. On a phone that is
   * the case that matters: "sign out" is what somebody relies on before handing
   * it to another person.
   *
   * A HARD navigation for the same reason `logout` uses one — a client-side push
   * keeps this JS context, and with it every balance already fetched.
   */
  useEffect(() => {
    return onSessionEvent((event) => {
      if (event !== 'signed-out') return;
      queryClient.clear();
      clearKycDraft();
      // The part-finished withdrawal too — it holds an amount and a payout
      // destination. Both, not one: this handler and `logout` below are the two
      // ways a session ends, and only clearing it in one leaves the other
      // carrying the previous person's financial detail into the next session.
      clearWithdrawIntent();
      if (typeof window === 'undefined') return;
      /*
       * Already somewhere a signed-out visitor belongs — there is nothing to
       * evict them from, and navigating would be a reload for no reason.
       *
       * The belt to `session-channel.ts`'s braces: that file drops a document's
       * own announcements, which is what actually broke the reload loop. This
       * makes the handler correct on its own terms too, so a future caller that
       * broadcasts from a public page cannot resurrect it.
       */
      if (isPublicPath(window.location.pathname)) return;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/auth/login';
    });
  }, [queryClient]);

  // /login is a redirect stub for /auth/login; go straight to the real page.
  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.clear();
    // The half-filled KYC form holds the client's name, date of birth and
    // address, and sessionStorage SURVIVES the full page load below — so the
    // "no KYC data survives the logout" guarantee this function claims was not
    // true of the one place that data actually sat. See lib/kyc-draft.ts.
    clearKycDraft();
    // `clearWithdrawIntent()` is back with the withdraw screen, on the same
    // reasoning: it holds an amount and a payout destination. Here AND in the
    // `signed-out` handler above; both, not one.
    clearWithdrawIntent();
    // Every other tab, before this one navigates away and stops being able to.
    announceSessionEvent('signed-out');
    // A HARD navigation, deliberately. `queryClient.clear()` drops the cache but
    // not the rest of the JS context; a full load is what guarantees no wallet
    // balance or KYC data survives the logout into the next session on a shared
    // device.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/auth/login';
  }, [queryClient]);

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading: isPending,
        isAuthenticated: sessionState === 'signed-in',
        sessionState,
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
