'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { VERIFY_EMAIL_PATH, loginPathFor, requiresVerifiedEmail } from '@/lib/route-guard';
import { t } from '@/lib/i18n';

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
  const { user, isLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const signedOut = !isLoading && user === null;

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

  const redirectTo = signedOut
    ? loginPathFor(pathname, typeof window === 'undefined' ? '' : window.location.search)
    : needsVerification
      ? VERIFY_EMAIL_PATH
      : null;

  React.useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (isLoading || redirectTo) return <SessionCheck />;

  return <>{children}</>;
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
