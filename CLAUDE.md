# oxshare-crm-client

> Cross-repo context — doc authority, ports, auth cookies, the `/api` rewrite, the §6 money
> rules, and the quality-gate machinery — lives in `../CLAUDE.md`. This file is only what is
> specific to this repo. If the two disagree, `../CLAUDE.md` wins on facts about the system
> and this file wins on conventions inside this directory.

Next.js 16 **client portal** on **:3000**. Package name is `portal`. This is the customer-facing
app: registration, email verification, KYC onboarding, wallet.

## Layout

```
src/app/auth/{login,register,confirm-email,forgot-password,reset-password,verify-email}/page.tsx
src/app/onboarding/                       "verify your identity now or later" (after the code)
src/app/kyc/{page,step/[step],submitted}/ (outside the group: it picks its own frame by path)
src/app/(portal)/                         layout.tsx — ONE frame (sidebar, header, bell) for every
                                          signed-in page; a section's own layout.tsx only carries
                                          `metadata`. Sections: dashboard/ · wallet/ ·
                                          accounts/{page,[id]} · transactions/ · partner/ ·
                                          platforms/ · profile/ · {deposit,withdraw,transfer}/
src/components/kyc/                       DocumentUploader · DynamicStepRenderer · SelfieCamera
src/components/                           async-boundary · backend-pending · query-provider ·
                                          theme-* · dashboard/* · ui/* · layout/{portal-layout,
                                          sidebar-nav, use-phone-drawer, use-rail-preference}
src/components/wallet/wallet-card         the balance card (see "Wallet cards" below)
src/components/transactions/              transaction-filters — the toolbar AND `applyFilters`
src/components/accounts/                  open-account-button · account-live-panel ·
                                          account-positions · account-transactions ·
                                          account-actions · open-account-dialog
src/components/partner/               partner-workspace (root) · partner-header ·
                                          partner-summary · partner-ui (the design system) ·
                                          partner-tabs · partner-overview · partner-clients ·
                                          partner-network · partner-commissions ·
                                          commission-summary · commission-transfers ·
                                          commission-balances · commission-transfer-dialog ·
                                          apply-panel (the non-approved states, untouched)
src/context/UserContext.tsx
src/hooks/                                use-resource · use-hydrated · use-realtime ·
                                          use-live-account · use-money-refresh
src/lib/api/                              client · auth · errors · wallet · trading · partner ·
                                          payments · index · types.gen.ts
src/lib/                                  money · date-range · account-stats · countries-data ·
                                          route-guard · session-hint · utils
src/proxy.ts                              route gate (a MARKER only — never a session, never a claim)
```

**Never create `middleware.ts`** — it will not run. The gate is `src/proxy.ts`, which also
delegates to the pure `lib/route-guard.ts`.

## The document never scrolls

`<body>` is `h-dvh overflow-hidden` (`app/layout.tsx`). Every screen owns its own scroll
container: the portal's `<main>`, `auth-shell`, and the full-screen error/not-found/session
states. Without the cap the document scrolls _behind_ whichever shell is already scrolling, and
the reader sees two scrollbars side by side on one screen — reported on `/partner` and fixed here
rather than on that page, because the cause was the shell.

`dvh`, not `vh`: on mobile `100vh` is the viewport with the browser chrome RETRACTED, so a `vh`
cap is taller than what is visible and reintroduces the overflow it was meant to remove.

**The consequence is a rule.** Anything past that box is CLIPPED, not reachable by scrolling — so
a new screen whose content can exceed the viewport must carry its own `overflow-y-auto`. A
full-height screen that forgets it loses its bottom silently, which is why the five that relied on
document scrolling were converted in the same change.

A panel INSIDE a scrolling screen may still scroll (a `fill` DataTable is the common case). That
is a nested scroll region and is fine as long as it is intended — see the `TABLE_FRAME` note under
`/partner` for how to size one so it never scrolls by accident.

**The gate reads a MARKER, and it is not a session.** `lib/session-hint.ts` is a non-sensitive
cookie this app writes on its OWN host whenever `/auth/me` answers "signed in", and clears when it
answers 401. The session cookie itself stays structurally invisible here, for the reason `proxy.ts`
gives at length.

It exists for one bug: `/` redirected to `/auth/login` unconditionally, and `/` is the URL clients
type and the one their bookmark points at. So every returning client with a valid thirty-day
session was shown a fully painted sign-in form and moved off it a round trip later. That reads as
having been logged out, and the response it invites is typing a password that was not needed —
minting a second session over the first.

