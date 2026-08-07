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
};
