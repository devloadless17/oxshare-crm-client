// NEAR-TWIN of the same path in oxshare-crm-admin: the structure and the logic below the
// twin:config block are intentionally identical, and a behaviour change belongs in
// BOTH. It is excluded from scripts/check-twins.sh because two differences cannot
// be reduced to config — the exported function names (used across each app) and
// the token casing (the admin API answers camelCase, the portal snake_case, which
// is frozen). Diff the two by hand when changing either.

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
// Resolved and validated in `lib/env.ts`, which refuses a production build with
// no NEXT_PUBLIC_API_BASE_URL rather than silently falling back to localhost.
import { API_BASE_URL } from '../env';
import { clearKycDraft } from '../kyc-draft';
import { clearWithdrawIntent } from '../withdraw-intent';
// PER-APP, and logically part of the twin:config block below — see the note
// there. It sits up here because an import cannot.
import { LOGIN_PATH, loginPathFor } from '../return-to';
// The single definition of "reachable without a session", shared with proxy.ts.
import { isPublicPath } from '../public-paths';
import { announceSessionEvent, withSessionLock } from '../session-channel';

/**
 * A request that never finishes must eventually fail.
 *
 * axios defaults `timeout` to 0, which means NO timeout: on a dying mobile
 * connection a request hangs until the browser or OS gives up, which can be
 * minutes. The KYC upload is where that hurts most — a stalled upload sat behind
 * a spinner reading "please wait" with no way to tell it from a slow one and no
 * cancel button.
 *
 * 60s rather than something tight: this ceiling has to clear the slowest
 * LEGITIMATE request, and that is a multi-megabyte document upload over mobile
 * data. A shorter timeout would start failing real uploads, which is worse than
 * the problem it solves. It is a backstop against hanging, not a latency budget.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── twin:config:start ────────────────────────────────────────────────────────
// The ONLY part of this file that differs from its twin. Everything below the
// end marker must stay identical in both apps; scripts/check-twins.sh enforces
// that by excluding this block and comparing the rest.
//
// `proxy.ts` gates private routes on the presence of the REFRESH cookie — not
// the access cookie, which lives fifteen minutes and would bounce a returning
// client whose thirty-day session is perfectly valid. (This comment said
// "access cookie" long after that changed, which is the stale-literal class
// that has disarmed a check in this system three times.)
const REFRESH_PATH = '/auth/refresh';
/*
 * Endpoints where a 401 is the ANSWER, not an expired access token.
 *
 * Refresh-then-replay is right for an authenticated endpoint whose token has
 * merely aged out. It is wrong for these, where 401 means "those credentials are
 * no good" — and getting it wrong is not cosmetic: a refused sign-in triggered a
 * doomed refresh and then the dead-session redirect, so a typo'd password could
 * navigate the client away from the form they were typing into.
 *
 * `logout`, `forgot-password` and `reset-password` are the additions. Recovery
 * runs from a browser that still holds a stale session cookie — that is the
 * normal state of the device somebody is locked out on — so a 401 there says the
 * emailed token is bad, and renewing a session changes nothing about that.
 *
 * `me` is deliberately NOT here, against the review's suggestion. It is the one
 * request that MUST refresh-and-replay: a client returning after fifteen minutes
 * has an expired access token and a valid thirty-day session, and `/auth/me` is
 * the first call of the page. Excluding it would resolve their profile to null
 * and `RequireAuth` would send a perfectly signed-in client to the login screen.
 * The cost the review names — one doomed refresh per anonymous page load — is
 * real and is the correct trade against that.
 *
 * `change-password`, `sessions` and `resend-verification` are likewise absent on
 * purpose: they are authenticated, so a 401 from them is an aged token and
 * renewal is exactly right.
 */
const AUTH_ENDPOINT_PATTERN =
  /\/(auth|identity)\/(login|register|verify-email|refresh|logout|forgot-password|reset-password)/;
