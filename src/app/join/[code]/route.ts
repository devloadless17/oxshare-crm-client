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
 *
 * ⚠️ The redirect is RELATIVE, on purpose. In production this runs in a
 * container behind Caddy, where a route handler's `request.url` is the
 * container's bind address — `https://0.0.0.0:3000` — not the portal's. Built
 * from it, every sign-up link sent visitors to an address that does not exist
 * (reported from production, 6 Oct 2026); localhost hid it, because there the
 * two are the same. A relative `Location` is resolved by the browser against the
 * address the visitor actually used, whatever the proxy in front.
 */
export function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return params.then(({ code: raw }) => {
    const code = normaliseAcquisitionCode(decodeURIComponent(raw));
    const query = new URLSearchParams();
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref) query.set('ref', ref);
    if (code) query.set(ACQUISITION_PARAM, code);
    const target = query.size > 0 ? `/auth/register?${query.toString()}` : '/auth/register';

    const response = new NextResponse(null, { status: 307, headers: { Location: target } });
    if (code) {
      response.cookies.set(ACQUISITION_COOKIE, code, {
        path: '/',
        maxAge: ACQUISITION_MAX_AGE_SECONDS,
        sameSite: 'lax',
        // Behind the proxy the request reaches us as plain http; Caddy says how it arrived.
        secure:
          request.headers.get('x-forwarded-proto') === 'https' ||
          request.nextUrl.protocol === 'https:',
      });
    }
    return response;
  });
}
