'use client';

import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/types.gen';
import { isKycApproved, isKycPending, isKycRejected } from '@/lib/kyc-access';
import { keys } from '@/lib/query-keys';

type KycStatusDto = components['schemas']['KycStatusDto'];

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

  /*
   * The CACHE holds the whole DTO; `select` narrows it for this caller.
   *
   * It used to store `res.data.status` — a bare string — under a key four other
   * files fill with the DTO OBJECT. One key, two shapes, and whichever screen
   * mounted first decided which one was in the cache. A client who refreshed
   * the dashboard (string) and then clicked through to /kyc/submitted (object
   * reader) got `'approved'.status` === undefined, fell to the page's
   * `?? 'submitted'` default, and was told their approved verification was
   * still under review — permanently, because a fresh cache entry never
   * refetches.
   *
   * `select` is what keeps both readers honest: the shared entry stays one
   * shape, and narrowing happens per consumer instead of per writer.
   */
  const { data, isPending } = useQuery({
    queryKey: keys.kyc.status(),
    queryFn: async () => (await apiClient.get<KycStatusDto | null>('/kyc/status')).data ?? null,
    select: (dto) => ({
      status: dto?.status ?? 'not_started',
      reverification: Boolean(dto?.reverificationRequestedAt),
    }),
    enabled: user?.emailVerified === true,
    retry: false,
  });
  const status = data?.status;

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
    /*
     * A VERIFIED client the desk asked to update (26 Sep 2026). The status is
     * `rejected` — the money doors are shut exactly as for a refusal, so every
     * gate above still reads `rejected` — but the WORDS differ: this client did
     * nothing wrong, and "your documents were not approved" tells them they did.
     */
    reverification: isKycRejected(status) && data?.reverification === true,
    /*
     * The email gate, which every consumer has to be able to see.
     *
     * The KYC query is disabled until the address is confirmed, so for an
     * unverified client `approved`/`pending`/`rejected` are all false and a
     * gate dialog falls through to "start verification" — pointing at /kyc,
     * which `EmailVerifiedGuard` bounces them out of. `KycGateDialog` has a
     * purpose-built `email` branch and says why it must win: sending somebody
     * into the identity wizard before they have clicked the link in their
     * inbox hands them a form the API refuses for a different reason than the
     * one on screen. `MoneyAction` could not pass it because this hook did not
     * expose it.
     */
    emailUnverified: Boolean(user) && user?.emailVerified !== true,
  };
}
