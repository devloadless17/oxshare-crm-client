'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AccountType } from '@/lib/api/trading';
import { t } from '@/lib/i18n';

/**
 * The two questions that decide the MT5 group: CURRENCY and PRODUCT.
 *
 * The group itself is never shown. `real\Standard\USD` is the broker's filing
 * system, not something a client can choose between — so the form asks what the
 * path stands for and the caller derives the group from the pair.
 * `trading_product_groups` is unique on (product, environment, currency), which
 * is what makes the pair resolvable to exactly one.
 *
 * Presentational on purpose: the lists and the derivation live with the caller,
 * which is the component that has to send the resolved group. Splitting the
 * fields off keeps this file about layout and that one about the request.
 */
export function AccountTypeFields({
  currencies,
  currency,
  onCurrency,
  productsForCurrency,
  product,
  onProduct,
  isDemo,
}: {
  /** Distinct currencies across the groups offered — never the whole catalogue. */
  currencies: string[];
  currency: string;
  onCurrency: (next: string) => void;
  /** The offered groups in the chosen currency, in the broker's own order. */
  productsForCurrency: AccountType[];
  product: string;
  onProduct: (next: string) => void;
  /** Demo asks no product — it takes the first offered in the currency. */
  isDemo: boolean;
}) {
  const only = productsForCurrency.length === 1 ? productsForCurrency[0] : undefined;

  return (
    <>
      {/*
        CURRENCY FIRST: it narrows the products, and an account is denominated
        once and cannot be re-denominated. A single option still gets a dropdown
        rather than a hidden field — a client should see what it will be held in.
      */}
      {currencies.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="account-currency" className="text-xs">
            {t('accounts.fieldCurrency')}
          </Label>
          <Select value={currency} onValueChange={onCurrency}>
            <SelectTrigger id="account-currency" className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/*
        PRODUCT — live only. Demo takes the first product in the chosen currency:
        practice money on "Standard" rather than "Raw Spread" is not a decision
        worth reading about before trying the platform. Hidden, not disabled,
        when a currency carries exactly one — a select that cannot be changed is
        a label wearing a control's clothes.
      */}
      {!isDemo && productsForCurrency.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="account-product" className="text-xs">
            {t('accounts.fieldProduct')}
          </Label>
          <Select value={product} onValueChange={onProduct}>
            <SelectTrigger id="account-product" className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {productsForCurrency.map((type) => (
                <SelectItem key={type.group} value={type.product}>
                  {type.product}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!isDemo && only && (
        <p className="text-[11px] text-muted-foreground">
          {t('accounts.onlyProduct', { product: only.product })}
        </p>
      )}
    </>
  );
}
