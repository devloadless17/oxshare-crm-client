import type { Metadata } from 'next';
import { PortalLayout } from '@/components/layout/portal-layout';

export const metadata: Metadata = { title: 'Deposit — OXShare' };

export default function DepositLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
