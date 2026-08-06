import { redirect } from 'next/navigation';

/**
 * Forwards to the real registration screen, carrying `?next=`.
 *
 * The sibling `/login` stub already did this and this one did not, so intent
 * survived one route and was silently dropped by the other: a visitor sent to
 * `/register?next=/kyc` — from a marketing link, a referral, or any link that
 * carries a destination — signed up and landed on the dashboard, with nothing
 * to say where they had been going.
 *
 * The stub itself exists because emails already in inboxes point at these
 * top-level URLs; `lib/api/auth.ts` records the incident where an emailed link
 * 404'd. Don't delete it.
 *
 * Only `next` is forwarded, and `safeReturnTo` still validates it downstream —
 * this is a stub for old links, not a place to re-decide where a redirect may
 * send somebody.
 */
export default async function RootRegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(next ? `/auth/register?next=${encodeURIComponent(next)}` : '/auth/register');
}
