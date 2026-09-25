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
  return (
    <>
      {/*
        CURRENCY BEFORE PRODUCT: it narrows the products, and an account is
        denominated once and cannot be re-denominated. A single option still gets
        a dropdown rather than a hidden field — a client should see what it will
        be held in, and the product field below now follows the same rule.

        These two are the middle of the form's sequence, not its start. The
        caller renders the account NAME above them — see the note there.
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
        PRODUCT — live only, and ALWAYS a select when one is offered.

        It used to hide itself when a currency carried exactly one product,
        replacing the control with the sentence "Opening a Standard account." The
        reasoning was that a select which cannot be changed is a label wearing a
        control's clothes — true in isolation, and wrong beside the currency
        field directly above it, which renders a one-option dropdown on the
        explicit ground that "a client should see what it will be held in". Two
        adjacent answers to the same question, and the form's most-asked question
        was the one that disappeared.

        What the client saw was a dialog with no product field at all, and a line
        of prose where a control belongs is not where anybody looks for one. The
        product also decides the spread and the commission the account trades on,
        so it is the field a client most wants to confirm before pressing open —
        and, once accounts exist, the one that tells two of them apart.

        A single-option select is honest about that: it shows what is being
        opened, in the same shape as every other choice on the form, and it grows
        a second row the day the broker sells a second product without this file
        changing.

        Demo still asks nothing and takes the first product in the chosen
        currency: practice money on "Standard" rather than "Raw Spread" is not a
        decision worth reading about before trying the platform.
      */}
      {!isDemo && productsForCurrency.length > 0 && (
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
                // Keyed by PRODUCT: one MT5 group may back several products
                // since backend 0142, so the group is no longer unique here.
                <SelectItem key={type.product} value={type.product}>
                  {type.product}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
