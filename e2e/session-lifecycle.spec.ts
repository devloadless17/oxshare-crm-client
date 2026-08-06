import { test, expect, type Page } from '@playwright/test';
import { E2E_LOGOUT_CLIENT, signIn } from './helpers';
// The app's own cookie names rather than a second copy — the same reasoning
// `helpers.ts` gives for importing them: the backend computes these and this
// repo hardcodes them, with nothing connecting the two.
import { CSRF_COOKIE_NAMES } from '../src/lib/api/client';

const CSRF_NAMES: readonly string[] = CSRF_COOKIE_NAMES;

/**
 * What happens to a session when things go wrong.
 *
 * The existing specs cover the happy path well — hard refresh on five private
 * pages, no flash while `/auth/me` is in flight, deep links, no tokens in
 * `document.cookie`. What they could not cover is the set of failures the auth
 * review found, every one of which came from the portal being unable to tell
 * "the server said no" from "we could not ask", and answering both by throwing
 * the client out.
 *
 * These are the regression tests for that. Each names the finding it pins.
 *
 * Note what is deliberately asserted in the NEGATIVE — "did not navigate to
 * /auth/login" — several times over. The defects were all silent redirects, and
 * a spec that only checks the good screen appears passes just as happily while
 * the client is being ejected a moment later.
 */

/**
 * Open the account menu, on either viewport.
 *
 * The layout renders the trigger twice — at the foot of the sidebar and, below
 * `lg`, in the header — so a bare `getByRole` matches two and fails strict mode.
 *
 * Neither `.first()` nor a visibility filter is enough, and the reason is worth
 * recording because it is a general trap. On a phone the sidebar is an `<aside>`
 * moved off-screen with `-translate-x-full`. A transform does not make an
 * element hidden: it still has a box, so Playwright counts it VISIBLE and then
 * waits forever for it to become "stable" at a position no click can reach. The
 * test times out pointing at a control the user can genuinely see, in the header,
 * a few pixels away.
 *
 * So the trigger is chosen by CONTAINER. The header copy is inside `lg:hidden`,
 * which really is `display: none` on desktop — an honest signal, unlike the
 * transform.
 */
async function openAccountMenu(page: Page) {
  const inHeader = page.locator('header').getByRole('button', { name: /account menu/i });
  const inSidebar = page.locator('aside').getByRole('button', { name: /account menu/i });
  const trigger = (await inHeader.isVisible()) ? inHeader : inSidebar;
  await trigger.click();
}

/** Proof the signed-in shell rendered: this exists only inside `PortalLayout`. */
function signedInShell(page: Page) {
  return page.getByRole('button', { name: /account menu/i }).first();
}

async function signOutThroughTheUi(page: Page) {
  await openAccountMenu(page);
  // `menuitem`, not `button`: this is a real ARIA menu and its items never match
  // a button query — a mistake that once read as "logout is missing".
  await page.getByRole('menuitem', { name: /log ?out/i }).click();
  await page.waitForURL(/\/auth\/login/, { timeout: 20_000 });
}

test.describe('signing out', () => {
  /*
   * ── Why this is ONE test, and why it signs in for itself ──────────────────
   *
   * Logging out REVOKES the refresh-token family server-side. Every other spec
   * in this suite replays the one session cached in `STORAGE_STATE`, so a
   * logout driven on that session kills it for everything that runs afterwards
   * — a cascade of unrelated-looking auth failures whose cause is three files
   * away. This is the same hazard `auth.setup.ts` records about reusing state
   * across runs, met from the other direction.
   *
   * So it opens a context with NO stored state and signs in as an identity
   * nothing else uses — `logout` revokes EVERY family for a user, so even a
   * fresh login as `E2E_CLIENT` would kill the cached one. That costs one login
   * against a five-per-minute cap, which is why the assertions that need a live
   * session to destroy are one test rather than three: the budget is small, and
   * spending it on repetition would trade a real risk of 429s for nothing.
   *
   * Un-`fixme`d from `auth-session.spec.ts`, where it was disabled because the
   * ARIA-menu selector needed writing against finished markup. That left the
   * only spec driving logout switched off, and C-C1 lived exactly in the gap.
   */
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ends the session everywhere, and it cannot walk back in', async ({ page, context }) => {
    await signIn(page, E2E_LOGOUT_CLIENT);

    // A second tab on the same session, opened BEFORE the sign-out.
    const otherTab = await context.newPage();
    await otherTab.goto('/wallet');
    await expect(otherTab).toHaveURL(/\/wallet/);

    await signOutThroughTheUi(page);

    /*
     * C-C1, the half no single-page test can see.
     *
     * The hard navigation ends the tab it runs in. Every other tab kept its
     * React Query cache and its chrome, and with `staleTime` at five minutes
     * and `refetchOnWindowFocus` off it never re-asked — so the client's name,
     * email and cached balances stayed on screen indefinitely, on a device they
     * believe they signed out of. On a phone that is the case that matters.
     */
    await otherTab.waitForURL(/\/auth\/login/, { timeout: 20_000 });
    await otherTab.close();

    /*
     * Only the SERVER can end a session, so the check that matters is whether
     * it still honours the cookie — not whether the tab navigated.
     */
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);

    /*
     * And no history entry to press Back into: `RequireAuth` redirects with
     * `router.replace`. A `push` would leave the client on a page that
     * immediately redirects again — a trap they cannot leave.
     */
    await page.goBack();
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});

