import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './client';

/*
 * Mirrors the harness in the admin app's twin of this file. `axios.post` is
 * mocked rather than the network, because the refresh call deliberately bypasses
 * `apiClient` - it must not recurse through the interceptor that calls it - and
 * that bypass is exactly what the test below is about.
 *
 * Hoisted and referenced directly rather than read back off `axios.post`:
 * reading it back trips `unbound-method`, and binding it produces a DIFFERENT
 * function, so assertions would watch a copy that never records anything.
 */
const mockedPost = vi.hoisted(() => vi.fn());

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    // `axios.create` must still build a real instance, since that instance IS the
    // thing under test; only the bare `axios.post` the refresh call uses is replaced.
    default: Object.assign({}, actual.default, { post: mockedPost }),
  };
});

async function loadClient() {
  // Re-imported per test: the in-flight promise and the remembered token are
  // module state, and leaking either would make the test pass for the wrong reason.
  vi.resetModules();
  return import('./client');
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The guard that turns "the API origin is misconfigured" into a message.
 *
 * The failure it exists for produced no error at all: with
 * `NEXT_PUBLIC_API_BASE_URL` pointing at this app's own origin, the sign-in POST
 * hit the portal itself, `proxy.ts` answered a 307 to `/auth/login`, the browser
 * followed it, and axios resolved 200 carrying the sign-in page's HTML. Sign-in
 * "succeeded", `/auth/me` "succeeded", and the next navigation bounced straight
 * back to the sign-in screen with no session behind it.
 *
 * Driven through `defaults.adapter` rather than the network, because the thing
 * under test is the response interceptor and nothing below it.
 *
 * The admin app's twin of this file carries the same three cases.
 */
describe('a response that did not come from the API', () => {
  function respondWith(headers: Record<string, string>, data: unknown) {
    return (config: InternalAxiosRequestConfig): Promise<AxiosResponse> =>
      Promise.resolve({ data, status: 200, statusText: 'OK', headers, config });
  }

  it('rejects an HTML body on a request that asked for JSON', async () => {
    apiClient.defaults.adapter = respondWith(
      { 'content-type': 'text/html; charset=utf-8' },
      '<!DOCTYPE html><html><body>Sign in</body></html>',
    );

    await expect(apiClient.get('/auth/me')).rejects.toThrow(
      /points at a frontend rather than at the API/,
    );
  });

  it('lets an ordinary JSON response through untouched', async () => {
    apiClient.defaults.adapter = respondWith({ 'content-type': 'application/json' }, { id: 'c1' });

    await expect(apiClient.get('/auth/me')).resolves.toMatchObject({ data: { id: 'c1' } });
  });

  /*
   * A download must not be second-guessed on its content type. Only a request
   * that asked for JSON can conclude anything from an HTML body.
   */
  it('leaves a non-JSON request alone even when the body is HTML', async () => {
    apiClient.defaults.adapter = respondWith({ 'content-type': 'text/html' }, 'anything');

    await expect(apiClient.get('/statements', { responseType: 'blob' })).resolves.toBeDefined();
  });
});

describe('the anti-forgery token across a refresh', () => {
  /*
   * The refresh call deliberately bypasses `apiClient` so a 401 cannot recurse
   * into the interceptor that called it - and that costs the RESPONSE
   * interceptor as well as the request one.
   *
   * Refresh ROTATES the CSRF token. Dropping `X-OxShare-CSRF` off this one
   * response left the cached token pinned to the value the rotation replaced,
   * so every write after the first refresh echoed a token the API's cookie no
   * longer matched and was refused 403 for the rest of the session.
   *
   * The cross-host deployment is the case that matters and the one local
   * development hides: `readCsrfCookie()` returns undefined because the cookie
   * belongs to the API's host, which makes the remembered response token the
   * ONLY source - so losing it means no header is sent at all.
   *
   * The admin app's twin of this file carries the same case.
   */
  it('attaches the token the refresh returned, not the one it replaced', async () => {
    // Cross-host: this app cannot read the API's cookie. Cleared explicitly so a
    // leftover from another test cannot supply the token by accident.
    document.cookie = 'oxshare_crm_portal_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = '__Host-oxshare_crm_portal_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    const client = await loadClient();
    mockedPost.mockResolvedValue({
      status: 200,
      headers: { 'x-oxshare-csrf': 'token-after-rotation' },
    });

    expect(await client.refreshPortalToken()).toBe(true);

    let sent: InternalAxiosRequestConfig | undefined;
    client.apiClient.defaults.adapter = (
      config: InternalAxiosRequestConfig,
    ): Promise<AxiosResponse> => {
      sent = config;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
      });
    };

    await client.apiClient.patch('/profile', { country: 'DE' });

    expect(sent?.headers['X-OxShare-CSRF']).toBe('token-after-rotation');
  });
});

