import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideRoute } from '@/lib/route-guard';

export function proxy(request: NextRequest) {
  const decision = decideRoute(
    request.nextUrl.pathname,
    request.cookies.get('access_token')?.value,
  );

  return decision.allow
    ? NextResponse.next()
    : NextResponse.redirect(new URL(decision.redirectTo, request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
