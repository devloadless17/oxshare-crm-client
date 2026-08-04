// NEAR-TWIN of the same path in oxshare-crm-admin: the structure and the logic below the
// twin:config block are intentionally identical, and a behaviour change belongs in
// BOTH. It is excluded from scripts/check-twins.sh because two differences cannot
// be reduced to config — the exported function names (used across each app) and
// the token casing (the admin API answers camelCase, the portal snake_case, which
// is frozen). Diff the two by hand when changing either.

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL =
  typeof window !== 'undefined'
    ? '/api'
    : process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ─── twin:config:start ────────────────────────────────────────────────────────
// The ONLY part of this file that differs from its twin. Everything below the
// end marker must stay identical in both apps; scripts/check-twins.sh enforces
// that by excluding this block and comparing the rest.
//
// Cookie lifetimes must match the tokens inside them: proxy.ts gates private
// routes on the mere PRESENCE of the access cookie, so a cookie that outlives
// its JWT waves the user through to a page where every request 401s.
const REFRESH_PATH = '/auth/refresh';
const AUTH_ENDPOINT_PATTERN = /\/(auth|identity)\/(login|register|verify-email|refresh)/;
const LOGIN_PATH = '/auth/login';
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
const CSRF_HEADER = 'X-OxShare-CSRF';

/**
 * Reads the CSRF cookie under both spellings.
 *
 * The name gains a `__Host-` prefix wherever the deployment has TLS, because
 * that prefix is what stops another OxShare site writing this cookie — the
 * browser enforces Secure + Path=/ + no Domain on it, so a sibling host cannot
 * create, overwrite or shadow it. Plain HTTP on localhost cannot satisfy Secure,
 * hence two spellings and one reader. Prefer the prefixed one: if both somehow
 * exist, the prefixed cookie is the one nothing else could have set.
 */
function readCsrfCookie(): string | undefined {
  return Cookies.get('__Host-oxshare_csrf') ?? Cookies.get('oxshare_csrf');
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
}

/**
 * Single-flight refresh.
 *
 * Rotation invalidates the presented refresh token, so N concurrent 401s fired
 * N rotations — the 2nd..Nth each presented an already-rotated token, failed,
 * and dumped the user on the login screen mid-session. Every caller now awaits
 * the one in-flight promise.
 */
let inFlight: Promise<string | null> | null = null;

export function refreshPortalToken(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // No body: the refresh token is an httpOnly cookie the browser attaches,
      // and the API accepts it from nowhere else (R-3.1 — two credential
      // channels for one session means two threat models). Nothing to read,
      // nothing to send, nothing to leak.
      //
      // snake_case is still asserted here rather than reading both casings:
      // these endpoints answer access_token, and reading both "just in case" is
      // how a rename goes unnoticed until sessions silently stop refreshing.
      const { data } = await axios.post<{ access_token?: string }>(
        `${API_BASE_URL}${REFRESH_PATH}`,
        {},
        { withCredentials: true },
      );
      // The rotated cookies — session and CSRF — arrive on the response and are
      // installed by the browser. A truthy answer just means "the session lives".
      return data.access_token ?? 'refreshed';
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined;
    const url = originalRequest?.url ?? '';
    const isAuthEndpoint = AUTH_ENDPOINT_PATTERN.test(url);

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      const refreshed = await refreshPortalToken();
      if (refreshed) {
        // No header to re-attach: the rotated session cookie travels on its own.
        // The CSRF header is rebuilt by the request interceptor on the retry,
        // which matters because refresh ROTATES the token — replaying the old
        // one would fail the binding check.
        return apiClient(originalRequest);
      }
      clearSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith(LOGIN_PATH)) {
        // A HARD navigation, deliberately, against @next/next's advice to use
        // router.push. The session is dead: a client-side push keeps the same JS
        // context alive, so the React Query cache, the user context and any
        // rendered wallet data survive into the login screen. A full load is what
        // discards them. Same reasoning in UserContext.logout.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = LOGIN_PATH;
      }
    }
    // Rethrow the original AxiosError, never a wrapped one: every caller reads
    // `error.response.data.message` through apiErrorMessage, and the 401 branch
    // above depends on `error.response.status`. AxiosError extends Error, which
    // is what prefer-promise-reject-errors wants.
    return Promise.reject(error);
  },
);
