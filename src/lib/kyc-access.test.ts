import { describe, expect, it } from 'vitest';
import {
  isKycApproved,
  isKycPending,
  isKycRejected,
  requiresApprovedKyc,
  KYC_APPROVED_PATHS,
} from './kyc-access';

/**
 * The rule that decides whether a client may reach a money screen.
 *
 * Worth testing ahead of anything else in this app: it is pure, it is consulted
 * from four places, and both ways of getting it wrong are expensive — strand a
 * verified client outside /deposit, or wave an unverified one into a form the
 * API will refuse after they have filled it in.
 *
 * These assert the DECISIONS the module's comments argue for, not the shape of
 * its code. A test that restated `verificationLevel === 1 || status ===
 * 'approved'` would pass for any refactor that kept the expression and break for
 * any that improved it, which is the wrong way round.
 */

describe('either signal is enough', () => {
  it('approves on the profile signal alone', () => {
    // `/auth/me` says level 1 while `/kyc/status` has not caught up.
    expect(isKycApproved(1, 'submitted')).toBe(true);
  });

  it('approves on the KYC record alone', () => {
    // The mirror case: the submission is approved, the profile has not been
    // re-read since.
    expect(isKycApproved(0, 'approved')).toBe(true);
  });

  it('approves when both agree', () => {
    expect(isKycApproved(1, 'approved')).toBe(true);
  });

  /**
   * The window this whole design exists for.
   *
   * `KycService.approve()` writes the submission status and the verification
   * level in one transaction, but the PORTAL reads them from two endpoints and
   * can see one before the other. Requiring both would lock a client out of
   * their own money for the length of that gap, on a screen that had just told
   * them they were verified.
   */
  it('does not require the two to agree', () => {
    expect(isKycApproved(1, undefined)).toBe(true);
    expect(isKycApproved(undefined, 'approved')).toBe(true);
  });

  it('refuses when neither says so', () => {
    expect(isKycApproved(0, 'not_started')).toBe(false);
    expect(isKycApproved(undefined, undefined)).toBe(false);
    expect(isKycApproved(0, 'rejected')).toBe(false);
  });

  it('treats level 0 as unverified', () => {
    expect(isKycApproved(0, 'submitted')).toBe(false);
    expect(isKycApproved(undefined, undefined)).toBe(false);
  });

  it('treats any level AT OR ABOVE 1 as verified', () => {
    // CORE-15 is "verification LEVELS". A level 2 is a higher tier, not a
    // different kind of thing: an exact-equality check here read the
    // most-verified clients as unverified and closed the money routes on them.
    expect(isKycApproved(1, undefined)).toBe(true);
    expect(isKycApproved(2, undefined)).toBe(true);
  });
});

describe('pending covers every spelling the backend uses', () => {
  /*
   * Four strings for one idea, and that is not tidiness to fix here: the KYC
   * status enum says `submitted` and `under_review`, while older records and
   * the portal's own optimistic paths have produced `pending` and `in_review`.
   * Missing one sends a client who has already submitted back into the wizard,
   * where `saveStep` refuses them — which reads as the product having lost
   * their documents.
   */
  it.each(['submitted', 'pending', 'in_review', 'under_review'])('treats %s as pending', (s) => {
    expect(isKycPending(s)).toBe(true);
  });

  it('does not treat a decided or absent status as pending', () => {
    for (const status of ['approved', 'rejected', 'not_started', undefined]) {
      expect(isKycPending(status)).toBe(false);
    }
  });
});

describe('rejected', () => {
  it('is only the rejected status', () => {
    expect(isKycRejected('rejected')).toBe(true);
    expect(isKycRejected('submitted')).toBe(false);
    expect(isKycRejected(undefined)).toBe(false);
  });
});

describe('which routes are gated', () => {
  it('gates the three that move money', () => {
    expect(requiresApprovedKyc('/deposit')).toBe(true);
    expect(requiresApprovedKyc('/withdraw')).toBe(true);
    expect(requiresApprovedKyc('/transfer')).toBe(true);
  });

  /**
   * Reading screens are deliberately open.
   *
   * An unapproved client with a funded wallet — credited before their level
   * lapsed, or by an operator adjustment — has every right to look at their own
   * balance and their own history. Gating a reading screen behind an approval
   * hides a client's money from them to no end, and the backend agrees:
   * `KycVerifiedGuard` is on the four POST routes and neither GET.
   */
  it('leaves the reading screens open', () => {
    expect(requiresApprovedKyc('/wallet')).toBe(false);
    expect(requiresApprovedKyc('/transactions')).toBe(false);
    expect(requiresApprovedKyc('/dashboard')).toBe(false);
    expect(requiresApprovedKyc('/partner')).toBe(false);
  });

  it('matches a child route of a gated path', () => {
    expect(requiresApprovedKyc('/deposit/confirm')).toBe(true);
  });

  /**
   * The bug a bare `startsWith` would introduce.
   *
   * `/deposit-history` is a reading screen that does not exist yet, and the
   * cheap implementation of this function would put it behind a money gate the
   * day somebody adds it — silently, and on a screen whose whole purpose is to
   * let a client see what already happened.
   */
  it('does not swallow a route that merely starts with a gated name', () => {
    expect(requiresApprovedKyc('/deposit-history')).toBe(false);
    expect(requiresApprovedKyc('/withdrawals')).toBe(false);
    expect(requiresApprovedKyc('/transfers-archive')).toBe(false);
  });

  it('gates exactly the paths the constant names', () => {
    // Pins the two together, so adding a path to the constant without meaning
    // to gate it — or gating one that is not listed — fails here.
    expect(KYC_APPROVED_PATHS).toEqual(['/deposit', '/withdraw', '/transfer']);
  });
});
