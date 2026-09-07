import { describe, expect, it } from 'vitest';
import { isPartnerRoute, partnerPageHidden, PARTNER_PATHS } from './partner-access';

/**
 * The rule that decides whether the Partner page exists for a client.
 *
 * Both ways of getting it wrong are expensive and both fail silently: hide the
 * page from a client entitled to it and a partner-to-be quietly never applies;
 * show it to a client the ladder can never hold and the navigation offers a
 * door the API keeps refusing. These assert the DECISIONS the module's
 * comments argue for, not the shape of its code.
 */

const OPEN = { account: null, application: null, ineligibleCode: null };

describe('when the page is hidden', () => {
  it('hides it only for chain_full with nothing on the page to see', () => {
    expect(partnerPageHidden({ ...OPEN, ineligibleCode: 'chain_full' })).toBe(true);
  });

  /**
   * A partner stays a partner. Their own introducer being on the deepest rung
   * says nothing about the workspace they already hold — and the workspace is
   * where their referral link and commission balances live.
   */
  it('never hides it from an existing partner', () => {
    expect(
      partnerPageHidden({ ...OPEN, account: { level: 2 }, ineligibleCode: 'chain_full' }),
    ).toBe(false);
  });

  /**
   * An application keeps the page whatever the code says. A pending applicant
   * must see the pending card (a reviewer can still root them at approval),
   * and a rejected one must be able to read the reason — hiding a decision
   * that was delivered reads as the product having lost it.
   */
  it('never hides it from a client with an application to look at', () => {
    expect(
      partnerPageHidden({
        ...OPEN,
        application: { status: 'pending' },
        ineligibleCode: 'chain_full',
      }),
    ).toBe(false);
    expect(
      partnerPageHidden({
        ...OPEN,
        application: { status: 'rejected' },
        ineligibleCode: 'chain_full',
      }),
    ).toBe(false);
  });

  /**
   * `unverified` is an errand, not a wall — the client can go and verify, so
   * the page stays and explains that. Only `chain_full` is permanent.
   */
  it('does not hide it for the unverified code', () => {
    expect(partnerPageHidden({ ...OPEN, ineligibleCode: 'unverified' })).toBe(false);
  });

  it('does not hide it while eligible', () => {
    expect(partnerPageHidden(OPEN)).toBe(false);
  });

  /**
   * An unanswered question hides nothing. The status may be unloaded or the
   * request may have failed, and hiding a page on a dropped request is a page
   * that vanishes at random — the backend refuses the application regardless,
   * so failing open costs one explanatory screen.
   */
  it('fails open on a missing status', () => {
    expect(partnerPageHidden(undefined)).toBe(false);
    expect(partnerPageHidden(null)).toBe(false);
  });

  /** A future code the build has not heard of must not hide anything. */
  it('fails open on an unrecognised code', () => {
    expect(partnerPageHidden({ ...OPEN, ineligibleCode: 'some_future_code' })).toBe(false);
  });
});

describe('which routes are gated', () => {
  it('gates the partner page and its children', () => {
    expect(isPartnerRoute('/partner')).toBe(true);
    expect(isPartnerRoute('/partner/anything')).toBe(true);
  });

  it('leaves every other route alone', () => {
    expect(isPartnerRoute('/dashboard')).toBe(false);
    expect(isPartnerRoute('/wallet')).toBe(false);
  });

  /**
   * The bug a bare `startsWith` would introduce — the same whole-segment rule
   * `proxy.ts`, `require-auth.tsx` and `kyc-access.ts` each state: a future
   * `/partners-terms` reading screen must not inherit this gate silently.
   */
  it('does not swallow a route that merely starts with the gated name', () => {
    expect(isPartnerRoute('/partners')).toBe(false);
    expect(isPartnerRoute('/partner-terms')).toBe(false);
  });

  it('gates exactly the paths the constant names', () => {
    expect(PARTNER_PATHS).toEqual(['/partner']);
  });
});
