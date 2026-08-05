import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './e2e/helpers';

/**
 * End-to-end tests for the client portal.
 *
 * ## Why these exist, given 213 unit tests already pass
 *
 * Every UI defect found by actually using this app during the KYC review was
 * missed by the unit suite — the "Required" badge on a verified account, the
 * sidebar vanishing on /kyc, the chrome flashing on refresh, a 403 fired on
 * every navigation. All four passed component tests, because component tests
 * mount one thing in isolation and every one of those bugs lived in the seam
 * between a layout, a page and a fetch.
 *
 * That is the gap this closes, and it is the only reason to accept the cost of a
 * browser in the toolchain. These specs are therefore written against WHOLE
 * JOURNEYS and cross-page state, never against a single component — anything
 * that can be asserted with testing-library belongs in a `.test.tsx`, where it
 * runs in milliseconds.
 *
 * ## What must be running
 *
 * The portal is started by `webServer` below. The BACKEND is not: it needs
 * Postgres, and standing the whole stack up from here would make a failure in
 * any of it look like a failed test. `global-setup.ts` checks it is reachable
 * and fails with a sentence telling you what to start.
 *
 * ## Not in CI yet — deliberately
 *
 * Running these in CI means Postgres, the API and a browser in the pipeline,
 * which roughly doubles its time and adds a class of flake somebody then owns.
 * The value is in catching these bugs at all; catching them locally first is
 * most of it. Add the CI job once the specs have been stable for a while.
 */
export default defineConfig({
  testDir: './e2e',
  // These drive a real browser against a real API, so they are slower than the
  // unit suite by design. A timeout that is too tight turns a slow machine into
  // a failing build.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Sequential. The journeys register accounts and submit KYC against ONE shared
  // database, so parallel workers would race each other's data — and a suite
  // that fails only under concurrency is worse than a slower one.
  fullyParallel: false,
  workers: 1,

  // A test that only passes on the third attempt is not passing. Retries hide
  // exactly the flakiness worth knowing about while the suite is young.
  retries: 0,
  forbidOnly: true,

  globalSetup: './e2e/global-setup.ts',

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: 'http://localhost:3000',
    // Kept only for failures: a trace per test is gigabytes and nobody opens the
    // passing ones. This is the artefact that makes a red run diagnosable
    // without reproducing it.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      /*
       * Signs in once and writes the session to disk; everything else depends on
       * it and starts authenticated.
       *
       * Not a convenience. Signing in per spec meant eight logins in a minute
       * against a five-per-minute cap, so the suite rate-limited itself and any
       * human signing in at the same time. The cap is right; the tests were
       * wrong to keep asking.
       */
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      /*
       * The device most of these clients actually use.
       *
       * Not decoration: the source documents never mention mobile, nearly every
       * KYC submission arrives from a phone, and the mobile findings in the KYC
       * review were the largest group of real defects. A journey that passes at
       * 1280px and fails at 393px is a journey that fails.
       */
      name: 'mobile',
      use: { ...devices['Pixel 7'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    // `dev`, not `build && start`: this suite is for catching things while
    // building, and a production build per run would make it too slow to reach
    // for. The CI job, when it exists, should use the built app instead.
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
