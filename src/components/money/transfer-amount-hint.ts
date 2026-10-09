import { isPositiveAmount } from '@/components/money/withdraw-amount-hint';
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
export function transferAmountHint({
  amount,
  spendable,
  currency,
}: {
  amount: string;
  spendable: string | undefined;
  currency: string;
}): string | undefined {
  if (amount.trim() && !isPositiveAmount(amount)) return t('withdraw.amountInvalid');
  // No per-transfer minimum: the product minimum is checked once, when the
  // account is opened (backend, 9 Oct 2026).
  return spendable
    ? t('money.availableBalance', { amount: moneyText(spendable, currency) })
    : undefined;
}
