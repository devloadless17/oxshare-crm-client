import type { Metadata } from 'next';
import { BackendPending } from '@/components/backend-pending';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Trading Accounts — OXShare' };

/**
 * The client's MT5 accounts — waiting on the endpoint that lists them.
 *
 * ## Why nothing is rendered instead
 *
 * This screen once carried a full live/demo layout backed by
 * `GET /trading/accounts`. That route does not exist on the rebuilt backend,
 * and the version before THAT is the reason this file is a placeholder rather
 * than an optimistic restore: it rendered a fixed "No Active Trading Accounts"
 * empty state for everyone, unconditionally, with no request behind it — so a
 * client who held three live accounts was told they had none.
 *
 * That is the same failure as the wallet showing a hardcoded `$0.00` to someone
 * holding $700, and it is why "a screen with no data says so, never renders a
 * plausible nothing" is this repo's hardest rule. An empty-looking accounts page
 * and a genuinely empty accounts page are indistinguishable to the person
 * reading them, and only one of them is true.
 *
 * The list layout is not lost — `git show 34c85c5^:src/app/accounts/page.tsx`
 * has it, along with the reasoning for keeping live and demo as separate
 * sections and for showing no balances (equity lives in MT5, not in the CRM).
 * Restore it when the endpoint lands; the `accounts.*` message keys are all
 * still in the catalogue for it.
 */
export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('accounts.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('accounts.subtitle')}</p>
      </div>

      <BackendPending endpoints={['GET /trading/accounts']} />
    </div>
  );
}
