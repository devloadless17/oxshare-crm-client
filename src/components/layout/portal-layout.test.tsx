import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { NAV_ITEMS, kycNavBadge } from './portal-layout';

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

  it('links the money screens that now exist', () => {
    const live = NAV_ITEMS.filter((i) => !i.comingSoon).map((i) => i.href);

    // These were `comingSoon` while their routes did not exist. All three now
    // do: /withdraw and /transactions are real screens against real endpoints,
    // and /deposit is a real route rendering BackendPending — CORE-06 is blocked
    // on Whish/USDT credentials (§12.5), and a form with nowhere to submit would
    // be worse than the 404 it replaces.
    expect(live).toEqual(expect.arrayContaining(['/withdraw', '/transactions', '/deposit']));
  });

  it('still marks what genuinely has no route', () => {
    const soon = NAV_ITEMS.filter((i) => i.comingSoon).map((i) => i.href);

    // The list is not empty by accident. /profile has no page, and marking it is
    // what keeps this honest rather than the alternative of quietly deleting the
    // entry and losing the reminder that it is committed scope.
    expect(soon).toEqual(['/profile']);
  });

  it('sanity-checks the route probe itself', () => {
    // A probe that always returned true would make the first test vacuous.
    expect(routeExists('/dashboard')).toBe(true);
    expect(routeExists('/profile')).toBe(false);
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
    // The header pill is what states verified status.
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
