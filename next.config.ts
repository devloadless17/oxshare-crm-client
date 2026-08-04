import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Security headers — PLATFORM-CONVENTIONS R-7.5.
 *
 * `helmet()` protects the API, whose responses are JSON. This app is the one that
 * renders HTML, holds the client session cookie, takes identity-document uploads
 * and shows wallet balances, and it shipped with no CSP and no clickjacking
 * protection at all.
 *
 * TWIN-ADJACENT: the admin app's copy is the same policy with three deliberate
 * differences, all of them here and all of them for KYC capture:
 *   1. `camera=(self)` — SelfieCamera calls getUserMedia. Setting `camera=()` as
 *      the admin app does would silently break the selfie step of FR-CORE-15,
 *      with no error the user could act on.
 *   2. `img-src` allows `blob:` and `data:` — the capture preview renders a canvas
 *      via toDataURL and object URLs for chosen files before upload.
 *   3. `media-src` allows `blob:` — the live camera stream is attached to a
 *      <video> as an object URL.
 * Do not "align" these with the admin copy; they are why KYC works.
 *
 * Honest note on `'unsafe-inline'` in script-src: Next inlines its own bootstrap
 * and next-themes inlines the no-flash theme script, so a nonce-based policy
 * would require rendering every page dynamically through middleware. This policy
 * still blocks loading script from ANY other origin, which is what stops a
 * compromised dependency exfiltrating a session or a document to an attacker.
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-eval' is dev-only: the Turbopack/webpack dev runtime needs it.
      `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'", // Tailwind and Next inject style tags
      "img-src 'self' data: blob:", // KYC capture preview — see (2) above
      "media-src 'self' blob:", // live camera stream — see (3) above
      "font-src 'self' data:",
      // Same-origin only: the API is reached through the /api rewrite, so the
      // browser never needs to talk to :3001 directly. Anything else is exfiltration.
      `connect-src 'self'${isProd ? '' : ' ws: http://localhost:*'}`,
      "frame-ancestors 'none'", // no OxShare site should embed the funded portal
      "base-uri 'self'", // stops an injected <base> retargeting every relative URL
      "form-action 'self'", // stops an injected form posting credentials elsewhere
      "object-src 'none'",
      ...(isProd ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
  // Legacy companion to frame-ancestors, for anything that predates CSP level 2.
  { key: 'X-Frame-Options', value: 'DENY' },
  // A mislabelled upload must never be sniffed into active content.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Never leak a path containing a user id in a Referer to another origin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // camera=(self) is REQUIRED by the KYC selfie step — see (1) above.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // HSTS only where TLS exists; on localhost it would pin http://localhost to
  // https and lock the developer out of their own dev server.
  ...(isProd
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Three sibling repos each have a lockfile; pin the root so Next doesn't guess
  // which one is the workspace. The admin app already does this.
  turbopack: { root: __dirname },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:3001'}/:path*`,
      },
    ];
  },
  // Applied to every route, including the /api rewrite — a KYC document fetched
  // through the proxy inherits nosniff and the CSP from here as well as from the
  // API's own response.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
