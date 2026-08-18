import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from '@/lib/csp';
import { LOGIN_PATH } from '@/lib/return-to';

/**
 * Route handling for the whole portal, in one file.
 *
 * ── THE SESSION GATE THAT USED TO LIVE HERE IS GONE ─────────────────────────
 *
 * This runtime runs on the PORTAL's host and used to read
 * `__Host-oxshare_crm_portal_rt` off the incoming request to decide whether a
 * session existed. That cookie is set by the API's host, and the backend's
 * `session-cookies.ts` sets it with no `domain` and a `__Host-` prefix —
 * "deliberately and permanently", because a `Domain` attribute is the only way
 * a CRM cookie could reach another OxShare site. `__Host-` is the browser
 * ENFORCING that: the cookie is locked to the exact host that set it.
 *
 * So it is never sent here. The gate read `undefined` for every valid session
 * and bounced every private route to `/auth/login?next=…`: sign-in returned
 * 200, `/auth/me` returned the client, and the next navigation went straight
 * back to the sign-in screen.
 *
 * It looked fine locally because COOKIES IGNORE THE PORT — on localhost the API
 * and this app are the same cookie host, so the cookie was visible. Only a
 * deployment on distinct hostnames separates them.
 *
 * This is a consequence of the browser calling the API DIRECTLY rather than
 * through a same-origin rewrite; `lib/env.ts` documents why that had to change
 * (the realtime socket cannot go through a rewrite).
 *
 * ── What enforces access now ────────────────────────────────────────────────
 *
 * What always did, and what this file already said was the authoritative half:
 * `components/auth/require-auth` asks `/auth/me`, which is the only unforgeable
 * answer, and refuses to paint the signed-in shell until it arrives. The
 * eviction path is `endDeadSession` in `lib/api/client.ts` — a 401 clears the
 * session and hard-navigates to `loginPathFor(pathname, search)`, carrying the
 * destination exactly as this gate used to.
 *
 * The presence check was only ever "cheap-and-early" in front of that. Cheap
 * and early is worth nothing when it is also always wrong.
 *
 * DO NOT reinstate a cookie check here without first giving this host a cookie
 * to read — a separate, non-sensitive marker set with `Domain=` on the shared
 * parent domain, never the session cookie itself, which must keep `__Host-`.
 */

export type GuardDecision = { allow: true } | { allow: false; redirectTo: string };

const ALLOW: GuardDecision = { allow: true };

/*
 * Exported for tests only — `proxy()` below is the sole caller in the app.
 *
 * All that survives is the SITE ROOT, which is a routing decision rather than a
 * page. It no longer takes a token, and that removal is the point: this
 * function must not decide anything that depends on a session, because it
 * cannot see one.
 *
 * `/` therefore resolves to the sign-in screen unconditionally, matching what
 * `app/page.tsx` does anyway. A client who already has a session is corrected
 * onward by `components/auth/redirect-if-authenticated`, which asks `/auth/me`.
 * That costs a signed-in client one extra hop on `/` — the cost of the old
 * one-hop version was that everyone else could not sign in at all.
 *
 * It used to also gate `/kyc` on an `emailVerified` claim. That was correct
 * while this file supplied the ACCESS token, whose payload carries it. When
 * gating moved to the refresh cookie the claim vanished — the refresh token is
 * signed from `{ sub, jti }` and nothing more — so the check read
 * `undefined !== true` for every client and redirected all of them, verified or
 * not, away from onboarding. Claims are read where the token's shape is known
 * and the answer is authoritative: `/auth/me`, via `RequireAuth`.
 */
export function decideRoute(pathname: string): GuardDecision {
  if (pathname === '/') return { allow: false, redirectTo: LOGIN_PATH };
  return ALLOW;
}

export function proxy(request: NextRequest) {
  const decision = decideRoute(request.nextUrl.pathname);

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
