import { test as base, expect } from '@playwright/test';
import { isApi, persistStateIfLive } from './helpers';

/**
 * Every spec imports `test` from HERE, not from `@playwright/test`.
 *
 * ## The rotated-token problem this closes
 *
 * Each test starts a fresh context from the storage-state file `auth.setup.ts`
 * wrote. The access cookie in that file lives fifteen minutes; a full run takes
 * longer. So mid-run the first request of some test finds its access token
 * expired, the interceptor renews — and renewal ROTATES the refresh token. The
 * test's context now holds the new token; the FILE still holds the old one.
 *
 * The next test replays the file. Presenting a refresh token that has already
 * been rotated is exactly what reuse detection exists to punish: the whole
 * family is revoked, and every test from then on — including a later project,
 * the mobile one here — is signed out for reasons that read as a dozen
 * unrelated failures. That is precisely what took 20 tests down in one run.
 *
 * ## What this does
 *
 * Watches the context for a successful `POST …/auth/refresh`. If one happened,
 * the test's jar is the only place the live token exists, so it is written back
 * over the storage-state file this test was started from — the one named by the
 * `storageState` option, which `test.use({ storageState })` overrides per spec.
 * A test that forged or cleared cookies never sees a SUCCESSFUL refresh, so it
 * never persists its junk.
 *
 * Auto, so no spec can forget it. The explicit `persistSharedState` calls in the
 * specs that DELIBERATELY force a renewal remain correct and merely redundant.
 */
export const test = base.extend<{ persistRotation: void }>({
  persistRotation: [
    async ({ context, storageState }, use) => {
      let rotated = false;
      const onResponse = (response: import('@playwright/test').Response) => {
        if (isApi(response, '/auth/refresh', 'POST') && response.ok()) rotated = true;
      };
      context.on('response', onResponse);
      await use();
      context.off('response', onResponse);
      if (rotated && typeof storageState === 'string') {
        /*
         * Through the live-check: a successful rotation followed by a sign-out
         * (or a cleared jar) must never overwrite the file with nothing.
         *
         * ⚠️ A REFUSAL HERE LEAVES THE FILE POISONED, AND USED TO SAY NOTHING.
         *
         * `persistStateIfLive` THROWS when the context holds no refresh cookie,
         * and refusing is correct — saving a signed-out jar would sign out every
         * later test. But the refusal and the damage are the same event: this
         * test rotated the token, so the token in the FILE is already spent. The
         * next test replays it, reuse detection revokes the whole family, and
         * every test after that is signed out for reasons that read as a dozen
         * unrelated failures — which is precisely the outcome this fixture
         * exists to prevent, arriving through its own escape hatch.
         *
         * The catch was `() => undefined`, so a run could not be told apart from
         * one where the persist succeeded. That is what made a real occurrence
         * INFERABLE rather than diagnosable: a full portal run failed 22 tests
         * this way on 10 Sep 2026, the shape matched this file's own docblock
         * exactly, and it could not be confirmed because nothing recorded
         * whether this line fired.
         *
         * It still does not throw — failing an unrelated test for a fixture
         * problem would mislabel it, which is the mistake this suite has made
         * before. It just stops being silent.
         */
        await persistStateIfLive(context, storageState).catch((error: unknown) => {
          console.warn(
            `[e2e] STORAGE STATE NOT PERSISTED after a token rotation: ${
              error instanceof Error ? error.message : String(error)
            }\n` +
              `      ${storageState} still holds the PREVIOUS refresh token, which this test ` +
              'has already rotated.\n' +
              '      The next test to replay it will trip reuse detection and sign out every ' +
              'test after it.\n' +
              '      If later tests fail as unexplained sign-outs, this line is why.',
          );
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
