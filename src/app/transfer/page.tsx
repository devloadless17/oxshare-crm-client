import type { Metadata } from 'next';
import { BackendPending } from '@/components/backend-pending';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Transfer — OXShare' };

/**
 * Wallet ⇄ trading account, and honestly unfinished.
 *
 * ## Why this is a placeholder rather than a form
 *
 * `POST /payments/transfers` exists and works. What does not exist is any way
 * for this app to learn WHICH accounts the client holds: there is no
 * `GET /trading/accounts`. The request body requires a `tradingAccountId`, so a
 * form here would need an account picker with nothing to populate it.
 *
 * The tempting shortcuts are both worse than this screen. A free-text field for
 * an account id asks a client to type a UUID they have never seen and, on a
 * money path, invites a typo that either 422s or — the day another endpoint
 * leaks one — moves money somewhere unintended. A fabricated list is the exact
 * failure this repo has fixed twice: `/accounts` once rendered "No Active
 * Trading Accounts" to everyone with no request behind it, so a client holding
 * three was told they had none.
 *
 * So: nothing invented, the gap named in `endpoints` for whoever wires it, and
 * a screen that says what it is waiting on. Build the picker the day
 * `GET /trading/accounts` lands — `paymentsApi.requestTransfer` is written and
 * takes its idempotency key as a parameter, so the form is the only piece
 * missing.
 *
 * A SERVER component, unlike its siblings: there is no request, no state and no
 * handler here, so the metadata lives in the file rather than only in the
 * layout. It gains the `layout.tsx` wrapper anyway, because that is what mounts
 * `PortalLayout` — and with it `RequireAuth`, whose KYC gate covers /transfer.
 */
export default function TransferPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('transfer.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('transfer.subtitle')}</p>
      </header>

      <BackendPending endpoints={['GET /trading/accounts']} />
    </div>
  );
}
