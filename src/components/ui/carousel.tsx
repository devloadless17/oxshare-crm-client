'use client';

import * as React from 'react';
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { cn } from '@/lib/utils';

/**
 * shadcn's Carousel, on Embla.
 *
 * ## Why a library, after three hand-written attempts
 *
 * The wallet carousel was rebuilt three times and never animated. Each attempt
 * diagnosed a real cause and none of them was the whole story:
 *
 *   1. `overflow-x-auto` + `scroll-snap` + `scrollTo({ behavior: 'smooth' })` —
 *      mandatory snap resolves on the first frame, so the smooth scroll never
 *      ran.
 *   2. Suspending snap through React state — `setState` is async, so the scroll
 *      had already started under the old value.
 *   3. A CSS `transition-transform` on a translated track — correct geometry,
 *      and then killed by this project's own reduced-motion block, which sets
 *      `transition-duration: 0.001ms !important` on `*`.
 *
 * (3) is the one that matters, because it is not a bug in the carousel at all.
 * A component cannot own a CSS transition: the page can override it, an OS
 * setting can zero it, and `globals.css` already does exactly that to every
 * element. The same wildcard froze the loading spinner mid-arc — there is a
 * comment beside it in `globals.css` recording that report.
 *
 * Embla animates in JavaScript, on `requestAnimationFrame`, writing `transform`
 * per frame. No CSS transition is involved, so no CSS rule can flatten it. That
 * is the property being bought here, over and above not maintaining drag
 * physics, momentum, snapping and RTL by hand.
 *
 * ## Reduced motion SHORTENS the slide. It never removes it.
 *
 * This is the fourth thing that broke this carousel, and it was self-inflicted:
 * the first Embla build set `duration: 0` under `prefers-reduced-motion`, which
 * on a machine with that setting reproduced the exact bug it was meant to fix —
 * the card popped to the next one with no movement at all.
 *
 * Worth stating plainly, because it is not obvious from a browser: Chrome on
 * Windows derives `prefers-reduced-motion` from "Show animations in Windows"
 * (`SPI_GETCLIENTAREAANIMATION`). That is one checkbox in Ease of Access, it is
 * off on plenty of machines for performance rather than for vestibular reasons,
 * and it silently applied to every animation in this app.
 *
 * The slide here is NOT decoration. It is the only thing that says which
 * direction you moved and that the card in front of you changed because of
 * something you did — remove it and pressing Next reads as the content being
 * replaced, not as travelling to a neighbour. `globals.css` already carries this
 * exact argument for the loading spinner, which the same wildcard froze mid-arc:
 * "A progress indicator is not decoration: it is the only thing on screen saying
 * the app has not hung, and freezing it removes the message rather than calming
 * it."
 *
 * So the preference is honoured by making the movement QUICKER — half the
 * duration, one short glide, user-initiated and over in a moment. Nothing here
 * loops, autoplays, parallaxes or moves without being asked, which is what the
 * preference exists to suppress.
 */

type CarouselApi = UseEmblaCarouselType[1];
type EmblaOptions = Parameters<typeof useEmblaCarousel>[0];

interface CarouselContextValue {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: CarouselApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number) => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  selectedIndex: number;
  slideCount: number;
  /** True between pointer-down and release on the track. */
  dragging: boolean;
}

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