// `LOGIN_PATH` and `loginPathFor` are the third per-app value, and they are
// IMPORTED (see the top of the file) rather than written here, from
// lib/return-to.ts. The proxy, the sign-in page and this interceptor must agree
// on where sign-in lives and on how "where I was going" is encoded; three
// copies of that answer is how they stop agreeing — and one of the three is an
// open-redirect check. Admin's twin has no such module and keeps its own
// literal, so this is a real divergence and belongs on the list; it just cannot
// physically sit between the markers.
// ─── twin:config:end ──────────────────────────────────────────────────────────

/**
 * The session travels as httpOnly cookies, which the browser attaches on its own
 * (`withCredentials` above). There is nothing for JS to read and nothing to
 * attach — the `Authorization: Bearer` header this interceptor used to build was
 * decorative even then, because the API has only ever read the cookie.
 *
 * What IS attached here is the anti-forgery token
 * (PLATFORM-CONVENTIONS §3.0 / R-3.6). The CSRF cookie is deliberately readable
 * by JS — it is a proof of same-origin, not a credential — and echoing it into a
 * header is the half a cross-origin page cannot perform, because setting a custom
 * header triggers a CORS preflight the API refuses.
 */
apiClient.interceptors.request.use((config) => {
  config.headers['X-Request-Id'] = newCorrelationId();

  if (STATE_CHANGING.test(config.method ?? 'get')) {
    const csrf = readCsrfCookie();
    if (csrf) config.headers[CSRF_HEADER] = csrf;
  }
  return config;
});

const STATE_CHANGING = /^(post|put|patch|delete)$/i;
export const CSRF_HEADER = 'X-OxShare-CSRF';

/**
 * Reads THIS app's CSRF cookie, under both spellings.
 *
 * Per-surface, not shared: cookies are scoped by host and path and ignore the
 * port, so on localhost the portal and the admin app share one cookie jar. A
 * single shared name meant logging into one app silently overwrote the other's
 * token — and, worse, made the other app's login look like an authenticated
 * request that was missing its anti-forgery header.
 *
 * The name gains a `__Host-` prefix wherever the deployment has TLS, because
 * that prefix is what stops another OxShare site writing this cookie — the
 * browser enforces Secure + Path=/ + no Domain on it, so a sibling host cannot
 * create, overwrite or shadow it. Plain HTTP on localhost cannot satisfy Secure,
 * hence two spellings and one reader. Prefer the prefixed one: if both somehow
 * exist, the prefixed cookie is the one nothing else could have set.
 */
/**
 * The two spellings of this app's CSRF cookie, in order of preference.
 *
 * Exported so `cookie-contract.test.ts` pins the actual values rather than a
 * copy of them — the backend computes these names and this repo hardcodes them,
 * with nothing connecting the two (separate repos, no shared package). A rename
 * there compiles here, passes type-checking, and then logs everyone out.
 */
export const CSRF_COOKIE_NAMES = [
  '__Host-oxshare_crm_portal_csrf',
  'oxshare_crm_portal_csrf',
] as const;

function readCsrfCookie(): string | undefined {
  return Cookies.get(CSRF_COOKIE_NAMES[0]) ?? Cookies.get(CSRF_COOKIE_NAMES[1]);
}

/**
 * A correlation id for one request — PLATFORM-CONVENTIONS R-6.1.
 *
 * The API already accepts an inbound `x-request-id`, runs the request inside an
 * AsyncLocalStorage context keyed on it, stamps it on every log line and returns
 * it in the error envelope. What was missing was anyone sending one: the chain
 * started at the API, so a user saying "I clicked approve and nothing happened"
 * could not be tied to a request, and nothing joined a browser error to a server
 * log line.
 *
 * Generated per REQUEST, not per session — the id has to identify one call for a
 * log search to mean anything.
 *
 * The backend validates the shape (`/^[\w-]{8,128}$/`) before letting it into a
 * log, so anything non-conforming is replaced server-side rather than trusted.
 * The fallback below exists because `crypto.randomUUID` is undefined on insecure
 * origins and in some test environments; it only has to be unique enough to
 * correlate one request, never to be unguessable.
 */
