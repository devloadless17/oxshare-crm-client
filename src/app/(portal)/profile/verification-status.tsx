'use client';

import Link from 'next/link';
import { BadgeCheck, Clock, ShieldAlert } from 'lucide-react';
import type { Resource } from '@/hooks/use-resource';
import type { components } from '@/lib/api/types.gen';
import { t, type MessageKey } from '@/lib/i18n';
import { isKycApproved, isKycPending, isKycRejected } from '@/lib/kyc-access';

type KycStatusDto = components['schemas']['KycStatusDto'];

/**
 * The profile's "Verification" panel — the IDENTITY verification, read from
 * `GET /kyc/status` (26 Sep 2026).
 *
 * It read the EMAIL flag. Since sign-up ends on the emailed code, every
 * signed-in client has a confirmed address — so every one of them, KYC or not,
 * was told "Your identity is verified." on the screen they would check it on.
 * The email pill under the name still reads the email flag; this reads the one
 * thing its title names.
 *
 * Nothing is claimed before the status answers — "not complete yet" to an
 * approved client is the wrong answer confidently (`KycStatusCard` has the
 * same rule). A failed read says so; the documents section below it, reading
 * the same query, carries the retry.
 */
export function VerificationStatus({
  kyc,
  verificationLevel,
}: {
  kyc: Resource<KycStatusDto | null>;
  verificationLevel: number | undefined;
}) {
  const status = kyc.data?.status ?? 'not_started';
  const state: {
    copy: MessageKey;
    icon: typeof Clock;
    tone: string;
    cta?: MessageKey;
  } =
    kyc.status === 'loading'
      ? { copy: 'dashboard.kycLoading', icon: Clock, tone: 'text-muted-foreground' }
      : kyc.status !== 'ready'
        ? { copy: 'kyc.statusLoadFailed', icon: ShieldAlert, tone: 'text-muted-foreground' }
        : isKycApproved(verificationLevel, status)
          ? { copy: 'profile.verificationApproved', icon: BadgeCheck, tone: 'text-success' }
          : isKycPending(status)
            ? { copy: 'profile.verificationReview', icon: Clock, tone: 'text-info' }
            : isKycRejected(status)
              ? kyc.data?.reverificationRequestedAt
                ? {
                    copy: 'profile.verificationReverify',
                    icon: ShieldAlert,
                    tone: 'text-warning',
                    cta: 'kycGate.reverifyCta',
                  }
                : {
                    copy: 'profile.verificationRejected',
                    icon: ShieldAlert,
                    tone: 'text-destructive',
                    cta: 'kycGate.statusCta',
                  }
              : {
                  copy: 'profile.verificationPending',
                  icon: ShieldAlert,
                  tone: 'text-warning',
                  cta: 'profile.verificationCta',
                };
  const Icon = state.icon;

  return (
    <div className="flex items-start gap-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${state.tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs leading-relaxed text-muted-foreground" role="status">
          {t(state.copy)}
        </p>
        {/* The one permanent route into KYC. The sidebar entry disappears once
            approved, so a client with something to do needs a way back in
            from somewhere that does not move. */}
        {state.cta && (
          <Link
            href="/kyc"
            className="mt-2 inline-block rounded-md text-xs font-semibold text-link hover:underline focus-outline"
          >
            {t(state.cta)}
          </Link>
        )}
      </div>
    </div>
  );
}
