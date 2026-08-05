import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { NAV_ITEMS, kycNavBadge, visibleNavItems } from './portal-layout';

/**
 * Every live navigation target must be a route that exists.
 *
 * Four of the eight sidebar entries once pointed at pages that were never built
 * — `/deposit`, `/withdraw`, `/transactions` and `/profile` — and rendered as
 * ordinary enabled links. Two of them were also the primary call-to-action
 * buttons at the top of the dashboard. In the customer-facing app, a funded
 * client clicking "Withdraw" got a Next 404, which does not read as "screen not
 * finished" so much as "this platform cannot pay me".
 *
 * All four exist now, and the rail has been cut to the four DESTINATIONS —
 * dashboard, accounts, wallet, transactions — plus KYC while it is unfinished.
 * Deposit and Withdraw became actions on /wallet; Profile moved into the
 * account menu. The routes stayed.
 *
 * This test is what stops the next unbuilt entry from shipping as a live link:
 * it reads the real filesystem, so it cannot drift from what actually exists,
 * and it fails the moment someone adds a nav item ahead of its page or deletes
 * a page from under one. The de-listed routes are asserted to still EXIST for
 * the same reason — dropping a link is a navigation decision, dropping a route
 * breaks every bookmark and every link already e-mailed to a client.
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

/** Every href the rail can ever show, in either KYC state. */
const ALL_HREFS = [
  ...new Set([...visibleNavItems('approved', 1), ...visibleNavItems(undefined, 0)]),
];

describe('portal navigation', () => {
  it('every enabled nav item points at a page that exists', () => {
    const broken = ALL_HREFS.filter((item) => !item.comingSoon && !routeExists(item.href)).map(
      (item) => `${item.label} → ${item.href}`,
    );

    expect(broken, `nav items with no page.tsx: ${broken.join(', ')}`).toEqual([]);
  });

  it('still offers the built sections', () => {
    const live = NAV_ITEMS.filter((i) => !i.comingSoon).map((i) => i.href);

    // A regression guard in the other direction: pruning the rail down to
    // nothing would satisfy the test above while making the portal useless.
    expect(live).toContain('/dashboard');
    expect(live).toContain('/wallet');
    expect(live).toContain('/accounts');
    expect(live).toContain('/transactions');
  });

  /**
   * Deposit and Withdraw left the rail, and this is the assertion that says so
   * out loud.
   *
   * They are ACTIONS on a balance, not destinations — two top-level slots for
   * one idea, neither showing the number the client is deciding against. They
   * are buttons on /wallet now.
   *
   * The routes are deliberately NOT deleted, and the second half asserts that:
   * removing a link is a navigation decision, removing a route breaks every
   * bookmark and every link already sent to a client by e-mail.
   */
  it('keeps the money ACTIONS off the rail while keeping their routes alive', () => {
    const hrefs = ALL_HREFS.map((i) => i.href);
    expect(hrefs).not.toContain('/deposit');
    expect(hrefs).not.toContain('/withdraw');

    expect(routeExists('/deposit')).toBe(true);
    expect(routeExists('/withdraw')).toBe(true);
  });

  it('moved Profile into the account menu rather than deleting it', () => {
    // It was a `comingSoon` rail entry for months because the route did not
    // exist. It exists now, and it belongs in the account menu at the foot of
    // the sidebar, not in a rail of money screens.
    expect(ALL_HREFS.map((i) => i.href)).not.toContain('/profile');
    expect(routeExists('/profile')).toBe(true);
  });

  it('sanity-checks the route probe itself', () => {
    // A probe that always returned true would make the first test vacuous.
    expect(routeExists('/dashboard')).toBe(true);
    expect(routeExists('/not-a-real-route')).toBe(false);
  });
});

/**
 * KYC disappears from the rail once there is nothing left to do there.
 *
 * Not "turns into a tick" — onboarding is a task, and a completed task is not a
 * destination. `saveStep` throws for an approved submission, so the link led an
 * approved client to a page whose entire content was "you are done".
 */