function newCorrelationId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A key identifying ONE intended money operation — PLATFORM-CONVENTIONS R-5.2.
 *
 * Money-moving endpoints require an `Idempotency-Key`, and the value belongs to
 * the user's INTENT, not to the HTTP call. Generate it once when the user starts
 * an operation (opening the withdrawal form, say) and reuse that same value for
 * every attempt at it — that is what makes a double-click, a flaky network and a
 * "did that go through?" refresh all resolve to a single withdrawal.
 *
 * Deliberately NOT generated automatically per request: a fresh key on every
 * call would make each duplicate look like a new operation, which is precisely
 * the bug this exists to prevent. The request interceptor does preserve a key
 * that is already set, so the 401-refresh retry reuses it rather than minting a
 * new one.
 */
export function newIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Axios config carrying the key. `api.post(url, body, idempotent(key))`. */
export function idempotent(key: string) {
  return { headers: { 'Idempotency-Key': key } };
}

/**
 * There is no session-cookie writer here any more, deliberately.
 *
 * The server sets `httpOnly` cookies (PLATFORM-CONVENTIONS R-3.2), so this app
 * cannot read or write them — which is the entire point. Previously it wrote
 * them itself from the login response, which meant the access token and a
 * 30-day refresh token sat in `document.cookie`, readable by any XSS, any
 * compromised transitive dependency and any browser extension on this origin.
 * On a portal that also handles KYC documents and wallet balances, that is the
 * whole account.
 *
 * Ending a session is now a server call, not a local delete: only the server can
 * clear an httpOnly cookie, and only the server can revoke the refresh token
 * behind it. A local delete was always the weaker half — it left the refresh
 * token valid for 30 days.
 */
export function clearSession(): void {
  stopProactiveRefresh();
  /*
   * This still wipes the draft, and that is still right — because the only
   * callers left are a session that ENDED.
   *
   * It used to also run when a refresh failed for a TRANSPORT reason — flaky
   * wifi mid-KYC, which on a phone is the ordinary way this fails. The client
   * was signed out, returned to the right step afterwards, and every field was
   * empty, with nothing anywhere explaining why. A five-minute form lost to a
   * one-second blip.
   *
   * The fix is upstream rather than a flag here: the interceptor no longer treats
   * an unanswered refresh as a dead session at all, so it never reaches this
   * function. "This session is over" therefore means one thing again, and a
   * caller cannot half-mean it.
   */
  /*
   * The half-filled KYC form holds the client's full name, date of birth and
   * address, and `sessionStorage` survives the hard navigation to the login
   * screen that follows a dead session.
   *
   * `UserContext.logout` already cleared it, so a client who signs out
   * deliberately was covered. A session that DIES — a revoked token, a 30-day
   * refresh finally expiring, a password change elsewhere — takes the 401 path
   * instead, and left the previous client's identity documents readable in the
   * next person's tab. On a shared machine that is the case that matters, and
   * it is the one nobody chooses.
   *
   * Here rather than at the call site, so "this session is over" means the same
   * thing however it ended.
   *
   * The withdrawal intent goes with it, for the same reason and one more: it
   * carries an amount and a payout destination, which on a shared device is
   * financial detail about the previous person, and a restored intent belonging
   * to somebody else is not a form the next client should ever see.
   */
  clearKycDraft();
  clearWithdrawIntent();
}

/**
 * Single-flight refresh.
 *
 * Rotation invalidates the presented refresh token, so N concurrent 401s fired
 * N rotations — the 2nd..Nth each presented an already-rotated token, failed,
 * and dumped the user on the login screen mid-session. Every caller now awaits
 * the one in-flight promise.
 */
let inFlight: Promise<RefreshOutcome> | null = null;

/**
 * A refused refresh versus one that never got an answer.
 *
 * 401 is the API saying no. Anything else — no response at all, a 5xx, a
 * timeout — is us being unable to ask, which is a different fact and must not be
 * rendered, or acted on, as though the session had ended.
 */
function outcomeOf(error: unknown): 'dead' | 'unreachable' {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === undefined) return 'unreachable';
  return status >= 500 ? 'unreachable' : 'dead';
}

/**
 * Did the API say this refresh merely LOST A RACE?
 *
 * `SESSION_SUPERSEDED` is the one 401 on this path that does not mean the
 * session is over — see the backend's domain-errors.ts. Branching on the machine
 * code rather than the message, because the message is prose that changes and
 * will be translated (D-16).
 */
