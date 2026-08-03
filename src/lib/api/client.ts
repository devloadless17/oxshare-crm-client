import axios from 'axios';
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

// The backend reads the cookie (cookies travel via withCredentials). The header
// is kept only for tooling that replays requests outside the browser.
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('access_token');
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
const ACCESS_TOKEN_DAYS = 1 / 96; // 15 minutes
const REFRESH_TOKEN_DAYS = 30;

export function setSessionCookies(accessToken: string, refreshToken?: string): void {
  Cookies.set('access_token', accessToken, {
    expires: ACCESS_TOKEN_DAYS,
    path: '/',
    sameSite: 'lax',
  });
  if (refreshToken) {
    Cookies.set('refresh_token', refreshToken, {
      expires: REFRESH_TOKEN_DAYS,
      path: '/',
      sameSite: 'lax',
    });
  }
}

export function clearSession(): void {
  Cookies.remove('access_token', { path: '/' });
  Cookies.remove('refresh_token', { path: '/' });
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
      const refreshToken = Cookies.get('refresh_token');
      // snake_case: the client-portal endpoints answer access_token /
      // refresh_token, unlike the admin API's camelCase. Reading both "just in
      // case" is how a rename goes unnoticed until a session silently stops
      // refreshing, so this asserts the one shape the backend actually sends.
      const { data } = await axios.post<{ access_token?: string; refresh_token?: string }>(
        `${API_BASE_URL}/auth/refresh`,
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
      if (Cookies.get('refresh_token')) void refreshPortalToken();
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url: string = originalRequest?.url || '';
    const isAuthEndpoint = /\/(auth|identity)\/(login|register|verify-email|refresh)/.test(url);

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const newToken = await refreshPortalToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
      clearSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/login')) {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  },
);
