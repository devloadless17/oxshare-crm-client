import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * The partner (introducing broker) programme, from the client's side.
 *
 * Aliased from the generated schema rather than hand-written, so a backend
 * rename is a compile error here instead of a field that silently reads
 * `undefined` on a screen.
 */

export type IbStatus = components['schemas']['IbStatusDto'];
export type IbAccount = components['schemas']['IbAccountDto'];
export type IbApplication = components['schemas']['IbApplicationDto'];
export type IbApplicationStatus = IbApplication['status'];

export interface ApplyToPartnerInput {
  motivation?: string;
  expectedVolume?: string;
  website?: string;
}

export const partnerApi = {
  /**
   * Where this client stands.
   *
   * Carries BOTH `account` and `application`, and the screen needs both:
   * "never applied" and "rejected last month, here is the reason" are
   * different states, and a client shown a blank form after a refusal has been
   * told nothing about why.
   */
  async status(signal?: AbortSignal): Promise<IbStatus> {
    const { data } = await apiClient.get<IbStatus>('/ib/status', { signal });
    return data;
  },

  async apply(input: ApplyToPartnerInput): Promise<IbApplication> {
    const { data } = await apiClient.post<IbApplication>('/ib/apply', input);
    return data;
  },
};
