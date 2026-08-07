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
src/app/kyc/{page,step/[step],submitted}/ · dashboard/ · wallet/ · accounts/
src/components/kyc/                       DocumentUploader · DynamicStepRenderer · SelfieCamera
src/components/                           async-boundary · backend-pending · query-provider ·
                                          theme-* · dashboard/* · layout/portal-layout · ui/*
src/context/UserContext.tsx
src/hooks/                                use-resource · use-hydrated
src/lib/api/                              client · auth · errors · wallet · index · types.gen.ts
src/lib/                                  money · countries-data · route-guard · utils
src/proxy.ts                              route gate (session PRESENCE only — never reads a claim)
```

**Never create `middleware.ts`** — it will not run. The gate is `src/proxy.ts`, which also
delegates to the pure `lib/route-guard.ts`.

**The gate never reads a claim.** It used to base64-decode the JWT payload to bounce unverified
users off `/kyc`, and that check was deleted — `route-guard.ts:45-61` records why. When gating
moved to the REFRESH cookie (rightly: the access token lives 15 minutes, so gating on it bounced
returning clients who had a valid 30-day session), the payload changed under it. A refresh token
is signed from `{ sub, jti }` and carries no `emailVerified`, so the check read `undefined !== true`
for everyone and redirected every client, verified or not, away from onboarding.

The lesson is narrower than "be careful": a guard that reads claims is coupled to WHICH token it
is handed, and nothing made that coupling visible. Claims are read where the token's shape is
known and the answer is authoritative — `/auth/me` — so the email gate lives in
`app/kyc/layout.tsx`.

**The top-level auth stubs are GONE, and this is the known cost.** `/login`, `/register`,
`/forgot-password` and `/reset-password` were 5-line `redirect()` files pointing at their
`/auth/*` equivalents, and they existed because verification and reset emails already in inboxes
contain those URLs — `lib/api/auth.ts` records the incident where an emailed link 404'd. They were
removed on an explicit instruction to clean the folder structure, with that consequence stated
first. So: **any verification or reset link sent before this change now 404s.** If support reports
one, the fix is to restore the four files from git history, not to redirect at the edge.

The `?next=` forwarding went with `/login`. Nothing else reads that parameter at the root, so a
restored stub needs it back — `proxy.ts` writes it when it bounces a visitor, and dropping it
downgrades "sign in and carry on" to "sign in and land on the dashboard".

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

The login and refresh responses carry **no tokens at all** (R-3.2) — `AuthTokensResponseDto` keeps
the name and only returns `{ user, emailVerified }`. Nothing in this app reads a token from a
response body, and `refreshPortalToken()` returns a **boolean**: reaching 200 IS the result,
because the rotated cookies arrive on the response and the browser installs them.

The historical snake_case/camelCase asymmetry between the two APIs still exists on other fields
and is frozen; it no longer applies to tokens, because there are none.

### `api` is exported twice

`src/lib/api/index.ts` exports `api` **both** as a named export and as the default, and pages use
whichever the author reached for. Keep both. Anything that stubs or wraps the module has to supply
both too — supplying only `default` leaves the named `api` undefined, the page throws on first
use, its own `catch` swallows the TypeError, and what you see is a generic "failed to load" that
reads as a broken query rather than a broken stub. That cost real time twice.

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
- **Tests are back, on request, and the suite is deliberately small.** All 291 were deleted on an
  explicit instruction, along with `e2e/`, `src/test/`, `vitest.config.mts` and every test
  dependency. `npm test` was then re-added — also on request — when the money screens landed,
  because a change to `/wallet`, `/deposit`, `/withdraw` or the KYC gate had no automated
  protection at all beyond `type-check`, `lint` and `build`.

  What exists now is three files, chosen because they cover the two rules that are expensive to
  get wrong and cheap to break by accident:

  - `src/lib/money.test.ts` — §6.1. The assertions are the ugly values (`12345678901234567.89`,
    eight-decimal balances), so a refactor to `Number()` or `Intl.NumberFormat` FAILS rather than
    passing. A test asserting `formatMoney('10','USD') === '$10.00'` would prove nothing.
  - `src/lib/kyc-access.test.ts` — who may reach a money screen. Pins the "either signal is
    enough" rule and the whole-segment path match, both of which have a wrong answer that only
    shows up in production.
  - `src/components/kyc/money-action.test.tsx` — that an unanswered KYC question blocks rather
    than optimistically links.

  All three were mutation-checked when written: the guarantee was deliberately broken and each
  test failed on the right assertion. Add tests the same way — if you cannot describe the
  regression a test catches, it is not earning its run time.

  `vitest.config.mts` sets NO coverage thresholds yet, and that is deliberate; see the comment in
  it. `vitest.setup.ts` and `src/test/render.tsx` are TWIN FILES with admin — behaviour changes
  belong in both.

  `admin/` and `backend/` run much larger suites — 434 and ~1000 tests. The backend is where the
  money rules are actually enforced, and that remains the deepest coverage.
- The README is create-next-app boilerplate and says port 3000 for the wrong reasons. Ignore it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
