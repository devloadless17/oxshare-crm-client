/**
 * Which portal paths a visitor may reach without a session.
 *
 * ONE definition, two readers — `src/proxy.ts`, which gates requests before any
 * JavaScript runs, and `src/lib/api/client.ts`, which decides whether a dead
 * session should be evicted to the sign-in screen.
 *
 * ## Why it moved here
 *
 * `endDeadSession` in `client.ts` needed to answer "is the page I am on
 * public?" and had no way to ask, so it used a proxy for the question: *does the
 * CSRF cookie exist* — reasoning that the cookie is set and cleared alongside
 * the session, so its absence means nobody was ever signed in.
 *
 * That reasoning is wrong in two ordinary situations:
 *
 *  - **Signing out in one tab clears the CSRF cookie for the WHOLE browser**, so
 *    every other tab concluded nobody had been signed in and kept rendering the
 *    portal — the client's name, email and cached balances — indefinitely, on a
 *    machine they believe they signed out of.
 *  - The CSRF cookie lives **8 hours** and the refresh cookie **30 days**, so a
 *    client returning the next day holds one and not the other. If the session
 *    has also died they were stranded on a live-looking portal instead of being
 *    sent to sign in.
 *
 * The comment on that heuristic rejected a path list because "one would have to
 * be kept in step with proxy.ts", and a page added to one and not the other
 * fails the same way again. That is an argument against a SECOND list, not
 * against this one: `proxy.ts` imports these, so there is nothing to keep in
 * step.
 *
 * It cannot live in `proxy.ts` itself — that file imports `next/server` and is
 * compiled for the edge runtime, so importing it from a client component would
 * pull the middleware into the browser bundle.
 */

/**
 * Screens that exist only for someone without a session.
 *
 * They are PUBLIC here and nothing more — this file does not redirect a
 * cookie-holder away from them, and `decideRoute` explains at length why that
 * would loop. Keeping a signed-in client off the sign-in form is the job of
 * `components/auth/redirect-if-authenticated`, which asks `/auth/me`.
 *
 * The list still earns its place: `safeReturnTo` reads it to refuse a `?next=`
 * pointing back at sign-in, which would strand a client in a loop of their own.
 *
 * The top-level entries are the 5-line `redirect()` stubs — verification and
 * reset emails already in inboxes point at those URLs, so they must keep
 * working (lib/api/auth.ts records the incident where an emailed link 404'd).
 */
export const AUTH_ONLY_PATHS = ['/auth/login', '/auth/register', '/login', '/register'];

/**
 * Screens that must work with OR without a session, and are therefore never
 * redirected in either direction.
 *
 * Each entry is here for a concrete reason, and "it is an auth page" is not one:
 *
 *  - `/auth/confirm-email` and `/verify-email` (with `/verify-email/pending`,
 *    now a redirect to the first) — a client whose address an operator changed
 *    IS signed in and is NOT verified, and the emailed link is opened in
 *    whatever browser the mail app picks, session or not. Bouncing either to
 *    /dashboard sends them away from the one page that unblocks them.
 *
 *  - `/forgot-password` and `/reset-password` — account recovery has to work
 *    from a browser that still holds a stale session cookie, which is the
 *    normal state of the device someone is locked out on. Treating these as
 *    auth-only would redirect a client holding a valid reset link to a
 *    dashboard they cannot reach, with no way back except clearing cookies by
 *    hand.
 *
 * That last case is why there are two lists rather than one: "public" and "for
 * signed-out people only" are different properties, and collapsing them locks
 * users out of recovery.
 */
export const ALWAYS_PUBLIC_PATHS = [
  /*
   * The 6-digit code screen. Public because the person typing the code has no
   * session yet — the code is what starts one — and "always" rather than
   * auth-only because a SIGNED-IN client whose address an operator changed is
   * sent here by `RequireAuth` to confirm the new one.
   */
  '/auth/confirm-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  /*
   * `/r/` — the referral-code prefix — is deliberately NOT here yet.
   *
   * It was, and nothing in `src/app` served it. That is a latent hole rather
   * than a live one: no route means nothing is exposed today. But an entry
   * ending in `/` is a PREFIX match by design, so the moment somebody adds the
   * referral landing page (D-23's attribution work, IB-01) it would be
   * unauthenticated by default, and nobody would think to look here.
   *
   * This file goes out of its way to avoid exactly that — see the segment-match
   * comment in `matches` — so the exception does not get to stay on
   * speculation. Add it back in the same commit as the route.
   */
];

/**
 * Every path reachable without a session.
 *
 * Enumerated, never a blanket `/auth` prefix. It used to be the latter, which
 * meant any page added under `/auth/` in future would be unauthenticated by
 * default and nobody would have decided that. Fail-closed is the only default
 * that survives a route being added by someone who has not read this file.
 */
export const PUBLIC_PATHS = [...AUTH_ONLY_PATHS, ...ALWAYS_PUBLIC_PATHS];

export function matches(pathname: string, entries: readonly string[]): boolean {
  return entries.some((entry) =>
    // An entry ending in `/` is a prefix by design — `/r/` would cover every
    // referral code. Everything else matches whole SEGMENTS, never a bare string
    // prefix: `startsWith('/login')` would also admit `/login-help`, and
    // `startsWith('/register')` would admit `/register-partner`, so a route
    // added later could become unauthenticated without anyone deciding it.
    entry.endsWith('/')
      ? pathname.startsWith(entry)
      : pathname === entry || pathname.startsWith(`${entry}/`),
  );
}

/**
 * Reachable with no session — the question `endDeadSession` actually needs.
 *
 * A thin name over `matches(pathname, PUBLIC_PATHS)` so call sites read as the
 * question rather than as its implementation, and so a future third caller has
 * one obvious thing to import.
 */
export function isPublicPath(pathname: string): boolean {
  return matches(pathname, PUBLIC_PATHS);
}
