import { pageMetadata } from '@/lib/i18n/server';

// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.statement');

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
