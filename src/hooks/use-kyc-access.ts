'use client';

import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { apiClient } from '@/lib/api/client';
import { isKycApproved, isKycPending, isKycRejected } from '@/lib/kyc-access';

/**
 * "May this client move money, and if not, why not?"
 *
 * The rule itself lives in `lib/kyc-access.ts` as pure functions; this is the
 * wiring that feeds it the two live signals.
 *
 * ## The query key is shared on purpose
 *
 * `['kyc-status']` is EXACTLY what `PortalChrome` uses for the sidebar badge.
 * Every private page renders through `PortalChrome`, so on any screen that
 * calls this hook the request is in flight or settled before the hook mounts,
 * and react-query serves it from that one fetch. A different key would mean two
 * `/kyc/status` requests per page load that can also disagree with each other
 * for as long as one is behind — which is precisely how the sidebar badge and
 * the wizard once told a client two different things about the same
 * submission.
 *
 * The key deliberately carries NO pathname. It used to, and `portal-layout.tsx`
 * records the cost: a cache entry per URL, a refetch on every navigation, and a
 * sidebar that kept yesterday's status until the client happened to visit a URL
 * it had not cached.
 *
 * That shared key is also what lets `RequireAuth` call this UNCONDITIONALLY,
 * on every private route rather than only the money ones. It looks like a
 * request on pages that do not need one; it is not, because `PortalChrome`
 * already makes exactly this request with exactly this key and this `enabled`
 * condition on every one of those pages. Two hooks, one fetch. Calling it
 * behind an `if` instead would break the rules of hooks and buy nothing.
 *
 * ## Not fetched for an unverified email
 *
 * `/kyc/*` sits behind `EmailVerifiedGuard`, so the request would be a
 * guaranteed 403. `enabled` rather than a swallowed error: a request that could
 * never have succeeded should not be made, and catching it would hide the day
 * it starts failing for a different reason.
 */
export function useKycAccess() {
  const { user, isLoading: userLoading } = useUser();

  const { data: status, isPending } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: async () => {
      const res = await apiClient.get<{ status?: string }>('/kyc/status');
      return res.data?.status ?? 'not_started';
    },
    enabled: user?.emailVerified === true,
    retry: false,
  });

  // `enabled: false` leaves a query permanently pending, so an unverified
  // client would otherwise sit in a loading state forever. There is nothing
  // left to wait for in that case — the answer is already "no".
  const waiting = userLoading || (user?.emailVerified === true && isPending);

  return {
    /** Undefined until the status has answered; see `isLoading`. */
    status,
    isLoading: waiting,
    approved: isKycApproved(user?.verificationLevel, status),
    pending: isKycPending(status),
    rejected: isKycRejected(status),
  };
}
