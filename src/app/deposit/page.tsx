'use client';

import { BackendPending } from '@/components/backend-pending';
import { t } from '@/lib/i18n';

/**
 * Deposit — CORE-06, and honestly unbuilt.
 *
 * This route exists so that "Deposit" stops being a Next 404 in the customer's
 * primary navigation. It does NOT pretend to work.
 *
 * `TransactionsService.creditDeposit()` is written and correct, but the only
 * thing that would call it is a Whish or USDT provider webhook, and those are
 * blocked on credentials (ARCHITECTURE §12.5, DECISIONS D-05). There is no HTTP
 * route a client can reach, so there is nothing for a form to submit to.
 *
 * The house rule is explicit about this case: "A screen without a backend
 * renders BackendPending, naming what is missing. Never render mock or
 * placeholder data." A deposit form that collected an amount and had nowhere to
 * send it would be worse than a 404 — a 404 is obviously broken, whereas a form
 * that accepts input and silently does nothing looks like it worked.
 */
export default function DepositPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('deposit.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('deposit.subtitle')}</p>
      </div>

      <BackendPending
        endpoints={[
          'POST /payments/deposits — not built (blocked on Whish/USDT credentials, §12.5)',
          'POST /webhooks/payments/:provider — not built',
        ]}
      />
    </div>
  );
}
