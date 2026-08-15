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
 * The API host, read at REQUEST time and deliberately not via `lib/env`.
 *
 * Importing anything from `./env` evaluates its `API_BASE_URL` const, which
 * calls `resolveServerBaseUrl()` on module load and THROWS when
 * `NEXT_PUBLIC_API_BASE_URL` is unset in production. Next evaluates this module
 * while collecting route configuration at build time — where that variable is
 * legitimately absent for any deploy that supplies it at run time — so the
 * import alone failed the build with "Failed to collect configuration for
 * /kyc".
 *
 * The validation in `env.ts` is right and stays as it is for every client-side
 * caller. What is wrong is paying it during a build that is not serving
 * anything, so this reads the variable itself and falls back only in
 * development, matching what `resolveServerBaseUrl` does.
 */
function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured;
  // Same development convenience as `env.ts`, and the same refusal outside it:
  // a production server reaching localhost is the failure that rule exists for.
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3001';
  throw new Error('NEXT_PUBLIC_API_BASE_URL is required in production.');
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
    if (!response.ok) return null;

    const body = (await response.json()) as KycStatusDto | null;
    return body?.status ?? null;
  } catch {
    return null;
  }
}
