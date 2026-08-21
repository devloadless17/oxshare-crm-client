'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/loader';
import { useKycAccess } from '@/hooks/use-kyc-access';
import type { KycStatus } from '@/lib/kyc-form-access';
import { t } from '@/lib/i18n';

/**
 * Where a client belongs in the KYC flow, decided from the one status the
 * whole portal already reads.
 *
 * ## Why this replaced the server-side read
 *
 * The three `/kyc*` routes used to be Server Components that fetched
 * `/kyc/status` with the PORTAL host's cookie jar forwarded by hand. That works
 * only while the portal and the API share a cookie host — localhost. Deployed,
 * the API's session cookies are `__Host-` bound to the API's hostname and never
 * reach the portal's server, so every read answered 401, the helper returned
 * `null`, and `null` failed OPEN: a client who had just submitted was sent to
 * /kyc/submitted, which sent them back to step 1, which sent them on again. The
 * exact loop that file's own header claimed to have fixed, reintroduced by the
 * topology it could not see from localhost.
 *
 * ## What this does instead
 *
 * `useKycAccess` reads `/kyc/status` from the browser, with the browser's own
 * cookies, under the SAME query key `PortalChrome` and `RequireAuth` already
 * use — so on any `/kyc*` page the status is in flight or settled before this
 * mounts, and no extra request is made. Nothing paints until it lands (no
 * flash of the wrong screen, which was the server read's one genuine virtue),
 * and then ONE predicate — `canOpenKycForm`, the same function on every route —
 * decides. Two routes sharing one predicate cannot ping-pong.
 *
 * Failing open is still the rule: a status that cannot be read resolves to
 * `not_started`, which opens the form, and the API independently refuses any
 * write the client is not entitled to.
 */
export function KycRouteGate({
  allow,
  redirectTo,
  children,
}: {
  /** May a client in this state see `children`? */
  allow: (status: KycStatus) => boolean;
  /** Where to send them otherwise. */
  redirectTo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, isLoading } = useKycAccess();
  // `undefined` once loading is over means the query never ran (an unverified
  // email, which `RequireAuth` is already redirecting) — treated as "never
  // started", the open-form default.
  const resolved: KycStatus = status ?? 'not_started';
  const allowed = !isLoading && allow(resolved);

  useEffect(() => {
    if (!isLoading && !allowed) router.replace(redirectTo);
  }, [isLoading, allowed, redirectTo, router]);

  if (isLoading || !allowed) return <PageLoader label={t('kyc.resuming')} />;
  return <>{children}</>;
}
