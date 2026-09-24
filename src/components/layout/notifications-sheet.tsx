'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { notificationsApi, type AppNotification } from '@/lib/api/notifications';
import { apiErrorMessage } from '@/lib/api/errors';
import { useUser } from '@/context/UserContext';
import { queryKeysFor, resyncKeysOnReconnect } from './notification-kinds';
import { t } from '@/lib/i18n';
import { relativeTime } from '@/lib/relative-time';
import { useRealtime } from '@/hooks/use-realtime';
import {
  playNotificationSound,
  primeNotificationSound,
  setSoundEnabled,
  soundEnabled,
  soundEnabledOnServer,
  subscribeToSoundPreference,
} from '@/lib/notification-sound';
import { resolveKind } from './notification-kinds';
import { toastNotification } from './notification-toast';
import { keys } from '@/lib/query-keys';

/**
 * The notification bell, and the panel behind it — live since
 * `GET /notifications` landed. (This file's previous version showed labelled
 * sample rows and said so; the migration its doc comment promised — SAMPLES →
 * `useResource`, `previewNotice` → a real empty state — is this.)
 *
 * TWIN in intent with the admin console's `layout/notifications-sheet.tsx` —
 * same component shape — but NOT a twin file: the kind catalogues are disjoint
 * (account events here, work-queue events there), and mutations here are plain
 * async handlers with inline error state, the portal's frozen convention (no
 * useMutation, no toast library).
 *
 * ## The badge polls; the list fetches on open
 *
 * The unread count lives beside the trigger on a 60-second / `retry: false`
 * cadence and is NOT drawn at zero or unknown — a badge that cannot be counted
 * is a badge that is not drawn, the same rule that removed the old permanent
 * dot. The list lives inside `SheetContent`, which unmounts when closed, so
 * opening naturally fetches fresh.
 *
 * ## Read is EXPLICIT, never a side effect of opening
 *
 * Opening marks nothing. Clicking a row marks that row; "Mark all as read" is
 * a button. Auto-mark-on-open would destroy the unread signal before anything
 * was read.
 */

const COUNT_KEY = keys.notifications.unreadCount();
const LIST_KEY = keys.notifications.all();
const PAGE_SIZE = 30;

