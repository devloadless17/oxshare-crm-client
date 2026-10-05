'use client';

import Link from 'next/link';
import { Clock, ShieldAlert } from 'lucide-react';

/**
 * The header's verification prompt: `kycNavBadge`'s answer (portal-layout.tsx),
 * as a link to /kyc. Renders nothing for a verified client.
 */
export function KycAlert({
  badge,
}: {
  badge: { text: string; tone: 'warning' | 'info' | 'destructive' } | undefined;
}) {
  if (!badge) return null;

  const inReview = badge.tone === 'info';

  return (
    <Link
      href="/kyc"
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-outline ${
        badge.tone === 'destructive'
          ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
          : inReview
            ? 'border-info/30 bg-info/10 text-info hover:bg-info/15'
            : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15'
      }`}
    >
      {inReview ? (
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{badge.text}</span>
      <span className="sr-only sm:hidden">{badge.text}</span>
    </Link>
  );
}
