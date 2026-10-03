import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { SelfServiceAvailability } from '@/lib/api/trading';
import { setActiveLocale, translate } from '@/lib/i18n';
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
/**
 * ARABIC (0179): each offered type carries `productAr`. The reader picks the
 * Arabic name; the request still resolves on — and sends — the product the
 * English name identifies.
 */
describe('in Arabic', () => {
  beforeEach(() => setActiveLocale('ar'));
  afterEach(() => setActiveLocale('en'));

  const ARABIC: SelfServiceAvailability = {
    ...OPTIONS,
    liveTypes: [
      { ...OPTIONS.liveTypes[0]!, productAr: 'قياسي' },
      { ...OPTIONS.liveTypes[1]!, productAr: 'مميز' },
    ],
  };

  it('lists the products in Arabic and opens the one picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OpenAccountDialog environment="live" options={ARABIC} onClose={vi.fn()} />,
    );

    await user.click(
      await screen.findByRole('combobox', { name: translate('ar', 'accounts.fieldProduct') }),
    );
    const shown = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(shown).toEqual(['قياسي', 'مميز']);
    await user.click(screen.getByRole('option', { name: 'مميز' }));
    await user.click(screen.getByRole('button', { name: translate('ar', 'accounts.openConfirm') }));

    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\\Shared', productId: 'p-premium' }),
      ),
    );
  });

  it('shows the English name of a product with no Arabic', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(
      await screen.findByRole('combobox', { name: translate('ar', 'accounts.fieldProduct') }),
    );
    expect(await screen.findByRole('option', { name: 'Premium' })).toBeInTheDocument();
  });
});

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

/*
 * PRODUCT FIRST (owner, 29 Sep 2026): the client picks the product, and the
 * currency is filled in from the ones that product is offered in.
 */
describe('product first, currency from it', () => {
  const MIXED: SelfServiceAvailability = {
    ...OPTIONS,
    liveTypes: [
      { group: 'real\StdUsd', currency: 'USD', product: 'Standard', productId: 'p-standard' },
      { group: 'real\StdEur', currency: 'EUR', product: 'Standard', productId: 'p-standard' },
      { group: 'real\ProEur', currency: 'EUR', product: 'Pro', productId: 'p-pro' },
    ],
  };

  it('asks the product first, then fills in its currency', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OpenAccountDialog environment="live" options={MIXED} onClose={vi.fn()} />);

    const product = await screen.findByRole('combobox', { name: /product/i });
    const currency = screen.getByRole('combobox', { name: /currency/i });
    // The product comes before the currency in the form.
    expect(
      product.compareDocumentPosition(currency) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(currency).toHaveTextContent('USD');

    await user.click(product);
    await user.click(await screen.findByRole('option', { name: 'Pro' }));
    expect(screen.getByRole('combobox', { name: /currency/i })).toHaveTextContent('EUR');
    // One currency for Pro: nothing to choose.
    expect(screen.getByRole('combobox', { name: /currency/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /open account/i }));
    await waitFor(() =>
      expect(openAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\ProEur', productId: 'p-pro' }),
      ),
    );
  });
});
