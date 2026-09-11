import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { Mt5Adjustments } from './mt5-adjustments';
import { tradingApi, type BalanceMovementPage } from '@/lib/api/trading';

/**
 * THE SECTION THAT EXISTS BECAUSE AN ADMIN CAN MOVE A CLIENT'S MONEY SILENTLY.
 *
 * A dealer adjustment has no wallet leg and no ledger entry by design, so it
 * appears in neither the transactions table above nor the transfers list — and
 * before this section, nowhere a client could look at all. A DEBIT in
 * particular had no client-visible record anywhere in the CRM.
 *
 * So the cases here are not about layout. They are about the three ways this
 * screen could still fail a client while appearing to work.
 */
const page = (over: Partial<BalanceMovementPage> = {}): BalanceMovementPage => ({
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-09-01T00:00:00.000Z',
  truncated: false,
  items: [],
  ...over,
});

const movement = (over: Record<string, unknown> = {}) => ({
  ticket: '9001',
  accountId: 'acc-1',
  login: '500001',
  action: 2,
  actionLabel: 'Balance',
  amount: '250.00000000',
  comment: 'Goodwill credit',
  dealtAt: '2026-08-20T10:00:00.000Z',
  ...over,
});

beforeEach(() => vi.restoreAllMocks());

describe('money an admin moved on the client’s MT5 account', () => {
  it('shows a credit with its amount and the reason given', async () => {
    vi.spyOn(tradingApi, 'getBalanceMovements').mockResolvedValue(
      page({ items: [movement()] as BalanceMovementPage['items'] }),
    );

    renderWithProviders(<Mt5Adjustments currency="USD" />);

    expect(await screen.findByText(/Balance/)).toBeInTheDocument();
    expect(screen.getByText(/Goodwill credit/)).toBeInTheDocument();
    expect(screen.getByText(/500001/)).toBeInTheDocument();
  });

  it('renders a DEBIT with its minus sign — never as though it were a credit', async () => {
    /*
     * The case this whole section exists for. An admin taking money OFF a
     * client's trading account is the movement with no other client-visible
     * record anywhere, and a figure rendered without its sign reports a debit
     * as a credit. That is the feature failing while looking like it works.
     */
    vi.spyOn(tradingApi, 'getBalanceMovements').mockResolvedValue(
      page({
        items: [
          movement({ ticket: '9002', amount: '-125.50000000' }),
        ] as BalanceMovementPage['items'],
      }),
    );

    renderWithProviders(<Mt5Adjustments currency="USD" />);

    const amount = await screen.findByText(/125\.50/);
    expect(amount.textContent).toMatch(/-/);
  });

  it('SAYS the list is capped when it is', async () => {
    vi.spyOn(tradingApi, 'getBalanceMovements').mockResolvedValue(
      page({ truncated: true, items: [movement()] as BalanceMovementPage['items'] }),
    );

    renderWithProviders(<Mt5Adjustments currency="USD" />);

    expect(await screen.findByText(/500 most recent/i)).toBeInTheDocument();
  });

  it('does NOT claim a cap when everything fits', async () => {
    // The control: without it the notice could render unconditionally and the
    // case above would still pass — a warning about a problem nobody has.
    vi.spyOn(tradingApi, 'getBalanceMovements').mockResolvedValue(
      page({ items: [movement()] as BalanceMovementPage['items'] }),
    );

    renderWithProviders(<Mt5Adjustments currency="USD" />);

    await screen.findByText(/Balance/);
    expect(screen.queryByText(/500 most recent/i)).not.toBeInTheDocument();
  });

  it('says there are none rather than rendering an empty frame', async () => {
    vi.spyOn(tradingApi, 'getBalanceMovements').mockResolvedValue(page());

    renderWithProviders(<Mt5Adjustments currency="USD" />);

    expect(await screen.findByText(/No adjustments in this period/i)).toBeInTheDocument();
  });

  it('offers a retry when the read fails — never a silent empty list', async () => {
    /*
     * Defect class 7, and it is worse here than on most screens: an empty
     * adjustments list reads as "my broker has not touched my account", which
     * is precisely the reassurance a failed load must not give.
     */
    vi.spyOn(tradingApi, 'getBalanceMovements').mockRejectedValue(new Error('down'));

    renderWithProviders(<Mt5Adjustments currency="USD" />);

    expect(
      await screen.findByText(/Could not load trading account adjustments/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No adjustments in this period/i)).not.toBeInTheDocument();
  });
});
