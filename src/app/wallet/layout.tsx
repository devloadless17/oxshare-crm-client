import type { Metadata } from 'next';
import { PortalLayout } from '@/components/layout/portal-layout';

// The page reads live balances, so it is a client component and its metadata
// lives here instead.
export const metadata: Metadata = { title: 'My Wallet — OXShare' };

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
