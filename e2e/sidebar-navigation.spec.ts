import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The sidebar in a real browser — the things jsdom cannot see: whether the
 * frame survives a page change, what the menu shows WHILE a page loads, the
 * phone drawer's focus and visibility, and the mirrored shell.
 *
 * Every case here is a defect a live check found on 25 Sep 2026:
 *
 *  - each page change REBUILT the whole frame (every section wrapped its own
 *    `<PortalLayout>`), so a collapsed sidebar came back expanded on the next
 *    click and a group opened while a page loaded was dropped when it landed;
 *  - the menu fell back to the page being LEFT for as long as the next one took
 *    to load, so the group you clicked in folded shut and opened again;
 *  - the phone drawer snapped instead of sliding, ignored Escape, let focus
 *    walk out to the page behind the overlay, and stayed tabbable while shut;
 *  - in Arabic the sidebar stayed on the left of a right-to-left page.
 */

const sidebar = (page: Page) => page.locator('#portal-sidebar');
const nav = (page: Page) => page.locator('#portal-sidebar nav');

interface MenuRecorder {
  __menuStates: { path: string; state: string }[];
}

/**
 * Holds every client-side page load (Next's RSC requests) for `ms`, so a state
 * the menu passes through for a frame on a fast machine is held long enough to
 * be recorded.
 */
async function slowPageLoads(page: Page, ms: number): Promise<void> {
  await page.route('**/*', async (route) => {
    const headers = route.request().headers();
    if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.fallback();
  });
}

/**
 * From now on, records every DISTINCT state the menu shows: which groups are
 * open, which row is selected, which page is current.
 */
async function recordMenu(page: Page): Promise<void> {
  await page.evaluate(() => {
    const name = (el: Element) =>
      (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '')
        .replace(/\d+/g, '')
        .trim()
        .replace(/\s+pages$/, '');
    const snap = () => {
      const menu = document.querySelector('#portal-sidebar nav');
      if (!menu) return 'no menu';
      return JSON.stringify({
        open: [...menu.querySelectorAll('button[aria-expanded="true"]')].map(name),
        selected: [...menu.querySelectorAll('[data-selected]')].map(name),
        current: [...menu.querySelectorAll('[aria-current="page"]')].map(name),
      });
    };
    const w = window as unknown as MenuRecorder;
    w.__menuStates = [];
    let last = snap();
    new MutationObserver(() => {
      const state = snap();
      if (state === last) return;
      last = state;
      w.__menuStates.push({ path: location.pathname, state });
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'data-selected', 'aria-current', 'class'],
    });
  });
}

const recordedStates = (page: Page) =>
  page.evaluate(() => (window as unknown as MenuRecorder).__menuStates);

test.describe('the portal sidebar at a desk', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'the desk sidebar — the phone drawer has its own cases below');
  });

  test('is ONE frame for every page — never rebuilt by a navigation', async ({ page }) => {
    await page.goto('/dashboard');
    await sidebar(page).evaluate((el) => {
      el.dataset['probe'] = 'kept';
    });

    await nav(page).getByRole('link', { name: 'Wallet', exact: true }).click();
    await page.waitForURL(/\/wallet$/);
    await nav(page).getByRole('link', { name: 'Transactions', exact: true }).click();
    await page.waitForURL(/\/transactions$/);

    // The same element, not an identical-looking new one.
    await expect(sidebar(page)).toHaveAttribute('data-probe', 'kept');
  });

  test('remembers a collapsed sidebar across pages and a reload', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /collapse the sidebar/i }).click();
    const expand = page.getByRole('button', { name: /expand the sidebar/i });
    await expect(expand).toBeVisible();

    await nav(page).getByRole('link', { name: 'Wallet', exact: true }).click();
    await page.waitForURL(/\/wallet$/);
    await expect(expand).toBeVisible();

    await page.reload();
    await expect(expand).toBeVisible();
  });

  test('shows where a click is going at once, and nothing moves when the page lands', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await slowPageLoads(page, 1500);
    await nav(page)
      .getByRole('button', { name: /^Transactions pages/ })
      .click();
    await recordMenu(page);

    await nav(page).getByRole('link', { name: 'Deposit', exact: true }).click();
    await page.waitForURL(/\/deposit$/);
    await page.waitForLoadState('networkidle');

    const states = await recordedStates(page);
    // ONE change — straight to the destination, never back to the page being
    // left and never a group folding and reopening on the way…
    expect(states).toHaveLength(1);
    expect(JSON.parse(states[0]?.state ?? '{}')).toEqual({
      open: ['Transactions'],
      selected: ['Transactions'],
      current: ['Deposit'],
    });
    // …made while the dashboard was still on screen: the menu answered the
    // click, not the page's arrival.
    expect(states[0]?.path).toBe('/dashboard');
  });

  test('opens a group in place from its arrow, and its page from its name', async ({ page }) => {
    await page.goto('/dashboard');
    const arrow = nav(page).getByRole('button', { name: /^Transactions pages/ });
    await arrow.click();
    await expect(arrow).toHaveAttribute('aria-expanded', 'true');
    await expect(page).toHaveURL(/\/dashboard$/);

    await nav(page).getByRole('link', { name: 'Transactions', exact: true }).click();
    await page.waitForURL(/\/transactions$/);
    await expect(nav(page).locator('[aria-current="page"]')).toHaveText('Statement');
  });

  test('mirrors the whole shell for Arabic', async ({ page }) => {
    await page.goto('/dashboard');
    try {
      await page.evaluate(() => window.localStorage.setItem('oxshare-portal-locale', 'ar'));
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

      // On the inline START edge, which is the right in Arabic.
      const box = await sidebar(page).boundingBox();
      const width = page.viewportSize()?.width ?? 0;
      expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(width);
    } finally {
      // Never leave the shared session's browser speaking Arabic.
      await page.evaluate(() => window.localStorage.removeItem('oxshare-portal-locale'));
    }
  });
});

test.describe('the portal sidebar on a phone', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'the phone drawer — the desk sidebar has its own cases above');
  });

  test('is a proper modal drawer: hidden while shut, named, focused, closed by Escape', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    // Shut, it is HIDDEN — not merely slid off-screen with its links tabbable.
    await expect(sidebar(page)).toBeHidden();

    const open = page.getByRole('button', { name: /open menu/i });
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    // Focus moved INTO the drawer, rather than staying behind the overlay.
    await expect
      .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))
      .toBe(true);
    // It SLIDES: Tailwind v4 moves it with `translate`, which the transition
    // must name, or the drawer snaps.
    expect(await drawer.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain(
      'translate',
    );

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(open).toBeFocused();
  });

  test('navigates from the drawer and closes it behind the tap', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /open menu/i }).click();
    await page
      .getByRole('dialog', { name: 'Menu' })
      .getByRole('link', { name: 'Wallet', exact: true })
      .click();

    await page.waitForURL(/\/wallet$/);
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
  });
});
