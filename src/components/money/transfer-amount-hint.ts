import { isPositiveAmount } from '@/components/money/withdraw-amount-hint';
import { compareMoney } from '@/lib/money';
import { moneyText } from '@/lib/bidi';
import { t } from '@/lib/i18n';

/**
 * Is this amount below the account's product minimum (backend 0201)?
 *
 * EVERY transfer INTO an account on a product group with a minimum must reach
 * it (the owner's ruling). Compared through decimal.js, never as numbers (§6.1).
 * The server is still the judge and answers under the same field; this only
 * stops a request it would refuse.
 */
export function belowMinimum(amount: string, minimum: string | null): boolean {
  return minimum !== null && isPositiveAmount(amount) && compareMoney(amount, minimum) < 0;
}

/**
 * The line under the transfer amount: a malformed amount, else the minimum it
 * falls short of, else what can be spent and the minimum per transfer in.
 */
export function transferAmountHint({
  amount,
  spendable,
  minimum,
  currency,
}: {
  amount: string;
  spendable: string | undefined;
  /** The account's minimum per transfer in — null on transfers OUT, or none set. */
  minimum: string | null;
  currency: string;
}): string | undefined {
  if (amount.trim() && !isPositiveAmount(amount)) return t('withdraw.amountInvalid');
  if (minimum !== null && belowMinimum(amount, minimum)) {
    return t('transfer.belowMinimum', { amount: moneyText(minimum, currency) });
  }
  const parts = [
    spendable && t('money.availableBalance', { amount: moneyText(spendable, currency) }),
    minimum && t('transfer.minimumInto', { amount: moneyText(minimum, currency) }),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
