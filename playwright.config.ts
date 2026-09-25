import { defineConfig, devices } from '@playwright/test';
import { CROSS, TOPOLOGY } from './e2e/topology';
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
 * ## In CI, under E2E_STRICT
 *
 * This block used to say "not in CI yet — add the CI job once the specs have
 * been stable for a while". That job exists: `.github/workflows/ci.yml` stands
 * up Postgres, Redis, Mailpit and the API, and runs `npm run e2e` with
 * `E2E_STRICT=1`.
 *
 * The flag is what makes the run evidence. A skipped Playwright test reports as
 * PASSING, so a guard that steps aside for a missing fixture reads the same as
 * one that ran — see `requirePrecondition` in `e2e/helpers.ts`, which this
 * suite adopted first and the admin suite later.
 *
 * The stale sentence is recorded rather than deleted: it was believed long
 * enough to be quoted back as fact while the job was already running.
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
    // `localhost` for an ordinary run; `portal.crm.localhost` when E2E_TOPOLOGY=crosshost
    // reproduces the production cookie topology. See e2e/topology.ts.
    baseURL: TOPOLOGY.portalOrigin,
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
      /*
       * Layout and KYC only. Auth MECHANICS run once, on chromium.
       *
       * Not a coverage decision — a rate-limit one, and the suite was losing to
       * it. Login is capped at five per minute and registration at ten per hour
       * PER IP, both correctly. Running the auth specs under two projects
       * doubled every login and every registration, so a full run exhausted the
       * caps and failed nine tests that each pass on their own. A suite that
       * only goes green in isolation is one people stop believing.
       *
       * What is lost is small and deliberate: whether a session survives a
       * refresh, or whether registration lands on verify-email, is not a
       * question about viewport width. What mobile is FOR — the drawer, the KYC
       * capture flow, a 393px layout — still runs here in full.
       */
      /*
       * `session-lifecycle` joins the list, for the reason already written above
       * it: auth MECHANICS run once, on chromium.
       *
       * It was missing, so every sign-in and every forced expiry in that spec
       * ran TWICE per full run. Login is capped at five per minute per IP and
       * registration at ten per hour, both correctly — so a full run exhausted
       * the caps and failed four tests that each pass on their own, two of them
       * in specs that had nothing to do with the ones spending the budget.
       *
       * That is the exact failure this comment predicted, reproduced by adding a
       * spec and not the line. Whether a session survives a refresh is not a
       * question about viewport width; what mobile is FOR still runs in full.
       */
      /*
       * `partner-journey` joins for the same reason as the rest of the list:
       * it REGISTERS an account and signs in three identities per run, and
       * doubling that under a second project spends the 10-per-hour
       * registration cap on a question that is not about viewport width.
       */
      testIgnore:
        /(auth-session|account-security|email-code-signup|emailed-links|password-reset-journey|partner-journey|session-lifecycle|session-matrix|session-under-stress)\.spec\.ts/,
    },
  ],

  webServer: {
    // `dev`, not `build && start`: this suite is for catching things while
    // building, and a production build per run would make it too slow to reach
    // for. The CI job, when it exists, should use the built app instead.
    // In cross-host mode the dev server listens on a DIFFERENT port, so the
    // ordinary localhost server can stay up beside it; `NEXT_PUBLIC_*` is baked
    // at compile time, so it must be a fresh server rather than a reused one.
    command: CROSS ? `npx next dev --port ${TOPOLOGY.ports.portal}` : 'npm run dev',
    url: `http://localhost:${TOPOLOGY.ports.portal}`,
    reuseExistingServer: !CROSS,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
