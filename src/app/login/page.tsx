import { redirect } from 'next/navigation';

export default function RootLoginRedirect() {
  redirect('/auth/login');
}
