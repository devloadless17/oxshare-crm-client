'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { apiClient } from '@/lib/api/client';
import { isKycApproved, requiresApprovedKyc } from '@/lib/kyc-access';
import { loginPathFor } from '@/lib/return-to';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * Routes whose API calls the backend refuses without a verified email address.
 *
 * Mirrors `EmailVerifiedGuard`, which sits on the backend's `kyc.controller.ts`
 * AND its `payments.controller.ts`. The portal only ever gated KYC, so
 * /deposit, /withdraw and /transactions rendered a complete money-movement UI
 * to a client whose every submission the API had already decided to refuse with
 * `EMAIL_NOT_VERIFIED`.
 *
 * Deliberately NOT in `proxy.ts`, and this is the same lesson that file records
 * twice: answering "is this address verified" requires reading a claim, the
 * proxy is handed the refresh token, and the refresh token does not carry one.
 * A gate that reads claims must live where the token's shape is known and the
 * answer is authoritative — which is `/auth/me`, which is here.
 *
 * This is the CLIENT half of a rule the server owns. It exists to explain the
 * refusal before the user invests effort in it, never to be the refusal itself.
 */
const EMAIL_VERIFIED_PATHS = ['/kyc', '/deposit', '/withdraw', '/transactions'];

/** Where an unverified client is sent to finish verifying. */
const VERIFY_EMAIL_PATH = '/verify-email/pending';

/** Where a client who has not passed KYC is sent from a money route. */
const KYC_PATH = '/kyc';

function requiresVerifiedEmail(pathname: string): boolean {
  // Whole segments, never a bare prefix — same rule as proxy.ts, same reason:
  // `startsWith('/deposit')` would also catch a future `/deposit-history`.
  return EMAIL_VERIFIED_PATHS.some(
    (entry) => pathname === entry || pathname.startsWith(`${entry}/`),
  );
}

