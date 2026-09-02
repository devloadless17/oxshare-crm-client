// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-admin.
// Rule changes belong in both.
//
// Why this file grew past the create-next-app default:
//
// `eslint-config-next/typescript` is `tseslint.configs.recommended` — the
// NON-type-checked set — plus two rules downgraded to warn. That means
// no-floating-promises, no-misused-promises and await-thenable were all invisible
// here. The backend learned this the expensive way: with no ESLint config at all,
// a floating promise on an authorization check shipped to main (see the note atop
// oxshare-crm-backend/eslint.config.mjs). Nothing about that failure mode is
// backend-specific — an unawaited mutation on a withdrawal approval loses money
// just as quietly from a browser.
//
// So `recommendedTypeChecked` is spread AFTER the Next configs. `typescript-eslint`
// is declared in devDependencies rather than borrowed from eslint-config-next's
// transitive tree, so a future Next bump cannot silently take type-aware linting
// away again.
/**
 * Screens whose user-visible text has been moved into `src/lib/i18n`.
 *
 * This list only ever GROWS. Converting a screen means adding it here in the
 * same commit, which is what makes the remaining work visible rather than
 * indefinite.
 */
const I18N_ENFORCED = [
  'src/components/layout/portal-layout.tsx',
  'src/app/auth/login/page.tsx',
  'src/app/auth/register/page.tsx',
  'src/app/wallet/page.tsx',
  'src/app/kyc/submitted/page.tsx',
  'src/app/auth/forgot-password/page.tsx',
  'src/app/auth/reset-password/page.tsx',
  'src/app/auth/verify-email/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/components/dashboard/wallet-balance-cards.tsx',
  'src/app/accounts/page.tsx',
  'src/app/kyc/page.tsx',
  'src/app/kyc/step/[step]/page.tsx',
  'src/components/kyc/dynamic-step-renderer.tsx',
  'src/components/kyc/selfie-camera.tsx',
  'src/components/kyc/document-uploader.tsx',
  'src/components/async-boundary.tsx',
  'src/app/transactions/page.tsx',
  'src/app/withdraw/page.tsx',
  'src/app/deposit/page.tsx',
];

/*
 * NOT enforced yet, and why — so the gap is a decision rather than an oversight.
 *
 * src/app/verify-email/pending/page.tsx: its copy IS externalised, but the file
 * uses styled-jsx, and `jsx-no-literals` flags the CSS template literal as a
 * string child. Adding it would mean either suppressing the rule on the file —
 * which enforces nothing — or converting the screen to Tailwind, which is a
 * rewrite this change has no business doing. Convert the screen, then add it.
 */

/**
 * Text that is not copy: punctuation, separators and symbols a translator would
 * leave untouched anyway.
 */
const ALLOWED_JSX_LITERALS = [
  '·',
  '—',
  '–',
  '/',
  '%',
  '+',
  '-',
  '×',
  ':',
  '*',
  '(',
  ')',
  '&',
  // Separators and placeholder zeros in stat tiles. Not copy: a translator has
  // nothing to do with them, and listing them keeps the rule usable on screens
  // that are otherwise fully converted.
  '•',
  '0',
];

/**
 * Query keys come from `src/lib/query-keys.ts`, never from an array literal.
 *
 * Spread into EVERY `no-restricted-syntax` block rather than living in one of
 * its own. ESLint's flat config merges rules by NAME, so the last config
 * object matching a file REPLACES that rule's options — a standalone block
 * silently disarmed the §6.1 `Number()` ban on the money files it overlapped,
 * and would have been disarmed in turn by the i18n block. Caught by putting a
 * `Number()` back into money.ts and finding lint quiet. Re-verify the same way
 * after touching this file.
 */
const QUERY_KEY_SELECTORS = [
  {
    selector: "Property[key.name='queryKey'] > ArrayExpression",
    message:
      'Query keys come from src/lib/query-keys.ts. An inline key silently drifts from the one the screen reads, and React Query reports nothing when it does.',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(invalidate|remove|cancel|refetch|reset)Queries$/] ArrayExpression',
    message:
      'Invalidate through src/lib/query-keys.ts. An invalidate against a key no query uses matches nothing and resolves successfully — the exact failure the registry exists to remove.',
  },
];

