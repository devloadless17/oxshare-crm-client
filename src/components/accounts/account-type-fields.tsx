'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/**
 * The two questions that decide the MT5 group: PRODUCT, then CURRENCY.
 *
 * The group itself is never shown. `real\Standard\USD` is the broker's filing
 * system, not something a client can choose between — so the form asks what the
 * path stands for and the caller derives the group from the pair.
 * `trading_product_groups` is unique on (product, environment, currency), which
 * is what makes the pair resolvable to exactly one.
 *
 * PRODUCT FIRST (owner, 29 Sep 2026): a client chooses what they are opening,
 * and the currency follows from it — chosen for them from the currencies that
 * product is offered in (the first, in the broker's order), still changeable
 * when there are several. Demo asks for the product too since backend 0201,
 * when any number of demo products may exist.
 *
 * Presentational on purpose: the lists and the derivation live with the caller,
 * which is the component that has to send the resolved group.
 */
export function AccountTypeFields({
  products,
  productLabel = (name) => name,
  product,
  onProduct,
  currencies,
  currency,
  onCurrency,
  isUnavailable = () => false,
}: {
  /** The products offered, in the broker's own order. */
  products: string[];
  /** What the reader sees for a product (its Arabic); the value stays the English name. */
  productLabel?: (name: string) => string;
  product: string;
  onProduct: (next: string) => void;
  /** The currencies the chosen product is offered in (demo: every offered currency). */
  currencies: string[];
  currency: string;
  onCurrency: (next: string) => void;
  /**
   * A product the client may not open now — at its cap (backend 0201). Shown,
   * labelled by `productLabel`, and not choosable.
   */
  isUnavailable?: (name: string) => boolean;
}) {
  return (
    <>
      {products.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="account-product" className="text-xs">
            {t('accounts.fieldProduct')}
          </Label>
          <Select value={product} onValueChange={onProduct}>
            <SelectTrigger id="account-product" className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {products.map((name) => (
                <SelectItem key={name} value={name} disabled={isUnavailable(name)}>
                  {productLabel(name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/*
        Shown even with one option, so the client sees what the account will be
        held in — an account is denominated once and cannot be re-denominated.
        Filled in from the product; a select only matters when it has several.
      */}
      {currencies.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="account-currency" className="text-xs">
            {t('accounts.fieldCurrency')}
          </Label>
          <Select value={currency} onValueChange={onCurrency} disabled={currencies.length === 1}>
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
    </>
  );
}