function supersededCode(error: unknown): boolean {
  const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
  return code === 'SESSION_SUPERSEDED';
}

/**
 * Why a refresh did not renew the session.
 *
 * `dead` — the API refused the refresh token: revoked, expired, replayed. The
 * session is genuinely over and everything tied to it should go.
 *
 * `unreachable` — nothing answered, or it answered 5xx. We do NOT know that the
 * session is over, and treating it as though we did is what destroyed a
 * half-filled KYC form on a dropped connection.
 */
export type RefreshOutcome = 'renewed' | 'dead' | 'unreachable';

/**
 * The real refresh. `refreshPortalToken` is the boolean face of it, kept because
 * that is what the rest of the app and its tests already call.
 */
export function refreshPortalSession(): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let retrying = false;
    /*
     * Single-flight ACROSS TABS as well as within one.
     *
     * `inFlight` above is module scope, which is per tab, and each tab runs its
     * own ten-minute timer — so a phone waking with several tabs open fires
     * several refreshes at one rotating token. The lock serialises them; see
     * lib/session-channel.ts for why it waits rather than short-circuiting.
     */
    return withSessionLock(async () => {
      try {
        /*
         * No body: the refresh token is an httpOnly cookie the browser attaches,
         * and the API accepts it from nowhere else (R-3.1 — two credential
         * channels for one session means two threat models). Nothing to read,
         * nothing to send, nothing to leak.
         *
         * Deliberately NOT through `apiClient`, so a 401 here cannot recurse into
         * the response interceptor that called it. The cost of stepping outside is
         * that the request interceptor does not run, so the correlation id has to
         * be attached by hand — R-6.1. It was not, and this is the single request
         * you most want to trace when a session dies for no visible reason.
         *
         * No CSRF header, and that is correct: the API marks this route `@NoCsrf`
         * precisely because the anti-forgery token expires alongside the access
         * token, and demanding one here would lock out the returning client this
         * call exists to renew.
         */
        await axios.post(
          `${API_BASE_URL}${REFRESH_PATH}`,
          {},
          { withCredentials: true, headers: { 'X-Request-Id': newCorrelationId() } },
        );
        /*
         * A boolean, because there is nothing else to return.
         *
         * This used to resolve the literal string `'refreshed'` — a placeholder
         * shaped like the access token that used to come back in the body. The
         * token is gone (R-3.2): the rotated cookies arrive on the response and
         * the browser installs them, so reaching 200 IS the result. A `string |
         * null` signature invites the next reader to put a credential back into
         * JavaScript, which is exactly what this migration removed.
         */
        return 'renewed' as const;
      } catch (error) {
        /*
         * `SESSION_SUPERSEDED` means the session is ALIVE — retry, do not sign
         * out. Another request rotated the same token first, so the winner's
         * cookies are already in this browser's jar and a second attempt
         * succeeds against them.
         *
         * The lock serialises but does not eliminate the race: a request already
         * in flight when the winner committed cannot be recalled. Without this
         * retry the losing tab treats a live session as dead — and, since
         * `endDeadSession` now tells the other tabs, takes them with it.
         */
        if (supersededCode(error) && !retrying) {
          retrying = true;
          try {
            await axios.post(
              `${API_BASE_URL}${REFRESH_PATH}`,
              {},
              { withCredentials: true, headers: { 'X-Request-Id': newCorrelationId() } },
            );
            return 'renewed' as const;
          } catch (retryError) {
            return outcomeOf(retryError);
          }
        }
        return outcomeOf(error);
      }
    });
  })().finally(() => {
    // Released here rather than inside the lock, so the in-tab dedupe covers the
    // whole operation INCLUDING the wait for the cross-tab lock.
    inFlight = null;
  });
  return inFlight;
}

/** The boolean face of `refreshPortalSession`, for callers that only need "did it work". */
export function refreshPortalToken(): Promise<boolean> {
  return refreshPortalSession().then((outcome) => outcome === 'renewed');
}

// Started once a session exists, stopped on logout. The old version was a
// module-scope setInterval that ran forever — including on the login screen,
// where it refreshed nothing every 10 minutes for the life of the tab.
let proactiveTimer: ReturnType<typeof setInterval> | null = null;

