import { NextResponse, type NextRequest } from 'next/server';
import {
  ACQUISITION_COOKIE,
  ACQUISITION_MAX_AGE_SECONDS,
  ACQUISITION_PARAM,
  normaliseAcquisitionCode,
} from '@/lib/acquisition';

/**
 * `/join/<word>` — an administrator's sign-up link (backend 0198): one each, a
 * readable word like `omar-farah`.
 *
 * Remembers the code (30 days, last click wins) and sends the visitor to the
 * sign-up form with it in the URL as well, so it works even where cookies are
 * blocked. A partner's `?ref=` on the same link is carried along: a client may
 * arrive through both, and the API applies both.
 *
 * A malformed code is dropped, never echoed back: the visitor still reaches
 * sign-up, just without a link.
 */
export function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return params.then(({ code: raw }) => {
    const code = normaliseAcquisitionCode(decodeURIComponent(raw));
    const target = new URL('/auth/register', request.url);
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref) target.searchParams.set('ref', ref);
    if (code) target.searchParams.set(ACQUISITION_PARAM, code);

    const response = NextResponse.redirect(target);
    if (code) {
      response.cookies.set(ACQUISITION_COOKIE, code, {
        path: '/',
        maxAge: ACQUISITION_MAX_AGE_SECONDS,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
    return response;
  });
}
