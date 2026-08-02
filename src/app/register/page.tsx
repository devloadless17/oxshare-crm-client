import { redirect } from 'next/navigation';

export default function RootRegisterRedirect() {
  redirect('/auth/register');
}
