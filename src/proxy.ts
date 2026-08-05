import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from '@/lib/csp';
import { DEFAULT_SIGNED_IN_PATH, LOGIN_PATH, loginPathFor } from '@/lib/return-to';

/**
 * Route gating for the whole portal, in one file.
 *
 * Which paths are public, which are private, who gets bounced and where they
 * land — all of it is here. It used to live in `lib/route-guard.ts` as a pure
 * function this file called; that bought unit tests but cost a reader one
 * indirection to answer "is /wallet protected", and the answer to that question
 * belongs in the middleware that enforces it.
 *
 * NOTE ON TRUST: this runtime has no access to the signing key, so nothing here
 * can verify a token. That is acceptable only because this is a redirect hint,
 * not an authorization check — every route it guards is enforced again by the
 * API, which verifies signatures rather than presence. A forged cookie gets you
 * a rendered shell and a wall of 401s, nothing more.
 *
 * It follows that this file must never READ a claim to decide anything. It once
 * did, and the consequences are recorded above `decideRoute`. It also follows
 * that presence-of-cookie is not the whole gate: `components/auth/require-auth`
 * asks `/auth/me`, which is the only unforgeable answer, and refuses to paint
 * the signed-in shell until it arrives. Cheap-and-early here, correct-and-final
 * there.
 */

/**
 * Screens that exist only for someone without a session.
 *
 * They are PUBLIC here and nothing more — this file does not redirect a
 * cookie-holder away from them, and `decideRoute` explains at length why that
 * would loop. Keeping a signed-in client off the sign-in form is the job of
 * `components/auth/redirect-if-authenticated`, which asks `/auth/me`.
 *
 * The list still earns its place: `safeReturnTo` reads it to refuse a `?next=`
 * pointing back at sign-in, which would strand a client in a loop of their own.
 *
 * The top-level entries are the 5-line `redirect()` stubs — verification and
 * reset emails already in inboxes point at those URLs, so they must keep
 * working (lib/api/auth.ts records the incident where an emailed link 404'd).
 */
const AUTH_ONLY_PATHS = ['/auth/login', '/auth/register', '/login', '/register'];

/**
 * Screens that must work with OR without a session, and are therefore never
 * redirected in either direction.
 *
 * Each entry is here for a concrete reason, and "it is an auth page" is not one:
 *
 *  - `/verify-email` (and `/verify-email/pending`) — a client who has just
 *    registered IS signed in and is NOT verified. Bouncing them to /dashboard
 *    sends them to a portal they cannot use, away from the one page that tells
 *    them what to do next.
 *
 *  - `/forgot-password` and `/reset-password` — account recovery has to work
 *    from a browser that still holds a stale session cookie, which is the
 *    normal state of the device someone is locked out on. Treating these as
 *    auth-only would redirect a client holding a valid reset link to a
 *    dashboard they cannot reach, with no way back except clearing cookies by
 *    hand.
 *
 * That last case is why there are two lists rather than one: "public" and "for
 * signed-out people only" are different properties, and collapsing them locks
 * users out of recovery.
 */
const ALWAYS_PUBLIC_PATHS = [
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  /*
   * `/r/` — the referral-code prefix — is deliberately NOT here yet.
   *
   * It was, and nothing in `src/app` served it. That is a latent hole rather
   * than a live one: no route means nothing is exposed today. But an entry
   * ending in `/` is a PREFIX match by design, so the moment somebody adds the
   * referral landing page (D-23's attribution work, IB-01) it would be
   * unauthenticated by default, and nobody would think to look here.
   *
   * This file goes out of its way to avoid exactly that — see the segment-match
   * comment in `matches` — so the exception does not get to stay on
   * speculation. Add it back in the same commit as the route.
   */
];

/**
 * Every path reachable without a session.
 *
 * Enumerated, never a blanket `/auth` prefix. It used to be the latter, which
 * meant any page added under `/auth/` in future would be unauthenticated by
 * default and nobody would have decided that. Fail-closed is the only default
 * that survives a route being added by someone who has not read this file.
 */
