import { redirect } from 'next/navigation';

/**
 * Forwards to the real screen, CARRYING THE TOKEN.
 *
 * The token is the credential. Dropping it lands the client on a form that
 * cannot submit, with no way to recover the value except to request a second
 * email — and the screen they are looking at says nothing about that, so the
 * failure reads as "the link expired".
 *
 * This stub exists only for links already sitting in inboxes (emails now point
 * straight at `/auth/reset-password`), which makes losing the token worse than
 * it looks: the only people who reach here are the ones who cannot be helped by
 * a deploy. `/verify-email` had this right and this file did not.
 */
export default async function RootResetPasswordRedirect({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  redirect(
    token ? `/auth/reset-password?token=${encodeURIComponent(token)}` : '/auth/reset-password',
  );
}
