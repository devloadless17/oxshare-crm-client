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
const ACCESS_TOKEN_DAYS = 1 / 96; // 15 minutes — matches the portal access token lifetime
const REFRESH_TOKEN_DAYS = 30;
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/auth/refresh';
const AUTH_ENDPOINT_PATTERN = /\/(auth|identity)\/(login|register|verify-email|refresh)/;
const LOGIN_PATH = '/auth/login';
// ─── twin:config:end ──────────────────────────────────────────────────────────

// The backend reads the cookie (cookies travel via withCredentials). The header
// is kept only for tooling that replays requests outside the browser.
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get(ACCESS_COOKIE);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Cookie lifetimes must match the tokens inside them.
 *
 * proxy.ts gates every private route on the mere PRESENCE of access_token. The
 * refresh path used to write that cookie with a 7-day expiry while the JWT
 * inside it lives 15 minutes — so for the next 7 days the proxy waved the user
 * through to a page where every request 401s. Both writers use these now.
 */

export function setSessionCookies(accessToken: string, refreshToken?: string): void {
  Cookies.set(ACCESS_COOKIE, accessToken, {
    expires: ACCESS_TOKEN_DAYS,
    path: '/',
    sameSite: 'lax',
  });
  if (refreshToken) {
    Cookies.set(REFRESH_COOKIE, refreshToken, {
      expires: REFRESH_TOKEN_DAYS,
      path: '/',
      sameSite: 'lax',
    });
  }
}

export function clearSession(): void {
  Cookies.remove(ACCESS_COOKIE, { path: '/' });
  Cookies.remove(REFRESH_COOKIE, { path: '/' });
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
      const refreshToken = Cookies.get(REFRESH_COOKIE);
      // snake_case: the client-portal endpoints answer access_token /
      // refresh_token, unlike the admin API's camelCase. Reading both "just in
      // case" is how a rename goes unnoticed until a session silently stops
      // refreshing, so this asserts the one shape the backend actually sends.
      const { data } = await axios.post<{ access_token?: string; refresh_token?: string }>(
        `${API_BASE_URL}${REFRESH_PATH}`,
        { refreshToken },
        { withCredentials: true },
      );
      if (data.access_token) {
        setSessionCookies(data.access_token, data.refresh_token);
        return data.access_token;
      }
      return null;
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
  proactiveTimer = setInterval(
    () => {
      if (Cookies.get(REFRESH_COOKIE)) void refreshPortalToken();
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
      const newToken = await refreshPortalToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
      clearSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith(LOGIN_PATH)) {
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
