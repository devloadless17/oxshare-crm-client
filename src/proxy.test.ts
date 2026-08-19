import { describe, expect, it } from 'vitest';
import { decideRoute } from './proxy';

/**
 * Where the route gate sends a visitor, and — mostly — where it must not.
 *
 * `decideRoute` is pure and takes the `session-hint` marker as an argument, so
 * every branch is a table rather than something you find by clicking. That is
 * the point of the signature: the marker is a cookie, and a decision that reads
 * a cookie itself can only be tested by faking a request.
 *
 * THE REGRESSION THIS FILE EXISTS FOR: `/` redirected to `/auth/login`
 * unconditionally. `/` is the URL clients type and the one their bookmark points
 * at, so the guarantee was that every returning client — holding a perfectly
 * valid thirty-day session — was shown a sign-in form, painted in full, and
 * moved off it a round trip later. It reads as having been logged out, and the
 * natural response is to type a password that was not needed, which mints a
 * second session over the first.
 *
 * The marker is NOT a session. It says "this browser has been signed in", any
 * visitor can write it, and the tests below pin the boundary: it moves people
 * between PUBLIC screens and decides nothing about access.
 */

const SIGNED_IN_BEFORE = true;
const NEVER_SIGNED_IN = false;

const target = (pathname: string, hint: boolean, search = '') => {
  const decision = decideRoute(pathname, hint, search);
  return decision.allow ? null : decision.redirectTo;
};

describe('the site root', () => {
  it('sends a browser that has been signed in to the dashboard, not to a login form', () => {
    expect(target('/', SIGNED_IN_BEFORE)).toBe('/dashboard');
  });

  it('still sends everybody else to sign in', () => {
    expect(target('/', NEVER_SIGNED_IN)).toBe('/auth/login');
  });
});

describe('the screens that exist only for signed-out clients', () => {
  it('are not served to a browser carrying the marker', () => {
    expect(target('/auth/login', SIGNED_IN_BEFORE)).toBe('/dashboard');
    expect(target('/auth/register', SIGNED_IN_BEFORE)).toBe('/dashboard');
  });

  /*
   * The top-level stubs, which verification and reset emails already in inboxes
   * point at. They are redirects to `/auth/*` and must behave identically here,
   * or a signed-in client following an old link gets the form after all.
   */
  it('covers the emailed top-level stubs too', () => {
    expect(target('/login', SIGNED_IN_BEFORE)).toBe('/dashboard');
    expect(target('/register', SIGNED_IN_BEFORE)).toBe('/dashboard');
  });

  it('are served normally to a browser that has never been signed in', () => {
    expect(target('/auth/login', NEVER_SIGNED_IN)).toBeNull();
    expect(target('/auth/register', NEVER_SIGNED_IN)).toBeNull();
  });

  it('returns a client to where they were going, not to the dashboard', () => {
    expect(target('/auth/login', SIGNED_IN_BEFORE, '?next=%2Fwallet')).toBe('/wallet');
  });

  /*
   * `next` arrives in a URL, so anybody can mail a client a sign-in link
   * carrying any value at all. Following one unchecked would land them on an
   * attacker's page in the instant after they expect to have signed in.
   */
  it('refuses an off-site next rather than following it', () => {
    expect(
      target('/auth/login', SIGNED_IN_BEFORE, '?next=https%3A%2F%2Fevil.example%2Flogin'),
    ).toBe('/dashboard');
  });

  /*
   * Whole segments, never a string prefix — `startsWith('/login')` also matches
   * `/login-help`, so a page added later would start redirecting signed-in
   * clients away from it and nobody would connect the two.
   */
  it('matches by segment, not by prefix', () => {
    expect(target('/login-help', SIGNED_IN_BEFORE)).toBeNull();
    expect(target('/register-partner', SIGNED_IN_BEFORE)).toBeNull();
  });
});

/*
 * PUBLIC and AUTH-ONLY are different properties, and collapsing them locks
 * people out — which is why public-paths.ts keeps two lists.
 *
 * A client who has just registered IS signed in and is NOT verified, so bouncing
 * them off /verify-email sends them away from the one page that tells them what
 * to do next. Recovery runs from a browser still holding a stale session cookie,
 * which is the normal state of the device somebody is locked out on; redirecting
 * those to a dashboard leaves no way back except clearing cookies by hand.
 */
describe('the screens that must work with OR without a session', () => {
  it('are never redirected, marker or not', () => {
    for (const path of [
      '/auth/verify-email',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/verify-email/pending',
      '/forgot-password',
      '/reset-password',
    ]) {
      expect(target(path, SIGNED_IN_BEFORE)).toBeNull();
      expect(target(path, NEVER_SIGNED_IN)).toBeNull();
    }
  });
});

/*
 * The gate has no signing key and the session cookie is structurally invisible
 * to it (proxy.ts carries the full account), so a private route is served to
 * everybody and gated by `/auth/me` in `RequireAuth`. The marker must not change
 * that in EITHER direction: if this ever redirects, access has been rebuilt on a
 * signal any visitor can forge.
 */
describe('private routes', () => {
  it('are never gated here, with or without the marker', () => {
    for (const path of ['/dashboard', '/wallet', '/kyc/step/3', '/accounts/42']) {
      expect(target(path, SIGNED_IN_BEFORE)).toBeNull();
      expect(target(path, NEVER_SIGNED_IN)).toBeNull();
    }
  });
});
