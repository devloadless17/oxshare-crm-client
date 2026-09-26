// Topology FIRST: it sets the E2E_* / NEXT_PUBLIC_* defaults the constants
// below read at import time. See topology.ts.
import './topology';
import {
  expect,
  request as apiRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Response,
  type Route,
} from '@playwright/test';

/**
 * ── Where things are ────────────────────────────────────────────────────────
 *
 * The browser calls the API DIRECTLY at `NEXT_PUBLIC_API_BASE_URL` (+ `/v1`);
 * the same-origin `/api/*` rewrite is history for browser traffic. Every spec
 * that intercepts or awaits API traffic must match on the versioned PATH and
 * never on a host or an `/api/` prefix — `signIn` here waited on
 * `'/api/auth/login'`, which no request has carried since the switch, and a
 * `page.route('**​/api/auth/me')` delay never fired.
 *
 * Two origins are kept apart on purpose:
 *  - `API_ORIGIN` is what the BROWSER dials. In cross-host mode this is
 *    `http://api.crm.localhost:3001`, a name only Chromium resolves.
 *  - `API_NODE_BASE` is what NODE dials (`request` contexts, setup probes).
 *    Node does not resolve `*.localhost`, so it keeps `localhost`.
 */
export const APP_ORIGIN = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const ADMIN_ORIGIN = (process.env.E2E_ADMIN_ORIGIN ?? 'http://localhost:3002').replace(
  /\/+$/,
  '',
);
export const API_ORIGIN = (
  process.env.E2E_API_ORIGIN ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:3001'
).replace(/\/+$/, '');
/** What the browser dials. */
export const API_BASE = `${API_ORIGIN}/v1`;
/** What Node dials. */
export const API_NODE_BASE = `${(process.env.E2E_API_NODE_ORIGIN ?? 'http://localhost:3001').replace(/\/+$/, '')}/v1`;

/** The login limiter's window, plus a few seconds of slack. */
const RATE_LIMIT_WINDOW_MS = 65_000;

/**
 * A `page.route` / `waitForResponse` matcher for one API path — a PREDICATE on
 * the pathname, blind to host and query string. `path` is the un-versioned
 * route (`/auth/me`); a RegExp is matched against the pathname as-is.
 */
export function apiRoute(path: string | RegExp): (url: URL) => boolean {
  return (url) =>
    typeof path === 'string' ? url.pathname === `/v1${path}` : path.test(url.pathname);
}

/** Is this response the API answering `path` (optionally with `method`)? */
export function isApi(res: Response, path: string | RegExp, method?: string): boolean {
  if (!apiRoute(path)(new URL(res.url()))) return false;
  return method === undefined || res.request().method() === method.toUpperCase();
}

/**
 * `page.route` that COUNTS. Every test that injects a failure must assert
 * `hits() > 0` afterwards — a handler that never fires leaves the app talking
 * to the real API, and the assertion that follows passes against a healthy
 * response.
 */
export async function routeHit(
  page: Page,
  path: string | RegExp,
  handler: (route: Route) => Promise<void> | void,
): Promise<{ hits: () => number }> {
  let count = 0;
  await page.route(apiRoute(path), async (route) => {
    count += 1;
    await handler(route);
  });
  return { hits: () => count };
}

/**
 * The portal's anti-forgery token, read through Playwright's jar — which sees
 * every host's cookies — and NOT through `document.cookie`, which is blind to
 * the API host's cookies wherever the two differ.
 */
export async function csrfOf(context: BrowserContext): Promise<string> {
  const csrf = (await context.cookies()).find((c) => c.name.includes('portal_csrf'))?.value;
  expect(csrf, 'no CSRF cookie in the saved session — is it signed in?').toBeTruthy();
  return csrf!;
}

