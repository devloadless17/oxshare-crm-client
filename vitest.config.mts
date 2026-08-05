import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // .tsx too: the previous glob was .test.ts only, so a component test could
    // be written, committed, and silently never run.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // jsdom, so a screen can actually be rendered and asserted on. Before this
    // there was no way to test a page at all, only pure functions.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
     * 20s, not vitest's default 5s — the same decision as the admin app's
     * config, for the same reason and kept in step with it deliberately.
     *
     * The tests that time out are always `userEvent` ones, and none of them
     * assert anything time-sensitive: `userEvent.setup()` advances real timers
     * between keystrokes, each render goes through jsdom, and React Query
     * settles on its own schedule. A form fill costing 40ms on an idle machine
     * costs several seconds when the box is also building another app.
     *
     * 5s is not a deadline anybody chose for these tests; it is a default that
     * sits just above their cost on a quiet machine and just below it on a busy
     * one — which produces a suite that is green locally and red in CI for
     * reasons unrelated to the code. A flaky gate is one people re-run instead
     * of reading.
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
        // Layout shells and providers are wiring, not decisions.
        'src/app/**/layout.tsx',
        'src/components/query-provider.tsx',
        'src/components/theme-provider.tsx',
        // A static data table, not logic.
        'src/lib/countries-data.ts',
      ],
      /*
       * A FLOOR, not a target — see the note in the admin app's copy. Filled in
       * from a measured run below; may only ever go up.
       */
      // Raised after the selfie camera gained tests. Measured 2026-08-04:
      // statements 39.7, branches 33.9, functions 31.7, lines 40.5. Set a couple of
      // points under, so an unrelated refactor that moves a branch count by one
      // does not fail CI spuriously.
      thresholds: { lines: 38, functions: 29, branches: 31, statements: 37 },
    },
  },
});
