import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideRoute } from '@/lib/route-guard';

export function proxy(request: NextRequest) {
  const decision = decideRoute(
    request.nextUrl.pathname,
    // httpOnly cookies ARE sent to the server, and this runs server-side, so the
    // gate is unaffected by R-3.2 — only the NAME changed. Both spellings are
    // accepted because the `__Host-` prefix appears only where TLS makes it
    // valid (see the backend's common/security/session-cookies.ts).
    request.cookies.get('__Host-oxshare_portal_at')?.value ??
      request.cookies.get('oxshare_portal_at')?.value,
  );

  return decision.allow
    ? NextResponse.next()
    : NextResponse.redirect(new URL(decision.redirectTo, request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
