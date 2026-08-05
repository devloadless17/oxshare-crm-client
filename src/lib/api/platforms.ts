import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * Where a client downloads the trading terminal.
 *
 * The links are operator data, set from the admin settings screen and stored in
 * `platform_links`. They are not environment variables, because they change
 * with every terminal build and the person who changes them does not ship
 * releases.
 */

/**
 * Aliased from the generated schema — a backend rename is a compile error here
 * rather than a runtime surprise.
 *
 * `url` is explicitly nullable and that is the field the whole screen turns on:
 * null means the operator has not configured that platform, which must render
 * differently from a working link. The endpoint always returns all three keys
 * for exactly this reason — "not set up yet" and "not offered" are different
 * answers, and a response that omitted unconfigured rows could not tell them
 * apart.
 */
export type PlatformLink = components['schemas']['PlatformLinkDto'];
export type PlatformKey = PlatformLink['key'];

export const platformsApi = {
  async list(signal?: AbortSignal): Promise<PlatformLink[]> {
    const { data } = await apiClient.get<PlatformLink[]>('/platforms', { signal });
    return data;
  },
};
