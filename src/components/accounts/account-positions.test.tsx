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

/**
 * A paged history response.
 *
 * `deals` is ONE PAGE of closed trades — the server filters and slices, so a
 * fixture no longer hands over a window for the component to sift. `total`
 * defaults to the page length, which is the single-page case; a test paging
 * through passes a larger one explicitly.
 */
function history(
  deals: AccountDeal[],
  stats: Partial<AccountHistory['stats']> = {},
  paging: { total?: number; page?: number; limit?: number } = {},
): AccountHistory {
  const closing = deals.filter((d) => d.closing);
  return {
    from: '2026-08-15T00:00:00.000Z',
    to: '2026-09-14T23:59:59.999Z',
    deals,
    total: paging.total ?? deals.length,
    page: paging.page ?? 1,
    limit: paging.limit ?? 10,
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
    /* The page is part of the request now — the server slices, not the browser. */
    expect(getAccountHistory).toHaveBeenCalledWith(
      'ta-1',
      { page: 1, limit: 10 },
      expect.anything(),
    );
  });

  /*
   * ── THE FILTER MOVED TO THE SERVER, AND THAT IS THE ASSERTION ────────────
   *
   * Opening legs and balance deals must not appear in this table: an opening
   * leg has realised nothing and a deposit is not a trade. This component used
   * to drop them itself, which is only correct while it holds the whole window.
   *
   * Once the list is PAGED, a browser-side filter is a bug: a page of ten rows
   * holding three closed trades renders three, under a pager that counted ten,
   * and the last page can come back empty. So the endpoint filters before it
   * slices, and what this pins is that the component renders its page AS GIVEN
   * rather than sifting it again.
   */
  it('renders the page the server returned, without filtering it again', async () => {
    getAccountHistory.mockResolvedValue(
      history([
        deal({ ticket: '900001', symbol: 'EURUSD', closing: true }),
        deal({ ticket: '900002', symbol: 'GBPUSD', closing: true, profit: '-40.00000000' }),
      ]),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    expect(await screen.findByText('EURUSD')).toBeInTheDocument();
    expect(screen.getByText('GBPUSD')).toBeInTheDocument();
  });

  /*
   * The TOTALS describe the WINDOW, never the page on screen.
   *
   * This is what makes paging safe on a money panel: a client paging through
   * their month must not watch net profit and best trade change under them,
   * which is exactly what summing the visible rows would do.
   */
  it('shows totals for the whole window while the table shows one page', async () => {
    getAccountHistory.mockResolvedValue(
      history(
        [deal({ ticket: '900001', symbol: 'EURUSD', profit: '7.00000000' })],
        {
          trades: 40,
          wins: 25,
          losses: 15,
          netProfit: '820.00000000',
          bestTrade: '300.00000000',
        },
        { total: 40 },
      ),
    );

    renderWithProviders(<AccountPositions accountId="ta-1" currency="USD" />);

    // One row on screen…
    expect(await screen.findByText('EURUSD')).toBeInTheDocument();
    // …and the totals speak for all forty trades, not for that row.
    expect(screen.getByText('40')).toBeInTheDocument();
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