export function startProactiveRefresh(): void {
  if (typeof window === 'undefined' || proactiveTimer) return;
  // Gated on the CSRF cookie rather than the refresh cookie: it is the one
  // cookie this app can still see, it is set and cleared alongside the session,
  // and so it is an accurate "a session exists" signal without being a credential.
  proactiveTimer = setInterval(
    () => {
      if (readCsrfCookie()) void refreshPortalToken();
    },
    10 * 60 * 1000,
  );
}

export function stopProactiveRefresh(): void {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
}

/**
 * A request we have already retried once.
 *
 * `_retry` is our own marker, not an axios field, so it is declared rather than
 * bolted onto an `any`. Without the type, every line of the interceptor below
 * was an unchecked member access on `any` — which is how a typo like
 * `error.reponse?.status` would have gone unnoticed on the session-expiry path.
 */
type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * Ends a session the server has stopped honouring, and gets the client out.
 *
 * Extracted because there are two arrivals — the refresh failed, and the
 * refresh succeeded but the retry still 401'd — and only the first of them used
 * to do this. Two paths to "this session is over" that behaved differently is
 * how the second one went unnoticed.
 *
 * The redirect carries `?next=`, so a session that dies mid-task returns the
 * client to where they were once they sign in again rather than to the
 * dashboard. `safeReturnTo` re-checks it on the way back out; see its comment
 * for why a value we generated still cannot be trusted when it is read.
 */
