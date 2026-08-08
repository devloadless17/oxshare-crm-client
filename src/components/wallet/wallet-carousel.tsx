'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WalletCard } from './wallet-card';
import type { Wallet as WalletRecord, WalletCurrency } from '@/lib/api/wallet';
import { t, type MessageKey } from '@/lib/i18n';

export interface CarouselEntry {
  code: WalletCurrency;
  label: MessageKey;
}

/**
 * The wallet cards, one at a time, swipeable.
 *
 * ## Why a carousel rather than a grid
 *
 * A card is only a card at a readable size. Two side by side on a laptop shrinks
 * both until the balance — the one thing anybody came for — competes with the
 * chrome around it. One at a time keeps the figure large, and matches how a
 * physical wallet actually works: you look at one card, then the next.
 *
 * ## Scroll-snap, not a JS slider
 *
 * The track is a real horizontally-scrolling element with `snap-x snap-mandatory`
 * and one snap point per card. That gives native touch inertia, native
 * trackpad-swipe, keyboard scrolling and correct RTL behaviour for free — none of
 * which a transform-based slider gets without re-implementing all four, usually
 * badly.
 *
 * The arrows and dots then only need to call `scrollTo`, and the active index is
 * READ BACK from the scroll position rather than held as the source of truth. So
 * a swipe and a button press cannot disagree about which card is showing, which
 * is the classic carousel bug where the dots drift out of sync with the content.
 */
export function WalletCarousel({
  entries,
  byCurrency,
  holder,
}: {
  entries: CarouselEntry[];
  byCurrency: Map<string, WalletRecord>;
  holder?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);

  /*
   * The active card, derived from where the track has actually scrolled.
   *
   * Reading it back rather than storing it is what keeps a swipe and a button
   * press in agreement. `scrollLeft / cardWidth`, rounded — the snap points are
   * evenly spaced, so the ratio is the index.
   *
   * `Math.abs` on scrollLeft because in RTL the browser reports it as negative;
   * without it every card past the first would resolve to index 0 in Arabic.
   */
  const syncActive = React.useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const cardWidth = track.clientWidth;
    if (cardWidth === 0) return;
    setActive(Math.round(Math.abs(track.scrollLeft) / cardWidth));
  }, []);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.min(Math.max(index, 0), entries.length - 1);
    /*
     * `scrollTo` with a signed offset rather than `scrollIntoView`, which also
     * scrolls the PAGE vertically to bring the card into view — so pressing
     * "next" would jump the whole screen. The sign follows the document
     * direction, matching how the browser reports `scrollLeft` in RTL.
     */
    const direction = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollTo({ left: direction * clamped * track.clientWidth, behavior: 'smooth' });
  };

  const single = entries.length <= 1;

  return (
    <div className="w-full max-w-md">
      <div
        ref={trackRef}
        onScroll={syncActive}
        /*
         * `scrollbar-none` is a project utility (globals.css). The scrollbar
         * would sit under the card and read as part of it — and the dots below
         * already say how many cards there are.
         *
         * `snap-x snap-mandatory` makes every scroll settle on a card rather
         * than halfway between two.
         */
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
      >
        {entries.map(({ code, label }) => (
          /*
           * `w-full shrink-0` — each slide is exactly the track's width, which
           * is what makes `scrollLeft / clientWidth` a valid index and keeps one
           * card on screen at a time.
           */
          <div key={code} className="w-full shrink-0 snap-center">
            <WalletCard
              label={t(label)}
              currency={code}
              wallet={byCurrency.get(code)}
              holder={holder}
            />
          </div>
        ))}
      </div>

      {/*
        Controls are hidden entirely for a single card rather than disabled.
        Dimmed arrows either side of one card imply there is somewhere to go.
      */}
      {!single && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => scrollToIndex(active - 1)}
            disabled={active === 0}
            aria-label={t('wallet.previousCard')}
            className="focus-outline flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            {/* Mirrored under RTL rather than swapped: "previous" points at the
                start of the line, which is the RIGHT in Arabic. */}
            <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          </button>

          {/*
            The dots are BUTTONS, not decoration — they are the only way to reach
            a distant card without swiping past every one between.
          */}
          <div className="flex items-center gap-1.5">
            {entries.map(({ code }, index) => (
              <button
                key={code}
                type="button"
                onClick={() => scrollToIndex(index)}
                aria-label={t('wallet.goToCard', { currency: code })}
                aria-current={index === active ? 'true' : undefined}
                className={`focus-outline h-1.5 rounded-full transition-all ${
                  index === active ? 'w-5 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => scrollToIndex(active + 1)}
            disabled={active === entries.length - 1}
            aria-label={t('wallet.nextCard')}
            className="focus-outline flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
