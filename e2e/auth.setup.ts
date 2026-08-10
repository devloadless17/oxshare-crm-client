import { test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { E2E_CLIENT, E2E_KYC_CLIENT, KYC_STORAGE_STATE, signIn, STORAGE_STATE } from './helpers';

/**
 * Sign in ONCE, and let every spec reuse the session.
 *
 * The suite originally signed in per test. Four specs meant four logins, a
 * verification run meant eight inside a minute, and `POST /auth/login` is capped
 * at five per minute — so the suite rate-limited itself AND anybody signing in
 * from a browser at the same time.
 *
 * That cap is correct and should not be relaxed for tests; the tests should stop
 * asking for it. Playwright's `storageState` is the mechanism: this project runs
 * first, writes the cookies once, and the rest start already authenticated.
 *
 * Login itself still gets exercised — here, and by the specs that deliberately
 * drive the form.
 */
setup('authenticate as the e2e client', async ({ page }) => {
  await signIn(page, E2E_CLIENT);

  // Not committed: these are live session cookies, and `.auth/` is gitignored.
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});

/**
 * The second fixture: verified, but with no submission, so the wizard is
 * reachable. A separate session because it is a different identity — sharing
 * one would mean the wizard spec and the verified-state specs fighting over the
 * same KYC row.
 */
setup('authenticate as the e2e KYC client', async ({ page }) => {
  await signIn(page, E2E_KYC_CLIENT);
  mkdirSync(dirname(KYC_STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: KYC_STORAGE_STATE });
});
