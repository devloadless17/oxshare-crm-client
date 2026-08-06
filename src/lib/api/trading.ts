import { apiClient } from './client';

/**
 * The client's own MT5 trading accounts.
 *
 * ── Hand-declared, and why ──────────────────────────────────────────────────
 *
 * CLAUDE.md's rule is to alias `components['schemas'][…]` rather than
 * hand-write a response shape, because a backend rename should be a compile
 * error here rather than a runtime surprise. That is not possible YET for this
 * one: `GET /trading/accounts` and its `TradingAccountDto` were added in the
 * same change as this file, and `src/lib/api/types.gen.ts` is generated from a
 * running backend which is still serving the previous build.
 *
 * THE GAP, stated so it gets closed rather than forgotten: replace
 * `TradingAccount` below with
 *
 *     export type TradingAccount = components['schemas']['TradingAccountDto'];
 *
 * after `npm run gen:api-types` against a backend that has this endpoint. The
 * DTO in `backend/src/modules/trading/dto/trading-account.dto.ts` is the
 * authority on these field names; this declaration is a copy of it and copies
 * drift.
 *
 * ── No balance field, deliberately ──────────────────────────────────────────
 *
 * Equity, margin and open positions live in MT5, not in the CRM database. This
 * endpoint projects the `trading_accounts` row and nothing else, so there is
 * nothing here that could be a number the terminal disagrees with.
 */
export interface TradingAccount {
  id: string;
  /**
   * A string, not a number. It is an identifier that happens to be digits, and
   * leading zeros are significant to the bridge — `Number('005001234')` loses
   * them silently, which is the same class of bug as parsing money.
   */
  mt5Login: string;
  mt5Group: string | null;
  /**
   * Real money or practice. The distinction this whole screen is organised
   * around: a demo account mistaken for a live one is the worst outcome the
   * page has.
   */
  environment: 'live' | 'demo';
  tier: string | null;
  /** The 1:N in 1:500. */
  leverage: number | null;
  createdAt: string;
}

export const tradingApi = {
  /**
   * Live and demo together, in one request.
   *
   * The caller groups them. Two requests would let one half of the screen be
   * fresher than the other, and there is no state in which a client wants their
   * live accounts and their demo accounts to have been read at different times.
   */
  async listAccounts(signal?: AbortSignal): Promise<TradingAccount[]> {
    const { data } = await apiClient.get<TradingAccount[]>('/trading/accounts', { signal });
    return data;
  },
};
