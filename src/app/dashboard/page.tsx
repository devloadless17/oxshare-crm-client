import type { Metadata } from 'next';
import Link from 'next/link';
import { MonitorDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Dashboard — OXShare',
};

/**
 * The client's landing page, reduced to what actually exists.
 *
 * ## What left, and why nothing took its place
 *
 * This screen carried live balance cards, deposit and withdraw actions, and two
 * stat tiles reading "0 trading accounts" and "0 pending transactions". The
 * balances and the actions went with the money teardown.
 *
 * The two TILES went for a different reason, and it is worth keeping: they were
 * hardcoded zeros. The comment above them admitted no endpoint existed for
 * either, and a fabricated zero beside a real number is the exact failure this
 * repo has already fixed twice — a client holding three accounts was shown "0",
 * and a client holding $700 was shown "$0.00".
 *
 * So nothing replaces them. An emptier dashboard that tells the truth beats a
 * full one that invents figures, and the money rebuild brings back real numbers
 * with real endpoints behind them.
 *
 * ## What is left is real
 *
 * Verification, because it is genuinely the client's next action, and the
 * terminal download, because it works today. Both lead somewhere that exists.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-card p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
          {t('dashboard.title')}
        </h1>
        <p className="mt-1 text-xs md:text-sm text-muted-foreground">{t('dashboard.welcome')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-foreground">{t('dashboard.kycStatus')}</h2>
          <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
            {t('dashboard.kycVerified')}
          </p>
          <div className="mt-5">
            <Button asChild variant="outline" size="sm">
              <Link href="/kyc">{t('profile.verificationCta')}</Link>
            </Button>
          </div>
        </article>

        <article className="flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MonitorDown className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-foreground">{t('platforms.title')}</h2>
          <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
            {t('platforms.subtitle')}
          </p>
          <div className="mt-5">
            <Button asChild size="sm">
              <Link href="/platforms">{t('platforms.download')}</Link>
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}
