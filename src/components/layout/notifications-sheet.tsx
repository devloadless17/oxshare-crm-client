'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { notificationsApi } from '@/lib/api/notifications';
import { useUser } from '@/context/UserContext';
import { queryKeysFor, resyncKeysOnReconnect } from './notification-kinds';
import { t } from '@/lib/i18n';
import { useRealtime, type RealtimePayload } from '@/hooks/use-realtime';
import {
  playNotificationSound,
  primeNotificationSound,
  setSoundEnabled,
  soundEnabled,
  soundEnabledOnServer,
  subscribeToSoundPreference,
} from '@/lib/notification-sound';
import { toastBurst, toastNotification } from './notification-toast';
import { keys } from '@/lib/query-keys';
import { NotificationPanel } from '@/components/notifications/notification-panel';

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
 * The unseen count lives beside the trigger on a 60-second / `retry: false`
 * cadence and is NOT drawn at zero or unknown — a badge that cannot be counted
 * is a badge that is not drawn, the same rule that removed the old permanent
 * dot. The list lives inside `SheetContent`, which unmounts when closed, so
 * opening naturally fetches fresh.
 *
 * ## Seen means done — marked when the panel CLOSES
 *
 * The owner's rule for the client bell (25 Sep 2026): a notification the
 * client has seen is finished, and the bell must not keep counting it. The
 * panel reports the newest NEW row it put on screen; closing the sheet marks
 * everything up to that row read — never a row that arrived after it — and the
 * badge clears. See `NotificationPanel` for why it is on close and not open.
 */

const COUNT_KEY = keys.notifications.unreadCount();
const LIST_KEY = keys.notifications.all();

/** Arrivals this close together are ONE announcement — one chime, one toast. */
const BURST_MS = 400;
/** The chime never repeats sooner than this, however fast notifications land. */
const CHIME_GAP_MS = 3_000;
/** A burst toast still on screen absorbs the next burst rather than stacking. */
const BURST_TOAST_MS = 6_000;

const kindOf = (payload: RealtimePayload): string =>
  payload && typeof payload['kind'] === 'string' ? payload['kind'] : '';

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

  /*
   * MANY ARRIVALS ARE ONE ANNOUNCEMENT. The hourly commission run confirms a
   * partner's rebates together, so a client can be told about twenty credits
   * in the same instant. Arrivals within `BURST_MS` are gathered: one refetch,
   * one chime (never closer than `CHIME_GAP_MS`), one toast — the notification
   * itself when it is alone, "N new notifications" when it is not — and no
   * toast at all while the panel is open, where the client watches them land.
   */
  const arrivals = React.useRef<RealtimePayload[]>([]);
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastChime = React.useRef(0);
  const lastBurst = React.useRef({ count: 0, at: 0 });
  const panelOpen = React.useRef(open);
  React.useEffect(() => {
    panelOpen.current = open;
  }, [open]);
  React.useEffect(() => () => clearTimeout(flushTimer.current), []);

  const announce = () => {
    flushTimer.current = undefined;
    const arrived = arrivals.current;
    arrivals.current = [];
    if (arrived.length === 0) return;

    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    // The DATA each event is about refreshes with the bell, kind-scoped.
    for (const kind of new Set(arrived.map(kindOf))) {
      for (const key of queryKeysFor(kind)) void queryClient.invalidateQueries({ queryKey: key });
    }

    const now = Date.now();
    if (now - lastChime.current >= CHIME_GAP_MS) {
      lastChime.current = now;
      playNotificationSound();
    }
    if (panelOpen.current) return;

    const burstShowing = now - lastBurst.current.at <= BURST_TOAST_MS;
    const [only] = arrived;
    if (arrived.length === 1 && !burstShowing && only !== undefined) {
      const id = typeof only['id'] === 'string' ? only['id'] : undefined;
      // `router.push`, not a `<Link>`: a toast action is a button in an overlay.
      toastNotification(only, (href) => {
        // Following the toast is reading it — as a click on its row is.
        if (id) {
          void notificationsApi.markRead(id).then(
            () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
            () => undefined,
          );
        }
        router.push(href);
      });
      return;
    }
    const count = arrived.length + (burstShowing ? lastBurst.current.count : 0);
    lastBurst.current = { count, at: now };
    toastBurst(count, () => setOpen(true));
  };

  const { connected } = useRealtime(
    {
      /*
       * Passed inline: `useRealtime` keys its effect on the event NAMES and
       * holds the handlers in a ref, so a fresh object per render does not
       * rebuild the socket.
       */
      /*
       * The toast is the point of the socket for a client who is not looking
       * at the bell — which is almost always. Gathered into bursts; see above.
       */
      'notification.created': (payload) => {
        arrivals.current.push(payload);
        flushTimer.current ??= setTimeout(announce, BURST_MS);
      },
      /*
       * One of this client's rows was read — in another tab, or by this one's
       * own close. The payload names nothing; the feed re-reads itself.
       */
      'notification.changed': () => {
        void queryClient.invalidateQueries({ queryKey: LIST_KEY });
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

  /*
   * The newest NEW row the open panel is showing — written by the panel as its
   * rows arrive, read once when the sheet closes. A ref, not state: nothing
   * renders from it.
   */
  const seenUpTo = React.useRef<string | null>(null);
  const onShown = React.useCallback((newestNewAt: string | null) => {
    seenUpTo.current = newestNewAt;
  }, []);

  /*
   * Mark what the client saw. Fire-and-forget and swallowed, like the per-row
   * mark it replaces: a failure leaves the rows new for the next open, which is
   * the honest outcome and retries itself — an error message about it would
   * interrupt a client who has already moved on.
   */
  function markSeen() {
    const upTo = seenUpTo.current;
    seenUpTo.current = null;
    if (!upTo) return;
    notificationsApi
      .markAllRead(upTo)
      .then(() => queryClient.invalidateQueries({ queryKey: LIST_KEY }))
      .catch(() => undefined);
  }

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
        else markSeen();
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
            {unread > 99 ? '99+' : unread}
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
        <NotificationPanel enabled={verified} onShown={onShown} />
      </SheetContent>
    </Sheet>
  );
}
