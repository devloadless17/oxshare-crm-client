'use client';

import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';

/**
 * The portal's loading boundary — what lets a menu click answer at once.
 *
 * Every portal route is DYNAMIC (the root layout reads `headers()` for the CSP
 * nonce), and Next.js 16 prefetches a dynamic route only when it has a
 * `loading.js` boundary. Without this file a click on a page that was not
 * prefetched in full kept the OLD page on screen until the server answered;
 * with it, that click swaps to this loader at once and the page streams in.
 * Menu pages are prefetched in full (`usePrefetchRoutes`), so they usually skip
 * this entirely. Client-side so it speaks the visitor's language like every
 * other loader, and it is the same `PageLoader` `AsyncBoundary` shows, so the
 * two waits read as one.
 */
export default function PortalLoading() {
  return <PageLoader label={t('common.loading')} srOnly />;
}
