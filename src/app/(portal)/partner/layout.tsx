import { pageMetadata } from '@/lib/i18n/server';

// In the visitor's language (lib/i18n/server.ts).
export const generateMetadata = () => pageMetadata('meta.partner');

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
