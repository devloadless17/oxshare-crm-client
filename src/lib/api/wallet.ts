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
 * `{ items, total, page, limit }` envelope. Nothing called it yet, so it would
 * have broken the first caller rather than being caught. The alias makes that
 * mistake impossible to write.
 *
 * Every monetary field is a `string` in the generated types (ARCHITECTURE §6.1).
 * Never widen one to `number` — render through `formatMoney` in lib/money.ts.
 */
export type Wallet = components['schemas']['WalletDto'];
export type LedgerEntry = components['schemas']['LedgerEntryDto'];
export type LedgerPage = components['schemas']['LedgerListResponseDto'];

export const walletApi = {
  /** A bare array — one wallet per currency the client actually holds. */
  async getWallets(signal?: AbortSignal): Promise<Wallet[]> {
    const { data } = await apiClient.get<Wallet[]>('/wallet', { signal });
    return data;
  },

  /** Paginated, unlike getWallets. */
  async getLedger(signal?: AbortSignal): Promise<LedgerPage> {
    const { data } = await apiClient.get<LedgerPage>('/wallet/ledger', { signal });
    return data;
  },
};
