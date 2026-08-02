import { redirect } from 'next/navigation';

export default function RootResetPasswordRedirect() {
  redirect('/auth/reset-password');
}