describe('visibleNavItems', () => {
  it('offers KYC while it is unfinished', () => {
    expect(visibleNavItems('not_started', 0).map((i) => i.href)).toContain('/kyc');
    expect(visibleNavItems('rejected', 0).map((i) => i.href)).toContain('/kyc');
    expect(visibleNavItems('under_review', 0).map((i) => i.href)).toContain('/kyc');
  });

  it('drops it once the client is verified', () => {
    expect(visibleNavItems('approved', 1).map((i) => i.href)).not.toContain('/kyc');
  });

  it('drops it on EITHER signal, matching kycNavBadge', () => {
    // approve() writes the submission status first and the verification level
    // second, so there is a real window where these differ. The rail and the
    // badge must agree in that window or the sidebar contradicts itself —
    // which is the exact bug the badge function was written to close.
    expect(visibleNavItems('under_review', 1).map((i) => i.href)).not.toContain('/kyc');
    expect(visibleNavItems('approved', 0).map((i) => i.href)).not.toContain('/kyc');

    for (const [status, level] of [
      ['under_review', 1],
      ['approved', 0],
      ['approved', 1],
    ] as const) {
      const shown = visibleNavItems(status, level).some((i) => i.href === '/kyc');
      expect(shown, `${status}/${level}`).toBe(kycNavBadge(status, level) !== undefined);
    }
  });

  it('shows it while the status has not loaded', () => {
    // undefined is the first render, before /kyc/status resolves. Prompting is
    // the safe default; hiding onboarding from someone who needs it is not.
    expect(visibleNavItems(undefined, undefined).map((i) => i.href)).toContain('/kyc');
  });
});

/**
 * The KYC sidebar badge follows state — which it did not.
 *
 * `NAV_ITEMS` carried `badge: t('kyc.required')` as a module-level constant,
 * evaluated once at import. So an approved client was told their verification
 * was "Required" forever, while the header pill in the same layout read
 * "Verified Account" off the values below. The comment above the status query
 * already claimed "the sidebar badge follows the KYC status"; nothing connected
 * the two.
 *
 * These assert the connection rather than the styling, so they keep holding if
 * the badge is restyled — and they fail immediately if anyone puts a literal
 * back on the nav item.
 */
describe('kycNavBadge', () => {
  it('shows nothing once the client is verified', () => {
    // Not "Verified": a badge is a call to action and there is no action left.
    // The header pill that used to state verified status has been removed —
    // a status light that never changes is not information. The nav ENTRY
    // disappears with the badge; see visibleNavItems above.
    expect(kycNavBadge('approved', 1)).toBeUndefined();
  });

  it('stays silent while the two signals disagree, in either direction', () => {
    // approve() writes the submission status first and the verification level
    // second, so there is a real window where these differ. The badge asks
    // "is there KYC work left", and in that window there is none either way —
    // so both halves resolve to no prompt rather than a flickering one.
    expect(kycNavBadge('under_review', 1)).toBeUndefined();
    expect(kycNavBadge('approved', 0)).toBeUndefined();
  });

  it('calls a rejected submission out, and distinguishes it from untouched', () => {
    const rejected = kycNavBadge('rejected', 0);
    const notStarted = kycNavBadge('not_started', 0);

    expect(rejected?.tone).toBe('destructive');
    expect(notStarted?.tone).toBe('warning');
    // A client who was rejected and one who never started need different
    // prompts — the first has work to redo, the second has work to begin.
    expect(rejected?.text).not.toBe(notStarted?.text);
  });

  it('says a submission is in review rather than required', () => {
    // Telling a client who has already uploaded everything that KYC is
    // "Required" is the same lie in a smaller form.
    for (const status of ['submitted', 'under_review'] as const) {
      expect(kycNavBadge(status, 0)?.tone).toBe('info');
    }
  });

  it('falls back to Required when the status has not loaded', () => {
    // undefined is the first render, before /kyc/status resolves. Prompting is
    // the safe default; claiming verified would not be.
    expect(kycNavBadge(undefined, undefined)?.tone).toBe('warning');
  });

  it('carries no hardcoded badge on any nav item', () => {
    // The regression itself: a literal here is how the bug shipped.
    expect(NAV_ITEMS.filter((i) => i.badge !== undefined)).toEqual([]);
  });
});
