import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthShell } from './auth-shell';

/**
 * EVERY ROUTE OUT OF AN AUTH SCREEN CARRIES THE REFERRAL CODE — not just the
 * one somebody remembered.
 *
 * A referral code is attribution, and attribution is money: it is written at
 * registration and, once missed, a partner loses that client for good. The
 * explicit "Sign in" cross-link was fixed for exactly this. The MARK beside it
 * was not, and it is the most prominent clickable thing on the page — so a
 * visitor landing on `/auth/register?ref=CODE`, clicking the logo, and then
 * "Create account" arrived at a bare register form with the code gone and
 * nothing on screen saying so.
 *
 * Found by walking FSD §14 journey 2 by hand. The e2e spec asserted the
 * JOURNEY through the named link and was right to — it simply never clicked the
 * logo, which is the point: a control nobody thought of is not covered by a
 * test of the controls they did.
 *
 * So this asserts the PROPERTY (no auth link leaves without the code) rather
 * than one link's href, because naming links one at a time is how the mark got
 * missed in the first place.
 */
const authLinks = (container: HTMLElement) =>
  [...container.querySelectorAll('a[href^="/auth/"]')].map((a) => a.getAttribute('href') ?? '');

describe('the auth shell', () => {
  it('sends the mark to sign-in by default', () => {
    const { container } = render(<AuthShell heading="Sign in">form</AuthShell>);

    expect(authLinks(container)).not.toHaveLength(0);
    expect(authLinks(container).every((href) => href === '/auth/login')).toBe(true);
  });

  it('carries a referral code on EVERY route out, the mark included', () => {
    const { container } = render(
      <AuthShell
        heading="Create account"
        homeHref="/auth/login?ref=CODE123"
        footer={<a href="/auth/login?ref=CODE123">Sign in</a>}
      >
        form
      </AuthShell>,
    );

    const links = authLinks(container);
    // The control: there really are several, so "every" is a statement about a
    // populated set rather than a vacuous truth over an empty one.
    expect(links.length).toBeGreaterThan(1);
    expect(links.every((href) => href.includes('ref=CODE123'))).toBe(true);
  });

  it('invents no code when the visitor arrived without one', () => {
    const { container } = render(<AuthShell heading="Create account">form</AuthShell>);

    expect(authLinks(container).some((href) => href.includes('ref='))).toBe(false);
    expect(screen.getByText('form')).toBeInTheDocument();
  });
});
