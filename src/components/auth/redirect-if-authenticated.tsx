'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/route-guard';

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
 * `proxy.ts` is the primary gate for this and answers it before any JavaScript
 * runs. This component is the backstop for the case the proxy structurally
 * cannot see — a cookie that has expired or been cleared out of step with the
 * session, and any future deployment where the cookie name and the session
 * disagree.
 *
 * ## Why this one renders children while it waits
 *
 * `RequireAuth` withholds the first paint; this deliberately does not, and the
 * asymmetry is the point.
 *
 * The sign-in screen is the most-loaded page in the app and the overwhelming
 * majority of its visitors have no session. Making all of them watch a spinner
 * while `/auth/me` returns a 401 would tax the common case to correct a rare
 * one that the proxy has already handled. The harm is also not symmetric:
 * showing the sign-in form for a moment to someone already signed in is a
 * cosmetic flicker, while showing the portal shell to a stranger is the bug
 * this whole change exists to fix.
 *
 * So: paint immediately, and correct the moment the authoritative answer lands.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
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

  return <>{children}</>;
}
