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
       */
      thresholds: {
        lines: 23,
        functions: 18,
        branches: 18,
        statements: 23,
      },
    },
  },
});
