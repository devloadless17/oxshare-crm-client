import type { components } from './types.gen';
import { apiClient, clearSession, setSessionCookies, startProactiveRefresh } from './client';

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
    if (data.access_token) {
      setSessionCookies(data.access_token, data.refresh_token);
      startProactiveRefresh();
    }
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
  async verifyEmail(token: string) {
    const { data } = await apiClient.get<MessageResponse>('/auth/verify-email', {
      params: { token },
    });
    return data;
  },

  async resendVerification(email: string) {
    const { data } = await apiClient.post<MessageResponse>('/auth/resend-verification', { email });
    return data;
  },

  /**
   * NOT IMPLEMENTED BY THE BACKEND.
   *
   * There is no POST /auth/forgot-password and no POST /auth/reset-password —
   * verified against the identity controller, which exposes only register,
   * verify-email, resend-verification, login, refresh, logout and me. There is
   * also no password-reset token column on `users`.
   *
   * EmailService.sendPasswordResetEmail() exists and has zero callers, so the
   * flow is half-built: the template is written, the UI is written, and nothing
   * connects them. Both calls below will 404 until the endpoints land.
   * Tracked with the other contract gaps in docs/DECISIONS.md.
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
  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearSession();
    }
  },
};
