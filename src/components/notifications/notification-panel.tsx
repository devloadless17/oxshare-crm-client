'use client';

import * as React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useInfiniteResource, type InfiniteResource } from '@/hooks/use-infinite-resource';
import { notificationsApi, type AppNotification, type SeenRange } from '@/lib/api/notifications';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';
import { NotificationRow } from './notification-row';

const PAGE_SIZE = 30;
type PanelTab = 'new' | 'earlier';

/**
 * What the bell shows: NEW — what the client has not seen — and EARLIER.
 *
 * ## A client's notifications are done once SEEN (the owner's rule, 25 Sep 2026)
 *
 * Every row here is an outcome the client is waiting on — a deposit credited, a
 * withdrawal paid, a KYC decision — not a task. Once the client has looked at
 * it there is nothing left to do, and a bell that keeps counting it makes the
 * portal look as if something still needs them. So this panel reports the
 * newest NEW row it put on screen (`onShown`), and the sheet marks everything up
 * to that row read when it CLOSES.
 *
 * On close, not on open, deliberately: marking on open would move the rows the
 * client is reading from New to Earlier while they read them. Nothing on screen
 * moves while the panel is open; the next open says "all caught up", and the
 * rows are under Earlier for as long as the server keeps them.
 *
 * This reverses the old "read is explicit" note, for clients only — an admin's
 * notification is a task and still leaves the bell only when read or handled.
 *
 * New and Earlier are SEPARATE reads (`?unread=true` / `?read=true`), each with
 * its own "Load more". They were cut from one page of the 30 newest rows, which
 * broke as soon as a client had more than that unseen: the 30 were marked seen,
 * the newest page then held no unread row, and New said "all caught up" while
 * the badge still counted 95. The tab's count is the server's own unread total
 * — the badge's number — never the length of whatever page is loaded.
 */
export function NotificationPanel({
  enabled,
  onShown,
  unreadCount,
}: {
  /** False until the email is verified — both feed routes are guarded. */
  enabled: boolean;
  /** The server's unread total — the badge's number, for the New tab. */
  unreadCount?: number;
  /** The `createdAt` span of the NEW rows on screen, or null when none. */
  onShown: (shown: SeenRange | null) => void;
}) {
  const [tab, setTab] = React.useState<PanelTab>('new');

  const freshFeed = useInfiniteResource(
    keys.notifications.feed('new'),
    (cursor, signal) =>
      notificationsApi.getNotifications({ view: 'new', cursor, limit: PAGE_SIZE }, signal),
    { enabled },
  );
  const earlierFeed = useInfiniteResource(
    keys.notifications.feed('earlier'),
    (cursor, signal) =>
      notificationsApi.getNotifications({ view: 'earlier', cursor, limit: PAGE_SIZE }, signal),
    // Read only once the tab is opened — most visits never look back.
    { enabled: enabled && tab === 'earlier' },
  );

  const fresh = freshFeed.items;
  const newCount = unreadCount ?? fresh.length;
  // Newest first from the server. Every page the client loaded with "Load more"
  // extends what they saw; an unread row past the last one was never shown.
  const newestNewAt = freshFeed.status === 'ready' ? (fresh[0]?.createdAt ?? null) : null;
  const oldestNewAt = freshFeed.status === 'ready' ? (fresh.at(-1)?.createdAt ?? null) : null;

  // Report what is on screen — writing the parent's ref is the whole effect.
  React.useEffect(
    () => onShown(newestNewAt && oldestNewAt ? { upTo: newestNewAt, from: oldestNewAt } : null),
    [newestNewAt, oldestNewAt, onShown],
  );

  if (!enabled) {
    /*
     * Not a spinner and not an empty state: a disabled query never resolves,
     * and "Nothing yet" would be a claim about a feed nobody asked for.
     */
    return (
      <EmptyState
        icon={<Bell className="h-5 w-5" aria-hidden="true" />}
        title={t('notifications.verifyEmailTitle')}
        body={t('notifications.verifyEmailBody')}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        idPrefix="notifications"
        className="px-3"
        value={tab}
        onValueChange={(value) => setTab(value === 'earlier' ? 'earlier' : 'new')}
        tabs={[
          {
            value: 'new',
            label:
              newCount > 0
                ? t('notifications.tabNewCount', { count: newCount })
                : t('notifications.tabNew'),
          },
          { value: 'earlier', label: t('notifications.tabEarlier') },
        ]}
      />
      <div className="flex-1 overflow-y-auto p-3">
        <TabPanel idPrefix="notifications" value="new" activeValue={tab} className="pt-0">
          <Feed
            feed={freshFeed}
            empty={
              <EmptyState
                icon={<CheckCheck className="h-5 w-5" aria-hidden="true" />}
                title={t('notifications.caughtUpTitle')}
                body={t('notifications.caughtUpBody')}
                action={
                  <button
                    type="button"
                    onClick={() => setTab('earlier')}
                    className="mt-3 cursor-pointer text-xs font-medium text-primary hover:underline focus-outline"
                  >
                    {t('notifications.seeEarlier')}
                  </button>
                }
              />
            }
          />
        </TabPanel>
        <TabPanel idPrefix="notifications" value="earlier" activeValue={tab} className="pt-0">
          <Feed
            feed={earlierFeed}
            empty={
              <EmptyState
                icon={<Bell className="h-5 w-5" aria-hidden="true" />}
                title={t('notifications.emptyTitle')}
                body={t('notifications.emptyBody')}
              />
            }
          />
        </TabPanel>
      </div>
    </div>
  );
}

/** One tab's list: the six states, its rows, and "Load more" while there is more. */
function Feed({
  feed,
  empty,
}: {
  feed: InfiniteResource<AppNotification>;
  empty: React.ReactNode;
}) {
  return (
    <AsyncBoundary
      status={feed.status}
      label={t('notifications.loading')}
      endpoints={['GET /notifications']}
      onRetry={feed.refetch}
      errorMessage={t('notifications.loadFailed')}
      error={feed.error}
      fill
    >
      {feed.items.length === 0 ? (
        empty
      ) : (
        <>
          <ul className="space-y-2">
            {feed.items.map((item) => (
              <NotificationRow key={item.id} item={item} />
            ))}
          </ul>
          {feed.hasMore && (
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={feed.loadMore}
                disabled={feed.isLoadingMore}
                className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted disabled:opacity-50 focus-outline"
              >
                {feed.isLoadingMore ? t('notifications.loadingMore') : t('notifications.loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </AsyncBoundary>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-10 text-center">
      <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-[16rem] text-xs text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
