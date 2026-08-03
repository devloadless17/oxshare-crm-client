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

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    isEmailVerified: boolean;
  };
}

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
    const { data } = await apiClient.post('/auth/register', dto);
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
    const { data } = await apiClient.get('/auth/verify-email', { params: { token } });
    return data;
  },

  async resendVerification(email: string) {
    const { data } = await apiClient.post('/auth/resend-verification', { email });
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
    const { data } = await apiClient.post('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(token: string, newPassword: string) {
    const { data } = await apiClient.post('/auth/reset-password', { token, newPassword });
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