export function NotificationsSheet() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useUser();
  const [open, setOpen] = React.useState(false);

  /*
   * Both feed routes sit behind the backend's `EmailVerifiedGuard`, and this
   * layout mounts on screens an UNVERIFIED client can reach (`/dashboard`,
   * `/profile`, `/platforms` — `EMAIL_VERIFIED_PATHS` does not cover them).
   * Polling a guaranteed 403 every sixty seconds and then telling a client
   * they lack permission to read their own notifications is a worse answer
   * than not asking: the bell simply does not fetch until the address is
   * proved. `undefined` (still loading) is treated as not-yet, so a flash of
   * requests cannot escape while the profile resolves.
   */
  const verified = user?.emailVerified === true;

  /*
   * The sound preference lives in localStorage, which React does not own and
   * the server cannot read — subscribed to rather than copied into state, with
   * an explicit server snapshot so the first client render matches the
   * server's instead of flipping after hydration.
   */
  const soundOn = React.useSyncExternalStore(
    subscribeToSoundPreference,
    soundEnabled,
    soundEnabledOnServer,
  );

  /*
   * The live socket. Proven up, the poll backs off to five minutes; otherwise
   * the original sixty-second cadence carries the feature.
   *
   * Gated on `verified` like the queries below: both feed routes sit behind
   * `EmailVerifiedGuard`, so an unverified client's handshake would be refused
   * — and Socket.IO retries a refused connection by default, which turns one
   * rejection into a reconnect loop.
   */
  /*
   * Build the AudioContext on the client's first click or keypress, rather than
   * on the first notification that wants it.
   *
   * Without this the first chime is inaudible even for somebody who has been
   * using the app for an hour — `resume()` is asynchronous and the notes are
   * already scheduled — so sound appeared to start working only from the second
   * notification onward. See `lib/notification-sound.ts`.
   *
   * Here rather than in the root layout because this component is the only
   * thing that plays the sound, and it mounts on every authenticated screen.
   */
  React.useEffect(() => primeNotificationSound(), []);

  const { connected } = useRealtime(
    {
      /*
       * Passed inline: `useRealtime` keys its effect on the event NAMES and
       * holds the handlers in a ref, so a fresh object per render does not
       * rebuild the socket.
       */
      'notification.created': (payload) => {
        void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        /*
         * The DATA the event is about refreshes with the bell — a settled
         * deposit updates the visible balance in the same breath as its toast.
         * Kind-scoped: an account event does not refetch the wallet.
         */
        const kind =
          payload && typeof payload === 'object' && typeof payload.kind === 'string'
            ? payload.kind
            : '';
        for (const key of queryKeysFor(kind)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        playNotificationSound();
        /*
         * The toast is the point of the socket for a client who is not looking
         * at the bell — which is almost always. The badge behind it is the
         * durable signal and the toast is the announcement; both are driven by
         * this one event so they cannot disagree.
         *
         * `router.push` rather than a `<Link>`: a toast action is a button
         * inside a portal-rendered overlay, not a row in the sheet.
         */
        toastNotification(payload, (href) => router.push(href));
      },
    },
    verified,
  );

  /*
   * ⚠️ RE-SYNC WHENEVER THE SOCKET COMES BACK — the missing half of "realtime".
   *
   * A Socket.IO event is delivered only to a socket that is connected AT THAT
   * MOMENT. There is no replay and no backlog, so everything that happened
   * while this tab was closed, asleep, offline, or past the fifteen-minute
   * token ceiling simply never arrives.
   *
   * That was the whole bug: a client whose withdrawal was approved while their
   * portal tab was in the background got no toast, no chime and no badge — and
   * then, because a CONNECTED socket backs the count poll off to five minutes,
   * waited up to five minutes for it to appear. Opening the bell was the only
   * thing that showed it promptly, because doing so invalidates the feed.
   *
   * Invalidating on every connect closes that window: reconnecting IS the
   * moment to ask what was missed. It costs one small request per reconnect,
   * and the first `connected === true` after mount is a normal cache
   * revalidation of a query that has just been fetched anyway.
   */
  React.useEffect(() => {
    if (!connected) return;
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    /*
     * And the DATA those events were about. Refreshing only the bell left a
     * KYC rejection that landed during the gap out of the outcome screen
     * (reported from production) — the row was in the bell, the screen still
     * said "under review". `resyncKeysOnReconnect` is the union of what the
     * live events refresh, and nothing more.
     */
    for (const key of resyncKeysOnReconnect()) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [connected, queryClient]);

  const count = useQuery({
    queryKey: COUNT_KEY,
    queryFn: ({ signal }) => notificationsApi.getUnreadCount(signal),
    enabled: verified,
    refetchInterval: connected ? 300_000 : 60_000,
    retry: false,
  });
  const unread = count.data?.count;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        /*
         * The whole prefix, not just the count: `QueryProvider` holds a
         * 30-second `staleTime`, so invalidating the count alone let the
         * remounted list serve cache — a badge reading "1 unread" over a panel
         * reading "Nothing yet". `LIST_KEY` is the prefix of both.
         */
        if (next) void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      }}
    >
      {/*
        Icon-only, so it needs a name — without one a screen reader announces
        "button". Sized to match the mobile menu trigger beside it.
      */}
      <SheetTrigger
        aria-label={
          unread
            ? `${t('notifications.open')} — ${t('notifications.unreadCountLabel', { count: unread })}`
            : t('notifications.open')
        }
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted focus-outline"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t('notifications.title')}</SheetTitle>
            {/*
              A control, not an indicator — it says what the client has ASKED
              for, not what the speaker is doing. Audio can be refused by the
              browser until they interact with the page, and claiming "on"
              while that holds it silent would be a status light that lies.
            */}
            <button
              type="button"
              aria-pressed={soundOn}
              aria-label={soundOn ? t('notifications.soundOn') : t('notifications.soundOff')}
              title={soundOn ? t('notifications.soundOn') : t('notifications.soundOff')}
              onClick={() => {
                const next = !soundOn;
                setSoundEnabled(next);
                // On the way ON only. It confirms the choice and, being a
                // click, satisfies the autoplay policy so the next real
                // notification is audible.
                if (next) playNotificationSound();
              }}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
            >
              {soundOn ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <SheetDescription className="sr-only">
            {t('notifications.panelDescription')}
          </SheetDescription>
        </SheetHeader>
        {/* Mounted only while open — see the component note. */}
        <NotificationsList unreadCount={unread ?? 0} enabled={verified} />
      </SheetContent>
    </Sheet>
  );
}

