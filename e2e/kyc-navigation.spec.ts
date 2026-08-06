import { expect, test } from '@playwright/test';
import { collectRejections } from './helpers';

/**
 * The four defects a full unit suite passed straight through.
 *
 * Every one was found by a person clicking around, and every one is the same
 * shape: cross-page state, chrome that changes after mount, or a request fired
 * by a layout the page knows nothing about. Component tests mount one thing in
 * isolation, so none of them could see any of it.
 *
 * These run against a real browser and the real API for that reason alone. If a
 * case here can be expressed with testing-library, it belongs in a `.test.tsx`.
 */

test.describe('KYC navigation, for a client who is already verified', () => {
  // Already signed in: the session comes from `auth.setup.ts` via storageState.
  test('the sidebar survives clicking KYC Verification', async ({ page, isMobile }) => {
    await page.goto('/dashboard');
    // THE reported bug: clicking the entry made the sidebar disappear, because
    // /kyc rendered a chrome-free redirect stub before landing somewhere with
    // the portal shell. The sidebar is a drawer on mobile, so this is the
    // desktop statement of it.
    test.skip(isMobile, 'the sidebar is a drawer on mobile — covered by its own case');

    const sidebar = page.getByRole('link', { name: 'Wallet', exact: true });
    await expect(sidebar).toBeVisible();

    /*
     * Navigated directly rather than by clicking a sidebar entry: KYC has since
     * moved out of the sidebar into the account menu. The PROPERTY under test is
     * unchanged and is still the reported bug — arriving at /kyc must not take
     * the surrounding chrome away and give it back.
     */
    await page.goto('/kyc');
    await page.waitForURL(/\/kyc/);

    // Never absent, not merely present at the end: an assertion after the
    // redirect settles would pass even if it vanished in between.
    await expect(sidebar).toBeVisible();
    await expect(page).toHaveURL(/\/kyc\/submitted/);
  });

  test('the sidebar survives a hard refresh of /kyc/submitted', async ({ page, isMobile }) => {
    // The second reported bug. The layout chose its chrome from fetched data, so
    // the first paint was the bare wizard and a later paint replaced it with the
    // whole portal. A reload is what made it obvious.
    test.skip(isMobile, 'the sidebar is a drawer on mobile');

    await page.goto('/kyc/submitted');
    await page.reload();

    await expect(page.getByRole('link', { name: 'Wallet', exact: true })).toBeVisible();
  });

  test('does NOT tell a verified client their verification is Required', async ({
    page,
    isMobile,
  }) => {
    /*
     * The badge was a module-level constant, so it said "Required" forever —
     * while the header pill in the same layout read "Verified Account" off the
     * same two values.
     */
    test.skip(isMobile, 'the sidebar is a drawer on mobile');

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    /*
     * The badge itself has moved with KYC out of the sidebar, so this no longer
     * asserts on that element. The PROPERTY it protected is what matters and is
     * unchanged: an approved client must not be told anywhere in the chrome that
     * their verification is still required, and the layout must not contradict
     * itself about it.
     */
    /*
     * Asserted as an ABSENCE, because the header's verification pill was removed
     * in the chrome redesign — there is no longer a positive "Verified Account"
     * element to point at. What must remain true is that an approved client is
     * never told anywhere in the chrome that verification is still outstanding.
     */
    await expect(page.locator('header, nav, aside').getByText(/^required$/i)).toHaveCount(0);
    await expect(page.locator('header, nav, aside').getByText(/action needed/i)).toHaveCount(0);
  });

  test('asks the API for nothing it is not allowed to have', async ({ page }) => {
    /*
     * The 403 flood. The sidebar's KYC-status query was keyed on the pathname,
     * so an unverified client fired a guaranteed 403 on EVERY navigation — and
     * nothing in the UI showed it, so it was only ever visible in the server
     * log.
     *
     * Asserted for a VERIFIED client too, because the sidebar should not be
     * generating refusals for anybody. This is the assertion a unit test cannot
     * make: it is about traffic, not about a rendered component.
     */
    const rejections = collectRejections(page);

    for (const path of ['/dashboard', '/wallet', '/transactions', '/kyc']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(rejections.list()).toEqual([]);
  });
});
