'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';
import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';

/**
 * Keeps a signed-in client off the screens that only exist for signed-out ones.
 *
 * The portal shipped with gating in one direction only. `/auth/login` rendered
 * the sign-in form to a fully authenticated client — confirmed against a live
 * session, not inferred — and so did `/auth/register`. Three things follow, in
 * rising order of seriousness:
 *
 *  1. It reads as broken. Clicking a stale bookmark shows a login form to
 *     someone who is demonstrably logged in.
 *  2. Submitting it mints a SECOND session over the first. The old refresh
 *     token is not revoked by a new login, so the account quietly accumulates
 *     live token families — each one valid for thirty days.
 *  3. On a shared device it is a foothold: the sign-in form is right there,
 *     under an existing session, inviting credentials to be typed into a page
 *     that will happily replace whoever is currently signed in.
 *
 * ## It no longer paints the form first
 *
 * It used to, and the comment here defended it: the sign-in screen is the
 * most-loaded page in the app, almost every visitor to it has no session, and
 * making all of them watch a spinner while `/auth/me` returns a 401 taxes the
 * common case to correct a rare one.
 *
 * The reasoning was sound and the conclusion was wrong, because the "rare" case
 * is what a returning client sees EVERY time they open the portal. `/` redirects
 * here, so a client with a live thirty-day session met a fully painted sign-in
 * form, held for a whole round trip, before being moved to their dashboard. That
 * is not a flicker — it is long enough to read, long enough to start typing a
 * password, and it teaches people the portal logs them out overnight.
 *
 * What was missing was a way to tell the two visitors apart before asking. There
 * is one now: `lib/session-hint.ts` — a non-sensitive marker cookie written on
 * THIS host whenever `/auth/me` says "signed in", read server-side in
 * `app/layout.tsx` so it is known before the first byte of HTML. So the trade
 * does not have to be made at all:
 *
 *   - no marker  → paint the form immediately, exactly as before. The signed-out
 *                  visitor, who is still the overwhelming majority, waits for
 *                  nothing.
 *   - marker     → hold the paint. This browser has been signed in; showing it
 *                  the form is either wrong or about to be.
 *
 * A marker that turns out to be stale costs a spinner and then the form — the
 * old behaviour, for the one visitor in a thousand whose session died between
 * loads.
 *
 * ## Why the loader and not the form once `signedIn` is known
 *
 * `router.replace` is not instantaneous, and returning `children` during it puts
 * the sign-in form on screen for precisely the client this component exists to
 * keep away from it — the bug, one line further down. `RequireAuth` holds its
 * paint through its own redirect for the same reason.
 *
 * This remains the BACKSTOP rather than the gate. `proxy.ts` reads the same
 * marker and sends `/` straight to the dashboard, so most signed-in clients
 * never reach this component; it covers the ones who arrive by bookmark, by
 * link, or with a marker and a session that disagree.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { user, isLoading, hadSession } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const signedIn = !isLoading && user !== null;
  // Where they were going before they were bounced here. Attacker-reachable —
  // anyone can send a client a link carrying any `next` at all — so it is never
  // navigated to without `safeReturnTo`, which is where the open-redirect
  // reasoning lives.
  const destination = safeReturnTo(searchParams.get(RETURN_TO_PARAM));

  React.useEffect(() => {
    if (signedIn) router.replace(destination);
  }, [signedIn, destination, router]);

  /*
   * `hadSession` is the marker while the answer is in flight and the answer once
   * it lands, so this stops holding the moment `/auth/me` says 401 — a browser
   * with a stale marker gets the form, not a spinner with no end.
   */
  if (signedIn || (isLoading && hadSession)) {
    return (
      // srOnly: this is painted for someone who is about to be moved to their
      // dashboard, and a visible "Checking your session" on a screen they never
      // asked for reads as an error. The label is there for screen readers,
      // which otherwise get an unannounced page that changes under them.
      <PageLoader label={t('session.checking')} srOnly fullScreen />
    );
  }

  return <>{children}</>;
}
