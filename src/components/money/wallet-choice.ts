import { moneyText } from '@/lib/bidi';
import { localized, t } from '@/lib/i18n';

/*
 * WHICH WALLET A PAYOUT RAIL CAN PAY OUT OF (backend 0173) — the withdraw
 * screen's rule, pure, so the page stays a page.
 */

/**
 * Can this rail pay out of a wallet in this currency? A method's payout channel
 * names the wallet currencies it serves (backend 0173) — a 3pay USDT method
 * pays USD wallets at par, nothing else — and null means any. The server
 * refuses the rest with the same sentence; the screen just never offers them.
 */
export function paysOut(
  method: { currencies?: string[] | null } | undefined,
  currency: string,
): boolean {
  return !method?.currencies || method.currencies.includes(currency);
}

/** The chosen wallet if this rail pays out of it, else the first funded one it does. */
export function walletFor<W extends { currency: string }>(
  method: { currencies?: string[] | null } | undefined,
  funded: readonly W[],
  current: string,
): string {
  if (paysOut(method, current)) return current;
  return funded.find((w) => paysOut(method, w.currency))?.currency ?? current;
}

/** A payout method's name in the reader's language (`nameAr`, 0179). */
export function methodName(method: { name: string; nameAr?: string | null }): string {
  return localized(method.name, method.nameAr);
}

/** The line under a wallet tile: its balance, or why this rail cannot use it. */
export function walletNote(
  method: { name: string; nameAr?: string | null; currencies?: string[] | null } | undefined,
  available: string,
  currency: string,
): string {
  return paysOut(method, currency)
    ? t('money.availableBalance', { amount: moneyText(available, currency) })
    : t('withdraw.paysOutOnly', {
        method: method ? methodName(method) : '',
        currencies: (method?.currencies ?? []).join(t('common.listSeparator')),
      });
}
