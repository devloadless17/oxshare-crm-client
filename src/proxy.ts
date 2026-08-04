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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
