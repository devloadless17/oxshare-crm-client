'use client';

import Image from 'next/image';
import { CalendarDays } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * The branded strip across the top of the dashboard: who you are, over the
 * broker's artwork.
 *
 * ## Short, and the artwork is a BACKDROP
 *
 * The first version held the artwork's 8:3 shape and set the words inside the
 * dark panel painted into it — on a laptop that was a ~400px-tall picture
 * pushing the balances below the fold, with text boxed in a rectangle. Now:
 *
 *  - a fixed, modest height (144 → 176px), the image `object-cover`ed and
 *    anchored right, where its subject is — the laptop and the skyline;
 *  - a full-bleed gradient from the reading edge, strong enough that the
 *    painted panel dissolves into it and white text reads at AA on any crop,
 *    fading out so the right half stays the picture;
 *  - a second, faint bottom gradient so the strip sits on the page rather
 *    than being cut out of it.
 *
 * The text is a hierarchy rather than three equal lines: a small accent
 * eyebrow, the NAME as the one large thing, the tagline quiet beneath. The
 * accent bar and eyebrow reuse the brand orange (`primary`), so it belongs to
 * the same system as the buttons below it. `start`/`end` and a mirrored
 * gradient keep it correct under RTL.
 *
 * The image is decorative — every word on the strip is real text — hence the
 * empty `alt`.
 */
export function WelcomeBanner({ firstName }: { firstName?: string }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <section
      aria-label={t('dashboard.bannerLabel')}
      className="relative isolate h-36 shrink-0 overflow-hidden rounded-2xl border border-border bg-black shadow-sm sm:h-40 lg:h-44"
    >
      <Image
        src="/dashboard-banner.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) calc(100vw - 20rem), 100vw"
        className="-z-10 object-cover object-[80%_58%]"
      />

      {/* The backdrop: dense at the reading edge, gone by two-thirds across. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/65 to-black/5 rtl:bg-gradient-to-l"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/40 via-transparent to-transparent"
      />

      <div className="flex h-full items-center justify-between gap-6 px-5 sm:px-8">
        <div className="flex min-w-0 items-stretch gap-4">
          <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-primary uppercase sm:text-xs">
              {t('dashboard.bannerWelcome')}
            </p>
            <p className="mt-1 truncate text-2xl leading-tight font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
              {firstName || t('dashboard.bannerFallbackName')}
            </p>
            <p className="mt-1.5 text-xs text-white/75 sm:text-sm">
              {t('dashboard.bannerTagline')}
            </p>
          </div>
        </div>

        {/* A quiet fact on the right from md up — glass, so it reads as part of the strip. */}
        <div className="hidden shrink-0 items-center gap-2 self-end rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs text-white/85 backdrop-blur-md md:mb-5 md:flex">
          <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {today}
        </div>
      </div>
    </section>
  );
}
