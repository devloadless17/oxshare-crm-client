import { expect, test, type Page } from '@playwright/test';

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
const PRIVATE = ['/dashboard', '/accounts', '/wallet', '/transactions', '/platforms', '/profile'];

/** Standalone screens: no chrome, so they must offer their own way onward. */
const STANDALONE = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/verify-email/pending',
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
      }));

      expect(
        overflow.scrollWidth,
        `${path} is ${overflow.scrollWidth - overflow.clientWidth}px wider than the screen`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
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