const PUBLIC_PATHS = [...AUTH_ONLY_PATHS, ...ALWAYS_PUBLIC_PATHS];

function matches(pathname: string, entries: readonly string[]): boolean {
  return entries.some((entry) =>
    // An entry ending in `/` is a prefix by design — `/r/` would cover every
    // referral code. Everything else matches whole SEGMENTS, never a bare string
    // prefix: `startsWith('/login')` would also admit `/login-help`, and
    // `startsWith('/register')` would admit `/register-partner`, so a route
    // added later could become unauthenticated without anyone deciding it.
    entry.endsWith('/')
      ? pathname.startsWith(entry)
      : pathname === entry || pathname.startsWith(`${entry}/`),
  );
}

export type GuardDecision = { allow: true } | { allow: false; redirectTo: string };

const ALLOW: GuardDecision = { allow: true };

/*
 * Exported for tests only — `proxy()` below is the sole caller in the app.
 *
 * It decides ONE thing per direction: is there a session at all. It
 * deliberately does not decide anything that depends on what is INSIDE the
 * token.
 *
 * It used to also gate `/kyc` on an `emailVerified` claim. That was correct
 * while this file supplied the ACCESS token, whose payload carries it. When
 * gating moved to the refresh cookie — rightly, so a returning client with a
 * valid 30-day session is renewed rather than bounced to login — the claim
 * vanished: the refresh token is signed from `{ sub, jti }` and nothing more.
 * The check then read `undefined !== true` for every client and redirected all
 * of them, verified or not, away from onboarding.
 *
 * The lesson is narrower than "be careful": a guard that reads claims is
 * coupled to WHICH token it is handed, and nothing made that coupling visible.
 * Claims are read where the token's shape is known and the answer is
 * authoritative — `/auth/me` — so the email gate lives in `RequireAuth`.
 */
export function decideRoute(
  pathname: string,
  token: string | undefined,
  search = '',
): GuardDecision {
  const hasSession = Boolean(token);

  /*
   * The site root is a routing decision, not a page, and it is answered here so
   * it costs one redirect instead of two.
   *
   * `app/page.tsx` sends `/` to the sign-in screen, so without this a client
   * with a session would land on a form and be bounced onward by the client
   * gate — two hops and a flash of the wrong screen for a question the cookie
   * already answers.
   *
   * A stale cookie sends them to /dashboard instead, where the client gate
   * corrects it to sign-in. That terminates: /dashboard is not auth-only, so
   * nothing sends them back here.
   */
  if (pathname === '/') {
    return { allow: false, redirectTo: hasSession ? DEFAULT_SIGNED_IN_PATH : LOGIN_PATH };
  }

  /*
   * THE SIGN-IN SCREEN IS ALWAYS SERVED. This is not an oversight.
   *
   * It used to redirect a cookie-holder away to /dashboard, and that produced
   * an infinite reload loop the moment a cookie outlived its session — which is
   * the NORMAL end of a session, not an edge case. A revoked family, an expired
   * refresh token, a password changed on another device: in every one of them
   * the browser still holds the cookie and the server no longer honours it.
   *
   *   /dashboard  → cookie present → allowed → /auth/me 401 → refresh fails
   *               → client navigates to /auth/login
   *   /auth/login → cookie present → redirected to /dashboard
   *               → and round again, forever.
   *
   * The asymmetry is the lesson, and it is the same one this file records twice
   * about reading claims. Gating a PRIVATE route on cookie presence fails safe:
   * the worst case is a rendered shell where every request 401s, and the client
   * gate corrects it. Gating an AUTH-ONLY route on cookie presence fails
   * CLOSED-AND-LOOPING: the worst case is a client who cannot reach the one
   * page that would fix their problem.
   *
   * So the reverse gate lives entirely in `components/auth/redirect-if-authenticated`,
   * which asks `/auth/me`. That answer is authoritative — a dead session
   * resolves to "no user" and the form renders, which is exactly right.
   *
   * `AUTH_ONLY_PATHS` still exists and is still used: `safeReturnTo` reads it to
   * refuse a `?next=` that would send a freshly signed-in client back to the
   * sign-in page.
   */
  if (matches(pathname, PUBLIC_PATHS)) return ALLOW;

  if (!hasSession) return { allow: false, redirectTo: loginPathFor(pathname, search) };

  return ALLOW;
}

