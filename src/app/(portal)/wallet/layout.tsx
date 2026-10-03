import { pageMetadata } from '@/lib/i18n/server';

// The page reads live balances, so it is a client component and its metadata
// lives here instead.
// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.wallet');

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children;
}
