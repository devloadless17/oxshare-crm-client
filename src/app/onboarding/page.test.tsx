import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import OnboardingPage from './page';

/**
 * "Complete your identity verification" — Verify now, or later.
 *
 * Asserted here: the choice is offered ONLY while there is something to decide,
 * both answers go where they say, and the pitch never flashes for a client it is
 * about to be taken from. The session gate itself is `RequireAuth`'s, and is
 * covered where it lives.
 */

const replace = vi.hoisted(() => vi.fn());
const kyc = vi.hoisted(() => ({
  value: { isLoading: false, approved: false, pending: false, rejected: false },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock('@/components/auth/require-auth', () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/use-kyc-access', () => ({ useKycAccess: () => kyc.value }));
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ user: { firstName: 'Ada', email: 'ada@example.test', emailVerified: true } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  kyc.value = { isLoading: false, approved: false, pending: false, rejected: false };
});

describe('a client who has not started verification', () => {
  it('is shown step one of two done, by name, with both answers', () => {
    renderWithProviders(<OnboardingPage />);

    expect(
      screen.getByRole('heading', { name: /complete your identity verification/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /step 1 of 2 complete/i })).toBeInTheDocument();
    expect(screen.getByText(/welcome, ada/i)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /verify now/i })).toHaveAttribute('href', '/kyc');
    expect(screen.getByRole('link', { name: /verify later/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('promises only what verification actually unlocks', () => {
    renderWithProviders(<OnboardingPage />);
    // The three doors `KycVerifiedGuard` and the live-account check keep shut.
    // Exact: the benefit TITLES, not the sentence above them that also says "trade live".
    expect(screen.getByText('Deposit and withdraw', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Trade live', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Move money freely', { exact: true })).toBeInTheDocument();
    // And "later" is honest about what works meanwhile.
    expect(screen.getByText(/demo accounts are available right away/i)).toBeInTheDocument();
  });

  it('is offered to a client who started and stopped, too', () => {
    // `in_progress` is none of approved / pending / rejected.
    renderWithProviders(<OnboardingPage />);
    expect(screen.getByRole('link', { name: /verify now/i })).toBeInTheDocument();
  });
});

describe('a client with nothing to decide', () => {
  it.each([
    ['approved', { approved: true }],
    ['under review', { pending: true }],
    ['refused', { rejected: true }],
  ])('%s: goes to the dashboard, and the pitch never paints', async (_label, state) => {
    kyc.value = { ...kyc.value, ...state };
    renderWithProviders(<OnboardingPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('link', { name: /verify now/i })).not.toBeInTheDocument();
  });
});

describe('while the answer is in flight', () => {
  it('holds the paint and decides nothing', () => {
    kyc.value = { ...kyc.value, isLoading: true };
    renderWithProviders(<OnboardingPage />);
    expect(screen.queryByRole('link', { name: /verify now/i })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
