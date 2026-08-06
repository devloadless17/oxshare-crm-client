/**
 * "Is this client allowed to move money yet?" — asked in one place.
 *
 * The answer was already being derived in three: `visibleNavItems` and
 * `kycNavBadge` in `components/layout/portal-layout.tsx`, and `nothingLeftToDo`
 * in `app/kyc/layout.tsx`. All three spelled it the same way by hand, which is
 * the arrangement where the fourth copy is the one that gets it wrong — and the
 * fourth copy is now a ROUTE GATE, where getting it wrong either strands a
 * verified client outside /deposit or lets an unverified one into it.
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
 * The payments API refuses an unverified client on its own — this exists to
 * explain the refusal BEFORE the client fills in an amount, never to be the
 * refusal itself. Same relationship as `EMAIL_VERIFIED_PATHS` in
 * `components/auth/require-auth.tsx`, and for the same reason: a check that only
 * runs in the browser is a courtesy, not a control.
 */

/** The KYC status strings this app branches on. Anything else is "not done". */
export type KycStatusValue = string | undefined;

/**
 * Approved, by either signal.
 *
 * `verificationLevel === 1` is the profile's own answer; `'approved'` is the KYC
 * record's. See the module comment for why either alone is enough.
 */
export function isKycApproved(
  verificationLevel: number | undefined,
  kycStatus: KycStatusValue,
): boolean {
  return verificationLevel === 1 || kycStatus === 'approved';
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
  return kycStatus === 'submitted' || kycStatus === 'pending' || kycStatus === 'in_review';
}

/** Refused, with something for the client to correct. */
export function isKycRejected(kycStatus: KycStatusValue): boolean {
  return kycStatus === 'rejected';
}

/**
 * Routes that move money, and so require an approved identity check.
 *
 * `/transfer` is listed although the route does not exist yet. The rule is about
 * the ACTION, not about which pages happen to be built this week, and a gate
 * that has to be remembered when the route lands is a gate that will be
 * forgotten — the wallet already renders a Transfer control today.
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
