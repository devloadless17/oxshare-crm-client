import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignedAmount } from './signed-amount';

/**
 * The amount a client reads to answer "where did my balance go".
 *
 * A withdrawal rendered `text-foreground` — the same white as every other
 * figure on the screen — so the only thing separating it from a deposit was a
 * `−` one character wide. That is the kind of thing nobody files a bug about
 * and everybody misreads, which is why the colours are asserted rather than
 * left to a ternary in three files.
 */
describe('direction decides the colour', () => {
  it('renders a withdrawal in red, with a minus', () => {
    render(<SignedAmount direction="withdrawal" amount="250.00000000" currency="USD" />);

    const el = screen.getByText(/250/);
    expect(el.className).toContain('text-destructive');
    expect(el.className).not.toContain('text-success');
    expect(el.textContent).toContain('−');
  });

  it('renders a deposit in green, with a plus', () => {
    render(<SignedAmount direction="deposit" amount="250.00000000" currency="USD" />);

    const el = screen.getByText(/250/);
    expect(el.className).toContain('text-success');
    expect(el.className).not.toContain('text-destructive');
    expect(el.textContent).toContain('+');
  });

  it('keeps the sign as well as the colour', () => {
    /*
     * Colour is NOT the only carrier. Roughly one man in twelve cannot separate
     * red from green, and for them the glyph is the whole signal — so a future
     * tidy-up that drops the prefix "because the colour says it" fails here.
     */
    const { container } = render(
      <SignedAmount direction="withdrawal" amount="10.00000000" currency="USD" />,
    );
    expect(container.textContent).toMatch(/^−/);
  });
});

describe('money stays a string (§6.1)', () => {
  it('formats rather than printing the raw decimal', () => {
    render(<SignedAmount direction="withdrawal" amount="250.00000000" currency="USD" />);
    // The stored scale is for arithmetic. Eight zeros on screen is how a client
    // learns the product does not format money.
    expect(screen.getByText(/250/).textContent).not.toContain('250.00000000');
  });

  it('survives an amount larger than a double holds exactly', () => {
    render(<SignedAmount direction="withdrawal" amount="12345678901.23456789" currency="USD" />);
    // Through a float this is already wrong before formatting starts.
    expect(screen.getByText(/12,345,678,901/)).toBeInTheDocument();
  });

  it('does not swallow an unparseable amount silently in the sign', () => {
    // `formatMoney` falls back for a value it cannot read; the sign must still
    // describe the direction rather than implying a figure that is not there.
    const { container } = render(
      <SignedAmount direction="withdrawal" amount="not-a-number" currency="USD" />,
    );
    expect(container.textContent).toContain('−');
  });
});
