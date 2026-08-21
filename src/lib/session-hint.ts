/**
 * "This browser probably has a session" — the cheap, early answer the proxy and
 * the first server render are allowed to have.
 *
 * ## Why this exists
 *
 * `src/proxy.ts` records at length why it cannot read the session: the refresh
 * cookie is set by the API's host with a `__Host-` prefix and no `Domain`, so
 * the browser locks it to that host and never sends it here. Its comment ends
 * with the only safe way to give this host something to read:
 *
 *   > a separate, non-sensitive marker set with `Domain=` on the shared parent
 *   > domain, never the session cookie itself, which must keep `__Host-`.
 *
 * This is that marker, with one simplification: nothing on the API side has to
 * set it, because it is written by THIS app on THIS host from JavaScript. It is
 * a mirror of the last authoritative answer `/auth/me` gave — set when that call
 * says "signed in", cleared when it says "signed out".
 *
 * ## What it is NOT
 *
 * It is not a credential, not a claim, and not an authorisation. Anyone can set
 * it with one line in a console, and doing so buys exactly one wasted hop:
 * `/` sends them to /dashboard, `RequireAuth` asks `/auth/me`, the API answers
 * 401 and they land back on the sign-in screen with the marker cleared. Nothing
 * downstream trusts it — every private byte still comes from an endpoint that
 * verifies a signature.
 *
 * So the rule that governs it is: this value may only ever decide **what to
 * paint while the real answer is in flight**. The moment it is used to decide
 * whether someone MAY see something, it has become the forgeable gate that
 * `require-auth.tsx` exists to prevent.
 *
 * ## What it buys
 *
 * A returning client stopped seeing the sign-in screen. Before this, opening the
 * portal with a live 30-day session went: `/` → `/auth/login` → the full sign-in
 * form, painted → `/auth/me` answers → `/dashboard`. The form was on screen for
 * a whole round trip, which reads as "I have been logged out" and is the moment
 * a client starts typing a password they did not need to type.
 *
 * The obvious fix — always hold the paint on the sign-in screen until `/auth/me`
 * answers — was rejected in `redirect-if-authenticated.tsx` for a good reason
 * that still stands: almost everybody who loads that page has no session, and
 * making all of them watch a spinner to spare the few is the wrong trade. The
 * marker is what lets both cases be right, because it says which one this is
 * before any request is made.
 *
 * ## Why it is deliberately unprefixed
 *
 * `__Host-` would stop a sibling OxShare host writing it, and that is the right
 * call for the CSRF cookie (see `CSRF_COOKIE_NAMES` in lib/api/client.ts). It is
 * not worth it here: the prefix requires `Secure`, which plain-HTTP localhost
 * cannot satisfy, so it would mean two spellings and two readers — including one
 * inside the edge proxy — to defend a value whose worst-case forgery is a
 * redirect that corrects itself.
 *
 * The NAME is per-app all the same. Cookies ignore the port, so on localhost the
 * portal (:3000) and the admin console (:3002) share one jar; a shared name
 * would mean signing into one app told the other it had a session.
 */
export const SESSION_HINT_COOKIE = 'oxshare_crm_portal_session_hint';

/**
 * Matched to the REFRESH cookie's thirty days, not to the access token's fifteen
 * minutes.
 *
 * The marker answers "could this browser still resume a session", and that is
 * the refresh token's question. Expiring it in fifteen minutes would put the
 * sign-in flash back for every client who left the tab and came back — which is
 * the exact case this exists for.
 */
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * Written with `document.cookie` rather than through `js-cookie`, because
 * `src/proxy.ts` imports the name from this module and runs in the edge runtime.
 * Keeping the file dependency-free means the proxy bundle does not grow a cookie
 * library to read one string.
 */
export function markSessionHint(): void {
  if (typeof document === 'undefined') return;
  // `Secure` only where the page is already on TLS — localhost is plain HTTP in
  // development, and a `Secure` cookie there is silently dropped, which would
  // make this whole mechanism a no-op in the one environment it is developed in.
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${THIRTY_DAYS_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Cleared on every path a session ends by — `clearSession`, `logout`, and the
 * cross-tab `signed-out` broadcast — for the same reason all three clear the KYC
 * draft: "this session is over" has to mean the same thing however it ended.
 *
 * A stale marker is self-correcting but not free: it costs the next visitor one
 * redirect to /dashboard and back, and on a shared device that hop paints the
 * signed-in chrome's loading state to somebody who never signed in.
 */
export function clearSessionHint(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Does this browser believe it has a session?
 *
 * ## NOT for deciding what to paint
 *
 * Anything that decides what the FIRST render shows reads the marker in
 * `app/layout.tsx` with `cookies()` — SERVER-side — and receives it as a prop.
 * A client component reading `document.cookie` for that renders `false` during
 * SSR and `true` after hydration, so the sign-in form ships inside the HTML and
 * is swapped out a frame later: a smaller version of the bug, not a fix for it.
 * That rule still stands, and this helper must never be used in a render path.
 *
 * ## What it IS for: "is there a session to renew?"
 *
 * `lib/api/client.ts` has to answer that question twice — before the ten-minute
 * proactive refresh fires, and before it decides whether a 401 on a public page
 * is a visitor who was never signed in or a returning client whose access token
 * lapsed. It used to read the CSRF cookie for both, and that is the one signal
 * that is wrong in exactly the environment that matters: wherever this app and
 * the API are different hostnames (every real deployment), the API's cookies
 * are `__Host-` bound to the API's host and `document.cookie` here cannot see
 * them. So the proactive refresh never fired in production, and a signed-in
 * client landing on /auth/login from a bookmark was shown the form over a live
 * session. Localhost hid both, because cookies ignore the port.
 *
 * This marker is written by THIS app on THIS host and cleared on every path a
 * session ends by, so it is readable everywhere and says exactly what those two
 * callers need: "worth asking". It decides whether to ASK — never access. A
 * forged marker buys one refresh attempt that the API refuses, after which
 * `clearSession` clears it again.
 */
export function hasSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith(`${SESSION_HINT_COOKIE}=1`));
}
