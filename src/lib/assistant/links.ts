/**
 * The portal pages an assistant answer may link to: the backend's
 * `PORTAL_LINKS` (modules/assistant/knowledge/platform-pack.ts), kept the same.
 *
 * This list is the SECURITY half of links in answers. The model is told to link
 * only here, but a model can be steered by what a client types, so the widget
 * does not trust it: a link to anything else, an external site included,
 * renders as plain text. An allowed link may carry a query (`/deposit?tab=history`).
 */
const PORTAL_PAGES = new Set([
  '/dashboard',
  '/wallet',
  '/deposit',
  '/withdraw',
  '/transfer',
  '/transactions',
  '/accounts',
  '/partner',
  '/platforms',
  '/profile',
  '/kyc',
]);

/** The path to navigate to, or null when the target is not an allowed portal page. */
export function allowedPortalLink(href: string | undefined): string | null {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  const [path = '', query = ''] = href.split('?', 2);
  if (!PORTAL_PAGES.has(path)) return null;
  if (query && !/^[a-z0-9_=&-]+$/i.test(query)) return null;
  return query ? `${path}?${query}` : path;
}
