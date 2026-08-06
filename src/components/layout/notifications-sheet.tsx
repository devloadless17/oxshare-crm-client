'use client';

import * as React from 'react';
import { Bell, Download, Info, ShieldCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The notification bell, and the panel behind it.
 *
 * ## Why the content is placeholder, and why it says so
 *
 * There is no notifications table, no endpoint and nothing emitting events. The
 * bell that used to sit here was removed for exactly that reason: it had no
 * handler, no menu, and a permanent unread dot implying items that did not
 * exist. It is back because the SURFACE is wanted now and the data will follow.
 *
 * What is deliberately not back is the lie. The panel opens with a plain
 * statement that notifications are not live, and the rows beneath it are
 * product copy — welcome, finish verification, the terminal is downloadable —
 * not fabricated account events. That distinction is the whole design: a
 * placeholder "Deposit approved · $5,000" on a money product is not a harmless
 * mock, it is a client calling support about money they do not have.
 *
 * There is also NO unread count. A badge that always says "1" teaches people to
 * ignore badges, which is the habit this product will need unlearned on the day
 * the badge starts meaning something.
 *
 * When `GET /notifications` lands: replace `SAMPLES` with a `useResource` call,
 * render through `<AsyncBoundary>`, delete `previewNotice`, and let the empty
 * state be a real one.
 */

interface SampleNotification {
  id: string;
  icon: React.ElementType;
  title: MessageKey;
  body: MessageKey;
}

const SAMPLES: SampleNotification[] = [
  {
    id: 'welcome',
    icon: Info,
    title: 'notifications.sampleWelcomeTitle',
    body: 'notifications.sampleWelcomeBody',
  },
  {
    id: 'kyc',
    icon: ShieldCheck,
    title: 'notifications.sampleKycTitle',
    body: 'notifications.sampleKycBody',
  },
  {
    id: 'platform',
    icon: Download,
    title: 'notifications.samplePlatformTitle',
    body: 'notifications.samplePlatformBody',
  },
];

export function NotificationsSheet() {
  return (
    <Sheet>
      {/*
        Icon-only, so it needs a name: without one a screen reader announces
        "button" and the only route to this panel is unreachable to anyone not
        looking at it. Same reasoning as the mobile menu trigger next to it, and
        it is sized to match that button so the header reads as one row of
        controls rather than two shapes.
      */}
      <SheetTrigger
        aria-label={t('notifications.open')}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted focus-outline"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
      </SheetTrigger>

      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>{t('notifications.title')}</SheetTitle>
          <SheetDescription>{t('notifications.previewNotice')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-2">
            {SAMPLES.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-foreground">{t(item.title)}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t(item.body)}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {t('notifications.sampleWhen')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
