import { describe, expect, it } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './client';

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
