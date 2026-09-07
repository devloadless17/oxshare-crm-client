/**
 * "Should the portal offer this client a way into the partner programme?" —
 * asked in one place.
 *
 * The backend's `GET /ib/status` answers `eligible: false` with
 * `ineligibleCode: 'chain_full'` when the partner who introduced this client
 * already stands on the deepest enabled level of the Commission Levels ladder
 * — there is no rung to place them on, and `POST /ib/apply` refuses them. The
 * two-level default means a level-2 partner's clients can never become
 * partners, and unlike `unverified` there is no step that changes the answer.
 *
 * For that client the Partner page is a door that can never open, so the
 * portal HIDES it: the sidebar entry goes (`visibleNavItems` in
 * `components/layout/portal-layout.tsx`) and a typed or bookmarked URL is
 * bounced (`RequireAuth`). Both read this predicate through
 * `hooks/use-partner-access.ts`, so the chrome and the gate cannot disagree.
 *
 * ## This is the client half of a server rule
 *
 * `IbApplicationsService.apply` refuses regardless, and `approve` refuses the
 * placement again on the reviewer's side. This exists to keep a dead end out
 * of the navigation, never to be the refusal itself — the same relationship
 * `kyc-access.ts` records for the money routes.
 */

/**
 * The slice of `IbStatusDto` the rule reads. Structural rather than the
 * generated type so the module stays pure and a test needs no DTO fixture.
 */
export interface PartnerAccessStatus {
  account: unknown;
  application: unknown;
  ineligibleCode: string | null;
}

/**
 * Hidden ONLY when nothing on the page belongs to the client.
 *
 * - An existing partner keeps their workspace, whatever their introducer's
 *   level is.
 * - A client with an application keeps the page too: a pending applicant must
 *   see the pending card (a reviewer can still root them), and a rejected one
 *   must be able to read the reason — hiding a decision that was delivered
 *   reads as the product having lost it. The page itself stops a rejected
 *   chain-blocked client from re-applying.
 * - An UNDEFINED status hides nothing. The status may be unloaded, or the
 *   request may have failed; hiding a page on an unanswered question is the
 *   bug `RequireAuth` documents twice, and the backend enforces the rule
 *   either way.
 */
export function partnerPageHidden(status: PartnerAccessStatus | null | undefined): boolean {
  if (!status) return false;
  return !status.account && !status.application && status.ineligibleCode === 'chain_full';
}

/**
 * The routes the gate covers. Everything partner lives under one segment; the
 * list exists so the gate and the sidebar name the same paths.
 */
export const PARTNER_PATHS = ['/partner'];

/**
 * Whole segments, never a bare prefix — the same rule as `proxy.ts`,
 * `require-auth.tsx` and `kyc-access.ts`, and for the same reason: a bare
 * `startsWith('/partner')` would also swallow a future `/partners-terms`.
 */
export function isPartnerRoute(pathname: string): boolean {
  return PARTNER_PATHS.some((entry) => pathname === entry || pathname.startsWith(`${entry}/`));
}