function endDeadSession(): void {
  /*
   * A session that never existed cannot have died.
   *
   * `/auth/me` answers 401 for a signed-out visitor, which is the ORDINARY case
   * on every public page. This branch once treated that identically to an
   * expired session — it refreshed, got another 401, and hard-navigated to the
   * sign-in screen. So a visitor who opened /auth/register was thrown off it
   * before they could type, landing on /auth/login?next=/auth/register. Nobody
   * could sign up. The same happened on forgot-password and reset-password, the
   * two pages a locked-out client reaches for.
   *
   * The check that fixed it now lives below, against `isPublicPath` rather than
   * against the CSRF cookie — see the comment there for why the cookie was the
   * wrong signal for the right question.
   */
  clearSession();
  if (typeof window === 'undefined') return;
  /*
   * Nothing to evict anyone from: these pages are meant to work signed out.
   *
   * This replaces `readCsrfCookie() !== undefined`. The intent was right — a
   * visitor who never had a session must not be thrown off /auth/register — but
   * the signal was wrong, because the server clears the CSRF cookie for the
   * WHOLE browser on logout and it expires 8 hours in against the refresh
   * cookie's 30 days. So a tab whose session had genuinely died concluded nobody
   * had ever been signed in, and kept rendering the client's name and balance.
   *
   * `isPublicPath` asks the question directly, from the one list `proxy.ts` also
   * reads. The comment this replaces rejected a path list because a second copy
   * would drift; there is no second copy.
   */
  if (isPublicPath(window.location.pathname)) return;
  if (window.location.pathname.startsWith(LOGIN_PATH)) return;

  /*
   * Tell the other tabs — but only now that we know this is a real eviction.
   *
   * Announcing ABOVE, before the public-path check, is what produced an
   * infinite reload after signing out: every load of /auth/login answers 401 on
   * `/auth/me`, which reaches this function, which announced — and the same
   * document's own listener heard it and reloaded. `session-channel.ts` now
   * ignores self-sent messages, and this ordering means a public page does not
   * broadcast at all. Either alone would fix the loop; both are correct
   * independently, and a broadcast from a page where nobody was signed in was
   * never meaningful.
   */
  announceSessionEvent('signed-out');
  // A HARD navigation, deliberately, against @next/next's advice to use
  // router.push. The session is dead: a client-side push keeps the same JS
  // context alive, so the React Query cache, the user context and any
  // rendered wallet data survive into the login screen. A full load is what
  // discards them. Same reasoning in UserContext.logout.

  window.location.href = loginPathFor(window.location.pathname, window.location.search);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined;
    const url = originalRequest?.url ?? '';
    const isAuthEndpoint = AUTH_ENDPOINT_PATTERN.test(url);

    if (error.response?.status === 401 && originalRequest && !isAuthEndpoint) {
      /*
       * `outcome` is threaded through rather than collapsed to a boolean,
       * because "the API refused this token" and "we could not ask" have to end
       * differently. Collapsing them is what wiped a half-filled KYC form on a
       * dropped connection: the two were indistinguishable here, so the
       * transport failure took the dead-session path and cleared the draft.
       */
      let outcome: RefreshOutcome = 'dead';

      /*
       * On a public page there is nothing to renew, so do not ask.
       *
       * `UserContext` asks `/auth/me` on mount everywhere, including
       * `/auth/login`, `/auth/register` and `/verify-email/pending`, and a
       * signed-out visitor's 401 there is the correct answer to "is anyone
       * here". Answering it with a real `POST /auth/refresh` meant TWO
       * guaranteed-to-fail requests on every cold load of the most-visited pages
       * in the portal — visible in the API log as a `/auth/me 401` immediately
       * followed by a `/auth/refresh 401 SESSION_REVOKED`, over and over.
       *
       * It is not only noise: that route is throttled at 20/min, and a shared
       * office or mobile-carrier IP reaches that on ordinary traffic.
       *
       * THE CSRF COOKIE IS PART OF THE CONDITION, and leaving it out was a
       * regression I nearly shipped. A signed-in client whose access token has
       * lapsed — the ordinary state of anyone returning after fifteen minutes —
       * may well land on `/auth/login` from a bookmark. Skipping the renewal
       * there resolves their profile to null, so `RedirectIfAuthenticated` never
       * fires and they are shown a sign-in form over a live session: exactly the
       * defect the reverse gate exists to prevent.
       *
       * The cookie is a sound signal HERE, unlike in `endDeadSession`, because
       * this is an optimisation rather than a correctness decision. A false
       * negative costs one wasted request — the old behaviour. A false positive
       * costs one renewal attempt, which is what should happen anyway.
       */
      if (
        typeof window !== 'undefined' &&
        isPublicPath(window.location.pathname) &&
        readCsrfCookie() === undefined
      ) {
        return Promise.reject(error);
      }

      if (!originalRequest._retry) {
        originalRequest._retry = true;
        outcome = await refreshPortalSession();
        if (outcome === 'renewed') {
          // No header to re-attach: the rotated session cookie travels on its own.
          // The CSRF header is rebuilt by the request interceptor on the retry,
          // which matters because refresh ROTATES the token — replaying the old
          // one would fail the binding check.
          return apiClient(originalRequest);
        }
      }
      /*
       * Reached by BOTH ways a 401 can turn out to be terminal, which it was
       * not before: the `_retry` check used to guard the whole branch, so a
       * request that refreshed successfully and then 401'd again fell straight
       * through to the rethrow with no `clearSession()` and no redirect.
       *
       * That second 401 is not a hypothetical. It is what the API answers when
       * the rotation succeeded but the account behind it no longer passes —
       * deleted, suspended (`jwt.strategy.ts` rejects a suspended user on the
       * next request, live token or not), or logged out from another device
       * between the two calls. The client sat on a fully rendered portal with a
       * dead session and no way to find out, because every subsequent request
       * took the same path and stopped in the same place.
       *
       * A second 401 after a SUCCESSFUL rotation is genuinely dead — the server
       * answered, and its answer was no. Only a refresh that never got an answer
       * is `unreachable`, which is why the default above is `dead`.
       *
       * And an `unreachable` refresh ends nothing at all. We do not know the
       * session is over; we know we could not ask. Signing the client out on that
       * basis is a network blip logging somebody out — reachable mid-KYC on a
       * phone, which is this portal's primary device. The 401 propagates instead,
       * the page renders its own error with a retry, and the session, the timer
       * and the half-filled form all survive.
       */
      if (outcome !== 'unreachable') endDeadSession();
    }
    // Rethrow the original AxiosError, never a wrapped one: every caller reads
    // `error.response.data.message` through apiErrorMessage, and the 401 branch
    // above depends on `error.response.status`. AxiosError extends Error, which
    // is what prefer-promise-reject-errors wants.
    return Promise.reject(error);
  },
);