/** Remove every cookie whose name matches, keeping the rest of the jar. */
export async function deleteCookie(context: BrowserContext, name: RegExp): Promise<void> {
  /*
   * Playwright's own per-name filter, NOT read-all / clear-all / re-add.
   *
   * The round-trip version dropped the whole jar and rebuilt it from what
   * `cookies()` returned, so every surviving cookie — including the refresh
   * token and each app's session-hint — had to survive a serialise-and-restore
   * it does not otherwise go through. `clearCookies({ name })` removes exactly
   * the match and leaves the rest untouched in the browser.
   *
   * ⚠️ This is a tidier primitive, NOT a fix for anything. It was changed while
   * chasing the ~50% failure rate of `session-matrix.spec.ts`'s reuse-detection
   * case, on the theory that the rebuild was losing the session-hint. MEASURED
   * AFTERWARDS: 2 of 4 repeats still failed, exactly as before. The theory was
   * wrong and the flake is elsewhere — do not read this comment as evidence
   * that the cookie handling was the cause.
   */
  await context.clearCookies({ name });
}

/**
 * Call the API FROM INSIDE THE PAGE, with the page's own cookies.
 *
 * `fetch` from the document carries the session cookies the browser holds for
 * the API host (same-site, `credentials: 'include'`); the CSRF header is
 * supplied from Playwright's jar because the page cannot read it cross-host.
 */
