import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideRoute } from '@/lib/route-guard';

export function proxy(request: NextRequest) {
  const decision = decideRoute(
    request.nextUrl.pathname,
    /*
     * Gated on the REFRESH cookie, not the access cookie.
     *
     * httpOnly cookies are still sent to the server, so R-3.2 changed nothing
     * here. R-3.3 did: the access token now lives 15 minutes rather than 8
     * hours, so gating on it would bounce a client who came back from lunch to
     * the login screen — while their 30-day refresh token sat there, valid,
     * ready to renew on the page's first request.
     *
     * A redirect hint either way: every route it guards is enforced again by the
     * API, which verifies signatures rather than presence.
     */
    request.cookies.get('__Host-oxshare_crm_portal_rt')?.value ??
      request.cookies.get('oxshare_crm_portal_rt')?.value,
  );

  return decision.allow
    ? NextResponse.next()
    : NextResponse.redirect(new URL(decision.redirectTo, request.url));
}

export const config = {
  /*
   * Everything except Next's internals, the API rewrite, and STATIC FILES.
   *
   * The last exclusion was missing, and it is why the logo rendered as a broken
   * image on the sign-in screen: `/oxshare-mark.svg` is not a public PATH, so an
   * unauthenticated request for it was redirected to /login. The browser got an
   * HTML redirect where it expected an SVG. `next/image` failed the same way one
   * level down — the optimizer fetches the source itself, got the redirect, and
   * answered 400.
   *
   * It hid well: anyone with a live session loaded the asset normally, and a
   * cached copy survived logging out, so it only appeared on a genuinely cold
   * signed-out load.
   *
   * The trailing pattern excludes any path with a file extension. Gating a
   * static asset behind a session was never the intent — nothing under
   * `public/` is private, and anything that ever is belongs behind an
   * authenticated route handler like the KYC uploads controller, not behind a
   * redirect that returns HTML.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.[\\w]+$).*)'],
};