function NotificationsList({ unreadCount, enabled }: { unreadCount: number; enabled: boolean }) {
  const queryClient = useQueryClient();
  const [markAllError, setMarkAllError] = React.useState<string | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);

  const query = useResource(
    keys.notifications.list(),
    (signal) => notificationsApi.getNotifications({ limit: PAGE_SIZE }, signal),
    { enabled },
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: LIST_KEY });

  // Portal convention: a plain async handler with inline error state — no
  // useMutation, no toast (neither exists in this app).
  async function markAllRead() {
    try {
      setMarkAllError(null);
      setMarkingAll(true);
      await notificationsApi.markAllRead();
      await invalidate();
    } catch (error) {
      setMarkAllError(apiErrorMessage(error, t('notifications.markAllReadFailed')));
    } finally {
      setMarkingAll(false);
    }
  }

  /*
   * Per-row mark-read, fired alongside navigation. The catch is an explicit
   * swallow: an error here would interrupt a navigation the client asked for
   * to report the failure of something they didn't — an unread row that stays
   * unread is silently retriable on the next visit.
   */
  function markRead(item: AppNotification) {
    if (item.readAt) return;
    notificationsApi
      .markRead(item.id)
      .then(invalidate)
      .catch(() => undefined);
  }

  const items = query.data?.items ?? [];
  /*
   * Derived from the rows the client can SEE, OR-ed with the polled count:
   * gating on the count alone let a failed count poll (`retry: false`) hide
   * the button above a list of visibly-unread rows.
   *
   * Gated on `ready` as well: rendering it over the error or not-available
   * card offers a button that would clear notifications the client never got
   * to see — the same "read is explicit" rule, by another route.
   */
  const hasUnread =
    query.status === 'ready' && (unreadCount > 0 || items.some((item) => !item.readAt));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasUnread && (
        <div className="border-b border-border px-3 py-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={markingAll}
              className="cursor-pointer text-xs font-medium text-primary hover:underline disabled:opacity-50 focus-outline"
            >
              {t('notifications.markAllRead')}
            </button>
          </div>
          {markAllError && (
            <p role="alert" className="pt-1 text-right text-[11px] text-destructive">
              {markAllError}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {!enabled ? (
          /*
           * Not a spinner and not an empty state: a disabled query never
           * resolves, and "Nothing yet" would be a claim about a feed nobody
           * asked for. This says what is true and what to do about it — the
           * feed is gated on a verified address, like the routes behind it.
           */
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <Bell className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              {t('notifications.verifyEmailTitle')}
            </p>
            <p className="text-xs text-muted-foreground">{t('notifications.verifyEmailBody')}</p>
          </div>
        ) : (
          <AsyncBoundary
            status={query.status}
            label={t('notifications.loading')}
            endpoints={['GET /notifications']}
            onRetry={query.refetch}
            errorMessage={t('notifications.loadFailed')}
            error={query.error}
            fill
          >
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center">
                <Bell className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">
                  {t('notifications.emptyTitle')}
                </p>
                <p className="text-xs text-muted-foreground">{t('notifications.emptyBody')}</p>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <NotificationRow key={item.id} item={item} onRead={() => markRead(item)} />
                  ))}
                </ul>
                {query.data?.nextCursor ? (
                  <p className="pt-3 text-center text-[11px] text-muted-foreground">
                    {t('notifications.recentNotice', { count: items.length })}
                  </p>
                ) : null}
              </>
            )}
          </AsyncBoundary>
        )}
      </div>
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: AppNotification; onRead: () => void }) {
  const config = resolveKind(item.kind);
  const Icon = config?.icon ?? Bell;
  const unread = !item.readAt;

  const body = (
    <>
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${unread ? 'bg-primary/15' : 'bg-primary/10'} text-primary`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            {config ? t(config.titleKey) : t('notifications.fallbackTitle')}
            {unread && <span className="sr-only"> — {t('notifications.itemUnread')}</span>}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {relativeTime(item.createdAt)}
          </span>
        </span>
        {config ? (
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {t(config.bodyKey, config.vars?.(item.params))}
          </span>
        ) : null}
      </span>
      {unread && (
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </>
  );

  const rowClass = `flex gap-3 rounded-lg border border-border p-3 ${unread ? 'bg-primary/5' : 'bg-muted/30'}`;

  /*
   * A known kind navigates to where the client acts on it; the sheet closes
   * with it. An unknown kind — a backend newer than this deploy — renders as a
   * plain row: generic title and timestamp, never a raw slug.
   */
  if (config?.href) {
    return (
      <li>
        <SheetClose asChild>
          <Link
            href={config.href}
            onClick={onRead}
            className={`${rowClass} transition-colors hover:bg-muted focus-outline`}
          >
            {body}
          </Link>
        </SheetClose>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onRead}
        className={`${rowClass} w-full cursor-pointer text-left transition-colors hover:bg-muted focus-outline`}
      >
        {body}
      </button>
    </li>
  );
}
