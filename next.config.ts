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
  // Content-Security-Policy is NOT here — it is built per request in
  // `src/lib/csp.ts` and set by `src/proxy.ts`, because `script-src` carries a
  // per-response nonce and a static header cannot. Keeping half the policy here
  // and half there was worse than either: `next.config.ts` headers are applied
  // AFTER middleware and REPLACED the header it set, so the static directives
  // silently vanished from every response. One owner, one place.

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

/*
 * `public/email/` holds the images our emails load — the logo in every message's
 * masthead (backend `modules/email/templates/layout.ts`). Each file there is a
 * CONTRACT with mail already delivered: a message keeps loading it for as long
 * as it sits in an inbox. So a file there is never edited or deleted — a new
 * logo is a new version (`oxshare-logo-v2.png`) beside the old one — and that
 * is what makes these two headers safe:
 *
 *  - a year's `immutable` cache. The `public/` default is `max-age=0`, which
 *    sent every open of every email back here to ask again; now mail clients,
 *    the Gmail and Apple image proxies and the CDN edge keep their copy;
 *  - `Cross-Origin-Resource-Policy: cross-origin`, stating outright that any
 *    origin may embed these. A webmail client does exactly that, and a
 *    site-wide `same-origin` added later must not blank the logo in every inbox.
 *
 * `src/test/email-assets.test.ts` pins the file and both headers.
 */
const emailAssetHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
];

const nextConfig: NextConfig = {
  /*
   * Do not announce the framework.
   *
   * Next.js sends `x-powered-by: Next.js` on every response by default. It is
   * not a vulnerability by itself — nothing is protected by hiding it — but it
   * is free reconnaissance: it tells a scanner which framework, and therefore
   * which CVE list, to try. The cost of removing it is one line and nothing
   * else, which is the whole argument for doing it.
   */
  poweredByHeader: false,
  /*
   * Self-hosted builds set NEXT_OUTPUT=standalone (see the Dockerfile). The build
   * then emits `.next/standalone`: a server.js plus only the node_modules it
   * traces, so the production image carries no dev dependencies. Unset, as in `npm run dev`,
   * nothing changes.
   */
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  /*
   * Development only (nothing renders it in production). Off, because Next draws
   * it in the bottom-left corner, where the assistant's button sits in Arabic.
   * Next still shows compile and runtime errors.
   */
  devIndicators: false,
  // Three sibling repos each have a lockfile; pin the root so Next doesn't guess
  // which one is the workspace. The admin app already does this.
  turbopack: { root: __dirname },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // The `/v1` lives HERE and only here — PLATFORM-CONVENTIONS R-2.1.
        //
        // The API is versioned; this app's axios `baseURL` is still `/api` and
        // no application code knows about the segment. That is deliberate: the
        // root CLAUDE.md instruction "never reintroduce /v1 into a frontend base
        // URL" came from a real incident where the frontends called /api/v1/...
        // against a backend serving bare paths and every request 404'd. Putting
        // the version on the destination rather than the base URL keeps that
        // instruction literally true while the API gains what R-2.1 asks for.
        //
        // /health stays unversioned on the API, so anything probing it must not
        // go through this rewrite.
        destination: `${process.env.API_BASE_URL ?? 'http://localhost:3001'}/v1/:path*`,
      },
    ];
  },
  // Applied to every route, including the /api rewrite — a KYC document fetched
  // through the proxy inherits nosniff and the CSP from here as well as from the
  // API's own response.
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // After the site-wide rule, so these win where a key is set by both.
      { source: '/email/:path*', headers: emailAssetHeaders },
      // The same logo at its FIRST address. The backend deployed as production
      // release be0341e (26 Sep 2026) points every email here until the release
      // carrying the move to `/email/` is deployed, and mail it sends keeps this
      // address for as long as it is kept — so this path is served for good.
      { source: '/brand/oxshare-email-logo.png', headers: emailAssetHeaders },
    ];
  },
};

export default nextConfig;
