# oxshare-crm-client

> Cross-repo context — doc authority, ports, auth cookies, the `/api` rewrite, the §6 money
> rules, and the quality-gate machinery — lives in `../CLAUDE.md`. This file is only what is
> specific to this repo. If the two disagree, `../CLAUDE.md` wins on facts about the system
> and this file wins on conventions inside this directory.

Next.js 16 **client portal** on **:3000**. Package name is `portal`. This is the customer-facing
app: registration, email verification, KYC onboarding, wallet.

## Layout

```
src/app/auth/{login,register,forgot-password,reset-password,verify-email}/page.tsx
src/app/{login,register,forgot-password,reset-password}/page.tsx   5-line redirect() stubs — KEEP
src/app/kyc/{page,step/[step],submitted}/ · dashboard/ · wallet/ · accounts/
src/components/kyc/                       DocumentUploader · DynamicStepRenderer · SelfieCamera
src/components/                           async-boundary · backend-pending · query-provider ·
                                          theme-* · dashboard/* · layout/portal-layout · ui/*
src/context/UserContext.tsx
src/hooks/                                use-resource · use-hydrated
src/lib/api/                              client · auth · errors · wallet · index · types.gen.ts
src/lib/                                  money · countries-data · route-guard · utils
src/proxy.ts                              route gate + JWT emailVerified check for /kyc
```

**Never create `middleware.ts`** — it will not run. The gate is `src/proxy.ts`, which also
base64-decodes the JWT payload to bounce unverified users off `/kyc`.

**The top-level auth stubs are deliberate.** `/login`, `/register`, `/forgot-password` and
`/reset-password` are 5-line `redirect()` files pointing at their `/auth/*` equivalents, because
verification and reset emails already in inboxes contain those URLs. `lib/api/auth.ts` records
the incident where an emailed link 404'd. Don't delete them.

File naming is mixed and should converge on **kebab-case** (`components/kyc/*` is still
PascalCase). `src/context/*Context.tsx` stays PascalCase, matching admin.

## Never mock data

This is the rule that matters most in this repo, because it was broken here twice:

- `src/lib/api/kyc.ts` used to call three `/compliance/*` routes **that do not exist** and, on the
  guaranteed failure, return four hardcoded KYC fields and a five-country list. Deleted.
- `/wallet` and `/dashboard` rendered literal `$0.00` while `GET /wallet` worked, so a client
  holding $700 was shown zero. Wired.

A screen without a backend renders `<BackendPending endpoints={[...]}>`, naming what is missing.
A failed request renders an error with a retry, never an empty success state — an empty KYC
config must not render as a form with no fields.

Do not add `.catch(() => ({ data: [] }))`. That pattern is what hid both bugs above.

## Data fetching

React Query, via `src/hooks/use-resource.ts` — a twin of admin's, giving the 4-state
`Resource<T>` (`loading | ready | unavailable | error`, where `unavailable` is a 404 = endpoint
not built). Render with `<AsyncBoundary>`. `QueryProvider` is mounted in the root layout.

Several older pages still use `useState`/`useEffect` + direct `api.*` calls; the migration to
`useResource` is in progress and new code should not add to the old pattern.

Async handlers on JSX attributes need an explicit `void` — `onClick={() => void resend()}`,
`onSubmit={(e) => void handleSubmit(e)}` — because React types those as returning `void` and
`no-misused-promises` is an error here.

`src/lib/api/errors.ts` holds the canonical `apiErrorMessage(error, fallback)`, including the
`error.message` fallback. Use it instead of reaching into `err.response.data.message` inline.

## Money in the UI

Balances arrive as **strings** (`'250.00000000'`) and stay strings all the way to the DOM.

`src/lib/money.ts` is the only formatter: `formatMoney(value, currency)` and
`isZeroMoney(value)`, both on decimal.js. `Number()`, `parseFloat` and `Intl.NumberFormat` are
banned on money paths (the first two by lint) — `Number('12345678901234567.89')` is already wrong
before formatting begins, and `isZeroMoney` exists so nobody writes `value !== '0.00000000'`,
which breaks the moment the API returns `'0'`.

A wallet absent from `GET /wallet` has genuinely not been opened. Render that as such, not as zero.

## API types are generated

`npm run gen:api-types` (backend running) regenerates `src/lib/api/types.gen.ts`. Alias
`components['schemas'][…]` rather than hand-writing response interfaces.

The auth, wallet, KYC and payments endpoints now carry response DTOs, so `UserProfile`,
`AuthResponse`, `Wallet`, `LedgerEntry` and `LedgerPage` are all aliases. Aliasing caught real
drift in the hand-written versions: they declared `user.role` and `user.isEmailVerified` (neither
exists), a `type: 'referral' | 'partner'` where the enum is `individual | corporate`, and a
`getLedger` returning a bare array where the endpoint returns `{ items, total, page, limit }`.

Where an alias is still impossible, hand-declare and mark it with a comment naming the gap, so it
gets replaced rather than forgotten.

Note the casing asymmetry: portal endpoints answer snake_case `access_token` / `refresh_token`,
while the admin API answers camelCase. `lib/api/client.ts` asserts the one shape the backend
actually sends rather than reading both — reading both is how a rename goes unnoticed until
sessions silently stop refreshing. This divergence is known and frozen.

## Twin files

These exist at the **same path** in `oxshare-crm-admin` and are meant to stay identical:
`lib/api/client.ts`, `lib/api/errors.ts`, `hooks/use-resource.ts`,
`components/{query-provider,backend-pending,async-boundary}.tsx`, `components/ui/*`, `lib/utils.ts`.

Behaviour changes belong in **both**. Per-app values (cookie names, token lifetimes, redirect
paths, endpoint patterns) go in the delimited `twin:config` block, never inline.

`npm run check:twins` enforces this by comparing everything outside that block, ignoring comments.
It is advisory and skips cleanly when the sibling repo is not checked out, so CI never depends on
a sibling directory. `lib/api/client.ts` is a **near**-twin and excluded: its exported names
(`clearSession`, `refreshPortalToken`) and snake_case token casing differ irreducibly from
admin's.

## Gotchas specific to this repo

- Dark mode is fully wired: `globals.css` is byte-identical to admin's, carries the Tailwind v4
  `@custom-variant dark`, and `ThemeProvider` is mounted with `attribute="class"`. Light is the
  default; dark is opt-in.
- The `sessionStorage` restore effect in `kyc/step/[step]/page.tsx` carries a reasoned
  `react-hooks/set-state-in-effect` exemption. Keep the comment and the disable — a lazy
  `useState` initialiser there would cause a hydration mismatch on a half-filled form.
- `npm test` → Vitest, 28 tests. No jsdom/testing-library yet, so component tests need those first.
- The README is create-next-app boilerplate and says port 3000 for the wrong reasons. Ignore it.
