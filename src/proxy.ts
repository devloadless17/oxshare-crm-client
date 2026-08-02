import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/auth',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/r/',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const token = request.cookies.get('access_token')?.value;

  // Not logged in → redirect to login
  if (!isPublic && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // KYC routes require a verified email — read from JWT payload (no sig check in proxy)
  if (token && pathname.startsWith('/kyc')) {
    try {
      const payloadB64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      if (!payload.emailVerified) {
        return NextResponse.redirect(new URL('/verify-email/pending', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
