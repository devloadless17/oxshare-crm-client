import type { Metadata } from 'next';

// The page reads the client's live MT5 account list, so it is a client
// component and its metadata lives here instead — same arrangement as
// app/wallet/layout.tsx, and for the same reason.
export const metadata: Metadata = { title: 'Trading Accounts — OXShare' };

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
