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

/**
 * The partner dashboard: level, earnings, referred clients and sub-partners.
 *
 * ## `earnings.engineLive` is the field that matters most on this screen
 *
 * FALSE means the commission engine does not exist — migration 0028 removed it
 * and nothing writes commission entries yet. The totals are therefore TRUE
 * READS of an empty ledger rather than computed results, and the UI must say so
 * beside them.
 *
 * That distinction is the whole reason the flag is on the wire. "You have
 * earned nothing" and "nothing has been calculated yet" are different
 * sentences, and a partner who is owed money reads the first as a dispute — the
 * same failure as the wallet that rendered `$0.00` while the client held $700.
 *
 * When something starts writing commission entries the flag flips server-side
 * and the same totals become live, with no change needed here.
 */
export type IbOverview = components['schemas']['IbOverviewDto'];
export type IbEarnings = components['schemas']['IbEarningsDto'];
export type IbReferredClient = components['schemas']['IbReferredClientDto'];
export type IbSubPartner = components['schemas']['IbSubPartnerDto'];
export type IbLevelSummary = components['schemas']['IbLevelSummaryDto'];

/** One commission entry, with the status that says whether it is money yet. */
export type IbCommissionRow = components['schemas']['IbCommissionRowDto'];

/** One open trade belonging to a client this partner introduced. */
export type IbClientPosition = components['schemas']['IbClientPositionDto'];

/** An agency (وكالة) a client may apply to be appointed under. */
export type Agency = components['schemas']['PublicAgencyDto'];

export interface ApplyToPartnerInput {
  /**
   * Which agency is being applied for.
   *
   * Optional in the API, because a deployment with none configured must still
   * take partners. Where agencies exist the form makes it a required choice —
   * "which programme" is the question the applicant is best placed to answer
   * and a reviewer is not.
   */
  agencyId?: string;
  motivation?: string;
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

  /**
   * The partner's own dashboard, in one request.
   *
   * 404s for a client who is not a partner, deliberately — zeroes across the
   * board would render as a partner dashboard belonging to somebody who is not
   * one. Call `status()` first and only ask for this once `account` is present;
   * `useResource` reports a 404 as `unavailable`, which reads as "not built" and
   * would be the wrong sentence here.
   */
  async overview(signal?: AbortSignal): Promise<IbOverview> {
    const { data } = await apiClient.get<IbOverview>('/ib/overview', { signal });
    return data;
  },

  /**
   * The programmes open for application, with the products each carries.
   *
   * An EMPTY list is a working state, not a failure: it means the broker has
   * configured no agencies, and the form should still let the client apply.
   */
  async agencies(signal?: AbortSignal): Promise<Agency[]> {
    const { data } = await apiClient.get<Agency[]>('/ib/agencies', { signal });
    return data;
  },

  /**
   * Every commission earned, claim and credit alike.
   *
   * The dashboard totals read the ledger — money PAID — so a partner mid-window
   * sees zero there. This list carries `status`, which is what lets the screen
   * explain the difference rather than appear to contradict itself.
   */
  async commissions(signal?: AbortSignal): Promise<IbCommissionRow[]> {
    const { data } = await apiClient.get<IbCommissionRow[]>('/ib/commissions', { signal });
    return data;
  },

  /** Open trades of this partner's DIRECT clients. */
  async positions(signal?: AbortSignal): Promise<IbClientPosition[]> {
    const { data } = await apiClient.get<IbClientPosition[]>('/ib/positions', { signal });
    return data;
  },

  async apply(input: ApplyToPartnerInput): Promise<IbApplication> {
    const { data } = await apiClient.post<IbApplication>('/ib/apply', input);
    return data;
  },
};
