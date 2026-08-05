import type { components } from './types.gen';
import { apiClient } from './client';

/**
 * The client's own account security: password, and where they are signed in.
 *
 * Both endpoints are new. The portal previously rendered `BackendPending` here
 * naming routes that did not exist, because they genuinely did not: the only
 * password write was `POST /auth/reset-password`, which consumes an e-mailed
 * single-use token and is for people who CANNOT sign in, and nothing exposed
 * the refresh-token families at all.
 */

/**
 * Aliased from the generated schema, never hand-written — a backend rename is a
 * compile error here rather than a runtime surprise.
 *
 * `id` is a refresh-token FAMILY id, which is the detail most likely to be
 * misread: a session is one login, not one token row. A client signed in for a
 * month on one laptop has thousands of rows and exactly one entry here.
 */
export type Session = components['schemas']['SessionDto'];

export type MessageResponse = components['schemas']['MessageResponseDto'];

export const accountApi = {
  /**
   * Change the password from inside a live session.
   *
   * The API requires the CURRENT password and ends every OTHER session on
   * success — the caller's own survives, so doing the right thing does not
   * dump them at the sign-in screen. The message it returns says how many were
   * signed out, so the screen shows the API's own words rather than guessing.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<MessageResponse> {
    const { data } = await apiClient.post<MessageResponse>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return data;
  },

  /** Live sessions, most recently active first. `current` marks this device. */
  async listSessions(signal?: AbortSignal): Promise<Session[]> {
    const { data } = await apiClient.get<Session[]>('/auth/sessions', { signal });
    return data;
  },

  /**
   * End one of the client's OTHER sessions.
   *
   * The API refuses the current one with a 400 and points at logout, because
   * revoking it here would half-work: the family dies, the httpOnly cookies
   * stay in the browser, and the client sits on a rendered portal where the
   * next request 401s.
   */
  async revokeSession(id: string): Promise<MessageResponse> {
    const { data } = await apiClient.delete<MessageResponse>(`/auth/sessions/${id}`);
    return data;
  },
};
