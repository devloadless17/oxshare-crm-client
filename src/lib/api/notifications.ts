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
export type NotificationsReadAll = components['schemas']['NotificationsReadAllDto'];

/** The `createdAt` span of the new rows a panel put on screen. */
export interface SeenRange {
  upTo: string;
  from: string;
}

export const notificationsApi = {
  /**
   * Newest first. `cursor`/`limit` are accepted now so a later load-more is a
   * UI-only change; the sheet reads a fixed most-recent page.
   */
  async getNotifications(
    params: { cursor?: string; limit?: number; view?: 'new' | 'earlier' } = {},
    signal?: AbortSignal,
  ): Promise<NotificationPage> {
    const query = new URLSearchParams();
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    // New and Earlier are separate lists on the server, so each pages on its
    // own and neither is ever a slice of one mixed page.
    if (params.view === 'new') query.set('unread', 'true');
    if (params.view === 'earlier') query.set('read', 'true');
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

  /**
   * Mark what the client SAW as read: every unread row up to `upTo`, the
   * `createdAt` of the newest one on screen. A notification that arrived after
   * the panel rendered is newer than `upTo` and stays unread — the bell marks
   * what it showed, never what it did not.
   *
   * `from` is the oldest new row on screen: the panel loads one page, so an
   * unread row beyond it was never shown and stays unread.
   */
  async markAllRead(shown?: SeenRange): Promise<NotificationsMarkAllRead> {
    const body: NotificationsReadAll = shown ? { upTo: shown.upTo, from: shown.from } : {};
    const { data } = await apiClient.post<NotificationsMarkAllRead>(
      '/notifications/read-all',
      body,
    );
    return data;
  },
};
