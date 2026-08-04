import { redirect } from 'next/navigation';

/**
 * Straight to the real sign-in page.
 *
 * This used to redirect to `/login`, which is itself a redirect stub for
 * `/auth/login` — two round trips to reach the same screen. The stub stays
 * (verification emails already in inboxes link to it, see lib/api/auth.ts), it
 * just is not on the path from the site root any more.
 */
export default function Home() {
  redirect('/auth/login');
}
