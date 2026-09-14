import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AccountPositions } from './account-positions';
import type { AccountDeal, AccountHistory } from '@/lib/api/trading';

/**
 * The CLOSED-positions panel.
 *
 * ## What these defend, specifically
 *
 * 1. **The empty pass.** This panel showed nothing for a whole release because
 *    its reader had been deleted with the old Activity card — the endpoint
 *    answered and no screen asked. An assertion that the table renders NAMED
 *    rows is what distinguishes "working" from "quietly reading nothing", so
 *    every case here asserts a populated result rather than absence of error.
 *
 * 2. **Open legs and balance deals leaking in.** `mt5_deals` holds the opening
 *    leg of every trade and every deposit, credit and correction. Only
 *    `closing` deals realised a result, and an opening leg carries `profit: 0`
 *    — so counting them drags the win rate toward zero and puts rows in the
 *    table that never closed.
 *
 * 3. **A loss rendered as a gain.** `profit` is signed and arrives as a decimal
 *    STRING; the sign is read from the raw value, never from formatted text.
 */
const { getAccountHistory } = vi.hoisted(() => ({ getAccountHistory: vi.fn() }));

vi.mock('@/lib/api/trading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/trading')>();
  return { ...actual, tradingApi: { ...actual.tradingApi, getAccountHistory } };
});

function deal(over: Partial<AccountDeal> = {}): AccountDeal {
  return {
    ticket: '900001',
    symbol: 'EURUSD',
    action: 0,
    actionLabel: 'buy',
    entry: 1,
    closing: true,
    volume: '1.00000000',
    price: '1.08500000',
    profit: '125.40000000',
    commission: '0.00000000',
    swap: '0.00000000',
    comment: null,
    dealtAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

function history(
  deals: AccountDeal[],
  stats: Partial<AccountHistory['stats']> = {},
): AccountHistory {
  const closing = deals.filter((d) => d.closing);
  return {
    from: '2026-08-15T00:00:00.000Z',
    to: '2026-09-14T23:59:59.999Z',
    deals,
    stats: {
      trades: closing.length,
      wins: closing.filter((d) => Number(d.profit) > 0).length,
      losses: closing.filter((d) => Number(d.profit) < 0).length,
      volume: '1.00000000',
      netProfit: '125.40000000',
      grossProfit: '125.40000000',
      grossLoss: '0.00000000',
      commission: '0.00000000',
      swap: '0.00000000',
      bestTrade: '125.40000000',
      worstTrade: '125.40000000',
      firstDealAt: '2026-09-01T10:00:00.000Z',
      lastDealAt: '2026-09-01T10:00:00.000Z',
      ...stats,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the closed-positions table', () => {
  /*
   * THE REGRESSION THIS PANEL EXISTS FOR: it must actually call the endpoint
   * and render what comes back. An empty table was the symptom of the reader
   * being absent entirely.
   */
  it('reads the history endpoint and renders the closed trade', async () => {
    getAccountHistory.mockResolvedValue(history([deal()]));

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    expect(await screen.findByText('EURUSD')).toBeInTheDocument();
    expect(getAccountHistory).toHaveBeenCalledWith('ta-1', {}, expect.anything());
  });

  /*
   * OPENING legs and BALANCE deals must not appear. Both arrive in the same
   * response, and both would be wrong in this table: an opening leg has not
   * realised anything, and a deposit is not a trade.
   */
  it('excludes opening legs and balance deals', async () => {
    getAccountHistory.mockResolvedValue(
      history([
        deal({ ticket: '900001', symbol: 'EURUSD', closing: true }),
        deal({
          ticket: '900002',
          symbol: 'GBPUSD',
          closing: false,
          entry: 0,
          profit: '0.00000000',
        }),
        deal({
          ticket: '900003',
          symbol: 'BALANCE',
          closing: false,
          action: 2,
          actionLabel: 'balance',
          profit: '500.00000000',
        }),
      ]),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    expect(await screen.findByText('EURUSD')).toBeInTheDocument();
    expect(screen.queryByText('GBPUSD')).toBeNull();
    expect(screen.queryByText('BALANCE')).toBeNull();
  });

  /*
   * A LOSS IS RED AND SIGNED. The sign comes from the raw decimal string — read
   * from formatted text it breaks on the currency symbol and on any locale that
   * brackets negatives, and it breaks by painting a loss green.
   */
  it('renders a loss as negative rather than as a gain', async () => {
    getAccountHistory.mockResolvedValue(
      history([deal({ profit: '-38.20000000' })], {
        netProfit: '-38.20000000',
        bestTrade: '-38.20000000',
        worstTrade: '-38.20000000',
        wins: 0,
        losses: 1,
      }),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    // Negative, and never rendered with a leading '+'.
    expect(await screen.findAllByText('-$38.20')).not.toHaveLength(0);
    expect(screen.queryByText('+$38.20')).toBeNull();
  });

  /*
   * The EMPTY state names the WINDOW, not the account. "Nothing closed on this
   * account" would be wrong for the case that produces it most often — a client
   * who traded months ago — and reads as their history having been lost.
   */
  it('names the period when nothing closed in it', async () => {
    getAccountHistory.mockResolvedValue(
      history([], {
        trades: 0,
        wins: 0,
        losses: 0,
        netProfit: '0.00000000',
        bestTrade: null,
        worstTrade: null,
      }),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    expect(await screen.findByText(/last 30 days/i)).toBeInTheDocument();
  });

  /*
   * The TOTALS are suppressed with no trades behind them. A row of zeros and em
   * dashes above an empty table says nothing the empty state does not, and
   * reads as a broken panel rather than an empty period.
   */
  it('hides the totals when there are no closed trades', async () => {
    getAccountHistory.mockResolvedValue(
      history([], {
        trades: 0,
        wins: 0,
        losses: 0,
        netProfit: '0.00000000',
        bestTrade: null,
        worstTrade: null,
      }),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    await screen.findByText(/last 30 days/i);
    expect(screen.queryByText(/win rate/i)).toBeNull();
  });

  /*
   * The win rate needs its DENOMINATOR beside it: 100% off a single trade read
   * as a track record is the misreading this guards.
   */
  it('shows the win rate with the wins and losses behind it', async () => {
    getAccountHistory.mockResolvedValue(
      history([deal({ ticket: '1' }), deal({ ticket: '2', profit: '-10.00000000' })], {
        trades: 2,
        wins: 1,
        losses: 1,
      }),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/1 won · 1 lost/i)).toBeInTheDocument();
  });

  /*
   * A FAILED READ must not look like an empty period — the defect class this
   * repo names explicitly. "No trades closed" is reassurance, and reassurance
   * is exactly what a failure must not give.
   */
  it('offers a retry rather than reading as an empty period', async () => {
    getAccountHistory.mockRejectedValue(new Error('network'));

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    expect(await screen.findByText(/could not load your closed positions/i)).toBeInTheDocument();
    expect(screen.queryByText(/no trades closed/i)).toBeNull();
  });
});
