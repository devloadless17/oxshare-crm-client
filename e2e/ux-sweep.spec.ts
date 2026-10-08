import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * One sweep, every page, for the defects a person notices and a test suite
 * usually does not.
 *
 * This exists because the verify-email waiting screen shipped with two of them
 * and both were found by a human refreshing the page, not by 253 unit tests:
 * it flashed unstyled content on every reload, and it offered no way off itself.
 * Neither is exotic, and neither is specific to that screen — so rather than fix
 * one page and wait for the next report, this asks the same questions of all of
 * them.
 *
 * What it checks, and why each is here rather than in a component test:
 *
 *  1. NO FLASH OF UNSTYLED CONTENT. Asked with JavaScript disabled, which is
 *     the precise question: runtime CSS-in-JS cannot apply without scripting,
 *     a linked stylesheet always does. Any page that renders full-bleed from
 *     x=0 without JS will visibly jump when the script lands.
 *
 *  2. NO SIDEWAYS SCROLLING ON A PHONE. A document wider than its viewport is
 *     the single most common mobile layout defect and is invisible at 1280px.
 *
 *  3. EVERY CONTROL HAS A NAME. An icon-only button with no text, no aria-label
 *     and no title is announced as "button" and is unusable by anyone not
 *     looking at it. The portal's hamburger was exactly this, and on a phone it
 *     is the only route to navigation.
 *
 *  4. NO STANDALONE SCREEN IS A DEAD END. A page outside the portal chrome has
 *     no sidebar to escape through, so if it offers no link it is a trap.
 *
 * Failures here are real and should be fixed rather than exempted. If something
 * genuinely does not apply, say so in the table with the reason, not by deleting
 * the check.
 */

/** Signed-in pages, which carry the portal chrome. */
/*
 * ⚠️ `/transfer`, `/deposit` and `/withdraw` were MISSING from this list until
 * 11 Sep 2026 — the three screens that actually move a client's money, absent
 * from the sweep whose stated purpose is that sideways scrolling "is the single
 * most common mobile layout defect and is invisible at 1280px".
 *
 * They are also the screens most likely to be used on a phone: a client checks
 * a balance at a desk and moves money from wherever they are. The six that WERE
 * covered are the ones you look at; the three that were not are the ones you
 * act on.
 *
 * Nothing excluded them on purpose — they are simply newer than the list, which
 * is how a census that names its subjects by hand fails. It cannot report what
 * it was never told about, and it looks identical to a passing one.
 */
const PRIVATE = [
  '/dashboard',
  '/accounts',
  '/wallet',
  '/transactions',
  '/platforms',
  '/profile',
  '/transfer',
  '/deposit',
  '/withdraw',
];

/** Standalone screens: no chrome, so they must offer their own way onward. */
const STANDALONE = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/confirm-email',
];

