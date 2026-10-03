import { pageMetadata } from '@/lib/i18n/server';

// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.transfer');

export default function TransferLayout({ children }: { children: React.ReactNode }) {
  return children;
}
