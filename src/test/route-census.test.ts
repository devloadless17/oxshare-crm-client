import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY SCREEN IS RENDERED BY A TEST, AND EVERY SCREEN THAT FETCHES SAYS WHAT
 * IT DOES WHEN THE FETCH FAILS.
 *
 * The twin of `oxshare-crm-admin/src/test/route-census.test.ts`. The admin app
 * has had this since the console hardening; the portal did not, and that gap was
 * found while signing off Domain 3 — criterion 4 asks that every screen have a
 * render test, and in this repo that was satisfied BY LUCK: `verify-email` and
 * `auth-shell` have tests because somebody wrote them, and nothing refused the
 * next screen that arrived without one.
 *
 * A guarantee that rests on somebody remembering is not a guarantee. That
 * sentence is used twice in this project's own sign-offs to reject other
 * people's mechanisms; it applies here.
 *
 * Note which repo this is. The portal is treated as the REFERENCE
 * implementation — most mature, solved auth and refresh and KYC first — so a
 * check it lacks is one every reader assumes it has.
 *
 * ## Two properties, and they fail differently
 *
 * A page with no render test is UNPROVEN — it may be perfectly fine. A page that
 * fetches and renders no `AsyncBoundary` is a page whose failure state is a
 * design nobody chose: `useResource` distinguishes loading / ready / unavailable
 * / forbidden / unauthenticated / error, and a screen that ignores that renders
 * a 403 as "something went wrong" and an outage as an empty list — a client with
 * money being told they have none.
 *
 * ## The list SHRINKS
 *
 * `UNTESTED` is the twenty-two screens that predate this check, and it is
 * frozen: a new page cannot join it, and every entry removed is a screen that
 * gained a test. The same ratchet this repo already uses for lint warnings and
 * coverage floors, for the same reason — a threshold set above the measured
 * number gets disabled the first time it blocks somebody. Twenty-two is an
 * uncomfortable number and it is the true one; a smaller list would have meant
 * exempting fewer pages than actually lack tests.
 */

/**
 * Every page in the portal, DERIVED — never listed.
 *
 * A plain walk rather than a glob dependency: the point of deriving is that a
 * page added tomorrow is covered without anyone editing this file, and that
 * property should not rest on a package.
 */
function pages(root = 'src/app'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...pages(path));
    else if (entry.name === 'page.tsx') found.push(path);
  }
  return found.sort();
}

/** Screens with no colocated `page.test.tsx` as of this check landing. FROZEN. */
const UNTESTED = new Set([
  'src/app/accounts/[id]/page.tsx',
  'src/app/accounts/page.tsx',
  'src/app/auth/forgot-password/page.tsx',
  'src/app/auth/login/page.tsx',
  'src/app/auth/reset-password/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/deposit/[outcome]/page.tsx',
  'src/app/deposit/page.tsx',
  'src/app/kyc/page.tsx',
  'src/app/kyc/step/[step]/page.tsx',
  'src/app/kyc/submitted/page.tsx',
  'src/app/page.tsx',
  'src/app/partner/page.tsx',
  'src/app/platforms/page.tsx',
  'src/app/profile/page.tsx',
  'src/app/transactions/page.tsx',
  'src/app/transfer/page.tsx',
  'src/app/verify-email/page.tsx',
  'src/app/verify-email/pending/page.tsx',
  'src/app/wallet/page.tsx',
  'src/app/withdraw/page.tsx',
]);

describe('every portal screen is rendered by a test', () => {
  it('no page ships without one, and the frozen list only shrinks', () => {
    const missing = pages().filter(
      (p) => !existsSync(p.replace('page.tsx', 'page.test.tsx')) && !UNTESTED.has(p),
    );
    expect(
      missing,
      'These pages render nothing under test. Add a `page.test.tsx` beside each — ' +
        '`src/test/render.tsx` supplies the providers:\n' +
        missing.map((p) => `  ${p}`).join('\n'),
    ).toEqual([]);
  });

  it('the frozen list names only pages that still exist and still lack a test', () => {
    /*
     * The other direction, and the one that rots. A stale exemption looks like
     * diligence and protects nothing.
     */
    const stale = [...UNTESTED].filter(
      (p) => !existsSync(p) || existsSync(p.replace('page.tsx', 'page.test.tsx')),
    );
    expect(
      stale,
      'These are exempted and no longer need to be — the page gained a test, or went ' +
        `away. Delete them from UNTESTED:\n${stale.map((p) => `  ${p}`).join('\n')}`,
    ).toEqual([]);
  });

  it('sees a real, populated set of pages', () => {
    /*
     * The non-vacuity floor. Every assertion above is `toEqual([])`, and all of
     * them pass trivially if the walk returns nothing — a rename of `src/app`
     * would turn this file green while checking not one screen. The number is a
     * floor rather than an equality so adding a page does not fail it.
     */
    expect(pages().length).toBeGreaterThanOrEqual(20);
  });
});

describe('every screen that fetches declares its failure state', () => {
  it('a page using useResource renders an AsyncBoundary', () => {
    /*
     * NO EXEMPTION LIST, and unlike the admin twin this one never needed one:
     * every fetching screen in the portal already renders a boundary. Landing it
     * exemption-free is the whole value — it is a guarantee from today rather
     * than a backlog, and there is no list here for a second offender to join.
     */
    const unguarded = pages().filter((p) => {
      const src = readFileSync(p, 'utf8');
      return src.includes('useResource') && !src.includes('AsyncBoundary');
    });
    expect(
      unguarded,
      'These pages fetch through useResource and render no AsyncBoundary, so their ' +
        'forbidden / unavailable / error states are whatever the page improvised:\n' +
        unguarded.map((p) => `  ${p}`).join('\n'),
    ).toEqual([]);
  });
});
