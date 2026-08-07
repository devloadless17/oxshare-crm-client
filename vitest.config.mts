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
       * NO THRESHOLDS YET, and that is deliberate rather than an omission.
       *
       * Admin's are a floor pinned just under its measured numbers, set after
       * its suite had grown. This suite starts at one file. A threshold guessed
       * before there is anything to measure either sits so low it protects
       * nothing or so high it blocks the first person to add a test — and a
       * coverage gate that blocks people gets disabled, after which it protects
       * nothing either.
       *
       * Run `npm run test:coverage`, read the figures, and pin a floor a point
       * or two under them. They may only ever go up.
       */
    },
  },
});
