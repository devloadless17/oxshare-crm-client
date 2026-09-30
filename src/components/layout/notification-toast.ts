import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import type { RealtimePayload } from '@/hooks/use-realtime';
import type { AppNotification } from '@/lib/api/notifications';
import { bodyText, resolveKind } from './notification-kinds';

/**
 * Turn one `notification.created` socket event into a toast.
 *
 * ## Why this renders from the EVENT and not from a refetch
 *
 * The socket carries `{id, kind, params}` (backend migration 0061), which is
 * everything the kind catalogue needs — so the toast is drawn from what
 * arrived, with no request in between. The alternative was to invalidate the
 * feed and toast the newest row once it came back, and that reads worse than it
 * sounds: the toast would land a round trip after the event, so on a slow
 * connection a client sees their balance change before being told why, and on a
 * failed request they are never told at all.
 *
 * The bell list is still invalidated by the caller. That is the durable record;
 * this is the announcement.
 *
 * ## The same catalogue as the bell rows
 *
 * `resolveKind` and `KIND_CONFIG` are shared with `notifications-sheet.tsx`
 * deliberately. A toast and its bell row are the same event seen twice, and two
 * catalogues would drift into saying different things about it — which the
 * client would notice, because they see both within seconds of each other.
 *
 * ## Both degrade paths render something honest
 *
 * An UNKNOWN kind (a backend deployed ahead of this app) and a MISSING `params`
 * (the trigger drops it above `pg_notify`'s 8000-byte limit) both fall back to
 * a title with no body, never a raw slug and never a sentence with an empty
 * hole in it. The bell row behind it always has the full detail, because that
 * comes from the permission-checked read rather than the socket.
 */
export function toastNotification(
  payload: RealtimePayload,
  /**
   * Navigate to where the client acts on this. Supplied by the caller rather
   * than imported, because `useRouter` is a hook and this is not a component.
   * Omitted, the toast simply has no action.
   */
  onView?: (href: string) => void,
): void {
  // No payload at all means no event worth announcing — the transport already
  // discarded anything that was not an object, and a toast with no kind could
  // only be the generic title with nothing behind it.
  if (!payload) return;

  const kind = typeof payload['kind'] === 'string' ? payload['kind'] : undefined;
  if (!kind) return;

  const config = resolveKind(kind);
  // A kind this build does not know: no toast. A bare "Notification" tells the
  // client nothing; the badge and the bell row still update.
  if (!config) return;

  /*
   * `params` is validated as an object before the catalogue's `vars` is allowed
   * near it. `vars` reads named fields and passes them through `formatMoney`,
   * and this value came off a socket — so an absent or non-object `params`
   * means no body at all rather than a sentence built out of empty strings.
   */
  const raw = payload['params'];
  const params =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as AppNotification['params'])
      : undefined;

  toast(t(config.titleKey), {
    // A body only when there is one to build. `undefined` renders no second
    // line; an empty string renders an empty line, which looks like a bug.
    description: params ? bodyText(config, params) : undefined,
    action:
      config.href && onView
        ? {
            label: t('notifications.view'),
            // `config.href` is narrowed by the guard above, but the closure
            // outlives it — hence the local.
            onClick: () => onView(config.href as string),
          }
        : undefined,
  });
}

/** The burst toast's id — a burst while one is showing UPDATES it instead of stacking. */
const BURST_TOAST_ID = 'notifications-burst';

/**
 * Several notifications at once — the hourly run confirming a day of rebates,
 * say — are ONE toast: "5 new notifications", with the bell one click away.
 * A stack of twenty is noise the client learns to ignore.
 */
export function toastBurst(count: number, onOpen: () => void): void {
  toast(t('notifications.burstTitle', { count }), {
    id: BURST_TOAST_ID,
    action: { label: t('notifications.view'), onClick: onOpen },
  });
}
