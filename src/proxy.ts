import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from '@/lib/csp';
import { DEFAULT_SIGNED_IN_PATH, LOGIN_PATH, RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';
// The single definition of "a screen that exists only for signed-out people",
// shared with lib/api/client.ts. Never a `/auth` prefix — see the file.
import { AUTH_ONLY_PATHS, matches } from '@/lib/public-paths';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';
import { languageFromLink } from '@/lib/i18n/link-locale';
import { LOCALE_COOKIE, LOCALE_MAX_AGE_SECONDS } from '@/lib/i18n/locale-storage';

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
 *
 * ── That marker now exists, and this file reads it ──────────────────────────
 *
 * `lib/session-hint.ts`. It is written by THIS app on THIS host from JavaScript
 * whenever `/auth/me` answers "signed in", so nothing about it depends on the
 * API's cookie domain and the paragraph above still holds in full — the session
 * cookie is still invisible here and still must be.
 *
 * What it is allowed to decide is bounded, and the boundary is the point: it
 * chooses between two PUBLIC screens for a visitor, and never whether somebody
 * may see a private one. Reinstating the old gate on top of it would be the
 * original bug wearing a new cookie — a marker any visitor can write is not an
 * authorisation, and `require-auth.tsx` remains the only thing that decides
 * access, because `/auth/me` is the only answer that cannot be forged.
 *
 * The problem it solves is the one a returning client actually had: `/` is what
 * people type and what their bookmark points at, so the unconditional redirect
 * to `/auth/login` meant every client with a live thirty-day session was shown a
 * sign-in form and then moved off it. Being logged out is what that looks like.
 */

export type GuardDecision = { allow: true } | { allow: false; redirectTo: string };

const ALLOW: GuardDecision = { allow: true };

/*
 * Exported for tests only — `proxy()` below is the sole caller in the app.
 *
 * PURE, and it takes the marker as an argument rather than reading a cookie, so
 * every branch here is a table test rather than something you find by clicking.
 *
 * It decides two things, both of which move a visitor between PUBLIC screens:
 * where the SITE ROOT goes, and whether a browser that has been signed in should
 * be handed the sign-in form. It still decides nothing about access — it cannot,
 * because a marker any visitor can write is not a session. The hard version of
 * that rule is in the header comment above.
 *
 * `/` used to resolve to the sign-in screen unconditionally, and that is the bug
 * this fixes: it is the URL people type, so the guarantee was that every
 * returning client saw a login form. They are now sent where they belong before
 * any HTML is generated, and `components/auth/redirect-if-authenticated` is left
 * as the backstop for the case this cannot see — a marker and a session that
 * disagree.
 *
 * It used to also gate `/kyc` on an `emailVerified` claim. That was correct
 * while this file supplied the ACCESS token, whose payload carries it. When
 * gating moved to the refresh cookie the claim vanished — the refresh token is
 * signed from `{ sub, jti }` and nothing more — so the check read
 * `undefined !== true` for every client and redirected all of them, verified or
 * not, away from onboarding. Claims are read where the token's shape is known
 * and the answer is authoritative: `/auth/me`, via `RequireAuth`.
 */
export function decideRoute(pathname: string, hasSessionHint: boolean, search = ''): GuardDecision {
  if (pathname === '/') {
    return { allow: false, redirectTo: hasSessionHint ? DEFAULT_SIGNED_IN_PATH : LOGIN_PATH };
  }

  /*
   * A browser that has been signed in does not get handed the sign-in form.
   *
   * This is the half of the fix that runs on the SERVER, and it is the half that
   * matters: the client-side backstop can only hold the paint until `/auth/me`
   * answers, whereas this means the HTML for the sign-in screen is never sent.
   * A returning client goes `/auth/login` → 307 → `/dashboard` with no form
   * rendered at any point, and no round trip spent deciding.
   *
   * `AUTH_ONLY_PATHS`, not `PUBLIC_PATHS`. The difference is the whole reason
   * public-paths.ts keeps two lists: /verify-email, /forgot-password and
   * /reset-password must work WITH a session — a client who just registered is
   * signed in and unverified, and account recovery runs from the device that
   * still holds a stale session cookie. Redirecting those to the dashboard locks
   * people out of the one page that unblocks them.
   *
   * `?next=` is honoured, through `safeReturnTo`: someone who followed a link to
   * /wallet, was bounced here, and turns out to still be signed in belongs at
   * /wallet, not at the dashboard. The value arrives in a URL, so it is
   * attacker-supplied and never navigated to unchecked — that check is the
   * reason `safeReturnTo` is a shared module rather than four inline snippets.
   */
  if (hasSessionHint && matches(pathname, AUTH_ONLY_PATHS)) {
    const next = new URLSearchParams(search).get(RETURN_TO_PARAM);
    return { allow: false, redirectTo: safeReturnTo(next) };
  }

  return ALLOW;
}

export function proxy(request: NextRequest) {
  const fromLink = languageFromLink(request.nextUrl.pathname, request.nextUrl.search);
  if (fromLink) return withCsp(request, rememberLanguage(request, fromLink));

  /*
   * NOT the session. A non-sensitive marker this app writes on its OWN host
   * whenever `/auth/me` says "signed in" — see lib/session-hint.ts, which
   * explains why the session cookie itself is structurally invisible here and
   * why this is the marker the note above asks for.
   *
   * Everything it decides is COSMETIC: which of two public screens to send a
   * visitor to. Forging it buys one redirect to /dashboard, where `RequireAuth`
   * asks the API, gets a 401, clears this marker and sends them back. No private
   * byte is ever rendered from it.
   */
  const hasSessionHint = request.cookies.has(SESSION_HINT_COOKIE);
  const decision = decideRoute(request.nextUrl.pathname, hasSessionHint, request.nextUrl.search);

  return decision.allow
    ? withCsp(request)
    : withCsp(request, NextResponse.redirect(new URL(decision.redirectTo, request.url)));
}

/**
 * An emailed link's language (`?lang=`, lib/i18n/link-locale.ts): remembered
 * exactly as the language switch remembers it, then the same address without
 * the parameter — so the page renders in that language from its first paint,
 * and the address the client keeps is clean.
 *
 * Absolute here, unlike `app/join/[code]/route.ts`: Next turns a proxy redirect
 * to the request's own host into a relative `Location` itself, and refuses a
 * relative one (`server/web/adapter.js`).
 */
function rememberLanguage(
  request: NextRequest,
  link: NonNullable<ReturnType<typeof languageFromLink>>,
): NextResponse {
  const response = NextResponse.redirect(new URL(link.target, request.url), 307);
  if (link.locale) {
    response.cookies.set(LOCALE_COOKIE, link.locale, {
      path: '/',
      maxAge: LOCALE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      // Behind the proxy the request reaches us as plain http; Caddy says how it arrived.
      secure:
        request.headers.get('x-forwarded-proto') === 'https' ||
        request.nextUrl.protocol === 'https:',
    });
  }
  return response;
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
   * The trailing pattern excludes static files. Gating a static asset behind a
   * session was never the intent — nothing under `public/` is private, and
   * anything that ever is belongs behind an authenticated route handler like
   * the KYC uploads controller, not behind a redirect that returns HTML.
   *
   * ## Why an explicit extension LIST, and not `.*\.[\w]+$`
   *
   * "Any path with a dot in it" is too wide, and the cost is not a broken
   * image — it is a page served with **no Content-Security-Policy**, because
   * `withCsp()` only runs on paths this matcher admits. Every real asset this
   * app serves is in the list below; a ROUTE segment that happens to contain a
   * dot is not, so it keeps its CSP. The admin console carries the identical
   * list for the identical reason.
   *
   * Note the double backslash: this is a single-quoted STRING, not a regex
   * literal, and `'\.'` silently collapses to a bare `.` meaning "any
   * character" — which reopens the hole this list closes.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|txt|xml|json|webmanifest|woff|woff2|ttf|otf|eot|map|mp4|webm|pdf|csv)$).*)',
  ],
};
