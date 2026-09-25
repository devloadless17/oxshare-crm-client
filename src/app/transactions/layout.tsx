import type { Metadata } from 'next';
import { PortalLayout } from '@/components/layout/portal-layout';

export const metadata: Metadata = { title: 'Statement — OXShare' };

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
