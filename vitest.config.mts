import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * The portal's test harness — deliberately re-added.
 *
 * `CLAUDE.md` recorded that all 291 tests here were deleted on an explicit
 * instruction, and asked that nothing be added back without asking. This was
 * asked for, and the note in that file has been updated to match rather than
 * left contradicting the tree.
 *
 * The config, `vitest.setup.ts` and `src/test/render.tsx` are copies of admin's,
 * which is the point: both setup files were already marked TWIN FILE and had
 * been written expecting this repo to hold the other copy. Their timeout and
 * jsdom-shim reasoning was learned the expensive way over there, and rewriting
 * it from scratch here would mean learning it again.
 *
 * NOT a twin of admin's for `check:twins` purposes — that script compares a
 * fixed list of source files, and this is build configuration. The values below
 * that differ from admin's are the coverage thresholds, which are a floor under
 * THIS repo's measured numbers.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // .tsx too: a `.test.ts`-only glob lets a component test be written,
    // committed, and silently never run.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
     * 20s, not vitest's default 5s — admin's reasoning, which applies here for
     * the same structural reason: `userEvent.setup()` advances real timers
     * between keystrokes, every render goes through jsdom, and React Query
     * settles on its own schedule. A form fill that is 40ms on an idle machine
     * is several seconds when the box is also compiling another app.
     *
     * 5s is not a deadline anybody chose; it is a default that sits just above
     * these tests' cost on a quiet machine and just below it on a busy one,
     * which produces a suite that is green locally and red in CI for reasons
     * unrelated to the code. A flaky gate is one people learn to re-run rather
     * than read.
     */
    /*
     * RETRY A FAILED TEST TWICE — the cheapest correct answer to this suite's
     * residual flakiness, and chosen only after the alternatives were measured.
     *
     * The flake is always the same shape: an assertion waiting for an error
     * state (a 404 becoming a BackendPending card) times out on a loaded
     * machine, and passes alone immediately afterwards. `src/test/render.tsx`
     * already disables React Query's back-off, so nothing is waiting on a
     * retry — the test is starved of CPU, not misconfigured.
     *
     * Measured on 18 Aug 2026, under `--coverage`, which is what CI runs:
     *   uncapped          48.5s   passed
     *   maxThreads: 8     56.2s   FAILED
     *   maxThreads: 8     46.6s   passed
     * Capping the workers neither fixed the flake nor paid for itself, so it is
     * not here. Raising `asyncUtilTimeout` a fourth time was refused for the
     * reason vitest.setup.ts states.
     *
     * Retrying is honest about what this is: a scheduling failure, not a product
     * failure. A genuinely broken test still fails — it fails all three
     * attempts — while a starved one costs milliseconds instead of a SIX-MINUTE
     * CI re-run, which on a private repo is real money.
     *
     * The cost is that a test which becomes genuinely flaky is quieter. That is
     * accepted deliberately, not overlooked: the flakiness is understood, the
     * failing shape is documented above, and if these retries ever start hiding
     * a real defect the fix is to shard the suite rather than to raise the
     * retry count.
     */
    retry: 2,
    /*
     * CAPPED — and the 18 Aug conclusion above is superseded, not ignored.
     *
     * That note measured `maxThreads: 8` and concluded capping "neither fixed
     * the flake nor paid for itself". Two things have changed since, and both
     * matter:
     *
     *   the KNOB — 8 threads is ABOVE the memory ceiling, not under it. Every
     *     worker carries its own jsdom, this box has ~5.9 GB with 1-2 GB free
     *     once a dev server is up, and vitest defaults to availableParallelism
     *     (22 here). Eight was measured on the ceiling; four is a cap meant to
     *     sit beneath it. The admin repo's config records the same finding from
     *     the other direction, on 21 Aug.
     *   the SUITE — 38 files now, not the smaller set that was measured.
     *
     * Uncapped today the suite does not merely flake, it cannot COMPLETE:
     * fifteen of thirty-eight files fail with "Failed to start forks worker /
     * Timeout waiting for worker to respond", and vitest reports the survivors
     * as a pass — 23 files, 251 tests, 15 unhandled errors, exit 0. A partial
     * run that reports green is the failure this repo keeps finding elsewhere,
     * arriving through the runner.
     *
     * Measured 10 Sep 2026, same machine, back to back:
     *   uncapped         17/38 files, 165 tests, 21 errors  (incomplete)
     *   uncapped         23/38 files, 251 tests, 15 errors  (incomplete)
     *   maxWorkers: 4    38/38 files, 383 tests, 0 errors   36.7s
     *   maxWorkers: 4    38/38 files, 383 tests, 0 errors   33.0s
     *   maxWorkers: 4    38/38 files, 383 tests, 0 errors   29.5s
     *
     * ⚠️ THE FAILURE IS MEMORY-DEPENDENT, WHICH MAKES THE CAP MORE NECESSARY
     * RATHER THAN LESS. Re-measured the same day with ~3.3 GB free instead of
     * ~680 MB, uncapped completed all 38 files. So "uncapped always truncates"
     * would be too strong; what is true is that uncapped SOMETIMES truncates,
     * decided by how much memory happens to be free — a dev server up, another
     * suite running, a second session on the box.
     *
     * An intermittent partial pass is worse than a reliable one. A reliable
     * failure gets noticed and fixed; this one reports 23/38 as green on a busy
     * machine and 38/38 on a quiet one, so the same commit "passes" or "passes
     * less" depending on nothing anybody controls, and the difference is
     * invisible unless somebody reads the file count. The cap removes the
     * dependence, which is the property worth having.
     *
     * `retry: 2` above stays: it addresses a different failure (an assertion
     * starved of CPU) and the two are complementary. If a machine ever wants
     * more, raise it deliberately and re-measure — never uncap it silently.
     */
    maxWorkers: 4,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Generated wholesale from the backend's OpenAPI document.
        'src/lib/api/types.gen.ts',
        '**/*.test.{ts,tsx}',
        // Layout shells and providers are wiring, not decisions; covering them
        // inflates the number without testing anything.
        'src/app/**/layout.tsx',
        'src/components/query-provider.tsx',
        'src/components/theme-provider.tsx',
      ],
      /*
       * A FLOOR, not a target — and now that there is something to measure, it
       * exists.
       *
       * This block used to say "no thresholds yet", correctly: the suite was one
       * file, and a threshold guessed before there is anything to measure either
       * sits so low it protects nothing or so high it blocks the first person to
       * add a test. It then said what to do about it — run the coverage report,
       * read the figures, pin a point or two under them. That is what these are,
       * taken from a measured run of 23 files / 298 tests on 21 Aug 2026
       * (statements 23.23, branches 18.14, functions 17.77, lines 23.40).
       *
       * READ THE NUMBER IN CONTEXT. It is low, and raising it for its own sake
       * would be the wrong work: what is covered here is chosen — the money
       * formatter, the sort comparators, the date range, the KYC gate, the
       * commission summariser, the transfer preselection. Those are the rules
       * whose wrong version renders perfectly. Wiring, shells and one-line API
       * wrappers make up most of the remainder and testing them would move this
       * figure without protecting anything.
       *
       * They may only ever go up.
       *
       * ⚠️ RE-BASED 11 Sep 2026, and the reason is not "the suite grew". The
       * floor above was correct when it was set and then did not move for three
       * weeks while the suite went from 23 files / 298 tests to 41 / 399. By
       * then the measurement had reached statements 32.64, branches 25.83,
       * functions 27.56, lines 33.30 — a TEN-POINT lag on a block whose own
       * comment says "pin a point or two under them".
       *
       * That gap is what makes it worth a note rather than a bump. A floor ten
       * points under the measurement would not catch a regression that undid a
       * THIRD of this repo's coverage: enforced, passing, and covering far less
       * than this comment claims for it. Same family as the guards that shipped
       * vacuous the same night — a check whose stated reach and actual reach had
       * come apart, with nothing failing.
       *
       * THE MARGIN IS DELIBERATE AND IS NOT ROUNDING. Five cases here skip by
       * ENVIRONMENT (four `isMobile`, one `!CROSS`), so the measurement is not a
       * constant across machines. A floor set flush against one machine's figure
       * reddens somewhere else for a reason that is not a regression — and a
       * threshold that reddens for environment reasons is the same defect as a
       * gate that blocks on a missing prerequisite: people stop believing its
       * refusals and route around it. ~1.5 points under, by the same reasoning
       * the backend's floor uses.
       */
      /*
       * RAISED 17 Sep 2026, against a measured run of 47 files / 423 tests:
       * lines 37.06, statements 36.27, functions 31.06, branches 30.58.
       *
       * The previous floor had drifted five to six points under that — nobody lowered it,
       * the suite grew and nothing lifted it. A floor far enough under the
       * measurement stops catching the regressions it was written for: at the old
       * number a change could delete most of that gap and still pass.
       *
       * Set about a point and a half under rather than flush, the same margin the
       * backend uses and for the same reason — a threshold that reddens for
       * environment reasons is one people route around.
       */
      thresholds: {
        lines: 35,
        statements: 34,
        functions: 29,
        branches: 29,
      },
    },
  },
});
