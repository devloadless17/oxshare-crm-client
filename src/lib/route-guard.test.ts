import { describe, expect, it } from 'vitest';
import { decideRoute, isPublicPath } from './route-guard';

/** A signature-less JWT — the guard never verifies one, so this is enough. */
function fakeToken(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${b64}.signature`;
}

const VERIFIED = fakeToken({ sub: 'u1', emailVerified: true });
const UNVERIFIED = fakeToken({ sub: 'u1', emailVerified: false });

describe('isPublicPath', () => {
  it('lets the auth screens through', () => {
    for (const p of ['/auth/login', '/auth/register', '/login', '/reset-password', '/r/ABC123']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it('does not treat private routes as public', () => {
    for (const p of ['/dashboard', '/kyc', '/wallet', '/accounts']) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe('decideRoute', () => {
  it('sends an anonymous visitor on a private route to login', () => {
    expect(decideRoute('/dashboard', undefined)).toEqual({
      allow: false,
      redirectTo: '/auth/login',
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
   * off onboarding. The email gate lives in the KYC layout now, reading
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
      redirectTo: '/auth/login',
    });
  });
});

describe('isPublicPath — whole segments, not string prefixes', () => {
  it('admits the public routes themselves and their children', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/auth/login')).toBe(true);
    expect(isPublicPath('/auth/verify-email')).toBe(true);
    expect(isPublicPath('/verify-email/pending')).toBe(true);
  });

  it('keeps /r/ a prefix, because referral codes are the whole point of it', () => {
    expect(isPublicPath('/r/ABC123')).toBe(true);
  });

  it('does NOT admit a route that merely starts with the same characters', () => {
    // The regression: a plain startsWith made every one of these public, so a
    // route added later could become unauthenticated without anyone deciding it.
    expect(isPublicPath('/login-help')).toBe(false);
    expect(isPublicPath('/logins')).toBe(false);
    expect(isPublicPath('/register-partner')).toBe(false);
    expect(isPublicPath('/reset-password-admin')).toBe(false);
  });

  it('still gates the private routes', () => {
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/wallet')).toBe(false);
    expect(isPublicPath('/kyc')).toBe(false);
  });
});
