import { describe, expect, it } from 'vitest';
import { decideRoute } from '@/lib/route-guard';
import { CSRF_COOKIE_NAMES, CSRF_HEADER } from './client';

/**
 * The cookie names this app hardcodes, pinned from THIS side.
 *
 * They are literals because the backend is a separate repository with no shared
 * package — there is nothing to import. The backend pins the same values in
 * `test/cookie-contract.spec.ts`, so a rename fails on whichever side made it.
 *
 * A cookie name appears in no response body, so the generated OpenAPI types
 * (R-1.2) cannot catch a rename. Without this it compiles, type-checks, deploys,
 * and then signs everyone out with every write returning 403 "failed
 * anti-forgery validation" and nothing pointing at the cause.
 */

describe('the CSRF cookie this app reads', () => {
  it('is named for the PORTAL surface, prefixed spelling first', () => {
    // Preference order matters: if both somehow exist, the `__Host-` one is the
    // only one a sibling oxshare.com site could not have written.
    expect(CSRF_COOKIE_NAMES).toEqual([
      '__Host-oxshare_crm_portal_csrf',
      'oxshare_crm_portal_csrf',
    ]);
  });

  it('is NOT the admin cookie — the two surfaces are separate sessions (R-3.1)', () => {
    // Cookies ignore the port, so on localhost both apps share one jar.
    expect(CSRF_COOKIE_NAMES.join(' ')).not.toContain('admin');
  });

  it('sends the header the API expects', () => {
    // Express lower-cases it on arrival; the backend constant is
    // `x-oxshare-csrf`, which is the same header and looks like a mismatch.
    expect(CSRF_HEADER).toBe('X-OxShare-CSRF');
  });
});

describe('the session cookie the route gate reads', () => {
  /*
   * `proxy.ts` supplies the value; `decideRoute` only sees "is there one". The
   * NAME lives in proxy.ts, so this pins the decision and proxy.ts pins the
   * lookup — together they cover the rename.
   */
  it('admits a private route when a session token is present', () => {
    expect(decideRoute('/wallet', 'a-refresh-token')).toEqual({ allow: true });
  });

  it('redirects when there is none, remembering where they were going', () => {
    expect(decideRoute('/wallet', undefined)).toEqual({
      allow: false,
      redirectTo: '/auth/login?next=%2Fwallet',
    });
  });
});