export default defineConfig([
  globalIgnores([
    // Defaults from eslint-config-next, restated because we override its ignores.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    // Generated from the backend's OpenAPI document by `npm run gen:api-types`.
    // Linting it would report on the generator's output, and any fix would be
    // erased by the next regeneration.
    'src/lib/api/types.gen.ts',
    // Build tooling, not application code — outside the TypeScript project
    // the type-checked rules need, so linting it reports a parsing error.
    'scripts/**',
    // Playwright's own output. These are gitignored, but flat config does not
    // read .gitignore — so a local `npx playwright test` run drops a bundled,
    // minified trace viewer here and the type-aware rules fail on every file in
    // it with "not found by the project service". Nothing here is our source.
    'playwright-report/**',
    'test-results/**',
    'blob-report/**',
  ]),

  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── The rules that catch real defects, not style ────────────────────
      // An unawaited promise on a money mutation or a permission check is a
      // correctness bug that no amount of review reliably catches.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `any` on an API response defeats the whole point of generating types
      // from the backend's OpenAPI document.
      '@typescript-eslint/no-explicit-any': 'error',

      // Warn, not error: these fire on legitimate boundary code where a value
      // genuinely is unknown until it is narrowed (axios error bodies, JSON
      // from sessionStorage). Ratchet to error once the count reaches zero.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          // `const { passwordHash, ...safe } = user` is the idiomatic way to
          // strip a field; the binding is meant to be unused.
          ignoreRestSiblings: true,
        },
      ],

      // In a browser app console.error IS the log sink, so it stays. console.log
      // is what leaks tokens and balances into a shared devtools session.
      'no-console': ['error', { allow: ['error', 'warn'] }],

      // An empty catch is how the KYC config failure and the kyc-config payload
      // bug both stayed invisible.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'always'],

      // ── Money invariants (ARCHITECTURE §6.1) ───────────────────────────
      // Monetary values cross the API as strings and must stay strings.
      // `Number(balance)` / `parseFloat(amount)` silently truncates past 2^53.
      // Formatting and comparison go through lib/money.ts, which uses decimal.js.
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Never coerce a monetary string to a float — use decimal.js via lib/money.ts. For non-money input use Number.parseInt with a radix.',
        },
      ],
    },
  },

  {
    // ── Query keys come from the registry (the BROAD pass) ─────────────────
    // Deliberately placed BEFORE the money and i18n blocks: those match a
    // subset of these files and set `no-restricted-syntax` of their own, and
    // the LAST matching config object wins per rule name. They spread
    // QUERY_KEY_SELECTORS in for exactly that reason, so every file is covered
    // either by this block or by a more specific one that includes it.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/query-keys.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      // The generic primitive: it RECEIVES a key, it does not author one.
      'src/hooks/use-resource.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...QUERY_KEY_SELECTORS],
    },
  },

  {
    // ── Money paths: no coercion at all ─────────────────────────────────────
    // PLATFORM-CONVENTIONS R-2.6 / R-2.5.5. The global rule above bans only
    // `parseFloat`; the backend additionally bans `Number()` inside
    // modules/{wallet,partners,payments} and the frontends did not, even though
    // `Number(balance)` is the *more* likely way to lose precision here — it is
    // what `.toFixed(2)` and `.toLocaleString()` want you to reach for.
    //
    // Scoped to the screens that actually render money rather than applied
    // globally, exactly as the backend scopes it to its money modules: a blanket
    // ban would fire on genuinely non-monetary conversions (the KYC step index in
    // app/kyc/step/[step]) and get disabled wholesale, which is how a rule stops
    // working.
    //
    // Keep this list in step with the screens that display amounts.
    files: [
      'src/lib/money.ts',
      'src/app/wallet/**/*.tsx',
      'src/app/dashboard/**/*.tsx',
      'src/components/dashboard/**/*.tsx',
    ],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...QUERY_KEY_SELECTORS,
        {
          selector: "CallExpression[callee.name='Number']",
          message:
            'ARCHITECTURE §6.1: Number() on a monetary string silently truncates past 2^53. Use decimal.js via lib/money.ts (formatMoney, isZeroMoney).',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message: 'Never coerce a monetary string to a float — use decimal.js via lib/money.ts.',
        },
        {
          name: 'parseInt',
          message:
            'Suspicious on a money screen. If this is not money, use Number.parseInt with an explicit radix.',
        },
      ],
    },
  },

  {
    // ── Layering: the shared layers know nothing about the pages ────────────
    // PLATFORM-CONVENTIONS R-2.5.1. The backend enforces the same direction
    // (`store/`, `common/`, `config/`, `database/` may not import `modules/**`);
    // the frontends had no equivalent, so nothing stopped a generic helper or a
    // UI primitive from importing a page and quietly creating a cycle.
    //
    // Verified 0 violations when this landed — it is a ratchet on the current
    // state, not a migration.
    files: ['src/lib/**/*.ts', 'src/lib/**/*.tsx', 'src/components/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/app', '**/app/*'],
              message:
                'Dependencies point one way: pages may import from lib/ and components/ui/, never the reverse. If a page owns something these layers need, move it down into lib/.',
            },
          ],
        },
      ],
    },
  },

  {
    // ── File size, as a ratchet ─────────────────────────────────────────────
    // 400 code lines (comments and blanks excluded, so documenting a decision is
    // never penalised). An `error`, not a warning, because both frontends run at
    // --max-warnings 0 and a warning nobody can see is not a limit.
    //
    // The overrides below pin the four files that already exceed it at their
    // CURRENT size. They cannot grow, and new files must come in under 400. Lower
    // these numbers as the files are split; never raise one.
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 340, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Pinned at its current size — the number only ever goes DOWN. Lowered
    // 450 -> 340 when the per-field renderer moved to step-field.tsx and the
    // helpers to field-hints.ts; lower it again after the next split.
    files: ['src/components/kyc/dynamic-step-renderer.tsx'],
    rules: {
      'max-lines': ['error', { max: 340, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    /*
     * `data-table.tsx` is a TWIN of admin's, and is exempted at admin's own
     * ceiling rather than this app's.
     *
     * It is not this app's file to split. `scripts/check-twins.sh` compares the
     * two byte for byte outside the config block, so splitting it here would
     * either break the twin check or force the same split on admin as a side
     * effect of a lint rule that only exists in this repo. Admin pins it at 680
     * for the same reason it is large — selection, expansion, three pagination
     * modes and sorting in one component — and this matches that number exactly
     * so the file is held to one limit rather than two.
     *
     * Lower it in ADMIN first; this follows.
     */
    files: ['src/components/data-table.tsx'],
    rules: {
      'max-lines': ['error', { max: 680, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    // Test files may use loose typing against fixtures.
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // Config files are not part of the app's tsconfig project graph, so
    // type-aware rules cannot resolve them.
    // Build tooling, not application code: these are not in the tsconfig project,
    // so type-aware rules cannot resolve them. `scripts/**` is included because
    // gen-openapi.mjs lives there — CI parses it, a developer's earlier run may
    // not have, and a lint rule that fails only on the runner is the worst kind.
    files: ['*.mjs', '*.mts', '*.config.ts', 'scripts/**/*.mjs', 'scripts/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    // ── i18n: no new hardcoded UI text ──────────────────────────────────────
    // docs/CLAUDE.md seam 4. The catalogue and t() exist; this is what stops the
    // next screen adding literals faster than they get externalised.
    //
    // Scoped to the screens ALREADY converted, and widened as more are done —
    // the same ratchet shape as max-lines. A blanket ban across an app that is
    // half converted produces hundreds of errors, gets disabled wholesale, and
    // then enforces nothing, which is how a rule stops working.
    //
    // It catches the forms that actually carry copy: a bare string as a JSX
    // child, and the handful of ATTRIBUTES that render text to a user. It
    // deliberately does not chase every possible string — a rule with too many
    // false positives is one people learn to silence.
    files: I18N_ENFORCED,
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          allowedStrings: ALLOWED_JSX_LITERALS,
          ignoreProps: true,
        },
      ],
      // `ignoreProps: true` above is deliberate and NOT a gap: with it off,
      // `react/jsx-no-literals` flags every className, every type="submit" and
      // every href — hundreds of findings that carry no copy, which is exactly
      // how a rule gets switched off wholesale.
      //
      // But the comment above claimed this block caught `placeholder`, and it
      // did not: the two are mutually exclusive in that rule. So the props that
      // genuinely carry user-visible copy get their own check, which is narrow
      // enough to stay believable.
      // ESLint flat config REPLACES a rule rather than merging it, so this block
      // silently dropped the money-path Number() ban on every file it covers —
      // which is most of the screens that display a balance. The money selector
      // is repeated here so both rules apply. Change one, change the other.
      'no-restricted-syntax': [
        'error',
        ...QUERY_KEY_SELECTORS,
        {
          selector: "CallExpression[callee.name='Number']",
          message:
            'ARCHITECTURE §6.1: Number() on a monetary string silently truncates past 2^53. Use decimal.js via lib/money.ts (formatMoney, isZeroMoney).',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(placeholder|title|aria-label|alt)$/] > Literal[value=/[A-Za-z]{2}/]',
          message:
            "This attribute is user-visible copy. Use t('key') from lib/i18n so it can be translated (FSD §10, D-16).",
        },
        {
          selector:
            'JSXAttribute[name.name=/^(placeholder|title|aria-label|alt)$/] > JSXExpressionContainer > Literal[value=/[A-Za-z]{2}/]',
          message:
            "This attribute is user-visible copy. Use t('key') from lib/i18n so it can be translated (FSD §10, D-16).",
        },
      ],
    },
  },
]);
