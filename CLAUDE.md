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
src/app/kyc/{page,step/[step],submitted}/ · dashboard/ · wallet/ · accounts/ · transactions/ ·
                                          partner/ · platforms/ · {deposit,withdraw,transfer}/
src/components/kyc/                       DocumentUploader · DynamicStepRenderer · SelfieCamera
src/components/                           async-boundary · backend-pending · query-provider ·
                                          theme-* · dashboard/* · layout/portal-layout · ui/*
src/components/wallet/wallet-card         the balance card (see "Wallet cards" below)
src/components/transactions/              transaction-filters — the toolbar AND `applyFilters`
src/components/partner/partner-dashboard  earnings · referred clients · sub-partners
src/context/UserContext.tsx
src/hooks/                                use-resource · use-hydrated
src/lib/api/                              client · auth · errors · wallet · trading · partner ·
                                          payments · index · types.gen.ts
src/lib/                                  money · date-range · countries-data · route-guard · utils
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

## The money/partner/accounts screens

Four screens landed together and share one rule: **state what is true, never render a plausible
number.** Each carries the rule differently, and each has a specific bug it exists to prevent.

- **`/wallet`** renders each currency as a payment CARD (`components/wallet/wallet-card.tsx`) —
  wallet id, currency, available balance, holder, and the three `MoneyAction`s beneath it. The
  card metaphor stops short of a fake card number, chip or expiry: those imply an instrument the
  client can present somewhere, and none exists. An **unopened** wallet renders an em dash and a
  sentence, deliberately flat and muted, **never `$0.00`** — that is what showed a client holding
  $700 a zero, and a prettier card is exactly the change that reintroduces it.

- **`/transactions`** filters by type, status, currency, free text, date range and sort. The
  toolbar and `applyFilters` live in `components/transactions/transaction-filters.tsx`, exported
  and pure so the money rules are assertions rather than something you find by clicking.
  Filtering is **client-side and that is bounded**: `GET /payments/transactions` returns the whole
  history as a bare array and takes no query parameters, so counts are honest and a sort covers
  the real set. **If that endpoint ever grows paging, this must move server-side** — filtering one
  page and calling it a filter over the history would silently under-report a client's own money.

- **`/accounts`** is live via `GET /trading/accounts` (new — see the backend note below). Live and
  demo are separate SECTIONS rather than one list with a tag, because the distinction is whether
  the money is real and a demo row between two live ones is what makes the wrong one plausible.
  It shows `balance` and **never equity, margin or open positions** — there is no MT5 bridge, so
  nothing here holds them. The screen says so in the UI, not only in a comment: a figure labelled
  only "Balance" gets read as equity, and those differ by every open position.

- **`/partner`** is full width on **every** state — no `max-w-*`, no `mx-auto` on the route. The
  four non-approved states were briefly capped, on the reasoning that a lone "apply" card stretched
  across an ultrawide monitor is a line of text with a button off to the right. That reasoning is
  about the CARD, so the fix belongs there (`max-w-md` on the prose inside the panels); capping the
  PAGE also moved the heading inward, so the partner screen sat at a different width from every
  other screen and read as a different app.

- **`/dashboard`** renders from `GET /dashboard`: four stat tiles, wallets, recent transactions,
  open positions and trading accounts. It was two cards (KYC + download) before, and that emptiness
  was CORRECT at the time — the version before it carried tiles reading "0 trading accounts" with
  no endpoint behind them, so a client with three read zero. Every figure is counted server-side
  now. `KycStatusCard` renders **nothing** for an approved client: a permanent "Level 1 Verified"
  card is a status light that never changes, telling somebody something they cannot act on while
  pushing the real data down the page — the same reason the header pill was removed.

### The empty states fill the page, and are sized in `vh`

`/transactions` and `/accounts` use `min-h-[60vh]` plus `justify-center`, **not** `h-full`. The
layout is `min-h-screen` with no unbroken `h-full` chain from `<html>` down, so a percentage height
has nothing to resolve against and silently collapses to its content.

### Positions are empty for everyone, and the copy says why carefully

Nothing writes to the `positions` table until an MT5 bridge exists. The panel says trades are not
**synced** — never "you have no trades" — because a client who opened a position this morning would
still see zero, and the second sentence would be false. The terminal is named as the source of
truth and linked, so the panel reads as a boundary rather than a broken feature.

`largestBalance` on the dashboard is **not** a cross-currency sum: $500 + 200 USDT is not "700" of
anything, and there is no FX source in this system. It reports the largest single holding with its
own currency label.

### `earnings.engineLive` is the field that matters most on the partner screen

The commission engine now EXISTS (backend `modules/ib/commission*`): a client deposit accrues to
the partner chain, and an hourly job credits it. `GET /ib/overview` sums real
`commission`/`rebate`/`payout` ledger entries — never a figure derived from referral count × rate.

`engineLive` is a server-side READ — "has any accrual ever been confirmed?" — not a constant. It
flips true on its own the first time the pipeline pays anyone, with no frontend change.

While it is false the UI **must** say so beside the totals. A zero then means "nothing has been
credited yet", which is a different sentence from "you have earned nothing", and a partner who is
owed money reads the second as a dispute. Same rule as the wallet's missing-wallet-is-not-a-zero.

Do **not** re-derive this flag client-side from `lifetime === '0'`: that is per-partner, so a
brand-new partner on a fully working platform would be told the calculation is not running.

### Dates are `YYYY-MM-DD` strings — `lib/date-range.ts`

The range picker (`ui/date-range-picker.tsx`, one trigger opening two months) keeps all its
arithmetic in a pure module, for the same reason money does: every boundary case has a wrong
answer that ships silently.

- **Never `toISOString().split('T')[0]`** — it converts to UTC first, so it returns tomorrow for
  eastern zones in the evening and yesterday for western zones in the morning. `todayIso()` uses
  local getters.
- **The end of a range is INCLUSIVE by date part.** Comparing a timestamp against the end date
  parsed as midnight excludes almost the whole final day — the "my newest transaction vanished
  when I set an end date" bug. `withinRange` compares date parts, so there is no end-of-day
  arithmetic to get wrong.
- A range selected backwards is **normalised**, not refused.
- `date-range.test.ts` and `transaction-filters.test.ts` pin both, and were mutation-checked.

## Money in the UI

Balances arrive as **strings** (`'250.00000000'`) and stay strings all the way to the DOM.

`src/lib/money.ts` is the only formatter: `formatMoney(value, currency)`, `isZeroMoney(value)` and
`compareMoney(a, b)`, all on decimal.js. `Number()`, `parseFloat` and `Intl.NumberFormat` are
banned on money paths (the first two by lint) — `Number('12345678901234567.89')` is already wrong
before formatting begins, and `isZeroMoney` exists so nobody writes `value !== '0.00000000'`,
which breaks the moment the API returns `'0'`.

**`compareMoney` is what you sort amounts with**, and it exists because both obvious alternatives
are wrong in ways that look right: `Number(a) - Number(b)` loses precision before comparing, and
`a.localeCompare(b)` puts `'9.00'` above `'100.00'`. Any list a client can sort by amount hits the
second on its first mixed-magnitude row. (Admin reaches the same rule through
`compareValues(a, b, 'money')`; `money.ts` is a **twin file**, so `compareMoney` was added to both.)

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

  What exists now is five files, chosen because they cover the rules that are expensive to get
  wrong and cheap to break by accident:

  - `src/lib/money.test.ts` — §6.1. The assertions are the ugly values (`12345678901234567.89`,
    eight-decimal balances), so a refactor to `Number()` or `Intl.NumberFormat` FAILS rather than
    passing. A test asserting `formatMoney('10','USD') === '$10.00'` would prove nothing.
  - `src/lib/kyc-access.test.ts` — who may reach a money screen. Pins the "either signal is
    enough" rule and the whole-segment path match, both of which have a wrong answer that only
    shows up in production.
  - `src/components/kyc/money-action.test.tsx` — that an unanswered KYC question blocks rather
    than optimistically links.
  - `src/lib/date-range.test.ts` — the INCLUSIVE range end (a transaction stamped 23:45 on the
    closing day must match), local-not-UTC `todayIso`, backwards selection, and impossible dates
    like `2026-02-31`. Every one of these fails silently rather than throwing.
  - `src/components/transactions/transaction-filters.test.ts` — that amounts sort through
    decimal.js, so `'9'` does not outrank `'100'` and two amounts a float would collapse stay
    distinct; and that the filter does not mutate React Query's cached array.

  All five were mutation-checked when written: the guarantee was deliberately broken and each test
  failed on the right assertion. Add tests the same way — if you cannot describe the regression a
  test catches, it is not earning its run time.

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
