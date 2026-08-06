import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * The currencies this platform supports.
 *
 * Operator data, set from the admin currencies screen — not a constant in this
 * repo. It used to be a Postgres enum, which made adding one a deploy; the
 * portal's job now is to render whatever the operator has enabled rather than
 * to hold its own opinion about what money exists.
 *
 * `GET /currencies` is public and returns only ENABLED currencies, in the
 * operator's order. Both matter to callers: public, because the registration
 * screen names the currency a new client's wallet opens in and has no session;
 * enabled-only, because a screen that received disabled rows would have to
 * remember to filter, and one of them would forget.
 */
export type Currency = components['schemas']['CurrencyDto'];

export const currenciesApi = {
  async list(signal?: AbortSignal): Promise<Currency[]> {
    const { data } = await apiClient.get<Currency[]>('/currencies', { signal });
    return data;
  },
};
