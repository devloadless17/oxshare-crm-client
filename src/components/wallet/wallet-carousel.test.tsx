import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WalletCarousel, type CarouselEntry } from './wallet-carousel';
import type { Wallet as WalletRecord } from '@/lib/api/wallet';

/**
 * The wallet carousel — and an honest account of what this file can prove.
 *
 * ## What was here before, and why it is gone
 *
 * The previous version of this file had eleven tests asserting the position of a
 * CSS-transformed track: `transform` containing `-100%`, the presence of
 * `transition-transform duration-300`, and so on. All eleven passed. The
 * carousel did not animate for the person using it.
 *
 * That is the important part. One of those tests was called "keeps the
 * transition class so the move is ANIMATED, not a jump" and it checked that a
 * class name was in a string. The class WAS there. It was being neutralised at
 * runtime by `globals.css`, which sets `transition-duration: 0.001ms !important`
 * on `*` under `prefers-reduced-motion` — so on any machine with that OS setting
 * every transition in the app finishes instantly. A green suite reported the
 * feature working for as long as it was broken.
 *
 * The implementation is Embla now, which animates in JavaScript on
 * `requestAnimationFrame` where no stylesheet can flatten it.
 *
 * ## ⚠️ MOVEMENT IS NOT TESTED HERE, AND CANNOT BE
 *
 * Embla derives its snap points from measured element widths. jsdom performs no
 * layout, so every element reports a width of 0, and Embla resolves the whole
 * track to a SINGLE snap: `canScrollNext()` and `canScrollPrev()` are both false
 * whatever is rendered, and `scrollNext()` has nowhere to go. Clicking an arrow
 * in this environment provably does nothing, so a test asserting it moved could
 * only pass by asserting something that is not movement — which is exactly the
 * mistake the old file made.
 *
 * So this file covers STRUCTURE and AFFORDANCES, which are real and which do
 * regress: that every wallet gets a slide, that the dots match the wallets, that
 * a lone card gets no controls, and that the accessibility contract holds.
 * Sliding, momentum, snapping and the drag are Embla's, exercised by its own
 * suite, and verified here by looking at the screen.
 *
 * If this ever needs real coverage, it needs a real browser — Playwright with a
 * viewport — not a cleverer jsdom assertion.
 */
const wallet = (currency: string): WalletRecord =>
  ({
    id: `w-${currency}`,
    userId: 'u-1',
    currency,
    balance: '250.00000000',
    onHold: '0.00000000',
    available: '250.00000000',
  }) as WalletRecord;

const ENTRIES: CarouselEntry[] = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
];

function setup(entries = ENTRIES) {
  const byCurrency = new Map(entries.map((e) => [e.code, wallet(e.code)]));
  return render(<WalletCarousel entries={entries} byCurrency={byCurrency} holder="A Client" />);
}

describe('the cards it renders', () => {
  it('renders one slide per wallet, all of them mounted', () => {
    const { container } = setup();

    /*
     * ALL of them, not just the visible one. A carousel that mounted only the
     * current card would lose the swipe entirely — there would be nothing to
     * swipe to — and it is the failure mode a naive "render `entries[active]`"
     * rewrite would introduce.
     */
    expect(container.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(3);
    expect(screen.getByText('US Dollar')).toBeInTheDocument();
    expect(screen.getByText('Euro')).toBeInTheDocument();
    expect(screen.getByText('British Pound')).toBeInTheDocument();
  });

  it('gives every wallet a dot that names its currency', () => {
    setup();

    // The dots are the only way to reach a distant card without swiping past
    // every one between, so one missing is a card that cannot be reached.
    for (const code of ['USD', 'EUR', 'GBP']) {
      expect(screen.getByRole('button', { name: new RegExp(code, 'i') })).toBeInTheDocument();
    }
  });
});

describe('one card', () => {
  it('hides the controls rather than disabling them', () => {
    setup([{ code: 'USD', label: 'US Dollar' }]);

    // Dimmed arrows either side of one card imply there is somewhere to go.
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    // The card itself still renders — hiding the chrome must not hide the money.
    expect(screen.getByText('US Dollar')).toBeInTheDocument();
  });

  it('shows the controls again as soon as there are two', () => {
    setup(ENTRIES.slice(0, 2));

    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
  });
});

describe('affordances and accessibility', () => {
  it('says it is a carousel, and that each card is a slide', () => {
    const { container } = setup();

    /*
     * `aria-roledescription` is what tells a screen-reader user this is a
     * carousel rather than an unexplained group of cards — without it the
     * arrows and dots are buttons with no stated relationship to the content.
     */
    expect(container.querySelector('[aria-roledescription="carousel"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-roledescription="slide"]').length).toBeGreaterThan(0);
  });

  it('shows a grab cursor, so a mouse user knows the track is draggable', () => {
    const { container } = setup();

    /*
     * The counterpart of the drag itself, and the half that IS assertable here.
     * Nothing else on the card suggests it moves — without the cursor a mouse
     * user has no reason to try, and the swipe may as well not exist for them.
     *
     * `select-none` is applied alongside `cursor-grabbing` only WHILE dragging
     * (it stops the drag sweeping a selection across the balance). That state is
     * driven by Embla's own pointer events, which need real layout to fire, so
     * it is not reachable from here.
     */
    const viewport = container.querySelector('.overflow-hidden');
    expect(viewport?.className).toContain('cursor-grab');
  });
});
