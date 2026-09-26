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

function renderDialog(takenNames: string[] = []) {
  return renderWithProviders(
    <OpenAccountDialog
      environment="live"
      options={OPTIONS}
      takenNames={takenNames}
      onClose={vi.fn()}
    />,
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

    await user.type(await screen.findByLabelText(/account name/i), 'Swing');
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

    await user.type(await screen.findByLabelText(/account name/i), 'Swing');
    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\\Shared', productId: 'p-standard' }),
      ),
    );
  });
});

describe('the account name', () => {
  it('is required before the account can be opened', async () => {
    renderDialog();

    expect(await screen.findByLabelText(/account name/i)).toBeRequired();
    expect(screen.getByRole('button', { name: /open account/i })).toBeDisabled();
  });

  it('is sent trimmed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(await screen.findByLabelText(/account name/i), '  Swing trading  ');
    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(expect.objectContaining({ name: 'Swing trading' })),
    );
  });

  it('refuses a name the client already uses, whatever its case', async () => {
    const user = userEvent.setup();
    renderDialog(['Swing trading']);

    await user.type(await screen.findByLabelText(/account name/i), 'SWING TRADING');

    expect(screen.getByRole('alert')).toHaveTextContent(/already have an account with this name/i);
    expect(screen.getByRole('button', { name: /open account/i })).toBeDisabled();
  });
});

/*
 * A product may hold several groups in ONE currency (backend 0146). The client
 * picks a product, never a group, so the product is offered once — and the
 * account opens in the group the API lists first, the one attached first.
 */
describe('a product with two groups in the same currency', () => {
  const TWO_USD: SelfServiceAvailability = {
    ...OPTIONS,
    liveTypes: [
      { group: 'real\\First', currency: 'USD', product: 'Standard', productId: 'p-standard' },
      { group: 'real\\Second', currency: 'USD', product: 'Standard', productId: 'p-standard' },
      { group: 'real\\Premium', currency: 'USD', product: 'Premium', productId: 'p-premium' },
    ],
  };

  it('offers the product once, and opens in its first group', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OpenAccountDialog environment="live" options={TWO_USD} takenNames={[]} onClose={vi.fn()} />,
    );

    await user.type(await screen.findByLabelText(/account name/i), 'Swing');
    await user.click(await screen.findByRole('combobox', { name: /product/i }));
    expect(await screen.findAllByRole('option', { name: 'Standard' })).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Premium' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Standard' }));
    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\\First', productId: 'p-standard' }),
      ),
    );
  });
});
