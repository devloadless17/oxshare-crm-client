import { describe, expect, it, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import KycLayout from './layout';

/**
 * KYC requires a verified email — FR-CORE-15.
 *
 * The gate lives here rather than in `proxy.ts` because this is the first place
 * that knows the answer. In the proxy it read `emailVerified` off the JWT in
 * the session cookie, which worked only while the proxy was handed the ACCESS
 * token. Route gating then moved to the refresh cookie — correctly, so a
 * returning client with a valid 30-day session is renewed rather than bounced —
 * and the refresh token is signed from `{ sub, jti }`. The claim was
 * `undefined` for every client, so every client was redirected off onboarding,
 * verified ones included.
 */

const { replace, useUser } = vi.hoisted(() => ({ replace: vi.fn(), useUser: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/kyc/step/1',
}));
vi.mock('@/context/UserContext', () => ({ useUser }));
vi.mock('@/lib/api', () => {
  const api = { get: vi.fn().mockResolvedValue({ data: [] }) };
  return { api, default: api };
});

const asUser = (emailVerified: boolean) => ({
  user: { id: 'u1', emailVerified },
  isLoading: false,
});

beforeEach(() => vi.clearAllMocks());

describe('KYC email-verification gate', () => {
  it('lets a VERIFIED client through', async () => {
    useUser.mockReturnValue(asUser(true));
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    // The regression: this redirected every client, including this one.
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('redirects an UNVERIFIED client to the pending page', async () => {
    useUser.mockReturnValue(asUser(false));
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/verify-email/pending'));
  });

  it('waits for the profile rather than redirecting on an unanswered question', async () => {
    // Redirecting while `/auth/me` is still in flight would bounce a verified
    // client on every cold load — the same visible bug by a different route.
    useUser.mockReturnValue({ user: null, isLoading: true });
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('does not redirect when there is no user at all', async () => {
    // No session is the route guard's job, and it answers it before this
    // renders. Acting here too would race it.
    useUser.mockReturnValue({ user: null, isLoading: false });
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });
});
