import { apiClient } from './client';
import type { components } from './types.gen';

/**
 * The client's own notification feed — the bell.
 *
 * Types are ALIASES of the generated schemas, never hand-written (the ./wallet.ts
 * rule). Rows carry a `kind` slug plus structured `params`; the copy and the
 * deep link live client-side in `components/layout/notification-kinds.ts` —
 * the backend deliberately stores neither. Money values inside `params` are
 * strings; render through `formatMoney`.
 *
 * The recipient is the SESSION — these routes take no user id, and that is the
 * entire ownership model (R-4.4).
 */
export type AppNotification = components['schemas']['NotificationDto'];
export type NotificationPage = components['schemas']['NotificationListResponseDto'];
export type NotificationUnreadCount = components['schemas']['NotificationUnreadCountDto'];
export type NotificationsMarkAllRead = components['schemas']['NotificationsMarkAllReadResponseDto'];

export const notificationsApi = {
  /**
   * Newest first. `cursor`/`limit` are accepted now so a later load-more is a
   * UI-only change; the sheet reads a fixed most-recent page.
   */
  async getNotifications(
    params: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<NotificationPage> {
    const query = new URLSearchParams();
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    const { data } = await apiClient.get<NotificationPage>(`/notifications?${query.toString()}`, {
      signal,
    });
    return data;
  },

  /** The badge number. Polled; cheap on the server by design. */
  async getUnreadCount(signal?: AbortSignal): Promise<NotificationUnreadCount> {
    const { data } = await apiClient.get<NotificationUnreadCount>('/notifications/unread-count', {
      signal,
    });
    return data;
  },

  /** Idempotent — marking an already-read row is a 200, not an error. */
  async markRead(id: string): Promise<AppNotification> {
    const { data } = await apiClient.post<AppNotification>(`/notifications/${id}/read`);
    return data;
  },

  async markAllRead(): Promise<NotificationsMarkAllRead> {
    const { data } = await apiClient.post<NotificationsMarkAllRead>('/notifications/read-all');
    return data;
  },
};
