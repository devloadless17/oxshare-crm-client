'use client';

import Link from 'next/link';
import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKycAccess } from '@/hooks/use-kyc-access';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The dashboard's verification card, derived from state rather than asserted.
 *
 * ## Why this is a component and not four lines of JSX on the page
 *
 * It was four lines of JSX on the page, and every one of them was a constant:
 * a green shield, the literal string "Level 1 Verified • Trading Enabled", and
 * a "Continue verification" button — rendered identically to a client who had
 * registered thirty seconds ago and never uploaded a document.
 *
 * On a compliance surface that is the worst possible direction for a hardcoded
 * value to point. It is the same failure this repo has already fixed twice
 * (a client holding $700 shown "$0.00"; "0 trading accounts" beside three real
 * ones), except those understated the truth and this one overstates it: it told
 * an unverified client that trading was enabled.
 *
 * `/dashboard` is a server component, so reading live state means a client
 * component. That is the whole reason this file exists.
 *
 * ## The rule it reads
 *
 * `useKycAccess()` — the same hook the money screens gate on, sharing the same
 * `['kyc-status']` query key as the sidebar badge. Deliberately NOT a second
 * source of truth: a dashboard that disagreed with the sidebar about whether a
 * client is verified is how the last contradiction in this layout started.
 */

type CardState = {
  copy: MessageKey;
  icon: typeof ShieldCheck;
  /** Tailwind classes for the icon chip — tone follows meaning, not decoration. */
  tone: string;
  /** Absent when there is nothing for the client to do. */
  cta: boolean;
};

export function KycStatusCard() {
  const { isLoading, approved, pending, rejected, reverification } = useKycAccess();

  /*
   * AN APPROVED CLIENT SEES NOTHING AT ALL.
   *
   * This used to render a permanent "Level 1 Verified • Trading Enabled" card,
   * and that is a status light that never changes: it occupies the top of the
   * dashboard forever, tells the client something they cannot act on, and pushes
   * the data they actually came for further down the page on every visit.
   *
   * It is the same mistake the header pill made — `portal-layout.tsx` records
   * removing a permanent "Verified Account" badge for exactly this reason, and
   * `kycNavBadge` returns `undefined` on the same principle: a status card is a
   * call to action, and somebody with no action left needs no card.
   *
   * Returning null rather than keeping a quieter version, because there is no
   * quieter version worth the vertical space. Verification is confirmable on
   * /profile whenever the client wants to check.
   */
  if (approved) return null;

  /*
   * Order matters below: `isLoading` is checked before the negative states so a
   * client whose status has not answered yet is never shown "Not started" — the
   * wrong answer confidently, which is the habit this card is being cured of.
   */
  const state: CardState = isLoading
    ? {
        copy: 'dashboard.kycLoading',
        icon: Clock,
        tone: 'bg-muted text-muted-foreground',
        cta: false,
      }
    : pending
      ? { copy: 'dashboard.kycPending', icon: Clock, tone: 'bg-info/10 text-info', cta: false }
      : rejected
        ? reverification
          ? {
              // Asked to update, not refused — see `useKycAccess`.
              copy: 'dashboard.kycReverify',
              icon: ShieldAlert,
              tone: 'bg-warning/10 text-warning',
              cta: true,
            }
          : {
              copy: 'dashboard.kycRejected',
              icon: ShieldAlert,
              tone: 'bg-destructive/10 text-destructive',
              cta: true,
            }
        : {
            copy: 'dashboard.kycNotStarted',
            icon: ShieldAlert,
            tone: 'bg-warning/10 text-warning',
            cta: true,
          };

  const Icon = state.icon;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6">
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${state.tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-foreground">{t('dashboard.kycStatus')}</h2>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{t(state.copy)}</p>
      {/* No button when there is no action. An approved client has nothing to
          continue, and `saveStep` throws for a submission under review — so a
          CTA in either state leads to a page that refuses the client. */}
      {state.cta && (
        <div className="mt-5">
          <Button asChild variant="outline" size="sm">
            <Link href="/kyc">{t('profile.verificationCta')}</Link>
          </Button>
        </div>
      )}
    </article>
  );
}