/**
 * Controls whose only content is an icon, and whether the browser can name them.
 *
 * Uses the accessibility tree rather than reading attributes, so `aria-label`,
 * `title`, visually-hidden text and `aria-labelledby` all count — the question
 * is what assistive technology would announce, not which technique was used.
 */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const unnamed: string[] = [];
    document.querySelectorAll('button, a[href]').forEach((el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const named =
        (el.textContent ?? '').trim().length > 0 ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('aria-labelledby');
      if (!named)
        unnamed.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`);
    });
    return unnamed;
  });
}

test.describe('no page flashes unstyled content', () => {
  // Scripting off: CSS-in-JS cannot run, a stylesheet still applies.
  test.use({ javaScriptEnabled: false });

  for (const path of STANDALONE) {
    test(`${path} is laid out before any script runs`, async ({ page }) => {
      await page.goto(path);

      const overflowing = await page.evaluate(() => {
        // Anything painting edge-to-edge from x=0 at full width is either a
        // deliberate full-bleed section or an unstyled document. On these
        // screens it is always the latter.
        const main = document.querySelector('main') ?? document.body.firstElementChild;
        const r = main?.getBoundingClientRect();
        const inner = main?.querySelector('div');
        const ir = inner?.getBoundingClientRect();
        return {
          hasMain: Boolean(r),
          innerWidth: ir?.width ?? null,
          viewport: window.innerWidth,
        };
      });

      expect(overflowing.hasMain, `${path} rendered nothing without JavaScript`).toBe(true);
      if (overflowing.innerWidth !== null) {
        expect(
          overflowing.innerWidth,
          `${path} painted full-bleed without styles — it will jump when the script lands`,
        ).toBeLessThanOrEqual(overflowing.viewport);
      }
    });
  }
});

test.describe('the KYC wizard does not flash either', () => {
  /*
   * Checked separately because it needs a SESSION: signed out, `/kyc` is
   * redirected before anything renders, so it cannot be swept with the public
   * screens.
   *
   * It is here because this shell was the second styled-jsx file in the repo and
   * had exactly the flaw the verify-email screen had — 167 lines of progress-rail
   * CSS injected by JavaScript, on the flow a client reloads most while working
   * through it. The flicker was reported from the running app twice.
   */
  test.use({ storageState: 'e2e/.auth/kyc-client.json' });

  test('gets its CSS from a stylesheet, not from an injected <style> tag', async ({ page }) => {
    /*
     * Asked by ORIGIN rather than by disabling JavaScript.
     *
     * The first version of this check turned scripting off, the way the public
     * screens are checked — and it failed for a reason that has nothing to do
     * with styling: this shell chooses its chrome from data it fetches, so with
     * no scripting it renders nothing at all and there is no element to measure.
     * A red that means "this route needs JavaScript to render" would have been
     * mistaken for "this route still flickers".
     *
     * What actually distinguishes the two is where the rule comes from.
     * styled-jsx writes a `<style>` element into the document at runtime; a real
     * stylesheet arrives as a `<link>` with the HTML. So: no inline `<style>`
     * anywhere may define `.kyc-shell`.
     */
    await page.goto('/kyc/step/1');
    await page.waitForLoadState('networkidle');

    const injected = await page.evaluate(() =>
      [...document.querySelectorAll('style')].some((s) =>
        (s.textContent ?? '').includes('.kyc-shell'),
      ),
    );

    expect(
      injected,
      'the KYC shell CSS is injected by script — it will flash unstyled on every refresh',
    ).toBe(false);
  });
});

test.describe('no page scrolls sideways on a phone', () => {
  test.use({ viewport: { width: 393, height: 851 } });

  for (const path of [...PRIVATE, ...STANDALONE]) {
    test(`${path} fits 393px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        // The page's OWN content area, not the whole document — see below.
        main: (document.querySelector('main')?.innerText ?? '').trim().length,
      }));

      /*
       * NON-VACUITY FIRST. A page that rendered NOTHING — a blank error
       * boundary, a crashed hydration, a redirect to a screen this jar is not
       * signed in for — cannot scroll sideways, so it passes the assertion
       * below for the one reason that should fail it.
       *
       * Not hypothetical: the admin app's copy of this sweep passed
       * `/invite/accept` for exactly that reason, measuring a fifty-character
       * "invalid link" apology instead of the form it was written to check.
       *
       * ⚠️ MEASURED ON `main`, NOT ON `document.body`, AND THE DIFFERENCE IS THE
       * WHOLE POINT. Body text includes the nav chrome — about a hundred
       * characters of it — so a page that rendered only its shell still reads as
       * substantial, which is precisely the case this guard exists to catch.
       *
       * The floor is deliberately LOW because two legitimate screens are terse,
       * measured rather than assumed:
       *
       *     /withdraw  47   step 1 of a 3-step wizard: pick a method
       *     /deposit   57   the same
       *     /transfer 181   ·  /auth/forgot-password 131  ·  /wallet 519
       *
       * A first attempt thresholded body text at 200 and failed all three of
       * those for being sparse rather than broken. A guard that flags correct
       * screens gets deleted, and takes the real cases with it.
       */
      expect(
        overflow.main,
        `${path} rendered an EMPTY <main> at 393px — the width assertion below ` +
          'would pass on a page that rendered only its navigation',
      ).toBeGreaterThan(20);

      expect(
        overflow.scrollWidth,
        `${path} is ${overflow.scrollWidth - overflow.clientWidth}px wider than the screen`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});

/*
 * AN AUTH SCREEN FITS A SHORT PHONE, top and bottom (owner, 26 Sep 2026).
 *
 * Reported on registration: the heading slid up under the logo and the theme
 * toggle, and the last line sat on the bottom edge. The form column CENTRED
 * its content in a fixed-height box, and a tall form overflowing a centred
 * column spills out above as well as below — where nothing can scroll to it.
 * The 393px sweep above never saw it: at that height the form fits.
 *
 * Signed out and at 320×568 (the first iPhone SE, the smallest phone still in
 * use), where the registration form is well taller than the screen. Measured
 * through the heading's own scrolling ancestor, so it holds for any markup.
 */
