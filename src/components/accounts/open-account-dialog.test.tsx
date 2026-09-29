import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { SelfServiceAvailability } from '@/lib/api/trading';
import { OpenAccountDialog } from './open-account-dialog';

/**
 * Opening a live account.
 *
 * Two things travel in the request and both are pinned here:
 *
 * - The PRODUCT the client picked, with the group (backend 0142). One MT5 group
 *   may back several products, and the product decides what the account's
 *   trades pay. If the dialog sent only the group, two products sharing it
 *   would be indistinguishable.
 * - The account NAME the client typed — required, and refused on the field when
 *   the client already has an account called that. Restored at the owner's
 *   request (25 Sep 2026) after its removal in f9d1475.
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

function renderDialog() {
  return renderWithProviders(
    <OpenAccountDialog environment="live" options={OPTIONS} onClose={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  openAccount.mockResolvedValue({ id: 'acc-1', login: '910001', environment: 'live' });
});

describe('opening a live account', () => {
  it('sends the chosen product with the group', async () => {
    const user = userEvent.setup();
    renderDialog();

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
    renderDialog();

    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\\Shared', productId: 'p-standard' }),
      ),
    );
  });
});

/*
 * NO NAME FIELD (owner, 29 Sep 2026): the server names the account after the
 * client — "First Last", then "First Last-2", "-3"…
 */
describe('the account name', () => {
  it('is not asked for, and none is sent', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole('combobox', { name: /product/i });
    expect(screen.queryByLabelText(/account name/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() => expect(openAccount).toHaveBeenCalled());
    expect(openAccount.mock.calls[0]?.[0]).not.toHaveProperty('name');
  });
});
