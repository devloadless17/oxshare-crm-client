import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * The links the broker puts on this client's sidebar.
 *
 * Operator data, added from the admin console and stored in `external_links` —
 * an economic calendar, a help centre, a Telegram channel. Not environment
 * variables and not a build-time constant, for the reason the platform download
 * links are neither: they change for marketing reasons, constantly, and the
 * person who changes them does not ship releases.
 */

/**
 * Aliased from the generated schema — a backend rename is a compile error here
 * rather than a runtime surprise.
 *
 * This is `ClientExternalLinkDto`, deliberately NOT the admin `ExternalLinkDto`.
 * It carries no `enabled` (every row the endpoint returns is enabled, so the
 * field could only ever say `true`) and no `updatedBy` (the id of an
 * administrator is not a thing to hand to a customer). If those ever appear
 * here, the endpoint started answering with the wrong shape.
 */
export type ExternalLink = components['schemas']['ClientExternalLinkDto'];

export const externalLinksApi = {
  /**
   * Enabled links only, in the operator's order.
   *
   * An EMPTY array is an ordinary answer, not an error or an unfinished state:
   * it means the broker has added no links, and the sidebar shows no extra
   * section. That is why this needs no "not configured yet" rendering, unlike
   * `platformsApi.list`, whose null urls are exactly that state.
   */
  async list(signal?: AbortSignal): Promise<ExternalLink[]> {
    const { data } = await apiClient.get<ExternalLink[]>('/external-links', { signal });
    return data;
  },
};