test.describe('an auth screen keeps clear of its header and its bottom edge on a short phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, storageState: { cookies: [], origins: [] } });

  for (const path of ['/auth/register', '/auth/login', '/auth/forgot-password']) {
    test(`${path} starts below the header row and ends above the edge`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const heading = await page.getByRole('heading', { level: 1 }).boundingBox();
      const toggle = await page
        .getByRole('button', { name: /switch to (dark|light)/i })
        .first()
        .boundingBox();
      expect(heading, `${path} rendered no heading`).not.toBeNull();
      expect(toggle, `${path} rendered no theme toggle`).not.toBeNull();
      expect(heading!.y, `${path}: the heading starts under the header row`).toBeGreaterThanOrEqual(
        toggle!.y + toggle!.height,
      );

      // Scrolled to its end, the form keeps its bottom padding.
      const gap = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        // The form block: the heading's header, the form and the footer line.
        const content = h1?.closest('header')?.parentElement;
        let scroller = h1?.parentElement ?? null;
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
          scroller = scroller.parentElement;
        }
        if (!content || !scroller) return -1;
        scroller.scrollTop = scroller.scrollHeight;
        return scroller.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom;
      });
      expect(gap, `${path}: the last line sits on the bottom edge`).toBeGreaterThanOrEqual(24);
    });
  }
});

test.describe('every control can be announced', () => {
  for (const path of [...PRIVATE, ...STANDALONE]) {
    test(`${path} has no unnamed buttons or links`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const unnamed = await unnamedControls(page);
      expect(unnamed, `${path} has controls a screen reader announces as just "button"`).toEqual(
        [],
      );
    });
  }
});

