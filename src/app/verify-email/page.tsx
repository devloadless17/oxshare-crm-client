import { redirect } from 'next/navigation';

export default function RootVerifyEmailRedirect({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return redirect('/auth/verify-email');
}
