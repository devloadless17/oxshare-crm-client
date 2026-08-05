import type { components } from './types.gen';
import { apiClient, clearSession, startProactiveRefresh } from './client';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Aliased from the generated schema. The hand-written version declared
 * `user.role` and `user.isEmailVerified`, neither of which the backend's
 * `sanitize()` ever returned — the field is `emailVerified`, and there is no
 * `role` on a portal user. That is the class of silent drift the alias removes.
 *
 * snake_case is correct here: the portal endpoints answer `access_token` /
 * `refresh_token` while the admin API answers camelCase. Known and frozen.
 */
export type AuthResponse = components['schemas']['AuthTokensResponseDto'];

/** `{ message }` — what the verify/resend/reset endpoints answer. */
export type MessageResponse = components['schemas']['MessageResponseDto'];

/**
 * `{ message, userId }` — registration does NOT return tokens, because the
 * account is unverified until the emailed link is followed. Aliasing this is what
 * caught the backend briefly documenting the route as returning tokens.
 */
export type RegistrationResponse = components['schemas']['RegistrationResponseDto'];

// The backend mounts these under both /auth and /identity
// (@Controller(['auth', 'identity'])). This file used /identity while
// UserContext used /auth, for the same session — one prefix now, so a change to
// the controller's paths breaks in one obvious place instead of half of them.
export const authApi = {
  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', dto);
    // Nothing to store: the server sets the session as httpOnly cookies and the
    // browser installs them from this very response (PLATFORM-CONVENTIONS R-3.2).
    // This used to write them from `data.access_token`, which is why the response
    // still carries the tokens at all — they are now unused by the app and should
    // come out of the payload the next time that DTO is touched.
    startProactiveRefresh();
    return data;
  },

  async register(dto: RegisterDto) {
    const { data } = await apiClient.post<RegistrationResponse>('/auth/register', dto);
    return data;
  },

  /**
   * GET with the token in the query string — that is what the backend exposes
   * (`@Get('verify-email')` with `@Query('token')`).
   *
   * This used to POST a JSON body to that route. The verification email links
   * to the page that calls this, so every new client clicked their link and got
   * a 404: email verification was broken end to end, while a second, working
   * implementation of the same screen sat unused at /verify-email.
   */
  /**
   * POST, not GET — R-3.9.
   *
   * The API used to verify on a GET, which meant anything that follows a link
   * without a person deciding to — a corporate mail gateway, a link scanner, a
   * preview pane — silently verified the address. That is the one thing the
   * email exists to prove.
   *
   * The emailed link still lands on this app's `/auth/verify-email` page; that
   * page makes this call. One click, as before, but the state change is now
   * something a person triggered. The token also moves out of the query string,
   * where it would otherwise reach access logs and Referer headers.
   */
  async verifyEmail(token: string) {
    const { data } = await apiClient.post<MessageResponse>('/auth/verify-email', { token });
    return data;
  },

  async resendVerification(email: string) {
    const { data } = await apiClient.post<MessageResponse>('/auth/resend-verification', { email });
    return data;
  },

  /**
   * Password reset. Both endpoints exist now (FR-CORE-09 · R-3.5).
   *
   * This comment used to say the opposite, and said it for months: the UI was
   * live, the email template was written, and both calls 404'd. The backend
   * half landed with the token stored as a hash, a 30-minute single-use TTL,
   * and every session revoked on success.
   *
   * `forgotPassword` answers identically whether or not the account exists — so
   * the screen must NOT branch on the response to say "no such account". That
   * would reintroduce, in the UI, the enumeration oracle the API refuses to be.
   */
  async forgotPassword(email: string) {
    const { data } = await apiClient.post<MessageResponse>('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(token: string, newPassword: string) {
    const { data } = await apiClient.post<MessageResponse>('/auth/reset-password', {
      token,
      newPassword,
    });
    return data;
  },

  /**
   * The only logout. It used to clear cookies without telling the server, so
   * the refresh token stayed valid for 30 days — while UserContext.logout()
   * called the server without clearing cookies, leaving proxy.ts convinced the
   * session was alive. Two halves that never met.
   */
  async logout(): Promise<void> {
    /*
     * REPORTS whether the session actually ended.
     *
     * Since R-3.2 this app cannot delete a session cookie — they are httpOnly —
     * and `clearSession()` clears a timer and the KYC draft, nothing more. So
     * the server call is the ONLY thing that ends a session: it revokes every
     * refresh-token family and sends the Set-Cookie headers that remove the
     * cookies.
     *
     * Swallowing its failure in `finally` therefore did not mean "logged out
     * locally, not remotely" — it meant NOT LOGGED OUT AT ALL, while the client
     * was shown a clean login screen. On the shared phone or family computer
     * this portal is often used from, the next person is signed in as them, with
     * the wallet and KYC documents that implies.
     *
     * One retry first, because the common cause is a transient blip.
     */
    try {
      await apiClient.post('/auth/logout');
    } catch {
      await apiClient.post('/auth/logout');
    }
    clearSession();
  },
};
