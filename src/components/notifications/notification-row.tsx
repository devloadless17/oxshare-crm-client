'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { SheetClose } from '@/components/ui/sheet';
import type { AppNotification } from '@/lib/api/notifications';
import { currentLocale, t } from '@/lib/i18n';
import { relativeTime } from '@/lib/relative-time';
import { bodyText, resolveKind } from '@/components/layout/notification-kinds';
import { useMinuteTick } from '@/hooks/use-minute-tick';

/**
 * One notification, as the bell lists it.
 *
 * A NEW row — one the client has not seen yet — carries a tint, a dot and a
 * spoken "New"; everything else is a plain row. The panel decides which is
 * which from the server's read marker, so a row is new exactly until the panel
 * that showed it closes.
 *
 * A known kind navigates to where the client acts on it, and the sheet closes
 * with it. An unknown kind — a backend newer than this deploy — renders as a
 * plain row: generic title and timestamp, never a raw slug.
 */
export function NotificationRow({ item }: { item: AppNotification }) {
  const config = resolveKind(item.kind);
  const Icon = config?.icon ?? Bell;
  const isNew = !item.readAt;
  // Keeps "3 minutes ago" true while the panel stays open.
  useMinuteTick();

  const body = (
    <>
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isNew ? 'bg-primary/15' : 'bg-muted'} ${isNew ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`text-xs ${isNew ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'}`}
          >
            {config ? t(config.titleKey) : t('notifications.fallbackTitle')}
            {isNew && <span className="sr-only"> — {t('notifications.itemNew')}</span>}
          </span>
          <time
            dateTime={item.createdAt}
            title={new Date(item.createdAt).toLocaleString(currentLocale())}
            className="shrink-0 text-[10px] text-muted-foreground"
          >
            {relativeTime(item.createdAt)}
          </time>
        </span>
        {config ? (
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {bodyText(config, item.params)}
          </span>
        ) : null}
      </span>
      {isNew && (
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </>
  );

  const rowClass = `flex gap-3 rounded-lg border p-3 ${isNew ? 'border-primary/20 bg-primary/5' : 'border-border bg-card'}`;

  if (config?.href) {
    return (
      <li>
        <SheetClose asChild>
          <Link
            href={config.href}
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
      <div className={rowClass}>{body}</div>
    </li>
  );
}