/**
 * The authoritative half of route gating.
 *
 * `proxy.ts` decides on the PRESENCE of a refresh cookie, because the proxy
 * runtime has no signing key and so cannot do better. That is the right design
 * — it is fast, it runs before any JavaScript, and it keeps a signed-out
 * visitor off a private URL entirely — but it has one gap it cannot close from
 * where it stands: a cookie that is present is not a session that is valid.
 *
 * Concretely, before this component existed:
 *
 *     curl -H 'Cookie: oxshare_crm_portal_rt=totally-forged' localhost:3000/dashboard
 *     → 200, the full portal shell
 *
 * The sidebar rendered, the topbar rendered, the avatar fell back to "U" and
 * the name to the literal string "Client User" (portal-layout.tsx renders those
 * when `user` is null), and the client-facing app looked signed in to somebody
 * who was not. Nothing was LEAKED — every request behind that shell 401s, the
 * API verifies signatures rather than presence — but a portal that paints a
 * signed-in chrome for an unauthenticated visitor is broken in the way users
 * report and auditors flag, and the same shell appeared for the far more common
 * honest case: a refresh cookie that has expired or been revoked.
 *
 * `/auth/me` is the only answer that cannot be forged: it is signature-verified
 * server-side, it reflects a suspension or a deletion immediately, and
 * `UserContext` already holds it. So this component asks it, and refuses to
 * paint anything private until it has answered.
 *
 * ## Why it holds back the first paint
 *
 * Rendering children while the answer is in flight would put the signed-in
 * shell on screen for everyone, including the visitor about to be redirected —
 * which is exactly the bug, just briefer. The wait is only ever on a COLD load:
 * `UserContext`'s query has a five-minute `staleTime`, so a client-side
 * navigation between private pages reads a settled cache and this renders
 * children synchronously.
 *
 * `RedirectIfAuthenticated` makes the opposite trade for the opposite reason —
 * see the comment there. The asymmetry is deliberate: the cost of showing a
 * private shell to a stranger is not the cost of showing the sign-in form to
 * someone who is already signed in.
 *
 * ## Why a soft redirect here, and a hard one in client.ts
 *
 * A dead session is navigated to `/auth/login` with `window.location.href` by
 * the 401 interceptor, deliberately: that path is reached with wallet balances
 * and KYC data already in the React Query cache and in the JS context, and only
 * a full load discards them.
 *
 * This path is different. It runs before any private data has been fetched —
 * that is the whole point of holding back the paint — so there is nothing to
 * discard, and `router.replace` keeps the redirect instant and leaves no
 * history entry to press Back into.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, sessionState, refetchUser } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  /*
   * `signedOut` is now the API's answer, not the absence of one.
   *
   * It used to be `!isLoading && user === null`, which is also what a 500, a
   * timeout or one dropped request produced — so an offline moment on the FIRST
   * `/auth/me` of a page load redirected a signed-in client to the sign-in
   * screen. Reachable mid-KYC, where it also used to destroy the typed form.
   *
   * An unreachable API is rendered as what it is (below) and the session is left
   * alone. See `SessionState` in UserContext.
   */
  const signedOut = sessionState === 'signed-out';

  /*
   * A verified email is required by `EmailVerifiedGuard` on the backend's KYC
   * and payments controllers, so the pages in front of them are gated here too
   * — see EMAIL_VERIFIED_PATHS.
   *
   * This lived in `app/kyc/layout.tsx` and covered KYC alone, which left
   * /deposit, /withdraw and /transactions rendering a full money-movement UI to
   * a client every one of whose submissions the API would refuse with
   * `EMAIL_NOT_VERIFIED`. One gate, one list, one place to add the next route.
   *
   * `user !== null` is part of the condition rather than assumed: while the
   * profile is loading, "is this address verified" has no answer, and
   * redirecting on an unanswered question is precisely the bug that made
   * onboarding unreachable once already (see decideRoute's comment).
   */
  const needsVerification =
    !isLoading && user !== null && !user.emailVerified && requiresVerifiedEmail(pathname);

  /*
   * The KYC gate on the money routes.
   *
   * The buttons that reach /deposit and /withdraw already refuse to navigate an
   * unverified client and explain why (see `KycGateDialog` on /wallet), but a
   * dialog in front of a link is a courtesy, not a gate: the URLs are typed,
   * bookmarked and shared, and the routes rendered a complete money-movement
   * form to a client every submission of which the payments API had already
   * decided to refuse. So the same rule is enforced on arrival, in the same
   * place as the email rule and for the same stated reason.
   *
   * `/kyc/status` needs a verified email, hence the `enabled` — an unverified
   * client is already being redirected by the branch above, and firing a
   * guaranteed 403 on the way out is the noise `PortalChrome`'s query comment
   * records. The key matches that query exactly so react-query serves both from
   * one request rather than doubling every gated page load.
   *
   * `verificationLevel` alone would answer this without any request at all, and
   * it is deliberately not trusted alone: see `lib/kyc-access.ts` on why either
   * signal is sufficient but neither is required.
   */
  const kycGated = requiresApprovedKyc(pathname);
  const { data: kycStatus, isPending: kycPending } = useQuery({
    queryKey: ['kyc', 'status', pathname],
    queryFn: async () => {
      const res = await apiClient.get<{ status?: string }>('/kyc/status');
      return res.data?.status ?? 'not_started';
    },
    enabled: kycGated && user?.emailVerified === true,
    retry: false,
  });

  /*
   * `kycPending` keeps the redirect off an unanswered question — the same trap
   * that made onboarding unreachable when the email gate read a claim that was
   * not there. While the status is in flight the client is neither admitted nor
   * bounced; `SessionCheck` holds the paint, exactly as it does for the profile.
   */
  const kycUnresolved = kycGated && user?.emailVerified === true && kycPending;
  const needsKyc =
    !isLoading &&
    user !== null &&
    user.emailVerified &&
    kycGated &&
    !kycPending &&
    !isKycApproved(user.verificationLevel, kycStatus);

  const redirectTo = signedOut
    ? loginPathFor(pathname, typeof window === 'undefined' ? '' : window.location.search)
    : needsVerification
      ? VERIFY_EMAIL_PATH
      : needsKyc
        ? KYC_PATH
        : null;

  React.useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  /*
   * The API could not be reached, which is NOT "you are signed out".
   *
   * Rendered before the redirect check on purpose: `redirectTo` is null in this
   * state, but leaving it to fall through to `children` would paint the portal
   * shell over a profile we do not have.
   *
   * FIRST, ahead of `kycUnresolved` below, and that ordering is the point: when
   * the network is down BOTH are true, and "we cannot reach the server, here is
   * a retry" is an answer while an endless spinner is not.
   */
  if (sessionState === 'unreachable') {
    return <SessionUnreachable onRetry={() => void refetchUser()} />;
  }

  // `kycUnresolved` joins the two existing reasons to hold the paint: on a money
  // route the KYC answer is as load-bearing as the profile itself, and rendering
  // the withdrawal form to someone about to be bounced off it is the same bug
  // this component was written to fix, one gate further in.
  if (isLoading || redirectTo || kycUnresolved) return <SessionCheck />;

  return <>{children}</>;
}

/**
 * The API did not answer, and the client is told so rather than signed out.
 *
 * Deliberately says the session is intact. The failure mode this replaces —
 * silently landing on the sign-in screen — teaches a client that the portal logs
 * them out at random, and the natural response to that is to sign in again,
 * which on a flaky connection fails too and then meets the login rate limit.
 */
function SessionUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <h1 className="text-lg font-semibold text-foreground">{t('session.unreachableTitle')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('session.unreachableBody')}</p>
      {/* `<Button>`, not a hand-styled one. This is the control a client presses
          when the portal has just failed them, and it should look like the rest
          of the product rather than like part of the failure. */}
      <Button type="button" onClick={onRetry}>
        {t('session.retry')}
      </Button>
    </div>
  );
}

/**
 * What is on screen while the session is being confirmed.
 *
 * Deliberately anonymous — no sidebar, no navigation, no name, nothing that
 * implies a session exists — because for some of the people who see it, one
 * does not. It is also what a redirect renders behind, and a flash of the
 * portal chrome there would undo the point of holding the paint back.
 */
function SessionCheck() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-background"
    >
      <span className="sr-only">{t('session.checking')}</span>
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
      />
    </div>
  );
}
