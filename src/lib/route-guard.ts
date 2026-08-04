/**
 * The route-gating decision, as a pure function.
 *
 * This logic decides whether an unauthenticated visitor reaches a private page
 * and whether an unverified client reaches KYC — and it lived inline in
 * proxy.ts, tangled with NextRequest and NextResponse, where it could not be
 * tested at all.
 *
 * NOTE ON TRUST: the JWT is read here WITHOUT verifying its signature, because
 * Next's proxy runtime has no access to the signing key. That is acceptable
 * only because this is a redirect hint, not an authorization check — every
 * route it guards is enforced again by the API, which does verify. A forged
 * token gets you a rendered shell and a wall of 401s, nothing more.
 */
export const PUBLIC_PATHS = [
  '/auth',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/r/',
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

/** Decode a JWT payload without verifying it. Returns null on anything malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const json = Buffer.from(payloadB64, 'base64url').toString();
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function decideRoute(pathname: string, token: string | undefined): GuardDecision {
  if (isPublicPath(pathname)) return ALLOW;
  if (!token) return { allow: false, redirectTo: '/auth/login' };

  // KYC requires a verified email (FR-CORE-15 gates onboarding on it).
  if (pathname.startsWith('/kyc')) {
    const payload = decodeJwtPayload(token);
    if (!payload) return { allow: false, redirectTo: '/auth/login' };
    if (payload['emailVerified'] !== true) {
      return { allow: false, redirectTo: '/verify-email/pending' };
    }
  }

  return ALLOW;
}
