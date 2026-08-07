import type { Metadata } from 'next';
import { PortalLayout } from '@/components/layout/portal-layout';

export const metadata: Metadata = { title: 'Transfer — OXShare' };

export default function TransferLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
