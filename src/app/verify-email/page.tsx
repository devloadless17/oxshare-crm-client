import { redirect } from 'next/navigation';

/**
 * The verification email links to /auth/verify-email, so that page is the real
 * one. This was a second, separate implementation of the same screen — and the
 * only one that called the endpoint correctly, which is how the mismatch in
 * authApi.verifyEmail went unnoticed: whichever page you opened by hand worked.
 */
export default async function VerifyEmailRedirect({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  redirect(token ? `/auth/verify-email?token=${encodeURIComponent(token)}` : '/auth/verify-email');
}
