import { redirect } from 'next/navigation';
import { CONFIRM_EMAIL_PATH } from '@/lib/pending-email';

/**
 * "Check your inbox for a link" is gone — the email now leads with a 6-digit
 * code, and `/auth/confirm-email` is the screen that takes it (25 Sep 2026).
 *
 * This route stays as a redirect because it was the portal's destination for
 * every unconfirmed session until then: a bookmark, a restored tab or an old
 * build's navigation still points here. The code screen reads the address from
 * the session, so nothing is lost on the way through.
 */
export default function VerifyEmailPendingRedirect() {
  redirect(CONFIRM_EMAIL_PATH);
}
