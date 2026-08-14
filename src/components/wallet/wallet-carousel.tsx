'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
 * ## ⚠️ A TRANSFORM, not a scroll container
 *
 * This was built on `overflow-x-auto` + `scroll-snap` + `scrollTo({ behavior:
 * 'smooth' })`, and it would not animate. Three separate attempts are recorded
 * in the history, each correct about its own cause and none of them enough:
 *
 *   - `scroll-snap-type: mandatory` applies to PROGRAMMATIC scrolls, and Chrome
 *     resolves the snap on the first frame — so the smooth scroll never ran.
 *   - Suspending snap through React state did nothing, because `setState` is
 *     async and the scroll had already started under the old value.
 *   - Suspending it by writing `style.scrollSnapType` directly fixed that, and
 *     left the behaviour at the mercy of `scroll-behavior: auto !important`,
 *     which this project's own reduced-motion block sets on `*`.
 *
 * The common thread is that native smooth scrolling is not something a
 * component can rely on: it is CSS the page can override, a snap model that
 * fights it, and browser heuristics on top. A transform with a transition is
 * none of those. The animation is declared here, it cannot be resolved away on
 * the first frame, and it behaves identically in every browser.
 *
 * What is given up is native touch INERTIA — a flick no longer coasts. In
 * exchange a drag tracks the finger exactly and always settles with a visible
 * glide, which is the behaviour that was actually missing.
 *
 * ## Reduced motion is honoured HERE, deliberately
 *
 * The global block cannot express this: killing the transition would leave the
 * carousel jumping, which is the correct outcome for somebody who asked for no
 * motion — but it must be a decision, not a side effect of a wildcard rule that
 * also freezes spinners mid-arc (see the note beside it in globals.css).
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
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);

  /**
   * How far the finger has pulled the track from its resting position, in px.
   *
   * Zero whenever nothing is being dragged, which is also when the transition
   * is allowed to run — the two are the same state, so they are one value
   * rather than two that can disagree.
   */
  const [dragOffset, setDragOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const drag = React.useRef<{ startX: number; pointerId: number; moved: boolean } | null>(null);
  /* Set on release, read by the click that follows it, cleared there. A drag
     that ends on the copy button must not also press it. */
  const suppressClick = React.useRef(false);

  const count = entries.length;
  const single = count <= 1;

  /*
   * CLAMPED AT RENDER, not corrected afterwards in an effect.
   *
   * A card can disappear — a wallet closed from the admin console — leaving
   * `active` past the end and the track parked on blank space with no way back.
   * An effect that reset it would render the broken frame first and fix it on
   * the next pass, which is both a visible flash and the cascading-render this
   * project's lint rules refuse.
   *
   * Deriving it means the out-of-range value is never rendered at all. `active`
   * stays whatever it was, so re-adding the card restores the reader's place.
   */
  const current = Math.min(active, Math.max(count - 1, 0));

  const goTo = React.useCallback(
    (index: number) => setActive(Math.min(Math.max(index, 0), Math.max(count - 1, 0))),
    [count],
  );

  // ── Dragging ──────────────────────────────────────────────────────────────
  //
  // Pointer events, so one code path serves mouse, touch and pen. The previous
  // version handled `pointerType === 'mouse'` only and left touch to the
  // browser's scrolling, which is why the two behaved differently.

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (single) return;
    drag.current = { startX: event.clientX, pointerId: event.pointerId, moved: false };
    setDragging(true);
    /*
     * CAPTURE, so a pointer dragged outside the track keeps delivering moves
     * and — crucially — still delivers the `pointerup`. Without it a release
     * beyond the edge strands the track mid-drag.
     */
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;

    const delta = event.clientX - state.startX;
    /*
     * A THRESHOLD before this counts as a drag, because a click is a tiny drag.
     * Without it, pressing the copy button on a card with a two-pixel wobble is
     * swallowed as a swipe and the button never fires.
     */
    if (!state.moved && Math.abs(delta) < 4) return;
    state.moved = true;

    /*
     * RESISTANCE at the two ends. Past the first or last card the track still
     * moves, at a third of the distance — so a pull that cannot go anywhere
     * says so by feeling heavy, rather than by not responding at all, which
     * reads as the control being broken.
     */
    const atStart = current === 0 && delta > 0;
    const atEnd = current === count - 1 && delta < 0;
    setDragOffset(atStart || atEnd ? delta / 3 : delta);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    setDragOffset(0);

    if (state && event.currentTarget.hasPointerCapture(state.pointerId)) {
      event.currentTarget.releasePointerCapture(state.pointerId);
    }
    if (!state?.moved) return;
    suppressClick.current = true;

    /*
     * A THIRD of the card commits the move, rather than half.
     *
     * Half means a deliberate-feeling pull that stops just short springs back,
     * which reads as the drag having been ignored. A third matches what the
     * hand intended: past a third, the next card is what somebody was reaching
     * for.
     */
    const width = viewportRef.current?.clientWidth ?? 0;
    const travelled = event.clientX - state.startX;
    if (width > 0 && Math.abs(travelled) > width / 3) {
      goTo(current + (travelled < 0 ? 1 : -1));
    }
    /*
     * Nothing else to do when it does not commit: `dragOffset` is already back
     * to 0 and the transition below animates the spring-back, because the same
     * flag that ends the drag re-enables it.
     */
  };

  const onClickCapture = (event: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /*
   * Arrow keys move between cards once the track has focus, which is the
   * keyboard equivalent of a swipe. The dots below are buttons and reachable by
   * tab; this is for somebody already on the card.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (single) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(current + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(current - 1);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
        tabIndex={single ? -1 : 0}
        role="group"
        aria-roledescription="carousel"
        aria-label={t('wallet.carouselLabel')}
        /*
         * `overflow-hidden` is what makes this a window onto the track rather
         * than a scroll container — there is no scrolling here at all now.
         *
         * `touch-action: pan-y` lets the page still scroll VERTICALLY under a
         * finger while horizontal movement belongs to the carousel. Without it
         * this is the carousel that traps a phone.
         */
        className={`overflow-hidden ${single ? '' : 'touch-pan-y'} ${
          dragging ? 'cursor-grabbing select-none' : single ? '' : 'cursor-grab'
        } focus-outline rounded-2xl`}
      >
        <div
          className={`flex ${
            /*
             * The transition runs whenever a drag is NOT in progress: on a
             * button press, on a dot, on an arrow key, and on the settle after
             * a release. During a drag it must be off, or the track lags the
             * finger by the duration of the animation.
             *
             * `motion-reduce:transition-none` honours the reader's own setting
             * here rather than through the global wildcard — see the header.
             */
            dragging
              ? ''
              : 'transition-transform duration-300 ease-out motion-reduce:transition-none'
          }`}
          style={{
            /*
             * `calc` mixes the two units this needs: whole cards in percent, so
             * the geometry holds at any width without measuring, and the live
             * drag in pixels, because that is what a pointer reports.
             *
             * RTL flips the direction of travel. `translateX` is physical, so
             * without this the cards move away from the finger in Arabic.
             */
            transform: `translateX(calc(${-current * 100}% + ${dragOffset}px))`,
          }}
        >
          {entries.map(({ code, label }, index) => (
            /*
             * `w-full shrink-0` — one slide is exactly the viewport, which is
             * what makes `-active * 100%` land on a card every time.
             *
             * The gap is `px-2` INSIDE the slide rather than `gap-4` on the
             * track: a gap between two full-width boxes sits entirely outside
             * the window and is never seen, so the cards met at a hard seam
             * while dragging. Padding inside puts the space where it shows.
             */
            <div
              key={code}
              className="w-full shrink-0 px-2"
              /* Hidden from assistive tech unless it is the card on screen —
                 otherwise every balance is announced, in order, as one list. */
              aria-hidden={index !== current}
            >
              <WalletCard
                label={label}
                currency={code}
                wallet={byCurrency.get(code)}
                holder={holder}
              />
            </div>
          ))}
        </div>
      </div>

      {/*
        Controls are hidden entirely for a single card rather than disabled.
        Dimmed arrows either side of one card imply there is somewhere to go.
      */}
      {!single && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
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
                onClick={() => goTo(index)}
                aria-label={t('wallet.goToCard', { currency: code })}
                aria-current={index === current ? 'true' : undefined}
                className={`focus-outline h-1.5 rounded-full transition-all ${
                  index === current ? 'w-5 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current === entries.length - 1}
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
