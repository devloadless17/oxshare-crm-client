import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { SelfServiceAvailability } from '@/lib/api/trading';
import { OpenAccountDialog } from './open-account-dialog';

/**
 * Opening a live account — the product the client picked travels WITH the
 * group (backend 0142).
 *
 * One MT5 group may back several products, and the product decides what the
 * account's trades pay. If the dialog sent only the group, two products sharing
 * it would be indistinguishable, and the account could be recorded under the
 * one the client did not choose.
 */
const { openAccount } = vi.hoisted(() => ({ openAccount: vi.fn() }));

vi.mock('@/lib/api/trading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/trading')>();
  return { ...actual, tradingApi: { ...actual.tradingApi, openAccount } };
});

const OPTIONS: SelfServiceAvailability = {
  live: true,
  demo: false,
  // Two products selling the SAME group.
  liveTypes: [
    { group: 'real\\Shared', currency: 'USD', product: 'Standard', productId: 'p-standard' },
    { group: 'real\\Shared', currency: 'USD', product: 'Premium', productId: 'p-premium' },
  ],
  demoTypes: [],
  leverages: [100],
  maxLiveAccounts: 5,
  maxDemoAccounts: 5,
  maxDemoDeposit: '10000',
};

beforeEach(() => {
  vi.clearAllMocks();
  openAccount.mockResolvedValue({ id: 'acc-1', login: '910001', environment: 'live' });
});

describe('opening a live account', () => {
  it('sends the chosen product with the group', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OpenAccountDialog environment="live" options={OPTIONS} onClose={vi.fn()} />,
    );

    await user.click(await screen.findByRole('combobox', { name: /product/i }));
    await user.click(await screen.findByRole('option', { name: 'Premium' }));
    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'live',
          group: 'real\\Shared',
          productId: 'p-premium',
        }),
      ),
    );
  });

  it('sends the first product offered when the client does not change it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OpenAccountDialog environment="live" options={OPTIONS} onClose={vi.fn()} />,
    );

    await user.click(await screen.findByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\\Shared', productId: 'p-standard' }),
      ),
    );
  });
});
