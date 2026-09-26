import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Wallet } from '@/lib/api/wallet';
import { CommissionBalances } from './commission-balances';

/**
 * A partner's commission balances, plus every enabled currency they hold no
 * commission wallet in, offered as a cell they open themselves (owner, 26 Sep
 * 2026). Adding a currency opens no wallets for anybody.
 */
const { listCurrencies, openCommissionWallet } = vi.hoisted(() => ({
  listCurrencies: vi.fn(),
  openCommissionWallet: vi.fn(),
}));

vi.mock('@/lib/api/currencies', () => ({ currenciesApi: { list: listCurrencies } }));
vi.mock('@/lib/api/partner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/partner')>();
  return { ...actual, partnerApi: { ...actual.partnerApi, openCommissionWallet } };
});

function commission(currency: string, available = '25.00000000'): Wallet {
  return {
    id: `c-${currency}`,
    walletNumber: `c${currency.toLowerCase()}`,
    name: `${currency} commission`,
    userId: 'p-1',
    currency,
    kind: 'commission',
    balance: available,
    onHold: '0.00000000',
    available,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as Wallet;
}

const currency = (code: string) => ({
  code,
  name: code,
  symbol: code,
  decimals: 2,
  enabled: true,
  isDefault: code === 'USD',
  sortOrder: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  listCurrencies.mockResolvedValue([currency('USD'), currency('EUR')]);
  openCommissionWallet.mockResolvedValue(commission('EUR', '0.00000000'));
});

describe('a currency the partner holds no commission wallet in', () => {
  it('is offered beside the balances they hold, with an open button', async () => {
    renderWithProviders(<CommissionBalances wallets={[commission('USD')]} />);

    expect(
      await screen.findByRole('button', { name: 'Open EUR commission wallet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('Not opened yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open USD commission wallet' })).toBeNull();
  });

  it('opens it on a click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommissionBalances wallets={[commission('USD')]} />);

    await user.click(await screen.findByRole('button', { name: 'Open EUR commission wallet' }));

    await waitFor(() => expect(openCommissionWallet).toHaveBeenCalledWith('EUR'));
  });

  it('offers every currency to a partner who has never been paid', async () => {
    renderWithProviders(<CommissionBalances wallets={[]} />);

    expect(
      await screen.findByRole('button', { name: 'Open USD commission wallet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open EUR commission wallet' })).toBeInTheDocument();
  });
});
