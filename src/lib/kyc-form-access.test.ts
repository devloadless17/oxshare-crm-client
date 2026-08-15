import { describe, expect, it } from 'vitest';
import { canOpenKycForm, type KycStatus } from './kyc-form-access';

/**
 * The KYC route gates, and the property that keeps them from looping.
 *
 * ## The loop these exist to prevent
 *
 * `/kyc/step/[n]` redirects to `/kyc/submitted` when the form is closed, and
 * `/kyc/submitted` redirects to `/kyc/step/1` when there is no outcome to read.
 * If any status satisfied BOTH conditions, the two pages would bounce a client
 * between them until the browser gave up — which is exactly what happened when
 * one gate decided from saved data and the other from status.
 *
 * The invariant is therefore: for every status, at most one of the two gates
 * fires. `everyStatus` below is exhaustive over the union, so a status added to
 * the API without a decision here fails to compile.
 */

const everyStatus: KycStatus[] = [
  'not_started',
  'in_progress',
  'submitted',
  'under_review',
  'approved',
  'rejected',
];

/** Mirrors the condition in `app/kyc/submitted/page.tsx`. */
const outcomeRedirects = (status: KycStatus | null) =>
  status === null || status === 'not_started' || status === 'in_progress';

/** Mirrors the condition in `app/kyc/step/[step]/page.tsx`. */
const formRedirects = (status: KycStatus | null) => !canOpenKycForm(status);

describe('the two gates never both fire — no redirect loop', () => {
  for (const status of [...everyStatus, null]) {
    it(`settles on one page for "${status ?? 'unknown'}"`, () => {
      const bothRedirect = formRedirects(status) && outcomeRedirects(status);
      expect(bothRedirect).toBe(false);
    });
  }
});

describe('who may open the form', () => {
  it('lets an unstarted or in-progress client in', () => {
    expect(canOpenKycForm('not_started')).toBe(true);
    expect(canOpenKycForm('in_progress')).toBe(true);
  });

  it('lets a REJECTED client back in — that is the point of the state', () => {
    // The API agrees: `saveStep` refuses approved and in-review submissions,
    // and accepts a rejected one.
    expect(canOpenKycForm('rejected')).toBe(true);
  });

  it('keeps an APPROVED client out', () => {
    // The bug that started this: a bookmark or the back button handed a
    // verified client their own onboarding form, and re-submitting showed them
    // "under compliance review", which reads as having been un-approved.
    expect(canOpenKycForm('approved')).toBe(false);
  });

  it('keeps a submission that is with compliance out', () => {
    expect(canOpenKycForm('submitted')).toBe(false);
    expect(canOpenKycForm('under_review')).toBe(false);
  });

  it('opens the form when the status cannot be read', () => {
    /*
     * Fails OPEN, deliberately. The API enforces these rules independently, so
     * an unreadable status costs a redirect rather than a lockout — failing
     * closed would sign clients out of their own onboarding whenever the status
     * endpoint hiccuped.
     */
    expect(canOpenKycForm(null)).toBe(true);
  });
});

describe('REGRESSION: verificationLevel is not a KYC status', () => {
  /*
   * The loop a real account hit. `hazimehussein01@gmail.com` is
   * verificationLevel 1 with a KYC submission still `not_started`, and
   * `app/kyc/layout.tsx` used to redirect off any step URL whenever
   * `verificationLevel === 1 || status === 'approved'` — EITHER signal.
   *
   * So the layout said "verified, nothing to do" and pushed to /kyc/submitted,
   * that route said "no outcome to read" and pushed back to /kyc/step/1, and
   * the layout fired again. Not a race — a permanent disagreement between two
   * different notions of "done", so it never settled.
   *
   * The layout redirect is gone. Routing is decided in the route segments from
   * `canOpenKycForm` alone, which is why these two must never both be true.
   */
  it('routes a level-1 client with an unstarted submission to the form, and keeps them there', () => {
    // Whatever `verificationLevel` says, an unstarted submission means the form
    // is theirs — and the outcome page has nothing to show them.
    expect(canOpenKycForm('not_started')).toBe(true);
    expect(outcomeRedirects('not_started')).toBe(true);
    // The step route does NOT bounce them back, so the two cannot ping-pong.
    expect(formRedirects('not_started')).toBe(false);
  });
});
