import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * The client's own MT5 trading accounts.
 *
 * Aliased from the generated schema — the hand-declared interface this file
 * carried while `GET /trading/accounts` was newer than the last contract
 * regeneration is gone, which is the state CLAUDE.md asks for: a backend rename
 * is now a compile error here rather than a runtime surprise.
 *
 * ## No balance field, and that is the API's shape rather than an omission here
 *
 * Equity, margin and open positions live in MT5, not in the CRM database. This
 * endpoint projects the `trading_accounts` row and nothing else, so there is no
 * number on this screen that can disagree with the client's terminal.
 */
export type TradingAccount = components['schemas']['TradingAccountDto'];

export const tradingApi = {
  /**
   * Live and demo together, in one request.
   *
   * The caller groups them. Two requests would let one half of the screen be
   * fresher than the other, and there is no state in which a client wants their
   * live accounts and their demo accounts read at different moments.
   */
  async listAccounts(signal?: AbortSignal): Promise<TradingAccount[]> {
    const { data } = await apiClient.get<TradingAccount[]>('/trading/accounts', { signal });
    return data;
  },

  /**
   * Only the accounts a client can actually fund.
   *
   * Demo accounts trade practice money and the API refuses to transfer into
   * one, so offering them in a "where should this money go" picker is offering
   * a choice that will be rejected — and it is an easy mis-click on a screen
   * that lists both.
   */
  async listFundable(signal?: AbortSignal): Promise<TradingAccount[]> {
    const accounts = await this.listAccounts(signal);
    return accounts.filter((a) => a.environment === 'live');
  },
};
