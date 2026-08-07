import type { Metadata } from 'next';
import { PortalLayout } from '@/components/layout/portal-layout';

export const metadata: Metadata = { title: 'Transactions — OXShare' };

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
