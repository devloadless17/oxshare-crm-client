/**
 * The route-gating decision, as a pure function.
 *
 * This logic decides whether an unauthenticated visitor reaches a private page
 * and whether an unverified client reaches KYC — and it lived inline in
 * proxy.ts, tangled with NextRequest and NextResponse, where it could not be
 * tested at all.
 *
 * NOTE ON TRUST: the proxy runtime has no access to the signing key, so nothing
 * here can verify a token. That is acceptable only because this is a redirect
 * hint, not an authorization check — every route it guards is enforced again by
 * the API, which does verify. A forged cookie gets you a rendered shell and a
 * wall of 401s, nothing more.
 *
 * It follows that this file must never READ a claim to decide anything. It once
 * did, and the consequences are recorded above `decideRoute`.
 */
export const PUBLIC_PATHS = [
  '/auth',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
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
   * comment in `isPublicPath` — so the exception does not get to stay on
   * speculation. Add it back in the same commit as the route.
   */
];

export type GuardDecision = { allow: true } | { allow: false; redirectTo: string };

const ALLOW: GuardDecision = { allow: true };

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((entry) =>
    // An entry ending in `/` is a prefix by design — `/r/` covers every referral
    // code. Everything else matches whole SEGMENTS, never a bare string prefix:
    // `startsWith('/login')` would also admit `/login-help`, and
    // `startsWith('/register')` would admit `/register-partner`, so a route
    // added later could become unauthenticated without anyone deciding it.
    entry.endsWith('/')
      ? pathname.startsWith(entry)
      : pathname === entry || pathname.startsWith(`${entry}/`),
  );
}

/*
 * This decides ONE thing: is there a session at all. It deliberately does not
 * decide anything that depends on what is INSIDE the token.
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
 * authoritative — `/auth/me` — so the email gate now lives in the KYC layout.
 */
export function decideRoute(pathname: string, token: string | undefined): GuardDecision {
  if (isPublicPath(pathname)) return ALLOW;
  if (!token) return { allow: false, redirectTo: '/auth/login' };
  return ALLOW;
}