describe('proactive refresh', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.cookie = 'oxshare_crm_portal_session_hint=; Path=/; Max-Age=0';
  });

  it('fires where the CSRF cookie is unreadable but the session marker is set', async () => {
    /*
     * THE PRODUCTION TOPOLOGY. The portal and the API are different hostnames,
     * so the API's `__Host-` CSRF cookie is invisible here — and the timer used
     * to be gated on reading it, so it never fired outside localhost. The
     * session-hint marker is this app's own cookie and is what it asks now.
     */
    vi.useFakeTimers();
    document.cookie = 'oxshare_crm_portal_session_hint=1; Path=/';
    const { startProactiveRefresh, stopProactiveRefresh } = await loadClient();
    mockedPost.mockResolvedValue({ status: 200, headers: {} });

    startProactiveRefresh();
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    stopProactiveRefresh();

    expect(mockedPost).toHaveBeenCalled();
  });

  it('does not refresh while no session marker exists', async () => {
    vi.useFakeTimers();
    const { startProactiveRefresh, stopProactiveRefresh } = await loadClient();
    mockedPost.mockResolvedValue({ status: 200, headers: {} });

    startProactiveRefresh();
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    stopProactiveRefresh();

    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('a 401 on a public page', () => {
  /*
   * `/auth/login`, `/auth/forgot-password`, `/verify-email/pending` all ask
   * `/auth/me` on mount. For a visitor who was never signed in that 401 is the
   * answer and a refresh would be two guaranteed-to-fail requests per cold
   * load. For a client whose access token lapsed — the normal state of anyone
   * returning after fifteen minutes — it is a session to renew, and skipping it
   * shows them the sign-in form over a live session. The session-hint marker
   * tells the two apart; the CSRF cookie used to, and cannot off localhost.
   */
  afterEach(() => {
    document.cookie = 'oxshare_crm_portal_session_hint=; Path=/; Max-Age=0';
    window.history.pushState({}, '', '/');
  });

  function answer401ThenOk(apiClient: import('axios').AxiosInstance) {
    let calls = 0;
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(
          Object.assign(new Error('401'), {
            config,
            response: { status: 401, data: {}, headers: {}, statusText: '', config },
            isAxiosError: true,
          }),
        );
      }
      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };
  }

  it('is not renewed when no session marker exists', async () => {
    window.history.pushState({}, '', '/auth/login');
    const { apiClient } = await loadClient();
    answer401ThenOk(apiClient);

    await expect(apiClient.get('/auth/me')).rejects.toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('IS renewed when the session marker says there is a session to renew', async () => {
    window.history.pushState({}, '', '/auth/login');
    document.cookie = 'oxshare_crm_portal_session_hint=1; Path=/';
    const { apiClient } = await loadClient();
    answer401ThenOk(apiClient);
    mockedPost.mockResolvedValue({ status: 200, headers: {} });

    const res = await apiClient.get('/auth/me');
    expect(res.status).toBe(200);
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});

describe('a refresh that lost a race', () => {
  it('retries once on SESSION_SUPERSEDED and keeps the session', async () => {
    /*
     * Pins the status the backend answers with: 401 + code SESSION_SUPERSEDED.
     * This interceptor and the admin's both branch on the CODE before the
     * status, so the 401 must never be read as a dead session — this is the
     * assertion that it is not.
     */
    const { refreshPortalToken } = await loadClient();
    mockedPost
      .mockRejectedValueOnce({ response: { status: 401, data: { code: 'SESSION_SUPERSEDED' } } })
      .mockResolvedValueOnce({ status: 200, headers: {} });

    expect(await refreshPortalToken()).toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});

describe('a refresh the API never answered is NOT a dead session', () => {
  /*
   * The rule this file introduced and the admin twin later adopted: only a
   * REFUSED refresh (401) ends the session. A 5xx or a request that never got
   * an answer is the API being unreachable, which must not evict anyone —
   * reachable mid-KYC on a phone, which is this portal's primary device.
   * These tests pin the outcome mapping so neither twin can drift back.
   */
  it('resolves unreachable for a 5xx, dead for a 401, renewed for a 200', async () => {
    const { refreshPortalSession } = await loadClient();

    mockedPost.mockRejectedValueOnce({ response: { status: 502, data: {} } });
    expect(await refreshPortalSession()).toBe('unreachable');

    mockedPost.mockRejectedValueOnce(Object.assign(new Error('network'), {}));
    expect(await refreshPortalSession()).toBe('unreachable');

    mockedPost.mockRejectedValueOnce({ response: { status: 401, data: {} } });
    expect(await refreshPortalSession()).toBe('dead');

    mockedPost.mockResolvedValueOnce({ status: 200, headers: {} });
    expect(await refreshPortalSession()).toBe('renewed');
  });

  function answer401(apiClient: import('axios').AxiosInstance) {
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> =>
      Promise.reject(
        Object.assign(new Error('401'), {
          config,
          response: { status: 401, data: {}, headers: {}, statusText: '', config },
          isAxiosError: true,
        }),
      );
  }

  it('keeps the session marker when the refresh cannot reach the API', async () => {
    window.history.pushState({}, '', '/dashboard');
    document.cookie = 'oxshare_crm_portal_session_hint=1; Path=/';
    const { apiClient } = await loadClient();
    answer401(apiClient);
    mockedPost.mockRejectedValue({ response: { status: 502, data: {} } });

    await expect(apiClient.get('/wallet')).rejects.toBeTruthy();
    expect(document.cookie).toContain('oxshare_crm_portal_session_hint=1');
    window.history.pushState({}, '', '/');
  });

  it('still ends the session when the API answers the refresh with a real 401', async () => {
    window.history.pushState({}, '', '/dashboard');
    document.cookie = 'oxshare_crm_portal_session_hint=1; Path=/';
    const { apiClient } = await loadClient();
    answer401(apiClient);
    mockedPost.mockRejectedValue({ response: { status: 401, data: {} } });

    await expect(apiClient.get('/wallet')).rejects.toBeTruthy();
    expect(document.cookie).not.toContain('oxshare_crm_portal_session_hint=1');
    window.history.pushState({}, '', '/');
  });
});
