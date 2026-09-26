import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Wallet } from '@/lib/api/wallet';
import WalletPage from './page';

/**
 * The wallet screen offers every enabled currency the client does not hold as
 * a card they open themselves (owner, 26 Sep 2026).
 *
 * Adding a currency opens no wallets for anybody — a write per client for every
 * currency an operator adds does not scale. So the offer lives here: the held
 * wallets first, then one "Open {currency} wallet" card per enabled currency
 * missing, never a fabricated zero balance.
 */
const { getWallets, openWallet, listCurrencies, getTransactions } = vi.hoisted(() => ({
  getWallets: vi.fn(),
  openWallet: vi.fn(),
  listCurrencies: vi.fn(),
  getTransactions: vi.fn(),
}));

vi.mock('@/lib/api/wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/wallet')>();
  return { ...actual, walletApi: { ...actual.walletApi, getWallets, openWallet } };
});
vi.mock('@/lib/api/currencies', () => ({ currenciesApi: { list: listCurrencies } }));
vi.mock('@/lib/api/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/payments')>();
  return { ...actual, paymentsApi: { ...actual.paymentsApi, getTransactions } };
});
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({
    user: { id: 'u-1', firstName: 'Ada', lastName: 'Client', emailVerified: true },
    isLoading: false,
  }),
}));

function wallet(currency: string, balance = '100.00000000'): Wallet {
  return {
    id: `w-${currency}`,
    walletNumber: `n${currency.toLowerCase()}`,
    name: `${currency} wallet`,
    userId: 'u-1',
    currency,
    kind: 'main',
    balance,
    onHold: '0.00000000',
    available: balance,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as Wallet;
}

const currency = (code: string, name: string) => ({
  code,
  name,
  symbol: code,
  decimals: 2,
  enabled: true,
  isDefault: code === 'USD',
  sortOrder: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  getWallets.mockResolvedValue([wallet('USD')]);
  listCurrencies.mockResolvedValue([currency('USD', 'US Dollar'), currency('EUR', 'Euro')]);
  getTransactions.mockResolvedValue({ items: [], total: 0 });
  openWallet.mockResolvedValue(wallet('EUR', '0.00000000'));
});

describe('a currency the client does not hold', () => {
  it('is offered as a card with an open button, after the wallets they hold', async () => {
    renderWithProviders(<WalletPage />);

    const button = await screen.findByRole('button', { name: 'Open EUR wallet' });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('You don’t have a EUR wallet yet.')).toBeInTheDocument();
    // The held USD wallet still shows its real balance.
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    // No card offers to open a currency the client already holds.
    expect(screen.queryByRole('button', { name: 'Open USD wallet' })).toBeNull();
  });

  it('opens that one wallet, and reloads the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WalletPage />);

    await user.click(await screen.findByRole('button', { name: 'Open EUR wallet' }));

    await waitFor(() => expect(openWallet).toHaveBeenCalledWith('EUR'));
    await waitFor(() => expect(getWallets).toHaveBeenCalledTimes(2));
  });

  it('offers a card even to a client who holds no wallet at all', async () => {
    getWallets.mockResolvedValue([]);
    renderWithProviders(<WalletPage />);

    expect(await screen.findByRole('button', { name: 'Open USD wallet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open EUR wallet' })).toBeInTheDocument();
  });

  it('offers nothing to open when the client holds every offered currency', async () => {
    getWallets.mockResolvedValue([wallet('USD'), wallet('EUR')]);
    renderWithProviders(<WalletPage />);

    // Both real balances render, and nothing is offered to open.
    expect(await screen.findAllByText(/100.00/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Open .* wallet$/ })).toBeNull();
    expect(screen.queryByText(/don’t have/)).toBeNull();
  });
});
