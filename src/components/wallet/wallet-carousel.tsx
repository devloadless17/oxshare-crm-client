'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, useCarousel } from '@/components/ui/carousel';
import { WalletCard } from '@/components/wallet/wallet-card';
import type { Wallet as WalletRecord } from '@/lib/api/wallet';
import { t } from '@/lib/i18n';

export interface CarouselEntry {
  /**
   * A currency CODE, not a member of a fixed union.
   *
   * This was `WalletCurrency` — the generated `'USD' | 'USDT'` — which is how a
   * client holding six wallets was shown two. Currencies are operator data;
   * see the note in the wallet DTO.
   */
  code: string;
  /**
   * ALREADY-RESOLVED text, not a message key.
   *
   * The catalogue supplies the currency's name and an operator can add one at
   * any time, so there is no key to look up: `t()` would need an entry per
   * currency, written before the operator invented it. The caller resolves
   * this — from `GET /currencies`, falling back to the code.
   */
  label: string;
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
 * ## ⚠️ THE MOTION IS EMBLA'S, NOT CSS
 *
 * This is the fourth build of this component and the first that is not doing its
 * own animation. Three hand-written versions failed, the last of them because a
 * CSS transition is not something a component can own: `globals.css` sets
 * `transition-duration: 0.001ms !important` on `*` under
 * `prefers-reduced-motion`, so on any machine with that OS setting the track
 * jumped instantly however correct the geometry was. The same wildcard froze the
 * loading spinner mid-arc.
 *
 * `components/ui/carousel.tsx` carries the full history. The short version: the
 * drag, the momentum, the snapping and the RTL handling are Embla's, it animates
 * on `requestAnimationFrame` rather than through CSS, and no stylesheet can
 * flatten it.
 *
 * What stayed from the hand-written versions is everything that was a JUDGEMENT
 * rather than a mechanism — one card per view, controls hidden for a single
 * wallet, dots as real buttons, and the gap living inside the slide.
 */
export function WalletCarousel({
  entries,
  byCurrency,
  holder,
  onOpen,
  opening,
}: {
  entries: CarouselEntry[];
  byCurrency: Map<string, WalletRecord>;
  holder?: string;
  /** Open an unopened currency's wallet — see `WalletCard.onOpen`. */
  onOpen?: (currency: string) => void;
  /** The currency whose open request is in flight, if any. */
  opening?: string | null;
}) {
  return (
    <Carousel className="w-full max-w-md" aria-label={t('wallet.carouselLabel')}>
      <CarouselContent>
        {entries.map(({ code, label }) => (
          <CarouselItem key={code}>
            <WalletCard
              label={label}
              currency={code}
              wallet={byCurrency.get(code)}
              holder={holder}
              onOpen={onOpen ? () => onOpen(code) : undefined}
              opening={opening === code}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <WalletCarouselControls entries={entries} />
    </Carousel>
  );
}

/**
 * Arrows and dots — a separate component ONLY so it can call `useCarousel`.
 *
 * The hook reads the context `<Carousel>` provides, and a component cannot
 * consume a context it renders itself. Splitting here is what lets the controls
 * read the live selected index instead of the parent tracking a second copy of
 * it that can disagree with the track.
 */
function WalletCarouselControls({ entries }: { entries: CarouselEntry[] }) {
  const { scrollPrev, scrollNext, scrollTo, canScrollPrev, canScrollNext, selectedIndex } =
    useCarousel();

  /*
   * Controls are hidden entirely for a single card rather than disabled. Dimmed
   * arrows either side of one card imply there is somewhere to go.
   */
  if (entries.length <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={scrollPrev}
        disabled={!canScrollPrev}
        aria-label={t('wallet.previousCard')}
        className="focus-outline flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        {/* Mirrored under RTL rather than swapped: "previous" points at the
            start of the line, which is the RIGHT in Arabic. */}
        <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>

      {/*
        The dots are BUTTONS, not decoration — they are the only way to reach a
        distant card without swiping past every one between.
      */}
      <div className="flex items-center gap-1.5">
        {entries.map(({ code }, index) => (
          <button
            key={code}
            type="button"
            onClick={() => scrollTo(index)}
            aria-label={t('wallet.goToCard', { currency: code })}
            aria-current={index === selectedIndex ? 'true' : undefined}
            className={`focus-outline h-1.5 rounded-full transition-all ${
              index === selectedIndex
                ? 'w-5 bg-primary'
                : 'w-1.5 bg-border hover:bg-muted-foreground'
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={scrollNext}
        disabled={!canScrollNext}
        aria-label={t('wallet.nextCard')}
        className="focus-outline flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  );
}
