'use client';

import { useWithdrawalLimits } from '@/hooks/use-currency-scale';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Under the withdrawal amount: what the client has, and what the currency lets
 * them take out in one go and in a day (backend 0162) — in that currency's own
 * units, so an LBP wallet reads in millions.
 *
 * Shown so the client is told BEFORE submitting rather than refused after.
 * Display only: the server re-derives every limit and is the gate (R-5.1). The
 * range line is simply absent until the currency catalogue has loaded.
 */
export function WithdrawAmountHint({
  currency,
  available,
}: {
  currency: string;
  available: string;
}) {
  const limits = useWithdrawalLimits()(currency);
  return (
    <>
      {t('withdraw.available', { amount: formatMoney(available, currency) })}
      {limits && (
        <span className="block">
          {t('withdraw.limits', {
            min: formatMoney(limits.min, currency),
            max: formatMoney(limits.max, currency),
            daily: formatMoney(limits.daily, currency),
          })}
        </span>
      )}
    </>
  );
}
