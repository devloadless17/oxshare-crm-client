'use client';

import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { partnerApi, type IbStatus } from '@/lib/api/partner';
import { partnerPageHidden } from '@/lib/partner-access';
import { keys } from '@/lib/query-keys';

/**
 * "Should this client see the Partner page at all?"
 *
 * The rule lives in `lib/partner-access.ts` as a pure function; this is the
 * wiring that feeds it `GET /ib/status`. Same shape as `useKycAccess`, and the
 * three decisions it copies are copied for the same reasons:
 *
 * ## The query key is shared on purpose
 *
 * `keys.partner.status()` is EXACTLY what the partner page's `useResource`
 * uses, with a query function returning the same DTO. `PortalChrome` calls
 * this hook for the sidebar on every private page and `RequireAuth` calls it
 * for the gate, so react-query serves all three readers from one fetch — two
 * keys would mean two requests that can also disagree, which is how a sidebar
 * and a gate end up telling the client different things about the same page.
 *
 * ## Not fetched for an unverified email
 *
 * `EmailVerifiedGuard` sits on the whole `ib` controller, so the request would
 * be a guaranteed 403. `enabled` rather than a swallowed error: a request that
 * could never have succeeded should not be made, and catching it would hide
 * the day it starts failing for a different reason. An unverified client keeps
 * the sidebar entry — `EMAIL_VERIFIED_PATHS` already explains the page to them
 * — and the answer resolves once they verify.
 *
 * ## A failed read hides nothing
 *
 * On any error `status` stays undefined and `partnerPageHidden` answers false.
 * The backend refuses the application regardless, so the cost of failing open
 * is one explanatory screen; the cost of failing closed is a client's page
 * vanishing because one request dropped.
 */
export function usePartnerAccess() {
  const { user, isLoading: userLoading } = useUser();

  const { data: status, isPending } = useQuery({
    queryKey: keys.partner.status(),
    queryFn: ({ signal }): Promise<IbStatus> => partnerApi.status(signal),
    enabled: user?.emailVerified === true,
    retry: false,
  });

  // `enabled: false` leaves a query permanently pending, so an unverified
  // client would otherwise sit in a loading state forever. There is nothing to
  // wait for in that case — the page is not hidden from them.
  const waiting = userLoading || (user?.emailVerified === true && isPending);

  return {
    /** Undefined until `/ib/status` has answered. */
    status,
    isLoading: waiting,
    hidden: partnerPageHidden(status),
  };
}
