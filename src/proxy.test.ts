import { describe, expect, it } from 'vitest';
import { decideRoute } from './proxy';

/**
 * Route gating, asserted against the middleware that performs it.
 *
 * These used to live against `lib/route-guard.ts`, a pure function this file
 * called. The rules moved back into `proxy.ts` — one file owns which paths are
 * public and who gets bounced where — and the tests came with them, because
 * `decideRoute` is still a plain function of (pathname, cookie, search) and
 * importing `next/server` under vitest turns out to cost nothing.
 *
 * That is the arrangement worth keeping: the rules are stated where they are
 * enforced, and every rule that has ever broken is one assertion away from
 * failing again. `proxy()` itself — the NextRequest/NextResponse wrapper — is
 * still not unit-tested, and does not need to be. It has no decisions in it.
 */

/** A signature-less JWT — the gate never verifies one, so this is enough. */
function fakeToken(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${b64}.signature`;
}

const SESSION = fakeToken({ sub: 'u1', emailVerified: true });
const UNVERIFIED = fakeToken({ sub: 'u1', emailVerified: false });

const AUTH_ONLY = ['/auth/login', '/auth/register', '/login', '/register'];

describe('no session', () => {
  it('sends an anonymous visitor on a private route to sign-in', () => {
    expect(decideRoute('/dashboard', undefined)).toEqual({
      allow: false,
      redirectTo: '/auth/login?next=%2Fdashboard',
    });
  });

  it('gates every private area, not just the one that was reported', () => {
    for (const path of ['/wallet', '/accounts', '/kyc', '/deposit', '/withdraw', '/transactions']) {
      expect(decideRoute(path, undefined).allow, path).toBe(false);
    }
  });

  it('serves the auth screens', () => {
    for (const path of AUTH_ONLY) {
      expect(decideRoute(path, undefined), path).toEqual({ allow: true });
    }
  });

  it('remembers the whole URL, query string included', () => {
    // Dropping the search meant a client bounced off a filtered transactions
    // view came back to an unfiltered one, mid-task.
    expect(decideRoute('/transactions', undefined, '?page=3&type=deposit')).toEqual({
      allow: false,
      redirectTo: '/auth/login?next=%2Ftransactions%3Fpage%3D3%26type%3Ddeposit',
    });
  });
});

describe('a live session', () => {
  it('allows the private routes', () => {
    expect(decideRoute('/dashboard', SESSION)).toEqual({ allow: true });
  });

  /*
   * The gate decides SESSION PRESENCE and nothing else, so none of these may
   * depend on what the token contains.
   *
   * It used to gate `/kyc` on an `emailVerified` claim, which worked only while
   * this file was handed the access token. Gating moved to the refresh cookie —
   * correctly — and the refresh token carries `{ sub, jti }` and nothing else,
   * so the claim was `undefined` for everyone and every client was redirected
   * off onboarding. The email gate lives in `RequireAuth` now, reading
   * `/auth/me`, which is the only authoritative answer.
   */
  it('lets any signed-in client into KYC, whatever the token contains', () => {
    expect(decideRoute('/kyc/step/personal', SESSION)).toEqual({ allow: true });
    expect(decideRoute('/kyc/step/personal', UNVERIFIED)).toEqual({ allow: true });
    expect(decideRoute('/kyc', fakeToken({ sub: 'u1' }))).toEqual({ allow: true });
  });

  it('does not read the token at all — an opaque one is still a session', () => {
    // The refresh cookie is what this is handed, and its payload is not the
    // access token's. Anything that parses a claim here is a bug waiting for
    // the next token-shape change.
    expect(decideRoute('/kyc', 'not-a-jwt')).toEqual({ allow: true });
    expect(decideRoute('/dashboard', 'opaque-token')).toEqual({ allow: true });
  });
});

/**
 * The half of gating this app shipped without.
 *
 * `/auth/login` served its form to a client holding a live session — confirmed
 * against the running backend, not inferred. Submitting it mints a SECOND
 * thirty-day refresh-token family over the first, and on the shared devices
 * this portal is often used from it puts a credential prompt in front of
 * whoever is already signed in.
 */
describe('a live session on a signed-out-only screen', () => {
  it('bounces a session-holder off every auth-only screen', () => {
    for (const path of AUTH_ONLY) {
      expect(decideRoute(path, SESSION), path).toEqual({
        allow: false,
        redirectTo: '/dashboard',
      });
    }
  });

  it('honours where they were going, rather than always the dashboard', () => {
    expect(decideRoute('/auth/login', SESSION, '?next=%2Fwallet')).toEqual({
      allow: false,
      redirectTo: '/wallet',
    });
  });

  it('refuses to be an open redirect', () => {
    // The `next` is attacker-supplied: anyone can mail a client this link.
    expect(decideRoute('/auth/login', SESSION, '?next=https://evil.example')).toEqual({
      allow: false,
      redirectTo: '/dashboard',
    });
  });

  /*
   * These are the entries that make ALWAYS_PUBLIC_PATHS a separate list rather
   * than a flag on one. Every one of them is reached by somebody who HAS a
   * cookie and still needs the page.
   */
  it('leaves account recovery reachable with a stale session in the jar', () => {
    // The device someone is locked out on is exactly the device still holding
    // their old cookie. Bouncing them to a dashboard they cannot load would
    // leave no way to recover except clearing cookies by hand.
    for (const path of ['/auth/forgot-password', '/auth/reset-password', '/reset-password']) {
      expect(decideRoute(path, SESSION), path).toEqual({ allow: true });
    }
  });

  it('leaves email verification reachable — the client is signed in AND unverified', () => {
    // A client who has just registered has a session and no verified address.
    // /verify-email is the one page that tells them what to do; sending them to
    // the dashboard sends them to a portal they cannot use.
    for (const path of ['/verify-email', '/verify-email/pending', '/auth/verify-email']) {
      expect(decideRoute(path, SESSION), path).toEqual({ allow: true });
    }
  });
});

describe('the site root', () => {
  /*
   * Answered here so it costs ONE redirect. `app/page.tsx` sends `/` to the
   * sign-in screen; without this, a signed-in client asking for `/` would go
   * there and be bounced straight back out to /dashboard — two hops and a flash
   * of the sign-in page, for a question the cookie already answers.
   */
  it('routes by session rather than through the sign-in screen', () => {
    expect(decideRoute('/', SESSION)).toEqual({ allow: false, redirectTo: '/dashboard' });
    expect(decideRoute('/', undefined)).toEqual({ allow: false, redirectTo: '/auth/login' });
  });
});

describe('path matching — whole segments, not string prefixes', () => {
  it('admits a public route and its children', () => {
    expect(decideRoute('/verify-email/pending', undefined)).toEqual({ allow: true });
    expect(decideRoute('/auth/verify-email', undefined)).toEqual({ allow: true });
  });

  it('does NOT admit a route that merely starts with the same characters', () => {
    // The regression: a plain startsWith made every one of these public, so a
    // route added later could become unauthenticated without anyone deciding it.
    for (const path of ['/login-help', '/logins', '/register-partner', '/reset-password-admin']) {
      expect(decideRoute(path, undefined).allow, path).toBe(false);
    }
  });

  it('does NOT treat /r/ as public — the referral route does not exist yet', () => {
    /*
     * `/r/` was listed as a public PREFIX with nothing in `src/app` serving it.
     * Nothing was exposed, because nothing was routed — but the entry meant the
     * first referral landing page anyone added would be unauthenticated by
     * default, and nobody would think to look here.
     *
     * It comes back in the same commit as the route, not before.
     */
    expect(decideRoute('/r/ABC123', undefined).allow).toBe(false);
  });

  it('is enumerated, so a new /auth/* page is private until someone says otherwise', () => {
    /*
     * `/auth` used to be a single blanket entry, which meant the next page added
     * under it — an SSO callback, a device-confirmation screen — would have been
     * unauthenticated on the day it was created, by nobody's decision.
     */
    expect(decideRoute('/auth/sso-callback', undefined).allow).toBe(false);
  });
});
