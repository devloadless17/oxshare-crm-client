import { redirect } from 'next/navigation';

export default function RootForgotPasswordRedirect() {
  redirect('/auth/forgot-password');
}
