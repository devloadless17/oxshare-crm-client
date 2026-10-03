import { pageMetadata } from '@/lib/i18n/server';

// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.deposit');

export default function DepositLayout({ children }: { children: React.ReactNode }) {
  return children;
}
