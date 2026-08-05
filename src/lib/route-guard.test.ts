import { describe, expect, it } from 'vitest';
import {
  AUTH_ONLY_PATHS,
  DEFAULT_SIGNED_IN_PATH,
  decideRoute,
  isAuthOnlyPath,
  isPublicPath,
  loginPathFor,
  requiresVerifiedEmail,
  safeReturnTo,
} from './route-guard';

/** A signature-less JWT — the guard never verifies one, so this is enough. */
function fakeToken(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${b64}.signature`;
}

const VERIFIED = fakeToken({ sub: 'u1', emailVerified: true });
const UNVERIFIED = fakeToken({ sub: 'u1', emailVerified: false });

describe('isPublicPath', () => {
  it('lets the auth screens through', () => {
    for (const p of ['/auth/login', '/auth/register', '/login', '/reset-password']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it('does not treat private routes as public', () => {
    for (const p of ['/dashboard', '/kyc', '/wallet', '/accounts']) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it('is enumerated, so a new /auth/* page is private until someone says otherwise', () => {
    /*
     * `/auth` used to be a single blanket entry, which meant the next page added
     * under it — an SSO callback, a device-confirmation screen — would have been
     * unauthenticated on the day it was created, by nobody's decision.
     *
     * Fail-closed is the only default that survives a route being added by
     * someone who has not read this file.
     */
    expect(isPublicPath('/auth/sso-callback')).toBe(false);
    expect(isPublicPath('/auth')).toBe(false);
  });
});

describe('decideRoute — no session', () => {
  it('sends an anonymous visitor on a private route to login', () => {
    expect(decideRoute('/dashboard', undefined)).toEqual({
      allow: false,
      redirectTo: '/auth/login?next=%2Fdashboard',
    });
  });

  it('never redirects a public route, even with no token', () => {
    expect(decideRoute('/auth/login', undefined)).toEqual({ allow: true });
  });

  it('allows a signed-in user onto a private route', () => {
    expect(decideRoute('/dashboard', VERIFIED)).toEqual({ allow: true });
  });

  /*
   * The guard decides SESSION PRESENCE and nothing else, so none of these may
   * depend on what the token contains.
   *
   * It used to gate `/kyc` on an `emailVerified` claim, which worked only while
   * proxy.ts handed it the access token. Gating moved to the refresh cookie —
   * correctly — and the refresh token carries `{ sub, jti }` and nothing else,
   * so the claim was `undefined` for everyone and every client was redirected
   * off onboarding. The email gate lives in `RequireAuth` now, reading
   * `/auth/me`, which is the only authoritative answer.
   */
  it('lets any signed-in client into KYC, whatever the token contains', () => {
    expect(decideRoute('/kyc/step/personal', VERIFIED)).toEqual({ allow: true });
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

  it('still sends a client with NO session to login', () => {
    expect(decideRoute('/kyc', undefined)).toEqual({
      allow: false,
      redirectTo: '/auth/login?next=%2Fkyc',
    });
  });
});

/**
 * The half of gating this app shipped without.
 *
 * `/auth/login` served its form to a client holding a live session — confirmed
 * against the running backend, not inferred. Submitting it mints a SECOND
 * thirty-day refresh-token family over the first, and on a shared device it
 * puts a credential prompt in front of whoever is already signed in.
 */
describe('decideRoute — a live session on a signed-out-only screen', () => {
  it('bounces a session-holder off every auth-only screen', () => {
    for (const path of AUTH_ONLY_PATHS) {
      expect(decideRoute(path, VERIFIED)).toEqual({
        allow: false,
        redirectTo: DEFAULT_SIGNED_IN_PATH,
      });
    }
  });

  it('honours where they were going, rather than always the dashboard', () => {
    expect(decideRoute('/auth/login', VERIFIED, '?next=%2Fwallet')).toEqual({
      allow: false,
      redirectTo: '/wallet',
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
      expect(decideRoute(path, VERIFIED)).toEqual({ allow: true });
    }
  });

  it('leaves email verification reachable — the client is signed in AND unverified', () => {
    // A client who has just registered has a session and no verified address.
    // /verify-email is the one page that tells them what to do; sending them to
    // the dashboard sends them to a portal they cannot use.
    for (const path of ['/verify-email', '/verify-email/pending', '/auth/verify-email']) {
      expect(decideRoute(path, VERIFIED)).toEqual({ allow: true });
    }
  });

  it('still serves the auth screens to a visitor with no session', () => {
    for (const path of AUTH_ONLY_PATHS) {
      expect(decideRoute(path, undefined)).toEqual({ allow: true });
    }
  });
});

describe('decideRoute — the site root', () => {
  /*
   * Answered in the guard so it costs ONE redirect. `app/page.tsx` sends `/` to
   * the sign-in screen; without this, a signed-in client asking for `/` would
   * go there and be bounced straight back out to /dashboard — two hops and a
   * flash of the sign-in page, for a question the cookie already answers.
   */
  it('routes by session rather than through the sign-in screen', () => {
    expect(decideRoute('/', VERIFIED)).toEqual({ allow: false, redirectTo: '/dashboard' });
    expect(decideRoute('/', undefined)).toEqual({ allow: false, redirectTo: '/auth/login' });
  });

  it('does not ask to be returned to the root after signing in', () => {
    // `next=/` would land a freshly signed-in client back on a redirect.
    expect(loginPathFor('/')).toBe('/auth/login');
  });
});

describe('loginPathFor', () => {
  it('remembers the whole URL, query string included', () => {
    // Dropping the search meant a client bounced off a filtered transactions
    // view came back to an unfiltered one, mid-task.
    expect(loginPathFor('/transactions', '?page=3&type=deposit')).toBe(
      '/auth/login?next=%2Ftransactions%3Fpage%3D3%26type%3Ddeposit',
    );
  });

  it('round-trips through safeReturnTo', () => {
    const back = safeReturnTo(
      new URLSearchParams(
        loginPathFor('/kyc/step/3', '?resume=1').split('?').slice(1).join('?'),
      ).get('next'),
    );
    expect(back).toBe('/kyc/step/3?resume=1');
  });
});

/**
 * `next` is attacker-controlled even though we are the ones who put it there:
 * anybody can mail a client `/auth/login?next=<anything>`, and the page they
 * land on afterwards is one they reach in the instant after typing their
 * password. That is what makes an open redirect worth more here than on most
 * sites.
 */
describe('safeReturnTo', () => {
  it('keeps a genuine same-origin path', () => {
    expect(safeReturnTo('/wallet')).toBe('/wallet');
    expect(safeReturnTo('/transactions?page=2')).toBe('/transactions?page=2');
    expect(safeReturnTo('/kyc/step/3#top')).toBe('/kyc/step/3#top');
  });

  it('refuses every spelling of "somewhere else"', () => {
    /*
     * Resolved through `URL` rather than pattern-matched, because the browser's
     * parser is the authority on what a string navigates to and hand-rolled
     * checks keep losing to it. Each of these is a real bypass of at least one
     * naive `startsWith('/')` guard:
     */
    const elsewhere = [
      'https://evil.example/login', // the obvious one
      '//evil.example', // protocol-relative — starts with '/'
      '/\\evil.example', // browsers read the backslash as a second slash
      '\\/\\/evil.example', // and so do they here
      'javascript:alert(1)', // not a navigation we ever want to perform
      'data:text/html,<script>alert(1)</script>',
    ];
    for (const raw of elsewhere) {
      expect(safeReturnTo(raw), raw).toBe(DEFAULT_SIGNED_IN_PATH);
    }
  });

  it('collapses a same-scheme relative URL to our own origin rather than theirs', () => {
    /*
     * `https:/evil.example` — one slash — is the case a `startsWith('/')` guard
     * misses and a scheme blacklist misreads. The URL parser treats it as a
     * relative reference because the scheme matches the base's, so it resolves
     * to `https://portal.invalid/evil.example`.
     *
     * The result is a path on OUR site, which is a 404 and not a redirect to
     * anybody. Asserted rather than merely allowed to happen, because "it is
     * safe" and "it is rejected" are different claims and only the first is
     * true here — a future reader tightening this into a rejection should know
     * they are changing behaviour, not fixing a hole.
     */
    expect(safeReturnTo('https:/evil.example')).toBe('/evil.example');
  });

  it('refuses control characters', () => {
    // Never present in a path we generated, and the raw material for hiding a
    // real target from anyone reading the link.
    expect(safeReturnTo('/wallet\nSet-Cookie: x=y')).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('/wallet ')).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it('refuses to send a freshly signed-in client back to sign in', () => {
    // Same-origin, so it survives the check above, and still wrong: it is a
    // loop the user cannot break out of.
    expect(safeReturnTo('/auth/login')).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('/login')).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('/register')).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('/')).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it('falls back when there is nothing to return to', () => {
    expect(safeReturnTo(null)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo(undefined)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('')).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});

