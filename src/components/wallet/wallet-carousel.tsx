'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WalletCard } from './wallet-card';
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

  /**
   * The distance from one card's left edge to the next — WIDTH PLUS THE GAP.
   *
   * The index maths used to be `scrollLeft / clientWidth`, which was right only
   * while the cards were flush against each other. With a gap between them each
   * step is wider than a card, so dividing by the card width drifts further out
   * with every slide: by the third card the arrows and the dots disagree with
   * what is on screen.
   *
   * Measured from the DOM rather than hardcoded to match the `gap-` class, so
   * the two cannot fall out of step — the layout is the source of truth. Falls
   * back to the track width for a single card, where there is no second element
   * to measure against and no stepping to do anyway.
   */
  const step = React.useCallback((): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const [first, second] = Array.from(track.children) as HTMLElement[];
    if (first && second) {
      const distance = Math.abs(second.offsetLeft - first.offsetLeft);
      if (distance > 0) return distance;
    }
    return track.clientWidth;
  }, []);

  /*
   * Snap is SUSPENDED during any scroll this component drives itself.
   *
   * `scroll-snap-type: mandatory` applies to programmatic scrolls too, and
   * Chrome resolves the snap on the first frame rather than letting the smooth
   * animation run — so `scrollTo({ behavior: 'smooth' })` under mandatory snap
   * lands on the next card instantly. That is the "it only changes, there is no
   * animation" on the arrows and the dots.
   *
   * A REF and a direct style write, deliberately NOT React state: `setState` is
   * asynchronous, so a state-driven class would not be applied until after the
   * `scrollTo` call had already started the scroll under the old value. The
   * first version of this fix did exactly that and changed nothing.
   *
   * The timer holds the handle that restores snapping once the glide settles.
   */
  const glideTimer = React.useRef<number | null>(null);

  /*
   * ── Dragging with a MOUSE, which native scrolling does not give us ─────────
   *
   * The track is a real scroll container, so touch and trackpad already swipe it
   * with correct inertia. A mouse cannot drag a scroll container at all — so on
   * a laptop the only way to move between cards was the arrows, and the thing
   * that looks and behaves like a swipeable carousel did not respond to being
   * pulled. That is what "it should slide" is about.
   *
   * Only for `pointerType === 'mouse'`. Hijacking touch here would replace the
   * browser's own inertia and snap with a worse hand-rolled version, and take
   * vertical page scrolling with it — the classic carousel that traps a phone.
   */
  const drag = React.useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const track = trackRef.current;
    if (!track) return;

    drag.current = { startX: event.clientX, startScroll: track.scrollLeft, moved: false };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const track = trackRef.current;
    if (!state || !track) return;

    const delta = event.clientX - state.startX;
    /*
     * A THRESHOLD before this counts as a drag, because a click is a tiny drag.
     * Without it, pressing the copy button on a card with a two-pixel wobble
     * would be swallowed as a swipe and the button would never fire.
     */
    if (!state.moved && Math.abs(delta) < 4) return;
    state.moved = true;

    // Native scrolling moves the content OPPOSITE the pointer, so the content
    // follows the hand rather than running away from it.
    track.scrollLeft = state.startScroll - delta;
  };

  /*
   * Set on release, read by the click that follows it, cleared there.
   *
   * A separate ref from `drag`, because `drag` is already null by the time
   * `click` fires — `pointerup` runs first and clears it, so checking it in the
   * click handler would always see nothing and never suppress anything.
   */
  const suppressClick = React.useRef(false);

  const endDrag = () => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (!state?.moved) return;
    suppressClick.current = true;

    /*
     * Settle on the nearest card. `scroll-snap` does this for a NATIVE scroll,
     * but a scroll driven by assigning `scrollLeft` is programmatic and gets no
     * snap — so releasing mid-card would leave two half-cards on screen.
     */
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    scrollToIndex(Math.round(Math.abs(track.scrollLeft) / track.clientWidth));
  };

  /*
   * Suppress the click that follows a drag.
   *
   * A pointer press, a move and a release still produce a `click` on whatever
   * was underneath — so dragging a card that happens to start on the copy button
   * would copy the wallet id. Captured on the way DOWN so it runs before the
   * button's own handler.
   */
  const onClickCapture = (event: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

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
    const stride = step();
    if (stride === 0) return;
    setActive(Math.round(Math.abs(track.scrollLeft) / stride));
  }, [step]);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.min(Math.max(index, 0), entries.length - 1);

    /*
     * ⚠️ Snap is turned off ON THE ELEMENT, not through React state.
     *
     * This is why the first attempt at this did nothing. `setState` is
     * asynchronous: `setGliding(true)` only schedules a re-render, so the
     * `scrollTo` two lines below still ran while `scroll-snap-type: mandatory`
     * was on the element, Chrome resolved the snap on the first frame, and the
     * card teleported exactly as before. The class swapped in afterwards, when
     * there was nothing left to animate.
     *
     * Writing the style directly takes effect before the next line runs, which
     * is the whole requirement.
     */
    track.style.scrollSnapType = 'none';
    if (glideTimer.current !== null) window.clearTimeout(glideTimer.current);
    /*
     * A timer rather than the `scrollend` event: Safari has only shipped
     * `scrollend` recently, and a missed re-enable would leave snap off for the
     * rest of the session — swipes would drift to a stop between two cards.
     * 500ms comfortably outlasts a smooth scroll of this distance, and
     * re-enabling snap a little late is invisible.
     *
     * Cleared to `''` rather than set to a value, so the class on the element
     * stays the single source of truth for what snapping should be.
     */
    glideTimer.current = window.setTimeout(() => {
      track.style.scrollSnapType = '';
    }, 500);

    /*
     * `scrollTo` with a signed offset rather than `scrollIntoView`, which also
     * scrolls the PAGE vertically to bring the card into view — so pressing
     * "next" would jump the whole screen. The sign follows the document
     * direction, matching how the browser reports `scrollLeft` in RTL.
     *
     * The offset is `index × stride`, where stride includes the gap between
     * cards — not `index × clientWidth`, which lands short by one gap per card
     * and leaves the third card visibly off-centre.
     */
    const direction = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollTo({ left: direction * clamped * step(), behavior: 'smooth' });
    /*
     * The dots update NOW rather than waiting for the scroll to report back.
     * With snap suspended the settle is animated, so `onScroll` would trail the
     * press by the length of the animation and the pressed dot would light up
     * late.
     */
    setActive(clamped);
  };

  // A pending re-enable must not fire after unmount — it would set state on a
  // component that is gone.
  React.useEffect(
    () => () => {
      if (glideTimer.current !== null) window.clearTimeout(glideTimer.current);
    },
    [],
  );

  const single = entries.length <= 1;

  return (
    <div className="w-full max-w-md">
      <div
        ref={trackRef}
        onScroll={syncActive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        /* Also on LEAVE and CANCEL: a mouse dragged out of the track and
           released elsewhere never fires `pointerup` here, and the carousel
           would stay stuck in the dragging state until the next press. */
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        /*
         * `scrollbar-none` is a project utility (globals.css). The scrollbar
         * would sit under the card and read as part of it — and the dots below
         * already say how many cards there are.
         *
         * `snap-x snap-mandatory` makes every scroll settle on a card rather
         * than halfway between two.
         *
         * SNAP IS SUSPENDED WHILE DRAGGING. `scroll-snap-type` applies to
         * programmatic scrolls too, so with it on, every `scrollLeft` assignment
         * in `onPointerMove` is yanked back to the nearest snap point and the
         * card judders instead of following the pointer. `endDrag` scrolls to
         * the nearest index itself, so the settling behaviour is unchanged.
         *
         * The cursor says the track is draggable, and `select-none` stops a drag
         * across the card from selecting the balance text instead of moving it.
         *
         * ## The gap is `px-2` on the SLIDE, not `gap-4` on this track
         *
         * `gap-4` was the obvious answer and it was invisible. Each slide is
         * exactly the track's width, so the gap sits between two boxes only one
         * of which is ever on screen — the space existed, entirely outside the
         * viewport, and the cards still met at a hard seam while dragging.
         *
         * Padding inside the slide puts the space where it can be seen: the card
         * is inset from both edges of its own slide, so any two adjacent cards
         * are separated by the sum of their padding. `-mx-2` on the track then
         * cancels the outer half, so the first and last cards still line up with
         * everything else on the page instead of sitting 8px inboard.
         *
         * It also keeps the scroll geometry simple — with no gap, one step is
         * exactly one slide width, which is what `step()` measures.
         */
        className={`scrollbar-none -mx-2 flex overflow-x-auto ${
          dragging ? 'cursor-grabbing select-none' : 'cursor-grab'
        } ${
          /* Snap off while DRAGGING so the card tracks the pointer. The GLIDE
             case is handled by writing `scrollSnapType` on the element directly
             — see `scrollToIndex` for why a class cannot do it. */
          dragging ? '' : 'snap-x snap-mandatory'
        }`}
      >
        {entries.map(({ code, label }) => (
          /*
           * `w-full shrink-0` — each slide is exactly the track's width, which
           * is what makes `scrollLeft / clientWidth` a valid index and keeps one
           * card on screen at a time.
           */
          <div key={code} className="w-full shrink-0 snap-center px-2">
            <WalletCard
              label={label}
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
