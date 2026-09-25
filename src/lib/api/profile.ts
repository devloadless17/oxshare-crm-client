import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * The countries and nationalities a client profile accepts — the SERVER's lists.
 *
 * `GET /profile/options` is public, like `/currencies`, because the screen that
 * needs it first is the registration form, which has no session. It exists so
 * the lists are ONE list: the profile refuses a country the server does not hold
 * (`common/profile/client-profile.ts` in the backend), so a form offering its
 * own copy would sooner or later offer a choice that is then refused — a sign-up
 * that cannot be finished, with nothing on screen saying why.
 *
 * The KYC form receives the same lists inside its configuration; this is the
 * same data for the screens that have no configuration to read.
 */
export type ProfileOptions = components['schemas']['ProfileOptionsDto'];

export const profileApi = {
  async options(signal?: AbortSignal): Promise<ProfileOptions> {
    const { data } = await apiClient.get<ProfileOptions>('/profile/options', { signal });
    return data;
  },
};