**The marker decides what to PAINT, never who may ENTER.** Any visitor can write it in a console,
so it only moves people between PUBLIC screens; a forged one buys a redirect to /dashboard that
`RequireAuth` reverses on the first `/auth/me`. Building a real gate on it would be the failure
this file records twice, wearing a new cookie.

Redirecting off the sign-in screens uses `AUTH_ONLY_PATHS`, **not** `PUBLIC_PATHS` — /verify-email,
/forgot-password and /reset-password must work WITH a session, and `public-paths.ts` explains what
collapsing the two lists locks people out of. `src/proxy.test.ts` pins every branch, and
`decideRoute` takes the marker as an ARGUMENT so it stays a table test.

A stale marker cannot loop, and the line that guarantees it is `clearSessionHint()` inside
`clearSession`: it runs in the axios interceptor, before React Query settles and long before any
navigation, so the 401 eviction reaches `/auth/login` with the marker already gone.

`RedirectIfAuthenticated` no longer paints the form first. It used to, on the reasoning that most
visitors to sign-in have no session and should not wait — which was sound, and wrong, because the
"rare" case was every returning client. The marker is what lets both be right: no marker paints
immediately, a marker holds the paint.

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

## Sign-up ends on a 6-digit code (25 Sep 2026)

The client's request: register → the emailed code → signed straight in → "verify your identity
now or later". `/auth/register` and an unconfirmed `/auth/login` both land on
`/auth/confirm-email`; the right code calls `POST /auth/verify-email-code`, which confirms the
address AND starts the session exactly as sign-in does (httpOnly cookies, CSRF header, no token in
the body). Then `/onboarding`: *Verify now* → `/kyc`, *Verify later* → `/dashboard`.

- **The address travels in `sessionStorage`, never the URL** (`lib/pending-email.ts`) — an email in
  a query string reaches history, Referer headers and access logs. `from=register|login` and
  `next=` do ride in the URL; `next` goes through `safeReturnTo` like everywhere else.
- **Every server rule is the server's**: keyed-hash storage, 5 attempts, 15 minutes, single use, a
  30-second resend cooldown (`RESEND_COOLDOWN_MS` mirrors it — a resend inside it is answered
  normally and sends NOTHING). Every wrong code is the one code `EMAIL_CODE_INVALID`.
- **An address that already has an account is told so ON THE SIGN-UP FORM** (the owner's ruling,
  28 Sep 2026, reversing the enumeration-safe design). The first step's Continue asks
  `POST /auth/register/email-available`, and `register` itself answers 409
  `EMAIL_ALREADY_REGISTERED` if the address was taken in between. Either way the form stays on step 1
  and shows `components/auth/email-taken-notice.tsx` (Reset password · Sign in · Use a different
  email), and it never reaches the code screen. Both buttons hand the address over
  (`lib/email-handoff.ts`, sessionStorage, read once) so the next screen opens pre-filled. Nothing is
  emailed. The code screen no longer hedges about an existing account: only a new address reaches it.
  Don't re-raise the enumeration trade-off; it was the owner's call.
- **A visitor with no remembered address is ASKED for it and sent no code** — they may already hold
  a good one, and a new code kills it. The resend button is one tap away.
- **The emailed LINK still works and never signs anyone in** (mail scanners follow links); it ends
  on sign-in with `next=/onboarding`, so both ways of confirming land on the same screen.
- `/verify-email/pending` is now a redirect to the code screen, and `RequireAuth` sends an
  unconfirmed session there.
- `/onboarding` offers the choice only while there is one — approved, under-review and refused
  clients go to `/dashboard` — and its benefits list only what `KycVerifiedGuard` and the
  live-account check actually keep shut.
- **The form is two steps** (the client's request, same day): the account, then the personal
  details — date of birth, nationality, phone, residence, city, address, postal code — that the KYC
  personal step then opens with. They are the client's ONE profile (backend 0139; see
  `../CLAUDE.md`), so nothing is typed twice and the two cannot disagree. `lib/register-form.ts`
  holds the screen's model; the SERVER judges every value and answers per field, and a refusal
  sends the client back to the step that shows the field. The country and nationality lists come
  from `GET /profile/options` — never a local copy. E2E fill both steps through
  `fillRegisterForm` in `e2e/helpers.ts`.
