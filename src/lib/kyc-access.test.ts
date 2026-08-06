import { describe, expect, it } from 'vitest';
import { isKycApproved, isKycPending, isKycRejected, requiresApprovedKyc } from './kyc-access';

/**
 * The rule that decides whether a client may move money, asserted directly.
 *
 * It is worth its own file because it is now read from four places — the route
 * gate, the dialog in front of the buttons, the sidebar entries and the sidebar
 * badge — and before this module existed each of those spelled it out by hand.
 * A rule with four hand-written copies has four chances to be the one that is
 * wrong, and the failure is asymmetric in both directions: too strict locks a
 * verified client out of their own money, too loose walks an unverified one
 * into a form the API refuses after they have filled it in.
 */

describe('isKycApproved', () => {
  it('accepts the profile signal on its own', () => {
    expect(isKycApproved(1, 'not_started')).toBe(true);
  });

  it('accepts the KYC record on its own', () => {
    expect(isKycApproved(0, 'approved')).toBe(true);
  });

  it('refuses when neither says so', () => {
    expect(isKycApproved(0, 'not_started')).toBe(false);
    expect(isKycApproved(undefined, undefined)).toBe(false);
  });

  it('refuses a submitted application', () => {
    // Submitted is the client having done their part, not us having agreed.
    // The payments API draws the line on the approval, so this must too.
    expect(isKycApproved(0, 'submitted')).toBe(false);
  });

  it('refuses a rejected one', () => {
    expect(isKycApproved(0, 'rejected')).toBe(false);
  });
});

describe('isKycPending', () => {
  it('covers the three names the backend uses for "waiting on us"', () => {
    expect(isKycPending('submitted')).toBe(true);
    expect(isKycPending('pending')).toBe(true);
    expect(isKycPending('in_review')).toBe(true);
  });

  it('is not true of anything else', () => {
    expect(isKycPending('approved')).toBe(false);
    expect(isKycPending('rejected')).toBe(false);
    expect(isKycPending(undefined)).toBe(false);
  });
});

describe('isKycRejected', () => {
  it('is exactly the rejected status', () => {
    expect(isKycRejected('rejected')).toBe(true);
    expect(isKycRejected('not_started')).toBe(false);
  });
});

describe('requiresApprovedKyc', () => {
  it('covers the three money routes', () => {
    expect(requiresApprovedKyc('/deposit')).toBe(true);
    expect(requiresApprovedKyc('/withdraw')).toBe(true);
    expect(requiresApprovedKyc('/transfer')).toBe(true);
  });

  it('covers their sub-routes', () => {
    expect(requiresApprovedKyc('/deposit/confirm')).toBe(true);
  });

  it('does not gate the reading screens', () => {
    // Seeing your own balance and your own history needs a session and nothing
    // more. Gating these would hide a client's money from the client.
    expect(requiresApprovedKyc('/wallet')).toBe(false);
    expect(requiresApprovedKyc('/transactions')).toBe(false);
    expect(requiresApprovedKyc('/dashboard')).toBe(false);
  });

  it('matches whole segments, never a bare prefix', () => {
    // `startsWith('/deposit')` would swallow this, and a deposit HISTORY page is
    // a reading screen with no business behind a money gate. Same rule and same
    // reason as proxy.ts and require-auth.tsx.
    expect(requiresApprovedKyc('/deposit-history')).toBe(false);
  });
});
