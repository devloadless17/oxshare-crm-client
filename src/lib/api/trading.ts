import { apiClient } from './client';
import type { components } from './types.gen';

/**
 * The client's own trading accounts.
 *
 * Types are ALIASES of the generated schemas — never hand-written. See the note
 * in ./wallet.ts for the drift that rule has already caught in this folder.
 *
 * `balance` is a decimal STRING (§6.1) and stays one all the way to the DOM.
 * Render it through `formatMoney`; `Number()` and `parseFloat` are lint errors
 * on money paths.
 *
 * WHAT THIS ENDPOINT DOES NOT RETURN, and why the screen must not invent it:
 * equity, margin, free margin and open positions. Those are computed from live
 * prices against open trades and nothing in the CRM holds them — there is no
 * MT5 bridge. `balance` is the CRM-held figure a transfer actually credits.
 */
export type TradingAccount = components['schemas']['TradingAccountDto'];

/** From the schema, so a new environment is a compile error rather than a gap. */
export type TradingEnvironment = TradingAccount['environment'];
export type TradingAccountStatus = TradingAccount['status'];

/**
 * One trade on a trading account.
 *
 * ## `GET /trading/positions` returns an empty list today
 *
 * Nothing writes to the `positions` table — there is no MT5 bridge, so no
 * ingestion path exists. The table and this endpoint exist ahead of the feed so
 * the portal renders against a REAL query returning zero rows.
 *
 * That is the whole point, and it is worth not undoing: a screen showing a
 * hardcoded "nothing here" is indistinguishable from one whose query genuinely
 * found nothing, and this codebase has already told a client with three live
 * accounts that they had none. "No open positions" must stay something the
 * database said.
 *
 * `profit` is the REALISED result and is null while a position is open.
 * Floating P/L is deliberately absent everywhere — it changes on every tick, so
 * a stored copy is stale the moment it is written.
 */
export type Position = components['schemas']['PositionDto'];
export type PositionSide = Position['side'];
export type PositionStatus = Position['status'];

/**
 * The landing page, in one response.
 *
 * One request rather than six because these panels are read in a single glance:
 * a balance from one instant beside a transaction list from another is a screen
 * that contradicts itself, and six requests give six ways to half-fail.
 */
export type Dashboard = components['schemas']['DashboardDto'];
export type DashboardStats = components['schemas']['DashboardStatsDto'];

export const tradingApi = {
  /**
   * Every account this client holds, live first then demo, newest first within
   * each.
   *
   * A bare array — unpaginated, because a client holds a handful of accounts
   * rather than a growing log. The server does the environment ordering so the
   * portal's grouping and the API cannot disagree about which is which.
   */
  async getAccounts(signal?: AbortSignal): Promise<TradingAccount[]> {
    const { data } = await apiClient.get<TradingAccount[]>('/trading/accounts', { signal });
    return data;
  },

  /**
   * The accounts a wallet transfer may credit — live and active only.
   *
   * The server narrows this; it is not a filter the UI should re-implement.
   * `TransfersService` still refuses a bad destination, so this shapes what is
   * OFFERED rather than replacing the check.
   */
  async getTransferableAccounts(signal?: AbortSignal): Promise<TradingAccount[]> {
    const { data } = await apiClient.get<TradingAccount[]>('/trading/accounts/transferable', {
      signal,
    });
    return data;
  },

  /**
   * The client's positions — open by default.
   *
   * Empty for everyone until a bridge writes to the table. A caller must render
   * that as "no open positions" and NOT as a broken or unbuilt screen: the
   * request succeeded and the answer was zero rows.
   */
  async getPositions(
    options: { status?: PositionStatus; limit?: number; signal?: AbortSignal } = {},
  ): Promise<Position[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const { data } = await apiClient.get<Position[]>(
      query ? `/trading/positions?${query}` : '/trading/positions',
      { signal: options.signal },
    );
    return data;
  },
};

export const dashboardApi = {
  /** Everything the landing page renders, in one request. */
  async get(signal?: AbortSignal): Promise<Dashboard> {
    const { data } = await apiClient.get<Dashboard>('/dashboard', { signal });
    return data;
  },
};
