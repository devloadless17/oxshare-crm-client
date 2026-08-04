import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { NAV_ITEMS } from './portal-layout';

/**
 * Every live navigation target must be a route that exists.
 *
 * Four of the eight sidebar entries pointed at pages that were never built —
 * `/deposit`, `/withdraw`, `/transactions` and `/profile` — and rendered as
 * ordinary enabled links. Two of them were also the primary call-to-action
 * buttons at the top of the dashboard. In the customer-facing app, a funded
 * client clicking "Withdraw" got a Next 404, which does not read as "screen not
 * finished" so much as "this platform cannot pay me".
 *
 * The fix marks them `comingSoon`, matching the admin app's existing pattern.
 * This test is what stops the next unbuilt entry from shipping as a live link:
 * it reads the real filesystem, so it cannot drift from what actually exists,
 * and it fails the moment someone adds a nav item ahead of its page or deletes
 * a page from under one.
 *
 * It deliberately does NOT assert that `comingSoon` entries have no route — the
 * correct end state is that each gets built and the flag comes off, and a test
 * that forbade that would have to be edited to allow the good outcome.
 */

const APP_DIR = join(process.cwd(), 'src', 'app');

/** Does a Next App Router page exist for this pathname? */
function routeExists(href: string): boolean {
  const segments = href.replace(/^\//, '').split('/').filter(Boolean);
  return existsSync(join(APP_DIR, ...segments, 'page.tsx'));
}

describe('portal navigation', () => {
  it('every enabled nav item points at a page that exists', () => {
    const broken = NAV_ITEMS.filter((item) => !item.comingSoon && !routeExists(item.href)).map(
      (item) => `${item.label} → ${item.href}`,
    );

    expect(broken, `nav items with no page.tsx: ${broken.join(', ')}`).toEqual([]);
  });

  it('still offers the built sections', () => {
    const live = NAV_ITEMS.filter((i) => !i.comingSoon).map((i) => i.href);

    // A regression guard in the other direction: marking everything "soon" would
    // satisfy the test above while making the portal useless.
    expect(live).toContain('/dashboard');
    expect(live).toContain('/wallet');
    expect(live).toContain('/kyc');
    expect(live).toContain('/accounts');
  });

  it('marks the unbuilt money screens rather than linking them', () => {
    const soon = NAV_ITEMS.filter((i) => i.comingSoon).map((i) => i.href);

    // These are committed scope (CORE-06 deposit, CORE-07/08 withdrawal,
    // IND-05), and the backend already serves POST /payments/withdrawals and
    // GET /payments/transactions — so they are pending UI, not dropped features.
    expect(soon).toEqual(
      expect.arrayContaining(['/deposit', '/withdraw', '/transactions', '/profile']),
    );
  });

  it('sanity-checks the route probe itself', () => {
    // A probe that always returned true would make the first test vacuous.
    expect(routeExists('/dashboard')).toBe(true);
    expect(routeExists('/deposit')).toBe(false);
  });
});
