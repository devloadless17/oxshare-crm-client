import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEFAULT_SIGNED_IN_PATH, LOGIN_PATH } from '@/lib/return-to';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';

/**
 * Straight to the real sign-in page — or, for a browser that has been signed in,
 * straight past it.
 *
 * This used to redirect to `/login`, which is itself a redirect stub for
 * `/auth/login` — two round trips to reach the same screen. The stub stays
 * (verification emails already in inboxes link to it, see lib/api/auth.ts), it
 * just is not on the path from the site root any more.
 *
 * The unconditional version is what made "open the portal" mean "look at a
 * sign-in form" for every returning client: `/` is what people type and what
 * their bookmark points at, so the one page a signed-in client was guaranteed to
 * be shown was the one page they had no business seeing.
 *
 * `proxy.ts` makes the same decision from the same cookie and gets there first,
 * so in practice this file is the fallback — for a request its matcher excludes,
 * and for anyone who reaches this route without passing through it. The two
 * agree because they read one marker and share `LOGIN_PATH` and
 * `DEFAULT_SIGNED_IN_PATH`; a second literal here is how they would stop
 * agreeing.
 *
 * The marker is not a session and is not trusted as one — see
 * lib/session-hint.ts. A forged or stale one lands on /dashboard, where
 * `RequireAuth` asks `/auth/me` and bounces it back with the marker cleared.
 */
export default async function Home() {
  const signedInBefore = (await cookies()).has(SESSION_HINT_COOKIE);
  redirect(signedInBefore ? DEFAULT_SIGNED_IN_PATH : LOGIN_PATH);
}