export function proxy(request: NextRequest) {
  const decision = decideRoute(
    request.nextUrl.pathname,
    /*
     * Gated on the REFRESH cookie, not the access cookie.
     *
     * httpOnly cookies are still sent to the server, so R-3.2 changed nothing
     * here. R-3.3 did: the access token now lives 15 minutes rather than 8
     * hours, so gating on it would bounce a client who came back from lunch to
     * the login screen — while their 30-day refresh token sat there, valid,
     * ready to renew on the page's first request.
     *
     * A redirect hint either way: every route it guards is enforced again by the
     * API, which verifies signatures rather than presence.
     */
    request.cookies.get('__Host-oxshare_crm_portal_rt')?.value ??
      request.cookies.get('oxshare_crm_portal_rt')?.value,
    // The query string travels with the decision so a bounced visitor is
    // returned to the exact URL they asked for, filters and all — see
    // `loginPathFor`. Passing only the pathname silently dropped it.
    request.nextUrl.search,
  );

  return decision.allow
    ? withCsp(request)
    : withCsp(request, NextResponse.redirect(new URL(decision.redirectTo, request.url)));
}

/**
 * Attaches the per-request `script-src` nonce — see lib/csp.ts.
 *
 * Every return path goes through this, including the redirect: a response
 * without the header would fall back to no `script-src` at all, and the one page
 * an unauthenticated visitor definitely loads is the sign-in screen.
 *
 * The nonce is set on the REQUEST headers as well, because that is how Next's
 * renderer learns to stamp it onto the inline bootstrap and hydration scripts it
 * emits. Setting it only on the response would produce a strict policy and a
 * blank page.
 */
function withCsp(request: NextRequest, response?: NextResponse): NextResponse {
  const nonce = createNonce();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);

  const res = response ?? NextResponse.next({ request: { headers: requestHeaders } });
  if (response) response.headers.set(NONCE_HEADER, nonce);

  // The WHOLE policy, from one place. Merging with a header set in
  // next.config.ts does not work — config headers are applied AFTER middleware
  // and replace it — and the failure is silent: the response goes out carrying
  // script-src alone, with no default-src, no frame-ancestors and no object-src.
  // The policy looked stricter than before and was weaker.
  res.headers.set(
    'Content-Security-Policy',
    contentSecurityPolicy(nonce, process.env.NODE_ENV === 'production'),
  );
  return res;
}

export const config = {
  /*
   * Everything except Next's internals, the API rewrite, and STATIC FILES.
   *
   * The last exclusion was missing, and it is why the logo rendered as a broken
   * image on the sign-in screen: `/oxshare-mark.svg` is not a public PATH, so an
   * unauthenticated request for it was redirected to /login. The browser got an
   * HTML redirect where it expected an SVG. `next/image` failed the same way one
   * level down — the optimizer fetches the source itself, got the redirect, and
   * answered 400.
   *
   * It hid well: anyone with a live session loaded the asset normally, and a
   * cached copy survived logging out, so it only appeared on a genuinely cold
   * signed-out load.
   *
   * The trailing pattern excludes any path with a file extension. Gating a
   * static asset behind a session was never the intent — nothing under
   * `public/` is private, and anything that ever is belongs behind an
   * authenticated route handler like the KYC uploads controller, not behind a
   * redirect that returns HTML.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.[\\w]+$).*)'],
};