export async function apiFromPage(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const csrf = method === 'GET' ? '' : await csrfOf(page.context());
  return page.evaluate(
    async ({ base, method, path, body, csrf }) => {
      const res = await fetch(`${base}${path}`, {
        method,
        credentials: 'include',
        headers: {
          ...(csrf ? { 'x-oxshare-csrf': csrf } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      return { status: res.status, body: parsed };
    },
    { base: API_BASE, method, path, body, csrf },
  );
}

/**
 * The ADMIN the suites own, for specs where an administrator must ACT on the
 * client under test (credit a wallet, approve a KYC). The same identity the
 * admin suite signs in as — NEVER `admin@oxshare.com`, the developer's own.
 */
export const E2E_ADMIN = {
  email: 'e2e-admin@oxshare.com',
  password: 'admin123',
} as const;

/**
 * A standalone admin API session, signed in over the wire as `E2E_ADMIN`.
 * Waits out the 5-per-minute login cap instead of failing on it.
 */
export async function adminApiSession(
  credentials: { email: string; password: string } = E2E_ADMIN,
): Promise<{
  request: APIRequestContext;
  csrf: string;
  get: (path: string) => ReturnType<APIRequestContext['get']>;
  post: (
    path: string,
    data?: unknown,
    extra?: Record<string, string>,
  ) => ReturnType<APIRequestContext['post']>;
  patch: (
    path: string,
    data?: unknown,
    extra?: Record<string, string>,
  ) => ReturnType<APIRequestContext['patch']>;
  put: (path: string, data?: unknown) => ReturnType<APIRequestContext['put']>;
  del: (path: string) => ReturnType<APIRequestContext['delete']>;
  dispose: () => Promise<void>;
}> {
  const request = await apiRequest.newContext();
  for (;;) {
    const login = await request.post(`${API_NODE_BASE}/admin/auth/login`, {
      headers: { Origin: ADMIN_ORIGIN },
      data: credentials,
    });
    if (login.status() === 429) {
      // eslint-disable-next-line no-console
      console.log(`↻ admin API login rate limited; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WINDOW_MS));
      continue;
    }
    if (!login.ok()) {
      throw new Error(`admin API sign-in as ${credentials.email} answered ${login.status()}`);
    }
    break;
  }
  const csrf =
    (await request.storageState()).cookies.find((c) => c.name.includes('admin_csrf'))?.value ?? '';
  if (!csrf) throw new Error('the admin API session carried no CSRF cookie');
  const headers = { Origin: ADMIN_ORIGIN, 'X-OxShare-CSRF': csrf };
  return {
    request,
    csrf,
    get: (path) => request.get(`${API_NODE_BASE}${path}`, { headers }),
    post: (path, data, extra) =>
      request.post(`${API_NODE_BASE}${path}`, { headers: { ...headers, ...extra }, data }),
    patch: (path, data, extra) =>
      request.patch(`${API_NODE_BASE}${path}`, { headers: { ...headers, ...extra }, data }),
    put: (path, data) => request.put(`${API_NODE_BASE}${path}`, { headers, data }),
    del: (path) => request.delete(`${API_NODE_BASE}${path}`, { headers }),
    dispose: () => request.dispose(),
  };
}

/**
 * The client the E2E SUITE owns — seeded verified and KYC-approved.
 *
 * Deliberately NOT `client@oxshare.com`. The suite used that one, which is the
 * account a developer is usually signed in as while working, and it caused two
 * real problems within a single run: repeated test logins exhausted the
 * 5-per-minute login limit and answered a developer's own sign-in with 429, and
 * two parties rotating refresh tokens for one identity is precisely what reuse
 * detection exists to punish.
 *
 * A test fixture must not share an identity with a person.
 */
export const E2E_CLIENT = {
  email: 'e2e@oxshare.com',
  password: 'client123',
} as const;

/**
 * A VERIFIED client with no KYC submission — the one the wizard spec drives.
 *
 * Separate from `E2E_CLIENT`, which is already approved and so has no wizard
 * left to walk. This one deliberately never submits, staying `in_progress`,
 * which is what makes the spec repeatable.
 */
export const E2E_KYC_CLIENT = {
  email: 'e2e-kyc@oxshare.com',
  password: 'client123',
} as const;

/**
 * The client whose only job is to be SIGNED OUT.
 *
 * `logout` revokes every family for a user, not just the session presenting a
 * token (R-3.3 — signing out on one device must not leave the others live). So
 * a spec that drives a real sign-out on `E2E_CLIENT` destroys the session every
 * later spec replays from `STORAGE_STATE`, and the run reports one logout
 * failure followed by a dozen unrelated-looking auth failures.
 *
 * That is why the logout spec sat `fixme`d. It has its own identity now, and
 * nothing else may sign in as this one.
 */
export const E2E_LOGOUT_CLIENT = {
  email: 'e2e-logout@oxshare.com',
  password: 'client123',
} as const;

/** Where each signed-in session is cached between specs. See `auth.setup.ts`. */
export const STORAGE_STATE = 'e2e/.auth/client.json';
export const KYC_STORAGE_STATE = 'e2e/.auth/kyc-client.json';

/**
 * A real 1x1 PNG, as bytes.
 *
 * Real rather than `Buffer.from('x')` because the upload path checks the file's
 * leading bytes against its declared type (`file-signature.ts`) and refuses
 * anything that is not genuinely the format it claims. A fake would be rejected
 * by the server, and the spec would be testing the rejection path by accident.
 */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Sign in through the real form.
 *
 * Used ONCE per run by `auth.setup.ts`, not per test — the session is then
 * reused from `STORAGE_STATE`. Driving the form is the only way these specs
 * exercise login at all, but doing it per spec is what burned the rate limit.
 *
 * Not by planting a cookie: the session is httpOnly and the login response
 * carries no token, so there is nothing to plant.
 */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string } = E2E_CLIENT,
): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);

  /*
   * Watch the login response, not just the URL.
   *
   * `POST /auth/login` is capped at five per minute, which is correct and which
   * a suite that signs in more than once WILL hit — especially while someone is
   * iterating on a spec and re-running it. Waiting only on the URL turns that
   * into a bare "Timeout 30000ms exceeded", which reads as "login is broken" and
   * sends whoever sees it looking in the wrong place. It cost real time once
   * already.
   *
   * So the status is captured and reported. A 429 is a fact about the harness,
   * not about the product, and the message says so.
   */
  const [response] = await Promise.all([
    page.waitForResponse((res) => isApi(res, '/auth/login', 'POST'), { timeout: 30_000 }),
    page.getByRole('button', { name: /^log in$/i }).click(),
  ]);

  if (response.status() === 429) {
    /*
     * WAIT FOR THE CAP, do not fail on it and do not weaken it — the admin
     * suite's lesson. The cap is five per minute per IP and correct; a run that
     * only goes green when nobody re-ran inside the same minute is one people
     * stop believing. The per-test budget grows for the wait, or the wait
     * itself becomes the failure.
     */
    test.setTimeout(RATE_LIMIT_WINDOW_MS + 60_000);
    // eslint-disable-next-line no-console
    console.log(`↻ login rate limit reached; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s to retry…`);
    await page.waitForTimeout(RATE_LIMIT_WINDOW_MS);
    return signIn(page, credentials);
  }
  if (!response.ok()) {
    throw new Error(
      `Could not sign in as ${credentials.email}: POST /auth/login answered ${response.status()}.`,
    );
  }

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * The personal details a sign-up gives (25 Sep 2026) — and so what the KYC
 * personal step must open with. Exported so a spec can assert the pre-fill
 * against the same values it typed.
 */
export const SIGN_UP_DETAILS = {
  dateOfBirth: '1991-03-09',
  nationality: 'Lebanese',
  country: 'Lebanon',
  /** As typed, grouped; stored as `+96170123456`. */
  nationalNumber: '70 123 456',
  city: 'Beirut',
} as const;

/**
 * What `POST /auth/register` requires besides the account and the names since
 * 26 Sep 2026 — date of birth, nationality, phone and country, refused with a
 * 400 without them. The same values the form types (`SIGN_UP_DETAILS`), with
 * the phone as the API takes it. A spec that registers over the API spreads this.
 */
export const API_SIGN_UP_DETAILS = {
  dateOfBirth: SIGN_UP_DETAILS.dateOfBirth,
  nationality: SIGN_UP_DETAILS.nationality,
  country: SIGN_UP_DETAILS.country,
  phone: '+96170123456',
} as const;

/**
 * Fill BOTH steps of the sign-up form: the account, Continue, then the
 * personal details the identity verification opens with. The final "Create
 * account" is left to the caller, which is where each spec waits on the
 * response it cares about.
 */
export async function fillRegisterForm(
  page: Page,
  client: { email: string; password: string; firstName?: string; lastName?: string },
): Promise<void> {
  await page.getByPlaceholder('John').fill(client.firstName ?? 'Kaya');
  await page.getByPlaceholder('Doe').fill(client.lastName ?? 'Newman');
  await page.getByPlaceholder('you@example.com').fill(client.email);
  await page.locator('input[type="password"]').first().fill(client.password);
  await page.getByRole('button', { name: /^continue$/i }).click();

  await page.getByLabel(/date of birth/i).fill(SIGN_UP_DETAILS.dateOfBirth);
  await pickOption(page, /nationality/i, SIGN_UP_DETAILS.nationality);
  // Choosing the country starts the phone in its dial code, so the number is
  // typed after it — the order a person fills the form in.
  await pickOption(page, /country of residence/i, SIGN_UP_DETAILS.country);
  await page.getByLabel('Phone number').fill(SIGN_UP_DETAILS.nationalNumber);
  await page.getByLabel(/^city/i).fill(SIGN_UP_DETAILS.city);
}

/** One of the styled drop-downs: open it, pick the exact entry. */
async function pickOption(page: Page, label: RegExp, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/**
 * Register a brand-new client through the real form.
 *
 * Shares `signIn`'s reason for existing: registration is capped at TEN PER HOUR
 * per IP — a far tighter budget than login's five per minute, and one a suite
 * that registers on every run WILL exhaust after a few iterations. Waiting only
 * on the URL turns that into a bare 30-second timeout that reads as "the
 * registration flow is broken", and the honest answer is "you have registered
 * ten people this hour".
 *
 * The cap is right and should not be relaxed for tests. What the tests owe is to
 * say which one they hit.
 */
export async function register(
  page: Page,
  client: { email: string; password: string },
): Promise<void> {
  await page.goto('/auth/register');
  await fillRegisterForm(page, client);

  const [response] = await Promise.all([
    page.waitForResponse((res) => isApi(res, '/auth/register', 'POST'), { timeout: 30_000 }),
    page.getByRole('button', { name: /complete registration|create account/i }).click(),
  ]);

  if (response.status() === 429) {
    throw new Error(
      'Rate limited registering: POST /auth/register answered 429. The cap is ten per hour ' +
        'per IP and it is not the thing under test — wait, or run this spec less often.',
    );
  }
  if (!response.ok()) {
    throw new Error(`Registration answered ${response.status()} for ${client.email}.`);
  }
}

/**
 * Put the KYC fixture back to an empty submission.
 *
 * WHY THIS IS NEEDED. `e2e-kyc@oxshare.com` is seeded with no submission, which
 * makes the FIRST run of the wizard spec repeatable and every run after it a
 * different world: the specs upload a document, the row keeps it, and the next
 * run finds an uploader already showing its "uploaded" state — so the
 * preview-before-upload flow it exists to assert never renders. The status
 * stayed `not_started` while `document` quietly became non-null, which is why
 * the failure looked like a product regression rather than accumulated state.
 *
 * Seeding cannot fix it: seeds run at boot, and the dev server people actually
 * run these against stays up for days. The fixture has to reset itself.
 *
 * Driven through `POST /kyc/reset`, the real endpoint, from inside the page so
 * it carries the real session cookies — and the CSRF header, because the API
 * refuses a state-changing request without it. That header is the one thing the
 * app is allowed to read from JS (it is proof of same-origin, not a
 * credential), which is exactly why this can be done from here at all.
 *
 * Safe by construction: `resetKyc` refuses when a submission is approved or
 * under review, so this can never destroy the approved fixture even if pointed
 * at the wrong session.
 */
export async function resetKycFixture(page: Page): Promise<void> {
  const { status } = await apiFromPage(page, 'POST', '/kyc/reset');
  // 200 is a reset; 400 means there was nothing to reset, which is the same
  // world as far as the wizard is concerned. Anything else is worth failing on
  // rather than discovering three assertions later.
  if (status !== 200 && status !== 201 && status !== 400) {
    throw new Error(`POST /kyc/reset answered ${status}; the wizard fixture is not clean.`);
  }
}

/**
 * Write a context's jar over a storage-state file — ONLY if it still holds a
 * refresh cookie. A jar without one is a signed-out browser, and saving it
 * signs out every test that follows. See the admin twin for the incident.
 */
export async function persistStateIfLive(context: BrowserContext, path: string): Promise<void> {
  const cookies = await context.cookies();
  const live = cookies.some((c) => /_rt$/.test(c.name) && c.value.length > 0);
  if (!live) {
    throw new Error(
      `Refusing to persist ${path}: the context holds no refresh cookie, so it is signed out. ` +
        'Saving it would sign out every later test.',
    );
  }
  await context.storageState({ path });
}

/** Persist the default storage state — after any test that forced a renewal. */
export async function persistSharedState(context: BrowserContext): Promise<void> {
  await persistStateIfLive(context, STORAGE_STATE);
}

/**
 * Every API response the page received that the server refused.
 *
 * The reason to reach for a browser at all: a unit test cannot see that a layout
 * fires a request on every navigation. Collecting responses lets a spec assert
 * about the traffic the UI produced without knowing which component produced
 * it — exactly the shape of the 403 flood that a passing unit suite missed.
 *
 * Only API calls count. A 404 for a favicon or a dev-server asset is noise from
 * the environment, not something the app decided to do.
 */
export function collectRejections(page: Page): { list: () => string[] } {
  const rejected: string[] = [];

  page.on('response', (response: Response) => {
    const url = response.url();
    // The direct API origin, whichever host — matched on the versioned path.
    if (!new URL(url).pathname.startsWith('/v1/')) return;
    const status = response.status();
    if (status === 401 || status === 403) {
      rejected.push(`${status} ${new URL(url).pathname}`);
    }
  });

  return { list: () => [...rejected] };
}

/**
 * A fresh, definitely-unverified account.
 *
 * Unique per run so a re-run never collides: registration answers identically
 * whether or not the address exists (deliberately — it is a membership oracle
 * otherwise), so a collision would fail confusingly rather than loudly.
 */
export function newClient(): { email: string; password: string } {
  return {
    // A domain of its own. These used to share `@oxshare-e2e.test` with the
    // ADMIN suite's seeded cohort, whose list assertions filter on that domain
    // — every registration here pushed the seeded rows one place further down
    // the admin's newest-first list until they left page one.
    email: `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@oxshare-e2e-signup.test`,
    password: 'e2e-password-123',
  };
}

/**
 * Open the Identity Document step with its uploader SHOWING.
 *
 * Since the document-choice cards landed (15 Aug), nothing renders an upload
 * slot until the client has said WHICH document they are presenting — an
 * upload box for an unstated document is what let a passport land in a slot
 * labelled "Back Side". The specs that predate that change went straight to
 * `/kyc/step/2` and waited a minute for a file input that never appears. This
 * picks the first document type when the cards are showing and leaves a page
 * that already has a choice alone.
 */
export async function openDocumentStep(page: Page): Promise<void> {
  await openTypedDocumentStep(page, 'document', /passport/i);
}

/**
 * Where a step sits in THIS deployment's flow.
 *
 * The wizard numbers steps by POSITION (`withReviewStep`), and the builder may
 * reorder, add or disable any of them — so a fixed `/kyc/step/2` held only for
 * the seeded order, and on a reordered flow opened a different step and failed
 * for the fixture's reasons rather than the product's. `review` is always last.
 */
export async function kycStepPath(page: Page, slug: string): Promise<string> {
  const config = await apiFromPage(page, 'GET', '/kyc/config');
  const steps = config.body as { slug: string }[];
  const index = slug === 'review' ? steps.length : steps.findIndex((step) => step.slug === slug);
  expect(index, `no "${slug}" step in the served configuration`).toBeGreaterThanOrEqual(0);
  return `/kyc/step/${index + 1}`;
}

/**
 * Upload a file as the signed-in client, from inside the page — the real route,
 * session and anti-forgery token, without driving a tile. `docType` names the
 * document a canonical page belongs to, as the wizard sends it.
 *
 * A 429 is WAITED OUT, never weakened: uploads are capped per minute and the
 * suite shares that budget, and raising a real limit so a test fits inside it
 * would remove the protection from production to make CI green.
 */
export async function uploadKycFile(page: Page, field: string, docType?: string): Promise<number> {
  const send = async () => {
    const csrf = await csrfOf(page.context());
    return page.evaluate(
      async ({ base, field, docType, csrf, bytes }) => {
        const form = new FormData();
        form.append(
          'file',
          new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          `${field}.png`,
        );
        form.append('field', field);
        if (docType) form.append('docType', docType);
        const res = await fetch(`${base}/kyc/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-oxshare-csrf': csrf },
          body: form,
        });
        return res.status;
      },
      { base: API_BASE, field, docType, csrf, bytes: Array.from(TINY_PNG) },
    );
  };
  const status = await send();
  if (status !== 429) return status;
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  return send();
}

/**
 * Reach a document step with its upload tiles actually rendered.
 *
 * A document step shows a CHOICE of type first — Passport / ID card, or
 * Utility bill / Bank statement / Tenancy agreement — and the tiles only exist
 * once one is picked. A bare `goto` therefore lands on a step with no
 * `input[type=file]` anywhere, which is indistinguishable from a broken step.
 *
 * That is what took the address case down in CI and not locally: a developer's
 * fixture has usually already chosen a type and kept it, while a freshly
 * seeded database has not, so `requirePrecondition` failed under E2E_STRICT
 * saying "no document tiles rendered" — accurate, and about the fixture rather
 * than the product.
 */
export async function openTypedDocumentStep(
  page: Page,
  slug: 'document' | 'address',
  typeCard: RegExp,
): Promise<void> {
  await page.goto(await kycStepPath(page, slug));
  await page.waitForLoadState('networkidle');
  const uploader = page.locator('input[type="file"]').first();
  if (await uploader.count()) return;
  const firstCard = page.getByRole('button', { name: typeCard }).first();
  if (await firstCard.isVisible().catch(() => false)) {
    await firstCard.click();
    await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 15_000 });
  }
}

