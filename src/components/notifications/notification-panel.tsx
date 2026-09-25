'use client';

import * as React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useResource } from '@/hooks/use-resource';
import { notificationsApi } from '@/lib/api/notifications';
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
 * Both tabs are cut from ONE read of the newest page, so they can never
 * disagree about which rows are new.
 */
export function NotificationPanel({
  enabled,
  onShown,
}: {
  /** False until the email is verified — both feed routes are guarded. */
  enabled: boolean;
  /** The `createdAt` of the newest NEW row on screen, or null when none. */
  onShown: (newestNewAt: string | null) => void;
}) {
  const [tab, setTab] = React.useState<PanelTab>('new');

  const query = useResource(
    keys.notifications.list(),
    (signal) => notificationsApi.getNotifications({ limit: PAGE_SIZE }, signal),
    { enabled },
  );

  const items = query.data?.items ?? [];
  const fresh = items.filter((item) => !item.readAt);
  const earlier = items.filter((item) => item.readAt);
  // Newest first from the server, so the first new row is the newest one.
  const newestNewAt = query.status === 'ready' ? (fresh[0]?.createdAt ?? null) : null;

  // Report what is on screen — writing the parent's ref is the whole effect.
  React.useEffect(() => onShown(newestNewAt), [newestNewAt, onShown]);

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
              fresh.length > 0
                ? t('notifications.tabNewCount', { count: fresh.length })
                : t('notifications.tabNew'),
          },
          { value: 'earlier', label: t('notifications.tabEarlier') },
        ]}
      />
      <div className="flex-1 overflow-y-auto p-3">
        <AsyncBoundary
          status={query.status}
          label={t('notifications.loading')}
          endpoints={['GET /notifications']}
          onRetry={query.refetch}
          errorMessage={t('notifications.loadFailed')}
          error={query.error}
          fill
        >
          <TabPanel idPrefix="notifications" value="new" activeValue={tab} className="pt-0">
            {fresh.length === 0 ? (
              <EmptyState
                icon={<CheckCheck className="h-5 w-5" aria-hidden="true" />}
                title={t('notifications.caughtUpTitle')}
                body={t('notifications.caughtUpBody')}
                action={
                  earlier.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setTab('earlier')}
                      className="mt-3 cursor-pointer text-xs font-medium text-primary hover:underline focus-outline"
                    >
                      {t('notifications.seeEarlier')}
                    </button>
                  ) : null
                }
              />
            ) : (
              <ul className="space-y-2">
                {fresh.map((item) => (
                  <NotificationRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </TabPanel>
          <TabPanel idPrefix="notifications" value="earlier" activeValue={tab} className="pt-0">
            {earlier.length === 0 ? (
              <EmptyState
                icon={<Bell className="h-5 w-5" aria-hidden="true" />}
                title={t('notifications.emptyTitle')}
                body={t('notifications.emptyBody')}
              />
            ) : (
              <>
                <ul className="space-y-2">
                  {earlier.map((item) => (
                    <NotificationRow key={item.id} item={item} />
                  ))}
                </ul>
                {query.data?.nextCursor ? (
                  <p className="pt-3 text-center text-[11px] text-muted-foreground">
                    {t('notifications.recentNotice', { count: items.length })}
                  </p>
                ) : null}
              </>
            )}
          </TabPanel>
        </AsyncBoundary>
      </div>
    </div>
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
