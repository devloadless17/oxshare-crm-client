/**
 * The route-gating decision, as a pure function.
 *
 * This logic decides whether an unauthenticated visitor reaches a private page,
 * whether a signed-in client is bounced off the sign-in screen, and where each
 * of them lands — and it lived inline in proxy.ts, tangled with NextRequest and
 * NextResponse, where it could not be tested at all.
 *
 * NOTE ON TRUST: the proxy runtime has no access to the signing key, so nothing
 * here can verify a token. That is acceptable only because this is a redirect
 * hint, not an authorization check — every route it guards is enforced again by
 * the API, which does verify. A forged cookie gets you a rendered shell and a
 * wall of 401s, nothing more.
 *
 * It follows that this file must never READ a claim to decide anything. It once
 * did, and the consequences are recorded above `decideRoute`.
 *
 * And it follows that presence-of-cookie is NOT the whole gate. `RequireAuth`
 * (components/auth/require-auth.tsx) is the authoritative half: it asks
 * `/auth/me`, which is the only answer that cannot be forged, and it refuses to
 * paint the signed-in shell until that answer arrives. The two layers divide as
 * cheap-and-early vs. correct-and-final, and neither is sufficient alone.
 */

/** Where a client with a live session belongs when they have asked for nothing in particular. */
export const DEFAULT_SIGNED_IN_PATH = '/dashboard';

/** The real sign-in screen. `/login` is a redirect stub for it — see below. */
export const LOGIN_PATH = '/auth/login';

/** The query parameter carrying where the visitor was trying to go. */
export const RETURN_TO_PARAM = 'next';

/**
 * Screens that exist ONLY for someone without a session.
 *
 * A signed-in client on one of these is redirected away, which is the second
 * half of gating and the half this app was missing: `/auth/login` rendered the
 * sign-in form to a fully authenticated client, who could then submit it and
 * mint a second session over their first.
 *
 * The top-level entries are the 5-line `redirect()` stubs — verification and
 * reset emails already in inboxes point at those URLs, so they must keep
 * working (lib/api/auth.ts records the incident where an emailed link 404'd).
 * They are listed here as well as their `/auth/*` targets so the bounce happens
 * on the first request rather than after a pointless round trip through the
 * stub.
 */
export const AUTH_ONLY_PATHS = ['/auth/login', '/auth/register', '/login', '/register'] as const;

/**
 * Screens that must work with OR without a session, and are therefore never
 * redirected in either direction.
 *
 * Each entry is here for a concrete reason, and "it is an auth page" is not one:
 *
 *  - `/verify-email` (and `/verify-email/pending`) — a client who has just
 *    registered IS signed in and is NOT verified. Bouncing them to /dashboard
 *    would send them to a portal they cannot use, away from the one page that
 *    tells them what to do next.
 *
 *  - `/forgot-password` and `/reset-password` — account recovery has to work
 *    from a browser that still holds a stale session cookie, which is the
 *    normal state of the device someone is locked out on. Treating these as
 *    auth-only would redirect a client holding a valid reset link to a
 *    dashboard they cannot actually reach, and there is no way back from that
 *    except clearing cookies by hand.
 *
 * That last case is why this list exists at all rather than one flat
 * PUBLIC_PATHS: "public" and "for signed-out people only" are different
 * properties, and collapsing them locks users out of recovery.
 */
export const ALWAYS_PUBLIC_PATHS = [
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
   * comment in `matchesPath` — so the exception does not get to stay on
   * speculation. Add it back in the same commit as the route.
   */
] as const;

/**
 * Every path reachable without a session.
 *
 * Enumerated, never a blanket `/auth` prefix. It used to be the latter, which
 * meant any page added under `/auth/` in future would be unauthenticated by
 * default and nobody would have decided that. Fail-closed is the only default
 * that survives a route being added by someone who has not read this file.
 */
export const PUBLIC_PATHS = [...AUTH_ONLY_PATHS, ...ALWAYS_PUBLIC_PATHS];

/**
 * Routes whose API calls the backend refuses without a verified email address.
 *
 * Mirrors `EmailVerifiedGuard` on the backend, which is applied to
 * `kyc.controller.ts` and `payments.controller.ts`. Without this list a client
 * with an unverified address could open /withdraw, fill in an amount, submit,
 * and be told `EMAIL_NOT_VERIFIED` by a 403 — the portal offering a money
 * operation the API had already decided to refuse.
 *
 * The list is the CLIENT half of a rule the server owns. It exists to explain
 * the refusal before the user invests effort in it, never to be the refusal
 * itself: every one of these endpoints enforces it again, and that enforcement
 * is the control.
 */
export const EMAIL_VERIFIED_PATHS = ['/kyc', '/deposit', '/withdraw', '/transactions'] as const;

