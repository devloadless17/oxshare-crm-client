'use client';

import Decimal from 'decimal.js';
import { useWithdrawalLimits } from '@/hooks/use-currency-scale';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Under the withdrawal amount: what the client has, and the currency's range
 * for one withdrawal — its minimum and maximum, the only withdrawal limits there
 * are (owner, 29 Sep 2026) — in that currency's own units, so an LBP wallet reads
 * in millions.
 *
 * Shown so the client is told BEFORE submitting rather than refused after.
 * Display only: the server re-derives every limit and is the gate (R-5.1). The
 * range line is simply absent until the currency catalogue has loaded.
 */
export function WithdrawAmountHint({
  currency,
  available,
  amount = '',
}: {
  currency: string;
  available: string;
  /** What the client typed — checked here so the problem shows under the field. */
  amount?: string;
}) {
  const limits = useWithdrawalLimits()(currency);
  const problem = withdrawalAmountProblem(amount, currency, available, limits);
  return (
    <>
      {problem && (
        <span role="alert" className="block text-xs font-medium text-destructive">
          {problem}
        </span>
      )}
      {t('withdraw.available', { amount: formatMoney(available, currency) })}
      {limits && (
        <span className="block">
          {t('withdraw.limits', {
            min: formatMoney(limits.min, currency),
            max: formatMoney(limits.max, currency),
          })}
        </span>
      )}
    </>
  );
}

/**
 * What is wrong with this amount, said under the field before the client
 * presses anything: below the minimum, above the maximum, or more than they
 * have, or not a positive number. Null when it is fine.
 *
 * decimal.js, never `Number()`: these are NUMERIC(28,8) strings on a money path.
 */
/** A positive decimal number at all — the one check that cannot drift from the server's. */
export function isPositiveAmount(amount: string): boolean {
  try {
    const value = new Decimal(amount.trim());
    return value.isFinite() && value.greaterThan(0);
  } catch {
    return false;
  }
}

export function withdrawalAmountProblem(
  amount: string,
  currency: string,
  available: string,
  limits: { min: string; max: string } | undefined,
): string | null {
  if (!amount.trim()) return null;
  /*
   * Not a number, zero or negative is said HERE, in the client's words. Left to
   * the server it surfaced as the validator's own "amount must be a number
   * string" (found live, 3 Oct 2026).
   */
  let value: Decimal;
  try {
    value = new Decimal(amount.trim());
  } catch {
    return t('withdraw.amountInvalid');
  }
  if (!value.isFinite() || !value.greaterThan(0)) return t('withdraw.amountInvalid');
  if (limits && value.lessThan(limits.min)) {
    return t('withdraw.amountBelowMin', { min: formatMoney(limits.min, currency) });
  }
  if (limits && value.greaterThan(limits.max)) {
    return t('withdraw.amountAboveMax', { max: formatMoney(limits.max, currency) });
  }
  if (value.greaterThan(available)) {
    return t('withdraw.amountAboveAvailable', { available: formatMoney(available, currency) });
  }
  return null;
}
