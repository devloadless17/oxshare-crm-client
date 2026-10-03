import { pageMetadata } from '@/lib/i18n/server';

// The page reads the client's live MT5 account list, so it is a client
// component and its metadata lives here instead — same arrangement as
// app/wallet/layout.tsx, and for the same reason.
// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.accounts');

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
