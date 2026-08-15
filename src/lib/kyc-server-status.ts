import 'server-only';
import { cookies } from 'next/headers';
import type { components } from './api/types.gen';

export { canOpenKycForm } from './kyc-form-access';
export type { KycStatus } from './kyc-form-access';

type KycStatusDto = components['schemas']['KycStatusDto'];

/**
 * The client's KYC status, read on the SERVER before anything renders.
 *
 * ## Why not `src/proxy.ts`
 *
 * The middleware is the obvious home for a route gate and it cannot do this
 * one. It runs at the edge with no signing key, so it can see that a session
 * cookie EXISTS but cannot read or trust a claim inside it — its own header
 * says so, and records the incident that taught it: a check on an
 * `emailVerified` claim read `undefined !== true` for every client and
 * redirected all of them.
 *
 * The workaround would be a `kyc_status` cookie for the middleware to read, and
 * that is worse than it sounds. KYC status changes SERVER-SIDE while the client
 * is signed in — a reviewer approves them mid-session — so the cookie is stale
 * from the moment it is written. A client approved thirty seconds ago would
 * still be treated as pending, which is the exact complaint that started this.
 *
 * A Server Component gets the same guarantee the middleware was wanted for —
 * the page does not render, there is no flash of the wrong screen, no client JS
 * runs first — while reading the one source that is both current and
 * unforgeable.
 *
 * ## Cookies are forwarded by hand
 *
 * A server-side fetch carries no browser cookie jar, so the session has to be
 * attached explicitly or the API answers 401 and every client looks unstarted.
 *
 * ## A failed read is not a verdict
 *
 * `null` on any error, and the callers treat that as "render the page". The API
 * enforces these rules independently — `saveStep` refuses an approved or
 * in-review submission — so a status endpoint that is briefly down costs a
 * redirect, not a lockout. Failing closed would sign clients out of their own
 * onboarding whenever this one call hiccuped.
 */
/**
 * The API base for a SERVER-side call, mirroring the `/api` rewrite.
 *
 * ## Why this is not the browser's base URL
 *
 * Client code calls `/api/kyc/status` and `next.config.ts` rewrites it to
 * `${API_ORIGIN}/v1/kyc/status`. A rewrite only applies to requests the browser
 * makes, so a Server Component reaching the API directly gets none of it — and
 * calling `/kyc/status` without the version produced exactly one symptom:
 *
 *   WARN [ExceptionFilter] GET /kyc/status → 404 NOT_FOUND
 *
 * which this module treats as "status unreadable", so the gate fell through to
 * the form. A client who had just submitted was redirected to /kyc/submitted
 * and bounced straight back to step 1.
 *
 * ## The version is still stated once
 *
 * The root instruction is "never reintroduce /v1 into a frontend base URL",
 * from an incident where the frontends called `/api/v1/...` against a backend
 * serving bare paths and every request 404'd. That rule is about the base URL
 * client code uses, which is still `/api` and still knows nothing.
 *
 * This is the rewrite's DESTINATION, expressed once more because a server
 * fetch cannot go through the rewrite itself. It reads the same `API_ORIGIN`
 * and appends the same prefix, so the two move together.
 */
const API_VERSION_PREFIX = 'v1';

function apiBaseUrl(): string {
  /*
   * `API_ORIGIN` first, because that is what the rewrite uses and what a deploy
   * sets for server-to-server traffic — it may be an internal address the
   * browser could not reach. `NEXT_PUBLIC_API_BASE_URL` is the fallback.
   */
  const origin = process.env.API_ORIGIN?.trim() || process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (origin) return `${origin.replace(/\/+$/, '')}/${API_VERSION_PREFIX}`;

  // Same development convenience as `env.ts`, and the same refusal outside it:
  // a production server reaching localhost is the failure that rule exists for.
  if (process.env.NODE_ENV !== 'production') {
    return `http://localhost:3001/${API_VERSION_PREFIX}`;
  }
  throw new Error('API_ORIGIN or NEXT_PUBLIC_API_BASE_URL is required in production.');
}

export async function fetchKycStatus(): Promise<KycStatusDto['status'] | null> {
  const jar = await cookies();
  const header = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (!header) return null;

  try {
    const response = await fetch(`${apiBaseUrl()}/kyc/status`, {
      headers: { cookie: header },
      // Never cached: this is the value the whole gate turns on, and a cached
      // "submitted" would outlive the approval that replaced it.
      cache: 'no-store',
    });
    /*
     * A 404 here is a WIRING fault, not an answer.
     *
     * `/kyc/status` returns 200 with a null body for a client who has never
     * started — "no submission" is a real response, not a missing route. So a
     * 404 means this module is calling the wrong URL, and it did: the version
     * prefix was missing, every call 404'd, the gate read that as "unknown" and
     * fell through to the form. A client who had just submitted was redirected
     * to /kyc/submitted and bounced straight back to step 1.
     *
     * Logged rather than swallowed, because the symptom (a redirect loop) is
     * several steps from the cause and the server log is where somebody will
     * look. Still returns null — failing OPEN is right, since the API refuses
     * any write the client is not entitled to and a status endpoint that is
     * briefly down must not lock anybody out of their own onboarding.
     */
    if (!response.ok) {
      console.error(
        `[kyc] GET /kyc/status → ${response.status}. ` +
          'A 404 means the API base is wrong — see apiBaseUrl() above.',
      );
      return null;
    }

    const body = (await response.json()) as KycStatusDto | null;
    return body?.status ?? null;
  } catch (error) {
    console.error('[kyc] status read failed', error);
    return null;
  }
}
