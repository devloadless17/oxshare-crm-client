import { redirect } from 'next/navigation';

/**
 * Forwards to the real sign-in screen, carrying `?next=`.
 *
 * `proxy.ts` writes that parameter when it bounces a visitor, so it names the
 * page they were actually trying to reach. Dropping it here silently downgrades
 * "sign in and carry on where you were" to "sign in and land on the dashboard",
 * which looks like the app forgetting rather than a redirect losing a query.
 *
 * Only `next` is forwarded, and `safeReturnTo` still validates it downstream —
 * this is a stub for old links, not a place to re-decide where a login may send
 * somebody.
 */
export default async function RootLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login');
}
