/**
 * "Is this client allowed to move money yet?" — asked in one place.
 *
 * The answer was already being derived in three: `visibleNavItems` and
 * `kycNavBadge` in `components/layout/portal-layout.tsx`, and the KYC gate in
 * `components/auth/require-auth.tsx`. All three spelled it the same way by
 * hand, which is the arrangement where the fourth copy is the one that gets it
 * wrong — and the fourth copy is a ROUTE GATE, where getting it wrong either
 * strands a verified client outside /deposit or lets an unverified one into it.
 *
 * ## Two signals, either sufficient
 *
 * `verificationLevel` comes from `/auth/me` and `status` from `/kyc/status`, and
 * they are updated by different code paths on the backend. Requiring both to
 * agree would mean a client whose approval landed on one and not yet the other
 * is locked out of their own money; accepting either matches what the sidebar
 * badge has always done, so the chrome and the gate cannot contradict each other
 * on screen.
 *
 * ## This is the client half of a server rule
 *
 * All four money-moving routes sit behind `KycVerifiedGuard` on the backend and
 * answer `KYC_NOT_VERIFIED`. This exists to explain the refusal BEFORE the
 * client fills in an amount, never to be the refusal itself. Same relationship
 * as `EMAIL_VERIFIED_PATHS` in `components/auth/require-auth.tsx`, and for the
 * same reason: a check that only runs in the browser is a courtesy, not a
 * control.
 */

/** The KYC status strings this app branches on. Anything else is "not done". */
export type KycStatusValue = string | undefined;

/**
 * Approved, by either signal.
 *
 * `verificationLevel >= 1` is the profile's own answer; `'approved'` is the KYC
 * record's. See the module comment for why either alone is enough.
 *
 * AT LEAST one, not exactly one. CORE-15 is "verification LEVELS", and the day
 * a level 2 exists an exact-equality check reads the most-verified clients as
 * unverified and closes the money routes on them.
 */
export function isKycApproved(
  verificationLevel: number | undefined,
  kycStatus: KycStatusValue,
): boolean {
  return (verificationLevel ?? 0) >= 1 || kycStatus === 'approved';
}

/**
 * Submitted, and now waiting on us.
 *
 * Separated from "not started" because the two need different words and
 * different buttons: someone under review has already done their part, and
 * sending them back into the wizard is both useless — `saveStep` refuses a
 * submitted application — and reads as the product having lost their documents.
 */
export function isKycPending(kycStatus: KycStatusValue): boolean {
  return (
    kycStatus === 'submitted' ||
    kycStatus === 'pending' ||
    kycStatus === 'in_review' ||
    kycStatus === 'under_review'
  );
}

/** Refused, with something for the client to correct. */
export function isKycRejected(kycStatus: KycStatusValue): boolean {
  return kycStatus === 'rejected';
}

/**
 * Routes that move money, and so require an approved identity check.
 *
 * These are the four `POST` routes' screens: /deposit, /withdraw and /transfer
 * each front an endpoint the backend guards with `KycVerifiedGuard`.
 *
 * /transactions and /wallet are deliberately ABSENT. They read; they do not
 * move anything, and an unapproved client with a funded wallet — one credited
 * before their level lapsed, or by an operator adjustment — has every right to
 * look at their own balance and their own history. Gating a reading screen
 * behind an approval hides a client's money from them to no end.
 */
export const KYC_APPROVED_PATHS = ['/deposit', '/withdraw', '/transfer'];

/**
 * Whole segments, never a bare prefix — the same rule as `proxy.ts` and
 * `require-auth.tsx`, and for the same reason: `startsWith('/deposit')` would
 * also swallow a future `/deposit-history`, which is a reading screen and has no
 * business behind a money gate.
 */
export function requiresApprovedKyc(pathname: string): boolean {
  return KYC_APPROVED_PATHS.some((entry) => pathname === entry || pathname.startsWith(`${entry}/`));
}
