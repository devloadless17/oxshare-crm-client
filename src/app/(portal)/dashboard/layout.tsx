import type { Metadata } from 'next';

// The page reads the client's live dashboard, so it is a client component and
// its metadata lives here instead — the same arrangement as app/wallet/layout.tsx
// and app/accounts/layout.tsx, and for the same reason.
export const metadata: Metadata = { title: 'Dashboard — OXShare' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
