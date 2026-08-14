import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

/**
 * A loading button must not accept a second click.
 *
 * Every submit on /deposit, /withdraw and /transfer is this component with
 * `loading` set from an in-flight request. If it stays clickable, a client who
 * taps twice files two deposits, two withdrawals or two transfers — and the
 * screen is telling them to wait while it happens.
 *
 * The idempotency keys on those paths are what stop the SERVER acting twice.
 * They are not a reason to let the button through: a key protects the money, it
 * does not stop the client believing the first press failed.
 *
 * Rendered without providers on purpose — a button has no query, no router and
 * no context, and pulling in `renderWithProviders` would test the harness.
 */
describe('Button, while loading', () => {
  /*
   * THE regression this file exists for.
   *
   * The implementation read `disabled={disabled ?? loading}`. Nullish coalescing
   * only falls back when `disabled` is null or undefined, so an explicit `false`
   * — which is what every real call site computes once its form is valid —
   * kept the button enabled with a spinner on it.
   *
   * `disabled={false}` is therefore the case that matters, and it is the one the
   * obvious test (`<Button loading />` with no `disabled` prop) does NOT catch:
   * that one passed throughout.
   */
  it('is disabled when loading, even with disabled explicitly false', () => {
    render(
      <Button loading disabled={false}>
        Pay
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
  });

  it('does not fire a second click while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button loading disabled={false} onClick={onClick}>
        Pay
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays disabled when the caller disables it for its own reasons', () => {
    render(
      <Button loading={false} disabled>
        Pay
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
  });

  it('is enabled when neither loading nor disabled', () => {
    render(<Button>Pay</Button>);
    expect(screen.getByRole('button', { name: 'Pay' })).toBeEnabled();
  });

  /*
   * `aria-busy` rather than colour alone: a client using a screen reader gets
   * no spinner, and "disabled" on its own does not say why. Together they mean
   * "working", which is the state the button is actually in.
   */
  it('announces itself as busy while loading', () => {
    render(<Button loading>Pay</Button>);
    expect(screen.getByRole('button', { name: 'Pay' })).toHaveAttribute('aria-busy', 'true');
  });
});
