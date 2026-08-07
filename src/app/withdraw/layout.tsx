import type { Metadata } from 'next';
import { PortalLayout } from '@/components/layout/portal-layout';

export const metadata: Metadata = { title: 'Withdraw — OXShare' };

export default function WithdrawLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