- Proved by `e2e/email-code-signup.spec.ts` (the real journey against Mailpit, refresh rotation and
  reuse detection included — costs three registrations, desktop only) and
  `e2e/confirm-email-screen.spec.ts` (phone layout and the fold, stubbed, spends none). E2E filters
  on the sign-up mail use `VERIFICATION_SUBJECT` — `/verify/i` does not match "verification".

## KYC: the identity is the profile, and what the wizard may save (26 Sep 2026)

The rules are in `../CLAUDE.md` ("The identity core is the PLATFORM's"). What this app owns:

- **Which details are required comes from the server.** `requiredDetailFields(options)` reads
  `GET /profile/options` → `required.registration`. Before the lists arrive it claims nothing
  required, and the API still judges every value.
- **Autosave** (`components/kyc/use-step-autosave.ts`). The identity fields (`system`) are sent only if
  THIS client edited them (the tab's draft, `lib/kyc-draft.ts`), on the typing pause like any answer.
  A phone whose digits do not yet make a number is never autosaved; an emptied phone is a clear and is
  saved. Continue (`continueAnswers`) sends what is on screen, and the server answers per field, under
  each field. A failed autosave says so and offers *Try again*.
- **The form is the broker's to arrange (Phase 2, 29 Sep 2026)**, and this app renders whatever it
  is served. The identity details on Personal Information are the ones the builder placed, in its
  order, required or not. Any step, built-in included, may carry the broker's own questions and
  uploads; a file there is stored under that step, never on the passport or the bill. An evidence
  step the broker made optional (`evidenceRequired: false`) says so (`kyc.evidenceOptional`), and
  Continue stays the server's call. `e2e/kyc-builtin-extras.spec.ts` drives a question and an upload
  on Proof of Address.
- **A first visit opens Personal Information** (`resume-step.ts`, status `not_started`), even when sign-up
  already completed it: the details the documents are checked against are confirmed first.
- **One identity document.** Choosing another card than the one on file changes nothing until a page
  of the new one is uploaded; the note under the cards says the upload replaces it.
- **A verification returned for UPDATE** (`reverificationRequestedAt`) reads as a request, never as a
  rejection: `useKycAccess().reverification` drives the money gate dialog, the dashboard card, the step
  banner and the outcome screen. The doors stay shut exactly as for a rejection.
- **The progress rail holds any number of steps** (`app/kyc/kyc-shell.css`). Every step has ONE width,
  because each connector is sized from its own step and only meets the next circle when the two are
  equally wide. With eight steps, one-line labels broke that (reported): the lines stopped short and
  the labels ran together. Labels wrap to two lines inside their step. Phones show the rail with a
  "Step N of M · title" caption instead of the labels.
- **`/profile`'s Verification panel reads `GET /kyc/status`** (`verification-status.tsx`), never the email
  flag. Every signed-in client has confirmed their email, so it told all of them "Your identity is
  verified."

## The bell: a client's notification is done once SEEN (25 Sep 2026, D-78)

The owner's rule: a client's bell must never look full of things to do. Every row is an outcome
the client was waiting on (a deposit credited, a withdrawal paid, a KYC decision), so once seen it
is finished. `components/notifications/notification-panel.tsx` shows **New** (unread) and
**Earlier** (read), both cut from ONE read of the newest page; `layout/notifications-sheet.tsx`
marks everything up to the newest row SHOWN as read when the sheet **closes** — on close, not on
open, so nothing moves from New to Earlier while it is being read, and a row that arrived after the
panel rendered is never swept (`markAllRead(upTo)`). There is no "Mark all" button: seeing clears
the badge. `notification.changed` on the socket keeps other tabs in step.

**Many arrivals are ONE announcement.** The hourly commission run confirms a partner's rebates
together, so a client can be told about twenty credits in the same instant. The sheet gathers
arrivals within 400 ms: one refetch, one chime (never closer than 3 s), one toast — the notification
itself when alone, "N new notifications" (a single toast id, updated in place) when not — and no
toast while the panel is open. The admin bell does the same. Do not "simplify" it back to one toast
per event.

The echoes are gone at the source: a self-opened trading account rings nothing, and a transfer
rings only when it settled more than a minute after the request (it was in flight). Their
catalogue entries stay so Earlier still renders old rows. This reverses the sheet's old "read is
explicit" note for CLIENTS only — an admin's notification is a task and keeps that rule.

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

- **`/accounts`** is live via `GET /trading/accounts`. Live and demo are separate TABS rather than
  one list with a tag, because the distinction is whether the money is real and a demo row between
  two live ones is what makes the wrong one plausible. The LIST shows the CRM's cached `balance`
  and nothing else — one network call to a server we do not own, multiplied by the number of
  accounts, is not worth it for a summary card. Live figures live on the detail route.

- **`/accounts/[id]`** is the one account: live MT5 figures, its transfers, and its open positions.
  **The MT5 bridge now EXISTS** (`../bridge`, ASP.NET wrapping the Manager API), so equity, margin
  and floating P/L are real reads rather than the forbidden inventions they were when only the list
  existed. What has NOT changed is which figures are honest — see below.

### `/accounts/[id]`: two balances, both labelled, and one floating figure

The screen shows the CRM's cached `balance` beside MT5's live one, and they can legitimately
disagree: the column is what a wallet transfer credited and stops moving the moment the client
trades. **Both carry a label saying which is which.** Two unlabelled money figures that differ is
worse than showing one — a client cannot tell which is theirs, and half the time acts on the wrong
one. Same family as the wallet's `$0.00`.

`floating` is `equity - balance - credit`, derived server-side in `TradingService.snapshotMine`.
It is the **only** floating figure this system can state: the bridge exposes closed deals and
account snapshots, and **no open-position feed exists**. So the account TOTAL is real and a
per-trade breakdown is not. Do not add one by dividing the total across the `positions` table —
nothing writes to that table, and a fabricated per-trade floating beside a real login is the most
expensive kind of wrong number on a trading product.

The open-positions panel therefore says individual trades are **not carried here** and links the
terminal. It must never say "you have no open positions" — the client reading it may hold three,
and their own floating P/L is on the same screen.

Live figures have **three** outcomes and three different sentences: figures, `null` (no MT5 login —
permanent, about this account), and an error (bridge unreachable — temporary, about the platform).
Collapsing the last two into one "unavailable" tells a client whose account is fine that their
broker is down, and both then wait for the wrong thing.

### The Activity card and the trading statistics were REMOVED

This screen used to carry an "Activity" card — a period picker over
`GET /trading/accounts/:id/history` rendering thirteen stat figures. The card, that request, its
query key, the four response types and twenty-six strings went together, along with `winRate` in
`lib/account-stats.ts` and its test.

**Know what went with it:** a client can no longer see closed-trade totals — win rate, realised
P/L, volume, best and worst trade — anywhere in the portal. The endpoint still exists and still
answers; nothing calls it. Somebody reading this looking for those figures is not chasing a bug.

If they ever come back, the rule that made them honest must come back too: `wins + losses` need NOT
equal `trades` — a scratch exit is neither — so **a win rate divides by `trades`**. Dividing by
`wins + losses` gives a plausible percentage that is wrong only on accounts with flat exits, which
is exactly what lets it survive review. `account-stats.ts` keeps that note where the function was.

### The live figures are PUSHED, and the poll is the fallback

`useLiveAccount` registers a lease (`POST /trading/accounts/:id/watch`), the bridge reads the
account on its own loop, and each reading arrives as `account.live` on the socket this browser
already holds for its notifications. The hook writes it into the SAME query keys the two panels
render from, so `AccountLivePanel` and `AccountPositions` need no new prop and `dataUpdatedAt`
still drives the "read at" line — stamped with the READ time, not arrival.

Polling did not go away; it slows to 60s while readings arrive and returns to 10s when they stop.
**That is the whole safety of the feature.** Five things leave the feed silent — socket down, bridge
unreachable, bridge at capacity, no MT5 login yet, API predating the endpoint — and the fallback is
the behaviour it is falling back FROM. `live` therefore means A READING ARRIVED RECENTLY, not "the
server said yes": a watch that is accepted and then goes quiet drops back on its own.

**More watchers does not mean more live.** Every read takes the bridge's one MT5 session, so a
viewer's figures refresh every `watched × read-cost`; the bridge caps the watched set and refuses
new ones past it. `GET /admin/live` on the bridge is where the real latency is measured.

⚠️ **An absent `positions` array in a push is NOT an empty one.** The server drops it when the
event will not fit `pg_notify`'s 8000 bytes, so absence means "unchanged, ask separately". Writing
`[]` there would tell a client holding three trades that they hold none — the accounts list shipped
that exact bug once already.

That contract is why the hook returns **two** flags. `live` says account figures are arriving;
`positionsLive` says they are arriving WITH the table. Folding them into one told the positions
table it was being fed when it was not, and it slowed its own fallback poll to 60s on the strength
of it — so the client with the most open trades, the one whose array gets dropped, ended up with
the stalest table. Worse than before the live path existed.

⚠️ **A pushed position row must be the SAME SHAPE as a polled one.** Both fill the same table
through the same generated type, so a field on one and not the other is not a type error — it is a
column that empties itself when a reading arrives. `side` was omitted from the first live payload
and every pushed row lost its Buy/Sell label while the equity above it updated perfectly.
`positionSideLabel` on the backend is now the single definition both paths use, and
`parseLivePush` rejects a row without it. A malformed row drops the WHOLE array: open positions are
a set, and a table quietly missing one row is a client who thinks they closed something they still
hold.

- **`/partner`** is full width on **every** state — no `max-w-*`, no `mx-auto` on the route. The
  four non-approved states were briefly capped, on the reasoning that a lone "apply" card stretched
  across an ultrawide monitor is a line of text with a button off to the right. That reasoning is
  about the CARD, so the fix belongs there (`max-w-md` on the prose inside the panels); capping the
  PAGE also moved the heading inward, so the partner screen sat at a different width from every
  other screen and read as a different app.

  The APPROVED screen reads identity → money → evidence: a header surface (status, agency, and the
  referral code and link on one rule — no rate card, see below), then the four figures as one statement
  row, then every commission balance, then five tabs. The four non-approved states are untouched —
  `apply-panel.tsx` and the status panels in `page.tsx` were not part of the rebuild.

  **The visual language is `partner-ui.tsx`, and it is deliberately undecorated.** Related figures
  share ONE surface separated by hairlines (`HAIRLINE_GRID`: `gap-px` over `bg-border`, each cell
  painting `bg-card`, which is correct at every breakpoint without per-breakpoint border
  overrides) rather than floating as individual cards. No glows, no gradients, no tinted icon chip
  per panel header. Colour appears on the primary action, the active tab, and STATES — never on a
  figure for decoration. Three type sizes, used everywhere.

  **This screen is a DOCUMENT, not a fill screen.** No `flex-1 min-h-0` on its roots and no `fill`
  on its tables. `portal-layout` makes `<main>` the one scroll container, and its own note explains
  the trap: a `flex-1 min-h-0` child has `flex-basis: 0`, contributes zero to its parent's content
  height, and leaves the padded div exactly `<main>`'s height — so a page taller than the viewport
  overflows it, the bottom padding strands, and a `fill` table inside becomes a SECOND scrollbar
  inside the page's own. That shape is right for /transactions (one table owning the viewport) and
  wrong here.

  **Every table is ten rows tall whatever it holds** — `TABLE_FRAME` (`min-h-[32rem]`) around a
  `fill` `DataTable`, paging at `TABLE_PAGE_SIZE` (10). The three parts are one decision: `fill`
  gives the table's root `flex-1` so it resolves to the frame's height and keeps its
  header/body/pager shape, the frame supplies that height, and the ten-row page is what stops the
  body ever overflowing it. Without `fill` the frame stretches nothing — the card inside keeps its
  content height and the slack shows up as a gap underneath it. A `fill` table whose page DOES
  overflow is the second scrollbar inside `<main>` that this screen was reported for.

  Do not put a toolbar inside the frame; filters go above it.

  **`GET /ib/overview` is read ONCE**, in `partner-workspace.tsx`, and passed down. Seven panels
  need it; under one query key React Query serves them all from one fetch, so the cost of seven
  `useResource` calls is not requests — it is seven spinners on load and seven retry cards for one
  failure. Overview, Clients and Network therefore take `data` as a prop. The commission list and
  the open positions still own their reads, and `TabPanel` unmounts an inactive tab, so neither
  fires on a visit that only wanted the headline.

  The header sits OUTSIDE that boundary deliberately — "am I still a partner, and what is my link"
  is answered by `/ib/status`, which the page already holds.

  **The client list and the sub-partner tree are TABS, not capped scroll boxes.** They were
  `max-h-[22rem]` panels with no sort and no search, which is a treatment that gets worse exactly as
  a partner succeeds. Both are `DataTable`s now. Client-side filtering is correct there and the
  reason is on the wire: `IbOverviewDto.referredClients` is documented as the whole list and takes
  no query parameters. **If that field ever grows paging, the filter must move server-side** — the
  same rule `/transactions` carries.

  **The commission summary totals are BOUNDED, and the copy says so.** `GET /ib/commissions` caps
  its list server-side (200, newest first) and takes no parameters, so `lib/partner-earnings.ts`
  sums _the rows it was given_ — never "everything you have ever earned". The scope line under the
  tiles is what keeps that a true statement, and it is why the lifetime figure (summed over the
  whole ledger, in the database) is labelled differently and lives in the band above. Two money
  figures that differ with nothing saying which is which is the `/accounts/[id]` failure again.
  Currencies never merge there either — one summary per currency, because there is no FX source.

  **Still deliberately NOT rendered: a commission chart.** Not only because a projection would be
  invented — a chart over that capped list would under-draw exactly the partners with the most
  history, and silently.

  ### Commission is MULTI-CURRENCY, and the screen shows every balance

  A partner does not choose what they earn in — an accrual takes the currency of the trade that
  produced it. The server handles that already: `openCommissionWallet` opens the DEFAULT currency
  at approval, `WalletService.post` opens any other lazily on the first confirmed commission in it,
  and `GET /ib/overview.commissionWallets` returns every one. `POST /ib/wallet/transfer` is
  same-currency only, into the main wallet of that currency (created if missing).

  The SCREEN was what did not handle it. It drew one credit-card object and put the rest behind a
  carousel, so a partner with two balances saw one and a swipe hint — and a carousel also makes the
  money control ambiguous, because after a swipe lands mid-animation "Move to wallet" acts on a card
  the reader cannot be certain of. `commission-balances.tsx` renders one cell per currency, each
  with its own amount and its own named button, and the column count follows the number of balances
  so a single wallet does not sit in a third of an empty panel. The em-dash-not-zero rule is
  unchanged: no wallet at all is a panel that says so, never `$0.00`.

  **The one real gap is server-side and is now stated on screen.** `IbOverviewService` sums earnings
  in ONE currency (`EARNINGS_CURRENCY`, today USD) because there is no FX source — so a partner
  accruing in a second currency holds real money those totals do not cover. `PartnerSummary`
  compares the commission wallets against `earnings.currency` and, when they differ, names the
  currencies and points at the balances below. Without it the screen puts a zero lifetime total
  directly above a funded balance and explains neither. The server-side fix is a per-currency
  breakdown, **not** a converted total.

  **The `engineLive` notice was REMOVED on request.** A paragraph used to sit under the figures
  whenever no accrual had ever been confirmed platform-wide. It is gone on an explicit instruction,
  and the cost is recorded in `partner-summary.tsx` rather than lost: a structural zero and an
  earned-nothing zero now look identical. The flag is still read — it decides whether the lifetime
  figure claims to be credited as it is earned — so restoring the sentence is one JSX line. Do not
  re-add it as a "fix".

  `GET /ib/wallet/transfers` had a client method and no caller; it is now the "Moved to your wallet"
  panel on the commission tab. It answers the question the card raises and cannot: lifetime earnings
  do not move when a partner transfers money out, so the difference between the two figures is that
  list. Its `commissionBalance`/`mainBalance` stay unrendered for the reason the DTO gives.

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

Nothing writes to the `positions` table. The bridge landing did **not** change this and it is worth
being precise about why: the bridge ingests CLOSED DEALS (push plus a 5-minute sweep, into
`mt5_deals`) and serves account snapshots. It has no open-position endpoint, so there is still no
ingestion path and `GET /trading/positions` still returns zero rows for everyone.

The panel says trades are not **synced** — never "you have no trades" — because a client who opened
a position this morning would still see zero, and the second sentence would be false. The terminal
is named as the source of truth and linked, so the panel reads as a boundary rather than a broken
feature.

Closing this gap is a change to `../bridge` first (a Manager API `PositionRequest` endpoint), then a
backend passthrough — never a frontend one. Anything that makes per-position numbers appear without
those two is inventing them.

`largestBalance` on the dashboard is **not** a cross-currency sum: $500 + 200 USDT is not "700" of
anything, and there is no FX source in this system. It reports the largest single holding with its
own currency label.

### A partner's commission lives in its OWN wallet, and `/wallet` cannot see it

`wallets.kind` is `main` or `commission` (backend migration 0077). Commission credits land in the
`commission` wallet; `GET /wallet` returns **`main` only**, and that exclusion is SERVER-SIDE
rather than a filter this app applies.

That matters because `/wallet`, `/deposit` and `/withdraw` all read that one endpoint. A filter in
one of them would leave the other two to remember the rule; making it the shape of the response
means a new money screen inherits it without knowing it exists. `/dashboard` is covered by the
same call, so `largestBalance` cannot accidentally report a commission balance.

The commission wallet appears in exactly one place: `GET /ib/overview` → `commissionWallets`,
rendered by `components/partner/commission-wallet.tsx` on the partner screen. It is on the OVERVIEW
response rather than an endpoint of its own for the reason that response exists at all — the
balance is read beside the lifetime-earnings total, and two requests can straddle the hourly
confirm loop, leaving a balance the figure above it does not explain.

**Approving a partner OPENS their commission wallet** — `WalletProvisioningService.openCommissionWallet`,
called after the approval transaction, fire-and-forget, in the DEFAULT currency only. That is a
SCREEN concern, not a money one: `WalletService.post` still opens it lazily on the first confirmed
accrual, and that lazy path is what covers partners approved before this existed and commission
arriving in a currency this never opened. What eager creation buys is that a partner approved today
opens `/partner` and finds a commission card rather than a placeholder for one. It opens EMPTY — a
balance nobody earned is the one outcome this whole separation exists to prevent, and
`ib-applications.spec.ts` asserts the zero rather than only the row.

**The only exit is `POST /ib/wallet/transfer`** — same currency, into the main wallet, where
withdraw and trading-account transfer already work unchanged. There is no pending state to poll:
both legs commit in one database transaction, so a 200 IS the money having moved. Cross-currency is
not offered because there is no FX source (the same constraint behind `largestBalance` above).

**Both legs are written to the ledger as `transfer`, never `commission`** — that is what keeps
lifetime earnings unchanged when a partner moves money they have already earned. Typing the debit
as `commission` balances perfectly and is wrong only in the figure the partner opens the screen to
read: their earnings would fall by the amount they moved, which reads as a clawback.
`test/ib-commission-wallet.spec.ts` pins it, because nothing else would catch it.

Historical commission credited BEFORE this change is still in the main wallet and is NOT migrated —
it is settled money the partner may have spent. So `earningsFor` deliberately spans BOTH kinds;
narrowing it to the commission wallet would drop every existing partner's lifetime total to zero.

The movement shows in `/transactions` as `kind: 'commission_transfer'`, always `direction:
'deposit'` (stated from the main wallet's side — the commission wallet's matching debit is not a
second row, because a client cannot see that wallet). `kind` is an OPEN set: branch through
`lib/movement-label.ts`, which three screens share, and which falls back to the direction for a
kind this build has not heard of.

### The partner screen shows NO RATE CARD, and that is deliberate (0112)

`GET /ib/overview` carries **no terms at all**. It carried `programme` — a name, a `mode`, a
per-depth tier ladder and a rebate — until 0112, and a `level` with its own `rateValue` before that
(0102). Both are gone, and the same reasoning removed them.

A partner's rate card is a commercial arrangement between them and the broker, and the broker
publishes it. A portal screen restating it is a SECOND COPY that disagrees the day the desk
renegotiates — with the partner reading the stale one and nothing on the page saying so. The
backend does not send it, so there is nothing here to render out of date.

What the response carries is what only this system knows: what they have EARNED, their commission
wallets, who they introduced, and who sits directly beneath them. `PartnerHeader` takes no
`programmeName` prop, `partner-overview.tsx` has no rates cell and no reach cell, and
`partner-network.tsx` has no terms column.

**The one thing about a partner's arrangement this screen still states is their AGENCY** (وكالة) —
because it is not a rate. It decides what their clients may TRADE, nothing else names it, and the
`partner.programme*` strings that describe it were kept under those keys while their WORDING was
corrected to say "agency".

### The client's rebate arrives as an ordinary wallet credit

A rebate credits the TRADING CLIENT's main wallet as `entry_type: 'rebate'` — most people
receiving one are not partners at all. `notification-kinds.ts` links `rebate.credited` to /wallet
rather than /partner for that reason: sending a non-partner to the partner screen is a dead end on
the one notification that says they have been paid.

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

## Query keys come from the registry — `src/lib/query-keys.ts`

Every `queryKey` and every `invalidateQueries` resolves through it; lint refuses an array
literal in either position, and `queryKeysFor` returns the registry's own union type, so an
invented key is a compile error. The twin registry in `oxshare-crm-admin` carries the full
argument; the portal's own three bugs were:

1. `queryKeysFor` mapped `wallet.credited`, `rebate.credited` and `commission.confirmed` —
   the three kinds that ARE wallet credits — to `[]`. The client got the chime, the toast and
   the bell badge, and a balance underneath that had not moved. **Reported.**
2. Trading accounts were `['trading-accounts']` while the transfer and deposit pickers read
   `['transferable-accounts']`, which nothing ever invalidated: open an account, go to
   Transfer, and it is not in the list.
3. `['kyc-status']` and `['kyc-config']` were separate roots, so no single invalidate could
   cover the onboarding state.

⚠️ **`mt5Live` is a root of its own, and must stay one.** `/accounts/:id/live` and its
positions sibling are throttled 12/min per CLIENT and each takes the single MT5 session lock.
Nested under `trading-accounts` they are prefix-matched by every bulk `tradingAccounts.all()`,
so one "account opened" notification fires a burst of the most expensive read this system
makes. `notification-kinds.test.ts` pins that nothing bulk-invalidates them — it caught this
before it shipped.

## A screen that MOVES money refreshes it itself — `hooks/use-money-refresh.ts`

Four screens changed the balance and refreshed nothing, because none held a `QueryClient`:
`/deposit/[outcome]` (its `settle()` CREDITS the wallet), `/withdraw` (the server debits on
REQUEST, not on a hold), `/transfer`, and `/deposit`.

**The socket is not a substitute, and the settle path is why.** The client has just returned
from the provider's redirect, so the realtime connection is still handshaking while `settle()`
runs — and Socket.IO has no replay for what it missed. Treat the socket as the thing that
keeps OTHER tabs honest.

**REFETCHED, never patched.** No `setQueryData` computing `balance - amount`: §6.1 bans
client-side money arithmetic, and an optimistic balance is exactly the plausible invented
number the wallet card's em-dash-not-zero rule exists to prevent.

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
- **`public/email/` is a contract with mail already delivered** (26 Sep 2026). The backend's
  email masthead loads `${PORTAL_URL}/email/oxshare-logo-v1.png`, and a message keeps loading it
  for as long as it sits in an inbox. Never edit, rename or delete a file there: a new logo is a
  new version (`oxshare-logo-v2.png`) beside the old one. That is what makes the year-long
  `immutable` cache in `next.config.ts` safe. `src/test/email-assets.test.ts` pins the file (an
  opaque PNG, 400×177, under 40 KB) and both headers. Deploy this app BEFORE a backend that points
  at a new version. `public/brand/oxshare-email-logo.png` is the SAME file at its first address:
  the backend deployed as release be0341e points mail there until the next backend deploy, so it
  stays for good, byte-identical, and the test pins that too.
- **Tests are back, on request, and the suite is deliberately small.** All 291 were deleted on an
  explicit instruction, along with `e2e/`, `src/test/`, `vitest.config.mts` and every test
  dependency. `npm test` was then re-added — also on request — when the money screens landed,
  because a change to `/wallet`, `/deposit`, `/withdraw` or the KYC gate had no automated
  protection at all beyond `type-check`, `lint` and `build`.

  What exists now is a small set, chosen because each covers a rule that is expensive to get wrong
  and cheap to break by accident. The load-bearing ones (the count has grown past this list; these
  are the ones whose rules are documented above):

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
  - `src/lib/partner-earnings.test.ts` — that the commission summary sums through decimal.js,
    never merges two currencies into one total, and never nets a reversal off the released figure.
    Each wrong version renders perfectly: a float total is right to the cent and wrong in the
    eighth decimal, and a merged total is a plausible number describing nothing.
  - `src/lib/account-stats.test.ts` — that a P/L sign comes from decimal.js rather than from the
    formatted string or a float: `'-0.00000001'` is a real loss. (Its win-rate half went with the
    Activity card; the rule it pinned is recorded in `account-stats.ts`.)
  - `src/hooks/use-live-account.test.ts` — the socket boundary on the account screen. That a
    payload whose money arrived as NUMBERS is rejected rather than formatted, that a dropped
    `positions` array stays distinguishable from an empty one, and that `floating` is computed
    through decimal.js so a pushed figure and a polled one are the same string.

  All were mutation-checked when written: the guarantee was deliberately broken and each test
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