/** Where an unverified client is sent to finish verifying. */
export const VERIFY_EMAIL_PATH = '/verify-email/pending';

export type GuardDecision = { allow: true } | { allow: false; redirectTo: string };

const ALLOW: GuardDecision = { allow: true };

function matchesPath(pathname: string, entries: readonly string[]): boolean {
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

/** Reachable with no session — either of the two public kinds. */
export function isPublicPath(pathname: string): boolean {
  return matchesPath(pathname, PUBLIC_PATHS);
}

/** For signed-out visitors only; a live session is redirected away. */
export function isAuthOnlyPath(pathname: string): boolean {
  return matchesPath(pathname, AUTH_ONLY_PATHS);
}

/** Requires a verified email address, because the API behind it does. */
export function requiresVerifiedEmail(pathname: string): boolean {
  return matchesPath(pathname, EMAIL_VERIFIED_PATHS);
}

/**
 * The sign-in URL that remembers where the visitor was going.
 *
 * Landing every bounced client on /dashboard threw away their intent: someone
 * who followed a link to `/wallet`, or a bookmarked `/kyc/step/3`, signed in and
 * then had to navigate there again. On a session that has quietly expired —
 * which is the common case, not the rare one — that happens mid-task.
 *
 * The root is excluded because there is nothing to return to: `/` is itself a
 * routing decision, and round-tripping it would send a freshly signed-in client
 * back to a redirect.
 */
export function loginPathFor(pathname: string, search = ''): string {
  const target = `${pathname}${search}`;
  if (!pathname || pathname === '/') return LOGIN_PATH;
  return `${LOGIN_PATH}?${RETURN_TO_PARAM}=${encodeURIComponent(target)}`;
}

/**
 * The `next` parameter, made safe to navigate to — or the dashboard.
 *
 * This value comes out of a URL, so it is attacker-controlled even though we
 * are the ones who put it there: anybody can send a client a link to
 * `/auth/login?next=https://evil.example/login`, and a portal that redirects
 * there after a successful sign-in has handed over a phishing page wearing our
 * flow. That is a textbook open redirect, and it is worth more here than on
 * most sites, because the page the victim arrives at is one they reach
 * immediately after typing their password.
 *
 * Resolved through `URL` against an opaque base rather than pattern-matched,
 * because the browser's own parser is the authority on what a string navigates
 * to and hand-rolled checks keep losing to it. `//evil.example` is
 * protocol-relative, `/\evil.example` is treated as `//` by every browser,
 * `https:/evil.example` collapses a slash, and `\/\/evil.example` does too. One
 * parse settles all of them: if the resolved origin is not the opaque base, the
 * string was never same-origin.
 *
 * Auth-only destinations are refused separately, because they are same-origin
 * and therefore pass the check above while still being wrong — signing in and
 * being returned to the sign-in page is a loop the user cannot break.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback: string = DEFAULT_SIGNED_IN_PATH,
): string {
  if (!raw) return fallback;

  // Control characters never appear in a path we generated, and they are the
  // raw material for response-splitting and for hiding the real target from a
  // human reading the link.

  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  const BASE = 'https://portal.invalid';
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  // Never bounce a client who has just signed in back to a sign-out-only page.
  if (isAuthOnlyPath(url.pathname) || url.pathname === '/') return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}

/*
 * This decides ONE thing per direction: is there a session at all. It
 * deliberately does not decide anything that depends on what is INSIDE the
 * token.
 *
 * It used to also gate `/kyc` on an `emailVerified` claim. That was correct
 * while `proxy.ts` supplied the ACCESS token, whose payload carries it. When
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
   * `app/page.tsx` sends `/` to the sign-in screen. With the reverse gate below
   * in place, a signed-in client asking for `/` would go to `/auth/login` and
   * be bounced straight back out to `/dashboard` — two hops and a flash of the
   * wrong screen, for a question the cookie already answers.
   */
  if (pathname === '/') {
    return { allow: false, redirectTo: hasSession ? DEFAULT_SIGNED_IN_PATH : LOGIN_PATH };
  }

  if (isAuthOnlyPath(pathname)) {
    if (!hasSession) return ALLOW;
    /*
     * A session-holder is sent where they were going, if they said — the same
     * `next` the redirect below attaches. Someone who followed a deep link
     * while their tab still held a session should land on the link, not on the
     * dashboard.
     *
     * `safeReturnTo` is what makes reading it here safe; see its comment.
     */
    const returnTo = new URLSearchParams(search).get(RETURN_TO_PARAM);
    return { allow: false, redirectTo: safeReturnTo(returnTo) };
  }

  if (isPublicPath(pathname)) return ALLOW;

  if (!hasSession) return { allow: false, redirectTo: loginPathFor(pathname, search) };

  return ALLOW;
}
