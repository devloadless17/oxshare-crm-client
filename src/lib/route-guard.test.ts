import { describe, expect, it } from 'vitest';
import { decideRoute, decodeJwtPayload, isPublicPath } from './route-guard';

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

  it('holds an unverified client out of KYC', () => {
    expect(decideRoute('/kyc/step/personal', UNVERIFIED)).toEqual({
      allow: false,
      redirectTo: '/verify-email/pending',
    });
  });

  it('lets a verified client into KYC', () => {
    expect(decideRoute('/kyc/step/personal', VERIFIED)).toEqual({ allow: true });
  });

  it('treats a missing emailVerified claim as unverified, not as verified', () => {
    // Fail closed: a token shape we do not recognise must not open the gate.
    expect(decideRoute('/kyc', fakeToken({ sub: 'u1' }))).toEqual({
      allow: false,
      redirectTo: '/verify-email/pending',
    });
  });

  it('rejects a truthy-but-not-true emailVerified claim', () => {
    expect(decideRoute('/kyc', fakeToken({ emailVerified: 'yes' }))).toEqual({
      allow: false,
      redirectTo: '/verify-email/pending',
    });
  });

  it('sends a malformed token back to login rather than crashing', () => {
    expect(decideRoute('/kyc', 'not-a-jwt')).toEqual({
      allow: false,
      redirectTo: '/auth/login',
    });
  });

  it('does not gate non-KYC private routes on email verification', () => {
    // Only /kyc requires a verified email; the dashboard is reachable while
    // verification is pending, which is where the resend prompt lives.
    expect(decideRoute('/dashboard', UNVERIFIED)).toEqual({ allow: true });
  });
});

describe('decodeJwtPayload', () => {
  it('returns null for anything that is not a JWT', () => {
    for (const bad of ['', 'a', 'a.b', 'a.!!!.c']) {
      expect(decodeJwtPayload(bad)).toBeNull();
    }
  });

  it('returns null when the payload is not an object', () => {
    const b64 = Buffer.from(JSON.stringify('a string')).toString('base64url');
    expect(decodeJwtPayload(`h.${b64}.s`)).toBeNull();
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