/**
 * Mirrors `EmailVerifiedGuard` on the backend, which sits on `kyc.controller.ts`
 * AND `payments.controller.ts`. The portal only ever gated KYC, so an unverified
 * client could open /withdraw, fill in an amount and a destination, submit, and
 * be told `EMAIL_NOT_VERIFIED` — the app offering a money operation the API had
 * already decided to refuse.
 */
describe('requiresVerifiedEmail', () => {
  it('covers every route whose API is behind EmailVerifiedGuard', () => {
    for (const p of ['/kyc', '/kyc/step/2', '/deposit', '/withdraw', '/transactions']) {
      expect(requiresVerifiedEmail(p), p).toBe(true);
    }
  });

  it('does not gate what the backend does not gate', () => {
    // /wallet and /accounts need a session, not a verified address. Demanding
    // one would lock an unverified client out of seeing their own balance.
    for (const p of ['/dashboard', '/wallet', '/accounts']) {
      expect(requiresVerifiedEmail(p), p).toBe(false);
    }
  });
});

describe('path matching — whole segments, not string prefixes', () => {
  it('admits the public routes themselves and their children', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/auth/login')).toBe(true);
    expect(isPublicPath('/auth/verify-email')).toBe(true);
    expect(isPublicPath('/verify-email/pending')).toBe(true);
  });

  it('does NOT treat /r/ as public — the referral route does not exist yet', () => {
    /*
     * `/r/` was listed as a public PREFIX with nothing in `src/app` serving it.
     * Nothing was exposed, because nothing was routed — but the entry meant the
     * first referral landing page anyone added would be unauthenticated by
     * default, and nobody would think to look in the guard.
     *
     * It comes back in the same commit as the route, not before.
     */
    expect(isPublicPath('/r/ABC123')).toBe(false);
  });

  it('does NOT admit a route that merely starts with the same characters', () => {
    // The regression: a plain startsWith made every one of these public, so a
    // route added later could become unauthenticated without anyone deciding it.
    expect(isPublicPath('/login-help')).toBe(false);
    expect(isPublicPath('/logins')).toBe(false);
    expect(isPublicPath('/register-partner')).toBe(false);
    expect(isPublicPath('/reset-password-admin')).toBe(false);
    // Same rule on the reverse gate: `/registered-devices` is not the sign-up
    // page, and bouncing a signed-in client off it would be the mirror bug.
    expect(isAuthOnlyPath('/registered-devices')).toBe(false);
  });

  it('still gates the private routes', () => {
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/wallet')).toBe(false);
    expect(isPublicPath('/kyc')).toBe(false);
  });
});