export function useCarousel(): CarouselContextValue {
  const context = React.useContext(CarouselContext);
  if (!context) throw new Error('useCarousel must be used within a <Carousel />');
  return context;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The subscribe half of the store above. A no-op when `matchMedia` is absent. */
function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * True when the reader's OS asks for reduced motion.
 */
function usePrefersReducedMotion(): boolean {
  /*
   * `useSyncExternalStore`, not `useState` + `useEffect`.
   *
   * An OS setting is an EXTERNAL STORE — something outside React that changes on
   * its own and has to be read, subscribed to, and re-read. The effect version
   * of this called `setState` during mount, which the project's
   * `react-hooks/set-state-in-effect` rule rejects for good reason: it renders
   * once with a guessed value and again with the real one. This is the hook
   * React provides for exactly that shape, and it tears nothing.
   *
   * The third argument is the SERVER snapshot. `false` — assume motion — because
   * there is no media to query during SSR and the client corrects it before any
   * slide moves.
   *
   * Every `matchMedia` access is guarded: jsdom does not implement it at all, so
   * an unguarded read throws and takes down every test that renders a carousel.
   * Treating "cannot ask" as "no preference stated" is the right default anyway.
   */
  return React.useSyncExternalStore(
    subscribeToReducedMotion,
    () =>
      typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function Carousel({
  opts,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { opts?: EmblaOptions }) {
  const reducedMotion = usePrefersReducedMotion();

  const [carouselRef, api] = useEmblaCarousel({
    align: 'start',
    /*
     * `containScroll: 'trimSnaps'` drops the snap points that would scroll past
     * the last slide, so the track cannot rest on empty space — the state the
     * hand-rolled version needed a clamp for.
     */
    containScroll: 'trimSnaps',
    /*
     * NEVER ZERO, not even under reduced motion — see the header.
     *
     * Embla's `duration` is a scalar, not milliseconds. 25 is its default and
     * lands around a third of a second; 12 is perceptibly quicker while still
     * being a MOVE rather than a cut.
     */
    duration: reducedMotion ? 12 : 25,
    ...opts,
  });

  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [slideCount, setSlideCount] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const onSelect = React.useCallback((embla: NonNullable<CarouselApi>) => {
    setSelectedIndex(embla.selectedScrollSnap());
    setCanScrollPrev(embla.canScrollPrev());
    setCanScrollNext(embla.canScrollNext());
    setSlideCount(embla.scrollSnapList().length);
  }, []);

  React.useEffect(() => {
    if (!api) return;
    /*
     * Reasoned exemption. `api` is Embla's own state — an external store — and
     * it is ALREADY initialised by the time this effect runs, so there is no
     * event left to subscribe to for the first read. Without this the dots and
     * the arrows render from their initial `useState` values and only correct
     * themselves on the first interaction, which shows as both arrows enabled on
     * a single-snap track.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read of Embla's already-initialised state; see above
    onSelect(api);

    /*
     * The drag flag exists to stop TEXT SELECTION mid-swipe.
     *
     * Dragging the track used to sweep a selection highlight across the balance
     * and the wallet id, because a pointer drag over text is what a browser
     * treats as selecting it — reported directly. `user-select: none` fixes it,
     * and applying that permanently would be the lazy version: the wallet id is
     * something a client may legitimately want to select, and the card also
     * offers a copy button that a blanket rule would sit oddly beside.
     *
     * So it is applied only while a drag is actually in progress, which is what
     * these two Embla events bracket.
     */
    const onPointerDown = () => setDragging(true);
    const onPointerUp = () => setDragging(false);

    /*
     * `reInit` as well as `select`: the slide count changes when a wallet is
     * opened or closed, and without it the dots would describe a track that no
     * longer exists.
     */
    api
      .on('select', onSelect)
      .on('reInit', onSelect)
      .on('pointerDown', onPointerDown)
      .on('pointerUp', onPointerUp);

    return () => {
      api
        .off('select', onSelect)
        .off('reInit', onSelect)
        .off('pointerDown', onPointerDown)
        .off('pointerUp', onPointerUp);
    };
  }, [api, onSelect]);

  const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = React.useCallback(() => api?.scrollNext(), [api]);
  const scrollTo = React.useCallback((index: number) => api?.scrollTo(index), [api]);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Arrow keys are the keyboard equivalent of a swipe, for somebody already
      // on the card. The dots below are buttons and reachable by tab.
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext],
  );

  const value = React.useMemo(
    () => ({
      carouselRef,
      api,
      scrollPrev,
      scrollNext,
      scrollTo,
      canScrollPrev,
      canScrollNext,
      selectedIndex,
      slideCount,
      dragging,
    }),
    [
      carouselRef,
      api,
      scrollPrev,
      scrollNext,
      scrollTo,
      canScrollPrev,
      canScrollNext,
      selectedIndex,
      slideCount,
      dragging,
    ],
  );

  return (
    <CarouselContext.Provider value={value}>
      <div
        onKeyDown={onKeyDown}
        className={cn('relative', className)}
        role="region"
        aria-roledescription="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

/** The window onto the track. Embla owns the element this ref lands on. */
export function CarouselContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { carouselRef, dragging } = useCarousel();
  return (
    <div
      ref={carouselRef}
      /*
       * `select-none` ONLY while dragging — see the note on the drag flag.
       * The grab cursors say the track is draggable before anybody tries it;
       * without them a mouse user has no reason to think it moves at all.
       */
      className={cn('overflow-hidden', dragging ? 'cursor-grabbing select-none' : 'cursor-grab')}
    >
      {/*
        `-ml-2` against each slide's `pl-2` is how shadcn spaces slides: the
        padding puts the gap INSIDE the slide, where it is visible mid-drag, and
        the negative margin cancels it at the leading edge so the first card is
        not inset. A `gap` on the track sits entirely outside the window between
        two full-width slides and is never seen — the seam the previous build
        had.
      */}
      <div className={cn('flex -ml-2', className)} {...props} />
    </div>
  );
}

export function CarouselItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      className={cn('min-w-0 shrink-0 grow-0 basis-full pl-2', className)}
      {...props}
    />
  );
}
