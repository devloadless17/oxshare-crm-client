import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletCarousel, type CarouselEntry } from './wallet-carousel';
import type { Wallet as WalletRecord } from '@/lib/api/wallet';

/**
 * The carousel, which stopped animating three times before it was rebuilt.
 *
 * Each earlier fix was correct about its own cause — snap resolving a
 * programmatic scroll on the first frame, `setState` landing too late to
 * suspend it, `scroll-behavior: auto !important` from the reduced-motion block
 * — and none was enough, because native smooth scrolling is CSS the page can
 * override and a snap model that fights it.
 *
 * It is a transform with a transition now, which is testable in a way the
 * scroll version was not: jsdom reports no layout, so nothing about
 * `scrollLeft` could ever be asserted here. `transform` is a style this file
 * can read.
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
  const view = render(
    <WalletCarousel entries={entries} byCurrency={byCurrency} holder="A Client" />,
  );
  // The transformed element is the flex track — the viewport's only child.
  const track = view.container.querySelector('[aria-roledescription="carousel"] > div');
  if (!track) throw new Error('track not found');
  return { ...view, track: track as HTMLElement };
}

describe('moving between cards', () => {
  it('starts on the first card', () => {
    const { track } = setup();
    expect(track.style.transform).toContain('calc(0%');
  });

  it('slides to the next card when Next is pressed', async () => {
    const user = userEvent.setup();
    const { track } = setup();

    await user.click(screen.getByRole('button', { name: /next/i }));

    /*
     * The assertion that would have caught the original bug: the track's
     * position CHANGED. Under the scroll implementation this was a `scrollTo`
     * call that jsdom could not report and a real browser resolved instantly.
     */
    expect(track.style.transform).toContain('-100%');
  });

  it('keeps the transition class so the move is ANIMATED, not a jump', () => {
    const { track } = setup();
    /*
     * The whole complaint, as a test. A transform with no transition changes
     * the card without sliding — which is exactly what the scroll version did
     * once snap resolved it on the first frame.
     */
    expect(track.className).toContain('transition-transform');
    expect(track.className).toContain('duration-300');
  });

  it('goes back with Previous', async () => {
    const user = userEvent.setup();
    const { track } = setup();

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /previous/i }));

    expect(track.style.transform).toContain('calc(0%');
  });

  it('jumps straight to a card from its dot', async () => {
    const user = userEvent.setup();
    const { track } = setup();

    await user.click(screen.getByRole('button', { name: /GBP/i }));

    expect(track.style.transform).toContain('-200%');
  });

  it('stops at both ends rather than wrapping', async () => {
    const user = userEvent.setup();
    const { track } = setup();

    // A wallet list is not a loop: arriving back at USD after GBP would read as
    // a fourth card that happens to look like the first.
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(track.style.transform).toContain('-200%');
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('moves with the arrow keys', async () => {
    const user = userEvent.setup();
    const { track } = setup();

    screen.getByRole('group').focus();
    await user.keyboard('{ArrowRight}');
    expect(track.style.transform).toContain('-100%');

    await user.keyboard('{ArrowLeft}');
    expect(track.style.transform).toContain('calc(0%');
  });
});

describe('one card', () => {
  it('hides the controls rather than disabling them', () => {
    setup([{ code: 'USD', label: 'US Dollar' }]);
    // Dimmed arrows either side of one card imply somewhere to go.
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
  });
});

describe('when a wallet disappears', () => {
  it('does not leave the track parked past the end', () => {
    const { rerender, track } = setup();
    const two = ENTRIES.slice(0, 2);

    // An operator closing a wallet from the admin console must not strand the
    // carousel on blank space with no way back.
    rerender(
      <WalletCarousel
        entries={two}
        byCurrency={new Map(two.map((e) => [e.code, wallet(e.code)]))}
        holder="A Client"
      />,
    );

    const offset = Number(/-(\d+)%/.exec(track.style.transform)?.[1] ?? '0');
    expect(offset).toBeLessThanOrEqual(100);
  });
});

describe('accessibility', () => {
  it('announces only the card on screen', async () => {
    const user = userEvent.setup();
    const { container } = setup();

    const slides = () =>
      Array.from(
        container.querySelectorAll('[aria-roledescription="carousel"] > div > [aria-hidden]'),
      ).map((el) => el.getAttribute('aria-hidden'));

    // Every balance announced in order, as one list, is what `aria-hidden`
    // prevents here.
    expect(slides()).toEqual(['false', 'true', 'true']);

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(slides()).toEqual(['true', 'false', 'true']);
  });

  it('lets a finger still scroll the PAGE vertically', () => {
    const { container } = setup();
    const viewport = container.querySelector('[aria-roledescription="carousel"]');
    // Without `touch-action: pan-y` this is the carousel that traps a phone.
    expect(viewport?.className).toContain('touch-pan-y');
  });
});
