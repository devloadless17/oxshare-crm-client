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
 * THE SIGN-IN SCREEN IS ALWAYS SERVED, and these are the regression.
 *
 * `decideRoute` briefly redirected a cookie-holder off `/auth/login` to
 * `/dashboard`. That looked like the missing half of gating — the sign-in form
 * really was being served to authenticated clients — and it produced an
 * infinite reload loop in the browser within the hour:
 *
 *   /dashboard  → cookie present → allowed → /auth/me 401 → refresh fails
 *               → client navigates to /auth/login
 *   /auth/login → cookie present → redirected to /dashboard
 *               → and round again, forever.
 *
 * A cookie outliving its session is the NORMAL end of a session, not an edge
 * case: a revoked family, an expired refresh token, a password changed on
 * another device. In every one the browser still holds the cookie.
 *
 * The asymmetry is the thing to keep. Gating a PRIVATE route on cookie presence
 * fails safe — worst case a rendered shell where everything 401s, which the
 * client gate corrects. Gating an AUTH-ONLY route on presence fails
 * closed-and-looping: the client cannot reach the one page that would fix it.
 */
describe('the sign-in screen is unconditionally reachable', () => {
  it('serves the auth screens with no session', () => {
    for (const path of AUTH_ONLY) {
      expect(decideRoute(path, undefined), path).toEqual({ allow: true });
    }
  });

  it('serves them WITH a session cookie too — this is the loop fix', () => {
    // The proxy cannot tell a live cookie from a dead one. Only /auth/me can,
    // and `RedirectIfAuthenticated` asks it.
    for (const path of AUTH_ONLY) {
      expect(decideRoute(path, SESSION), path).toEqual({ allow: true });
    }
  });

  it('does not loop for the exact sequence that broke the browser', () => {
    // A stale cookie: present, and no longer honoured by the API.
    const stale = 'a-cookie-the-server-no-longer-honours';

    // The client gate sends a dead session here...
    expect(decideRoute('/auth/login', stale, '?next=%2Fdashboard')).toEqual({ allow: true });
    // ...and nothing sends it back out. That is the whole property.
  });

  /*
   * These stay reachable for their own reasons, and always did.
   */
  it('leaves account recovery reachable with a stale session in the jar', () => {
    // The device someone is locked out on is exactly the device still holding
    // their old cookie.
    for (const path of ['/auth/forgot-password', '/auth/reset-password', '/reset-password']) {
      expect(decideRoute(path, SESSION), path).toEqual({ allow: true });
    }
  });

  it('leaves email verification reachable — the client is signed in AND unverified', () => {
    // A client who has just registered has a session and no verified address.
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

  it('terminates even when the cookie is stale', () => {
    // `/` sends a cookie-holder to /dashboard. /dashboard is not auth-only, so
    // the client gate can move them on to sign-in and nothing sends them back.
    // One hop each way, no cycle.
    expect(decideRoute('/', 'stale')).toEqual({ allow: false, redirectTo: '/dashboard' });
    expect(decideRoute('/dashboard', 'stale')).toEqual({ allow: true });
    expect(decideRoute('/auth/login', 'stale')).toEqual({ allow: true });
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