test.describe('a session that has died', () => {
  test('still reaches sign-in with the CSRF cookie already gone', async ({ page, context }) => {
    /*
     * C-C1 proper.
     *
     * `endDeadSession` decided whether anybody had been signed in by reading the
     * CSRF cookie. Two ordinary things clear it while the session is dead: a
     * sign-out in another tab clears it for the WHOLE browser, and it expires in
     * 8 hours against the refresh cookie's 30 days. Either way the portal
     * concluded nobody had ever been signed in and kept rendering.
     *
     * Reproduced by deleting exactly that cookie and leaving session cookies the
     * server will refuse.
     *
     * BOTH session cookies have to be spoiled, and getting that wrong is a way
     * to write a test that passes for the wrong reason. The access token is
     * valid for fifteen minutes, so corrupting only the refresh cookie leaves
     * `/auth/me` answering 200 — the portal correctly stays put, and the spec
     * reads that as "the eviction did not happen" while nothing was ever
     * supposed to be evicted. The refresh cookie is what `proxy.ts` gates on, so
     * it must still be PRESENT (or the proxy redirects and the client-side path
     * this test exists for never runs) and merely invalid.
     */
    await page.goto('/dashboard');

    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(
      cookies
        .filter((c) => !CSRF_NAMES.includes(c.name))
        .map((c) => (/_rt$|_at$/.test(c.name) ? { ...c, value: 'no-longer-valid' } : c)),
    );

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 });
  });
});

test.describe('an API that cannot be reached', () => {
  /*
   * C-C3 — and the most consequential of the set, because the portal used to
   * treat it as a dead session.
   *
   * `user === null` was also what a 500, a timeout or one dropped request
   * produced, so an offline moment on the first `/auth/me` of a page load
   * redirected a signed-in client to sign-in. Reachable mid-KYC, where the same
   * path then wiped the form they had typed (C-C4).
   */
  test('does NOT sign the client out when /auth/me never answers', async ({ page }) => {
    await page.route('**/auth/me', (route) => route.abort('failed'));
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /cannot reach/i })).toBeVisible({
      timeout: 20_000,
    });
    // The assertion the defect fails.
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test('does NOT sign the client out on a 500 either', async ({ page }) => {
    await page.route('**/auth/me', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /cannot reach/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test('says the session is intact, and recovers when the API comes back', async ({ page }) => {
    /*
     * Telling the client their session is FINE is the load-bearing half. One
     * who believes they were logged out signs in again, which on the same bad
     * connection fails too — and then meets the login rate limit.
     */
    let failing = true;
    await page.route('**/auth/me', (route) => (failing ? route.abort('failed') : route.continue()));

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /cannot reach/i })).toBeVisible({
      timeout: 20_000,
    });

    failing = false;
    await page.getByRole('button', { name: /try again/i }).click();

    // Back into the portal, on the page they were already on — no sign-in, no
    // lost navigation.
    await expect(page.getByRole('heading', { name: /cannot reach/i })).toBeHidden({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('does not render private data behind the error', async ({ page }) => {
    // A fix that merely stopped redirecting would be worse than the defect: it
    // would paint the portal shell over a profile the app does not have.
    await page.route('**/auth/me', (route) => route.abort('failed'));
    await page.goto('/wallet');

    await expect(page.getByRole('heading', { name: /cannot reach/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });
});

test.describe('moving around the portal', () => {
  const PRIVATE_PAGES = ['/dashboard', '/wallet', '/transactions', '/accounts', '/profile'];

  for (const path of PRIVATE_PAGES) {
    test(`${path} survives a hard refresh with the session intact`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));

      await page.reload();

      // The whole point: a reload must not read as a new, sessionless visitor.
      await expect(page).toHaveURL(new RegExp(path));
      await expect(page).not.toHaveURL(/\/auth\/login/);
      await expect(signedInShell(page)).toBeAttached({ timeout: 20_000 });
    });
  }

  test('navigating between pages never bounces through sign-in', async ({ page }) => {
    /*
     * Client-side navigation reads a settled `/auth/me` from the cache and
     * renders synchronously — but only while the cache is shared. A regression
     * that remounts `UserProvider` shows up here as a flash of the sign-in
     * screen partway through the walk, and nowhere else.
     */
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });

    await page.goto('/dashboard');
    for (const path of ['/wallet', '/transactions', '/accounts', '/dashboard']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
    }

    expect(visited.filter((p) => p.startsWith('/auth/login'))).toEqual([]);
  });
});

test.describe('the emailed-link stubs', () => {
  test('/register forwards ?next= like /login does', async ({ page }) => {
    /*
     * C-C9. `/login` forwarded the parameter and `/register` dropped it, so
     * intent survived one stub and was silently lost by the other — the client
     * signed up and landed on the dashboard with nothing to say where they had
     * been going.
     */
    await page.goto('/register?next=%2Fkyc');
    await expect(page).toHaveURL(/\/auth\/register\?next=%2Fkyc/);
  });

  test('/register still works with no parameter at all', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/auth\/register$/);
  });
});
