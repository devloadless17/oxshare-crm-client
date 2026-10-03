import { pageMetadata } from '@/lib/i18n/server';

// The page reads the client's live dashboard, so it is a client component and
// its metadata lives here instead — the same arrangement as app/wallet/layout.tsx
// and app/accounts/layout.tsx, and for the same reason.
// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.dashboard');

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