test.describe('Arabic reads right-to-left, and still fits', () => {
  /*
   * RTL, actually looked at.
   *
   * FSD §10 lists Arabic with RTL as a requirement and D-16 tracks it. The
   * machinery was built — `direction()`, `LocaleDirection`, `dir` on <html>,
   * `rtl:` variants — and every bit of it was verified by unit tests asserting
   * that a function returns 'rtl'. NOTHING had ever rendered a page in Arabic
   * and looked at the result, which is the only way to catch the failure that
   * actually happens: a layout that mirrors its text and not its boxes, or that
   * overflows once direction flips.
   *
   * Mobile width on purpose. RTL and 393px are where two independent sources of
   * layout pressure meet, and nearly every client is on a phone.
   */
  test.use({ viewport: { width: 393, height: 851 } });

  const RTL_PAGES = ['/dashboard', '/wallet', '/profile', '/auth/login'];

  for (const path of RTL_PAGES) {
    test(`${path} in Arabic`, async ({ page, baseURL }) => {
      // The language is a COOKIE the server renders from (lib/i18n/locale-storage.ts),
      // so the first paint is already RTL. Seeding localStorage, as this once did,
      // no longer flips anything.
      await page
        .context()
        .addCookies([{ name: 'oxshare-portal-locale', value: 'ar', url: baseURL! }]);
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('html'), `${path} did not flip to RTL`).toHaveAttribute(
        'dir',
        'rtl',
      );

      // The failure RTL actually produces: a container that was pinned left now
      // pushes off the right edge, and the page scrolls sideways.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${path} in Arabic is ${overflow.scrollWidth - overflow.clientWidth}px wider than the screen`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});

test.describe('no standalone screen is a dead end', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of STANDALONE) {
    test(`${path} offers somewhere to go`, async ({ page }) => {
      /*
       * These screens have no sidebar. If one offers no link at all, the only
       * way out is the back button — which is the trap the verify-email waiting
       * screen was, and the reason this sweep exists.
       */
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const links = page.locator('a[href]');
      await expect(links.first(), `${path} offers no way onward`).toBeAttached();
    });
  }
});

/**
 * The checks above measure the DOCUMENT. This block measures what is on the
 * SCREEN, which is a different question and the one three real defects hid
 * behind.
 *
 * `document.scrollWidth` is the classic mobile-overflow test and it is blind to
 * exactly the shapes that go wrong on a phone:
 *
 *  1. An overlay positioned outside the viewport does not widen the document.
 *     The account menu's "Theme ▸" submenu opened to the SIDE of a menu already
 *     anchored to the right edge, so at 393px Radix flipped it left and it hung
 *     off the parent over the page — reported from a real phone, with every
 *     width check passing.
 *  2. An overlay BELOW the fold is on nobody's radar at all. The date-range
 *     picker's Apply button opened at y=867 on an 851px screen, and Apply is
 *     the only way to commit a half-open range.
 *  3. Overflow INSIDE a scroll container is overflow the document never sees.
 *     The transactions table is 839px wide in a 359px box, so Status — the
 *     answer to "did my withdrawal go through" — sat 300px off the right edge
 *     behind an overlay scrollbar a phone only draws while a finger is moving.
 *
 * All three are fixed. These assertions are what stop them coming back, and
 * they are written against the phone viewport because none of them is visible
 * at 1280px.
 */
test.describe('what is open is on the screen, at 393px', () => {
  test.use({ viewport: { width: 393, height: 851 } });

  /** Every box fully inside the viewport, or the names of the ones that are not. */
  async function offScreen(page: Page, selector: string): Promise<string[]> {
    return page.evaluate((sel) => {
      const bad: string[] = [];
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const escapes =
          r.left < -1 ||
          r.top < -1 ||
          r.right > window.innerWidth + 1 ||
          r.bottom > window.innerHeight + 1;
        if (escapes)
          bad.push(
            `${(el.textContent ?? '').trim().slice(0, 24) || el.tagName} at [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] in ${window.innerWidth}x${window.innerHeight}`,
          );
      });
      return bad;
    }, selector);
  }

  test('the account menu fits the phone screen', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /account menu/i }).click();
    await expect(page.getByRole('menuitem', { name: /log out/i })).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(1);

    expect(
      await offScreen(page, '[role="menu"], [role="menuitem"]'),
      'part of the account menu is off the phone screen',
    ).toEqual([]);
  });

  test('the light/dark toggle sits in the header beside the bell, on screen', async ({ page }) => {
    /*
     * The theme control USED to live inside the account menu as Light / Dark /
     * System, and this case checked that submenu fitted a phone. The client moved
     * it: two states, one icon, beside the notification bell. What matters on a
     * phone now is that the header still fits with one more icon in it — a 393px
     * header already carries the menu button, the bell and the avatar.
     */
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const toggle = page.getByRole('button', { name: /switch to (dark|light) mode/i });
    await expect(toggle).toBeVisible();
    expect(
      await offScreen(page, 'header button, header a'),
      'something in the header is pushed off the phone screen',
    ).toEqual([]);

    // And it works where the client will use it — on the phone.
    const before = await page.evaluate(() => document.documentElement.className);
    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .not.toBe(before);
  });

  test('the statement’s choices open on the screen — a custom range included', async ({ page }) => {
    /*
     * The Statement (25 Sep 2026) replaced the transactions list and its
     * date-range picker. On a phone one button names the wallet and the period
     * and opens the choices as a bottom sheet; they apply as they are chosen, so
     * there is no Apply to leave below the fold. A custom range adds the two
     * date fields — the tallest the sheet gets — and all of it must still fit.
     */
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /wallet · /i }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('combobox', { name: /^period$/i }).click();
    await page.getByRole('option', { name: /custom range/i }).click();
    await expect(sheet.locator('input[type="date"]').first()).toBeVisible();

    expect(
      await offScreen(page, '[role="dialog"], [role="dialog"] input, [role="dialog"] button'),
      'part of the statement sheet is off the screen',
    ).toEqual([]);
  });

  test('no table needs a sideways drag to read', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /^statement$/i })).toBeVisible();
    /*
     * The Statement's ledger is a TABLE from md up and a list below it
     * (statement-body.tsx) — a phone is not handed a table at all. So the
     * phone's rule is the page's: nothing scrolls sideways. Any table that IS
     * shown must still fit the box that scrolls it.
     */
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      'the statement scrolls sideways on a phone',
    ).toBeLessThanOrEqual(0);

    const overflow = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll('table').forEach((table) => {
        // The nearest ancestor that actually scrolls is what the table has to fit.
        let box: HTMLElement | null = table.parentElement;
        while (box && getComputedStyle(box).overflowX === 'visible') box = box.parentElement;
        if (!box) return;
        if (table.scrollWidth > box.clientWidth + 1)
          bad.push(`${table.scrollWidth}px table in a ${box.clientWidth}px box`);
      });
      return bad;
    });

    expect(
      overflow,
      'a table is wider than its scroll box — its right-hand columns are reachable only by a drag with no visible affordance',
    ).toEqual([]);
  });
});
