import { expect, test, type Page } from '@playwright/test';
import { collectRejections } from './helpers';

/**
 * Every page of the portal, as a signed-in client actually meets them.
 *
 * The KYC and auth specs go deep on two journeys. This one goes WIDE: it visits
 * every route the portal serves and asks the same four questions of each, which
 * are the questions that have actually broken here.
 *
 *   1. Does it render at all, or does something throw on the way in?
 *   2. Does the chrome survive a hard refresh? The sidebar vanishing on /kyc was
 *      found by a human, not by 213 unit tests, because it needed a real page
 *      load with a real cookie and a real in-flight request.
 *   3. Does it stay signed in, or does a page bounce a valid session to login?
 *   4. Does it ask the API for anything it is not allowed to have? A 403 fired
 *      on every navigation is invisible in the UI and only ever shows in a log.
 *
 * Written as a table rather than a spec per page on purpose: a new route should
 * cost one line here, and a route that nobody adds a line for is a route nobody
 * checked. Anything that needs more than these four questions gets its own file.
 */

/**
 * Make the navigation reachable, whatever the viewport.
 *
 * On a phone the sidebar is a drawer behind a hamburger, so the desktop version
 * of "click the Wallet link" simply cannot happen — and a spec that only ran at
 * 1280px left the mobile navigation journey untested on the device most of these
 * clients use. Opening it here means the SAME journey is asserted at both
 * widths, rather than one of them being quietly skipped.
 */
async function openNavigation(page: Page): Promise<void> {
  const hamburger = page.getByRole('button', { name: /open menu/i });
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  }
}

/** `main` renders on every page; `navigation` is the signed-in chrome. */
async function expectPortalChrome(page: Page, where: string): Promise<void> {
  await expect(page.getByRole('main'), `${where} rendered no main content`).toBeVisible();
  await expect(page.getByRole('navigation').first(), `${where} lost its chrome`).toBeAttached();
}

/**
 * Every route a signed-in client can reach from the navigation.
 *
 * `/kyc` is deliberately included even though `kyc-navigation.spec.ts` covers it
 * in depth — the questions asked here are different, and it is the page whose
 * chrome broke twice.
 */
const PORTAL_ROUTES = [
  '/dashboard',
  '/accounts',
  '/wallet',
  '/transactions',
  '/platforms',
  '/profile',
  '/kyc',
] as const;

test.describe('every portal page', () => {
  for (const route of PORTAL_ROUTES) {
    test(`${route} renders, refreshes and stays signed in`, async ({ page }) => {
      const rejections = collectRejections(page);

      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(page.url(), `${route} redirected away from itself`).toContain(route);
      await expectPortalChrome(page, route);

      // The hard refresh: a fresh document, an empty in-memory context, and a
      // cookie the app cannot read. Everything it knows it has to ask for.
      await page.reload();
      await page.waitForLoadState('networkidle');
      expect(page.url(), `${route} redirected away after a refresh`).toContain(route);
      await expectPortalChrome(page, `${route} after refresh`);

      // Never the signed-out screen, on either load.
      await expect(
        page.getByRole('button', { name: /^sign in$/i }),
        `${route} rendered the signed-out screen`,
      ).toHaveCount(0);

      expect(rejections.list(), `${route} made requests it is not allowed to make`).toEqual([]);
    });
  }
});

test.describe('moving around the portal', () => {
  test('navigates between pages without losing the session', async ({ page }) => {
    /*
     * Client-side navigation, not `goto`.
     *
     * A full page load re-runs everything from scratch and hides the failure
     * mode this catches: state that is built once at mount and then never
     * updated. The KYC badge reading "Required" on an approved account was
     * exactly that, and it was invisible to anything that reloaded between
     * assertions.
     */
    const rejections = collectRejections(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    for (const route of ['/wallet', '/transactions', '/accounts', '/dashboard']) {
      await openNavigation(page);
      const nav = page.getByRole('navigation').first();
      // `.first()`: the layout renders its nav twice at some widths (sidebar and
      // drawer), and a bare match is a strict-mode violation rather than a
      // failure anybody can read.
      await nav
        .getByRole('link', { name: new RegExp(route.slice(1), 'i') })
        .first()
        .click();
      await page.waitForURL(new RegExp(route));
      await expectPortalChrome(page, `${route} via the sidebar`);
    }

    expect(rejections.list()).toEqual([]);
  });

  test('survives the browser back and forward buttons', async ({ page }) => {
    // The navigation nobody tests and everybody uses. Next's client router and
    // an auth context that re-resolves per route can disagree here in a way no
    // in-app link exercises.
    await page.goto('/dashboard');
    await page.goto('/wallet');
    await page.goto('/transactions');

    await page.goBack();
    await expect(page).toHaveURL(/\/wallet/);
    await expectPortalChrome(page, '/wallet after Back');

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await expectPortalChrome(page, '/dashboard after Back');

    await page.goForward();
    await expect(page).toHaveURL(/\/wallet/);
    await expectPortalChrome(page, '/wallet after Forward');

    await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);
  });

  test('opening a page directly is the same as reaching it by link', async ({ page }) => {
    /*
     * Deep-linking is how a client returns from an email, a bookmark, or a
     * second tab, and it is the path that skips every piece of state the app
     * built on the way in. A page that only works when you arrive from
     * /dashboard works for nobody on a Monday morning.
     */
    for (const route of PORTAL_ROUTES) {
      await page.goto(route);
      await expect(page, `${route} could not be opened directly`).toHaveURL(new RegExp(route));
      await expectPortalChrome(page, `${route} opened directly`);
    }
  });
});
