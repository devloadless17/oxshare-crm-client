import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import WalletPage from './page';

/**
 * Guards the wallet screen against showing a number it does not have.
 *
 * This page rendered a literal `$0.00` and `0.00 USDT` while `GET /wallet` existed
 * and worked — the seeded client held 700.00000000 and was shown zero. On a money
 * system that is a correctness bug with a support and compliance tail, so the
 * tests below pin the three states that matter: real balance, request failed, and
 * currency not yet opened.
 *
 * The last one is the subtle one. A currency missing from the response has
 * genuinely never been opened, and rendering that as $0.00 is the same class of
 * lie as the original bug.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', () => ({
  apiClient: { get },
  // The page imports the module for its side effects too; keep the surface whole.
  clearSession: vi.fn(),
  refreshPortalToken: vi.fn(),
  startProactiveRefresh: vi.fn(),
  stopProactiveRefresh: vi.fn(),
}));

const USD_WALLET = {
  id: 'w-1',
  userId: 'u-1',
  currency: 'USD' as const,
  balance: '700.00000000',
  onHold: '0.00000000',
  available: '700.00000000',
  createdAt: '2026-08-03T14:51:46.899Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('wallet page', () => {
  it('renders the real balance, not a hardcoded zero', async () => {
    get.mockResolvedValue({ data: [USD_WALLET] });

    renderWithProviders(<WalletPage />);

    expect(await screen.findByText('$700.00')).toBeInTheDocument();
    // The original bug, stated as an assertion.
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('shows on-hold and total only when something is actually held', async () => {
    get.mockResolvedValue({
      data: [{ ...USD_WALLET, onHold: '300.00000000', available: '400.00000000' }],
    });

    renderWithProviders(<WalletPage />);

    // Available is the headline figure — it is what the client can withdraw.
    expect(await screen.findByText('$400.00')).toBeInTheDocument();
    expect(screen.getByText(/\$300\.00 on hold/)).toBeInTheDocument();
    expect(screen.getByText(/\$700\.00 total/)).toBeInTheDocument();
  });

  it('omits the on-hold line when nothing is held', async () => {
    get.mockResolvedValue({ data: [USD_WALLET] });

    renderWithProviders(<WalletPage />);

    await screen.findByText('$700.00');
    expect(screen.queryByText(/on hold/)).not.toBeInTheDocument();
  });

  it('says a currency is not opened rather than inventing a zero', async () => {
    // Only USD comes back; the client has never held USDT.
    get.mockResolvedValue({ data: [USD_WALLET] });

    renderWithProviders(<WalletPage />);

    await screen.findByText('$700.00');
    expect(screen.getByText(/not opened yet/i)).toBeInTheDocument();
    expect(screen.queryByText('0.00 USDT')).not.toBeInTheDocument();
  });

  it('surfaces an error with a retry instead of rendering zeros', async () => {
    get.mockRejectedValue({
      response: { status: 500, data: { message: 'Wallet service unavailable.' } },
    });

    renderWithProviders(<WalletPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/wallet service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // A failed request must never look like a zero balance.
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('says the screen is not built yet when the API 404s, without apologising', async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    renderWithProviders(<WalletPage />);

    /*
     * 404 is "not implemented yet", which is a different state from a failed
     * request — no error styling, no retry, nothing to apologise for.
     *
     * This asserted on the literal text `GET /wallet`, because `BackendPending`
     * used to print the endpoint names it was handed. It no longer does: route
     * names are internal vocabulary and this is the customer-facing app. The
     * PROP is still passed and is still the to-do; what changed is that the
     * client is not shown it. Asserting on the client-facing sentence is also
     * the more honest test — it checks what the user reads.
     */
    expect(await screen.findByText(/not available yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/GET \/wallet/)).not.toBeInTheDocument();
    // Still not an error: a to-do state must not offer a retry that cannot help.
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
