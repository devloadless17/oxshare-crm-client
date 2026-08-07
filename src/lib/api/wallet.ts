import { apiClient } from './client';
import type { components } from './types.gen';

/**
 * Wallet reads for the portal.
 *
 * Types are ALIASES of the schemas generated from the backend's Swagger
 * (`npm run gen:api-types`, with the backend running). Never hand-write an
 * interface for an API response — regenerate instead, so drift becomes a compile
 * error (docs/API-CONTRACTS.md Part C).
 *
 * This file is why that rule matters. It briefly carried hand-written types, and
 * one of them was wrong: `getLedger` was declared as returning `LedgerEntry[]`
 * when `GET /wallet/ledger` actually returns the paginated
 * `{ items, nextCursor, total, page, limit }` envelope. Nothing called it yet,
 * so it would have broken the first caller rather than being caught. The alias
 * makes that mistake impossible to write.
 *
 * Every monetary field is a `string` in the generated types (ARCHITECTURE §6.1).
 * Never widen one to `number` — render through `formatMoney` in lib/money.ts.
 */
export type Wallet = components['schemas']['WalletDto'];
export type LedgerEntry = components['schemas']['LedgerEntryDto'];
export type LedgerPage = components['schemas']['LedgerListResponseDto'];

/** The currencies the API rows a wallet in — from the schema, not a literal. */
export type WalletCurrency = Wallet['currency'];

export const walletApi = {
  /** A bare array — one wallet per currency the client actually holds. */
  async getWallets(signal?: AbortSignal): Promise<Wallet[]> {
    const { data } = await apiClient.get<Wallet[]>('/wallet', { signal });
    return data;
  },

  /**
   * Paginated, unlike getWallets.
   *
   * Keyset, not offset: pass `nextCursor` from the previous page back as
   * `cursor`. The ledger is append-only and never stops growing, so offset
   * paging over it skips rows as new ones are written — and a client checking
   * their own history against their own records must not be shown a page that
   * quietly omits a transaction.
   */
  async getLedger(
    options: { cursor?: string; limit?: number; signal?: AbortSignal } = {},
  ): Promise<LedgerPage> {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const { data } = await apiClient.get<LedgerPage>(
      query ? `/wallet/ledger?${query}` : '/wallet/ledger',
      { signal: options.signal },
    );
    return data;
  },
};