/**
 * ── The mailbox ─────────────────────────────────────────────────────────────
 *
 * Every email the API sends in development lands in Mailpit
 * (`docker compose up -d` in oxshare-crm-backend; UI at :8025), pointed at by
 * Settings → Email. Emailed TOKENS are the only way through several journeys —
 * verification, password reset, invites — because they are stored hashed and
 * echoed nowhere (a bearer credential in a log is a leak), so the suite reads
 * the mailbox exactly as the person would.
 */
export const MAILPIT_API = (process.env.E2E_MAILPIT_API ?? 'http://localhost:8025/api/v1').replace(
  /\/+$/,
  '',
);

/**
 * The subject of the email that confirms an address — the sign-up CODE mail
 * ("482913 is your OxShare verification code") and the link-only mail an
 * operator's address change sends ("Verify Your Email — OxShare Portal") alike.
 *
 * `/verify/i` matched only the second: "verification" does not contain
 * "verify". When the code shipped (25 Sep 2026) every journey that confirms a
 * new account timed out waiting on an inbox that had its mail all along.
 */
export const VERIFICATION_SUBJECT = /verif/i;

/** The newest message to `to`, waited for; throws with a fix when Mailpit is absent. */
export async function waitForMail(
  to: string,
  opts: { subject?: RegExp; timeoutMs?: number } = {},
): Promise<{ id: string; subject: string; text: string; html: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let lastErr = '';
  for (;;) {
    try {
      const res = await fetch(
        `${MAILPIT_API}/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=20`,
        { signal: AbortSignal.timeout(4_000) },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          messages?: { ID: string; Subject: string }[];
        };
        const hit = (body.messages ?? []).find(
          (m) => !opts.subject || opts.subject.test(m.Subject),
        );
        if (hit) {
          const full = (await (await fetch(`${MAILPIT_API}/message/${hit.ID}`)).json()) as {
            Text?: string;
            HTML?: string;
          };
          return { id: hit.ID, subject: hit.Subject, text: full.Text ?? '', html: full.HTML ?? '' };
        }
      } else {
        lastErr = `Mailpit answered ${res.status}`;
      }
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No mail for ${to} within ${opts.timeoutMs ?? 15_000}ms` +
          (lastErr ? ` (${lastErr})` : '') +
          '.\nIs Mailpit up (docker compose up -d in oxshare-crm-backend) and Settings → Email ' +
          'pointed at localhost:1025?',
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * The newest verification-CODE email to `to`, and the six digits in it.
 *
 * Read from the SUBJECT, because that is where phones and mail apps offer a
 * code for one-tap entry — so a template change that drops it from the subject
 * fails here rather than in a client's inbox. The body is checked to carry the
 * same code. `except` skips messages already seen, for "a NEW code arrived".
 */
export async function waitForCodeMail(
  to: string,
  opts: { except?: string[]; timeoutMs?: number } = {},
): Promise<{ id: string; code: string; subject: string; text: string; html: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
  for (;;) {
    const mail = await waitForMail(to, {
      subject: /is your OxShare verification code$/,
      timeoutMs: Math.max(1_000, deadline - Date.now()),
    });
    if (!opts.except?.includes(mail.id)) {
      const code = /^(\d{6}) is your OxShare verification code$/.exec(mail.subject)?.[1];
      if (!code) throw new Error(`No six-digit code in the subject "${mail.subject}"`);
      if (!mail.html.includes(code) || !mail.text.includes(code)) {
        throw new Error(`The body of "${mail.subject}" does not carry the code its subject names`);
      }
      return { ...mail, code };
    }
    if (Date.now() > deadline) throw new Error(`No NEW verification code arrived for ${to}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * The first tokened link in a message, REWRITTEN to this suite's app origin —
 * the email carries whatever PORTAL_URL/ADMIN_URL the backend was started
 * with, and the suite must follow it on the topology it is driving.
 */
export function linkIn(mail: { text: string; html: string }, appOrigin: string): string {
  const haystack = `${mail.text}\n${mail.html.replace(/&amp;/g, '&')}`;
  const match = haystack.match(/https?:\/\/[^\s"'<>]+[?&]token=[A-Za-z0-9._~-]+[^\s"'<>]*/);
  if (!match) throw new Error(`No tokened link found in "${mail.text.slice(0, 200)}…"`);
  const url = new URL(match[0]);
  return `${appOrigin}${url.pathname}${url.search}`;
}

/**
 * A precondition that could not be met — skipped locally, FATAL in CI.
 *
 * ## Why this exists
 *
 * A skipped Playwright test reports as PASSING in the summary. This suite
 * guards against conditions that are ordinary on a shared machine —
 * registration is capped at 10/hour per address, login and forgot-password are
 * capped too, and a fixture may be absent — and skipping is the right call when
 * somebody is iterating locally, because a red suite for a rate limit teaches
 * people to ignore red.
 *
 * The cost is that a run which exercised none of the onboarding journey looks
 * identical to one that exercised all of it. On the portal that journey IS the
 * product: register, verify, sign in, KYC, upload. A green summary that proves
 * none of it happened is worse than no summary.
 *
 * So the decision belongs to the ENVIRONMENT rather than to the spec:
 *
 *   - unset (a laptop): skip, as before.
 *   - `E2E_STRICT=1` (CI, or any run whose result somebody will quote): FAIL,
 *     naming the precondition.
 *
 * ## What must NOT be routed through here
 *
 * A viewport or topology guard — `test.skip(isMobile, …)`, `test.skip(!CROSS, …)`
 * — is not an unmet precondition. It says the case does not apply to the
 * project being run, and it is CORRECT for it to be skipped in every run
 * including CI. Converting one of those would make the suite permanently red
 * for a reason that is not a defect, which is the same "ignore the red build"
 * failure by the opposite route. Those stay `test.skip`.
 */
/**
 * Sign in to the PORTAL, waiting out the rate limit instead of reporting it.
 *
 * ## Why this exists
 *
 * `POST /auth/login` is capped at 5/minute per IP. Three specs handled that by
 * calling `requirePrecondition(status === 429, 'portal login is rate limited')`,
 * which under E2E_STRICT turns contention into a FAILED journey — and a rate
 * limit is not an unmet precondition. `requirePrecondition` is for a fixture
 * that should be there and is not; a 429 is a transient fact about the harness,
 * and the established answer to it everywhere else in this suite is to WAIT.
 * `adminApiSession` has waited it out since the day it was written, and the
 * browser login path waits at line ~305. These three were the outliers.
 *
 * ## The worse half: an ambiguous assertion
 *
 * Other sites asserted `expect(login.ok()).toBe(true)` with a message naming a
 * PRODUCT defect — "the NEW password does not sign in". `ok()` is a boolean, so
 * a 429 and a genuinely rejected password produce the identical failure, and the
 * message confidently names the wrong one. That sent a reader looking at the
 * password-reset flow for a fault that was a queue of tests sharing a cap.
 *
 * This is the same shape as a timeout being indistinguishable from the defect a
 * test exists to detect: a failure message is a claim, and a claim that cannot
 * tell two causes apart will eventually name the wrong one.
 *
 * So: wait out a 429, and return the response so the caller asserts on a status
 * that means what it says.
 */
export async function portalLogin(
  ctx: APIRequestContext,
  credentials: { email: string; password: string },
  headers: Record<string, string>,
): Promise<APIResponse> {
  for (;;) {
    const login = await ctx.post(`${API_NODE_BASE}/auth/login`, { headers, data: credentials });
    if (login.status() !== 429) return login;
    // Waited out, never weakened — the same choice every other login here makes.
    // eslint-disable-next-line no-console
    console.log(`↻ portal login rate limited; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s…`);
    test.setTimeout(RATE_LIMIT_WINDOW_MS + 60_000);
    await new Promise((r) => setTimeout(r, RATE_LIMIT_WINDOW_MS));
  }
}

export function requirePrecondition(condition: boolean, reason: string): void {
  if (!condition) return;
  if (process.env['E2E_STRICT'] === '1') {
    throw new Error(
      `PRECONDITION NOT MET (E2E_STRICT): ${reason}. ` +
        'This run was asked to be evidence, so the journey is reported as failed ' +
        'rather than silently skipped. Re-run when the precondition clears, or ' +
        'unset E2E_STRICT for a tolerant local run.',
    );
  }
  test.skip(true, reason);
}
