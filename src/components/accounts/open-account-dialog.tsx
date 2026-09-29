'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AccountTypeFields } from '@/components/accounts/account-type-fields';
import { apiErrorMessage } from '@/lib/api/errors';
import {
  tradingApi,
  type AccountType,
  type OpenedAccount,
  type SelfServiceAvailability,
  type TradingEnvironment,
} from '@/lib/api/trading';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The form that opens ONE trading account.
 *
 * Split from `open-account-button.tsx`, which is now only the control and the
 * three answers that replace it — loading, switched off, at the cap. The two do
 * different jobs: that file decides whether opening an account is offered at
 * all, this one asks what to open. They were one file until it outgrew the
 * repo's line limit, and the limit found a seam that was already there.
 *
 * Not exported beyond that button. The dialog needs `SelfServiceAvailability`,
 * which only the button fetches, so mounting it from anywhere else would mean
 * fetching that twice.
 */
/** What a demo account starts with unless the client says otherwise. */
const DEFAULT_DEMO_FUNDING = '10000';

export function OpenAccountDialog({
  environment,
  options,
  onClose,
}: {
  environment: TradingEnvironment;
  options: SelfServiceAvailability;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isDemo = environment === 'demo';

  const types: AccountType[] = isDemo ? options.demoTypes : options.liveTypes;
  const leverages = options.leverages;

  /*
   * ── The client picks a CURRENCY and a PRODUCT; the group falls out ────────
   *
   * The MT5 group is an implementation detail — `real\Standard\USD` means
   * nothing to a client — and it used to be the only thing this form asked
   * about, so choosing an account meant reading a server path. The two
   * questions behind it are the ones a person can actually answer: which
   * currency do I want to trade in, and which product am I opening.
   *
   * The schema makes that resolvable: `trading_product_groups` is unique on
   * (product, environment, currency), so the pair names exactly one group.
   *
   * ## Currencies come from what is OFFERED, not from the currency catalogue
   *
   * A currency with no group in this environment cannot open an account, so
   * listing every enabled currency would offer choices that fail at MT5. The
   * options are the distinct currencies across the groups this client is
   * offered — which already carries the agency filter, so a client under a
   * partner sees only what that partner sells.
   */
  /*
   * PRODUCT FIRST, then the currency it is offered in (owner, 29 Sep 2026).
   * The products in the order the API sent them — `offeredTo` orders by the
   * product's sort order then its name, so "first" is the broker's preference.
   */
  const products = React.useMemo(
    () => [...new Set(types.map((type) => type.product))].filter(Boolean),
    [types],
  );
  const [product, setProduct] = React.useState(products[0] ?? '');

  /** The currencies a product is offered in — demo, which asks no product: all of them. */
  const currenciesFor = React.useCallback(
    (chosen: string) =>
      [
        ...new Set(
          types.filter((type) => isDemo || type.product === chosen).map((type) => type.currency),
        ),
      ].filter(Boolean),
    [types, isDemo],
  );
  const currencies = React.useMemo(() => currenciesFor(product), [currenciesFor, product]);
  // Chosen FOR the client: the first currency the product is offered in.
  const [currency, setCurrency] = React.useState(currencies[0] ?? '');

  const [leverage, setLeverage] = React.useState(
    /*
     * The median rung, not the maximum: a default should not hand somebody the
     * riskiest leverage the broker allows.
     */
    String(leverages[Math.floor(leverages.length / 2)] ?? leverages[0] ?? 100),
  );
  const [startingBalance, setStartingBalance] = React.useState(isDemo ? DEFAULT_DEMO_FUNDING : '');
  const [opened, setOpened] = React.useState<OpenedAccount | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [needsKyc, setNeedsKyc] = React.useState(false);

  /*
   * The group, derived — never held in state.
   *
   * A stored group would survive a change of currency and send a pairing that
   * no longer matches what the form shows, which is the class of bug the
   * transfer screen's derived destination list exists to avoid.
   *
   * DEMO does not ask for a product, so it takes the first group offered in the
   * chosen currency. With one product that is the only group; with several it is
   * the broker's preferred one, by the ordering above.
   */
  const chosenType = isDemo
    ? types.find((type) => type.currency === currency)
    : types.find((type) => type.product === product && type.currency === currency);
  const group = chosenType?.group ?? '';
  /*
   * Sent WITH the group. One MT5 group may back several products (backend
   * 0142), so the pair — not the group — is what the client picked, and the
   * product decides what the account's trades pay.
   */
  const productId = chosenType?.productId;

  const create = useMutation({
    mutationFn: () =>
      tradingApi.openAccount({
        environment,
        ...(group ? { group } : {}),
        ...(productId ? { productId } : {}),
        ...(leverage ? { leverage: Number.parseInt(leverage, 10) } : {}),
        // No name (owner, 29 Sep 2026): the account is named after the client —
        // "First Last", then "First Last-2", "-3"… — by the server.
        // Demo only. The API REFUSES this on a live account rather than
        // ignoring it, so sending it would turn a valid request into an error.
        ...(isDemo && startingBalance.trim() ? { startingBalance: startingBalance.trim() } : {}),
      }),
    onSuccess: (account) => {
      setError(null);
      setNeedsKyc(false);
      setOpened(account);
      /*
       * `tradingAccounts.all()` reaches the list AND the transfer/deposit
       * pickers, which read `tradingAccounts.transferable()`. They used to be
       * separate roots, so a client could open an account and not find it in
       * the Transfer dropdown until a hard refresh.
       */
      void queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard.all() });
    },
    onError: (e: unknown) => {
      /*
       * KYC is a STATE with an action attached, not a failure to report. The
       * API answers with the same code the money endpoints use, so this offers
       * verification rather than a red message about what is not allowed.
       */
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'KYC_NOT_VERIFIED') {
        setNeedsKyc(true);
        setError(null);
        return;
      }
      setError(apiErrorMessage(e, t('accounts.openFailed')));
    },
  });

  if (opened) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accounts.openedTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
              <MailCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p className="text-xs leading-relaxed">
                {t('accounts.credentialsEmailed', { email: opened.credentialsSentTo })}
              </p>
            </div>

            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <Fact label={t('accounts.colLogin')} value={opened.login} mono />
              <Fact label={t('accounts.colCurrency')} value={opened.currency} />
              <Fact label={t('accounts.colLeverage')} value={`1:${opened.leverage}`} />
              <Fact
                label={t('accounts.colBalance')}
                value={formatMoney(opened.balance, opened.currency)}
              />
            </dl>

            <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              {t('accounts.credentialsNoCopy')}
            </p>

            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={onClose}>
                {t('accounts.openedDone')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/* `max-w-md` is the default and is too narrow for two columns of inputs;
          the width class only widens the CEILING, so the mobile
          `w-[calc(100%-2rem)]` still governs on a phone. */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isDemo ? t('accounts.openDemoTitle') : t('accounts.openLiveTitle')}
          </DialogTitle>
        </DialogHeader>

        {/*
          ONE FIELD PER ROW (owner, 29 Sep 2026), in the order a client answers:
          the product, the currency it is held in (filled in from the product),
          then the leverage. Demo asks no product. There is no name field: the
          server names the account after the client.
        */}
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <p className="text-xs text-muted-foreground">
            {isDemo ? t('accounts.demoBody') : t('accounts.liveBody')}
          </p>

          {needsKyc && (
            <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-xs leading-relaxed">{t('accounts.liveNeedsKyc')}</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/kyc">{t('accounts.verifyNow')}</Link>
                </Button>
              </div>
            </div>
          )}

          <AccountTypeFields
            products={products}
            product={product}
            onProduct={(next) => {
              setProduct(next);
              // The currency follows the product: its first offered currency.
              setCurrency(currenciesFor(next)[0] ?? '');
              setError(null);
            }}
            currencies={currencies}
            currency={currency}
            onCurrency={(next) => {
              setCurrency(next);
              setError(null);
            }}
            isDemo={isDemo}
          />

          <div className="space-y-1.5">
            <Label htmlFor="account-leverage" className="text-xs">
              {t('accounts.fieldLeverage')}
            </Label>
            <Select value={leverage} onValueChange={setLeverage}>
              <SelectTrigger id="account-leverage" className="h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leverages.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    1:{value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/*
            DEMO ONLY, and ABSENT rather than disabled on live. A greyed-out
            funding box invites "how do I enable this" — the answer is that it
            does not exist for real money, so neither should the field.
          */}
          {isDemo && (
            <div className="space-y-1.5">
              <Label htmlFor="account-funding" className="text-xs">
                {t('accounts.fieldStartingBalance')}
                {currency ? ` (${currency})` : ''}
              </Label>
              <Input
                id="account-funding"
                inputMode="decimal"
                value={startingBalance}
                onChange={(e) => {
                  // Digits and one dot. Kept as a STRING all the way to the API,
                  // like every other amount — see the money rule.
                  setStartingBalance(
                    e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'),
                  );
                  setError(null);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('accounts.startingBalanceHint', { max: formatCeiling(options.maxDemoDeposit) })}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('accounts.cancel')}
            </Button>
            {/*
              Disabled without a name as well as while the request is in flight.

              Two guards for one rule, and both earn their place: this is what a
              pointing device meets, and `required` on the input is what a
              keyboard submit meets. Only one of them is reachable at a time,
              which is why neither is redundant.
            */}
            {/*
              `loading`, not a hand-placed icon.

              This rendered lucide's `Loader2` at `h-4 w-4 animate-spin` — one of
              the fourteen spellings of "please wait" that `ui/loader.tsx` exists
              to have replaced, and its comment names this one. Three things were
              wrong with it and none were visible in isolation: it took its
              colour from the icon rather than from `currentColor`, so it did not
              follow the button's foreground; it was sized by hand, so it drifted
              from every other spinner; and `animate-spin` FREEZES under
              `prefers-reduced-motion`, because the blanket rule in globals.css
              cuts every animation to 0.001ms. A user with reduce-motion on
              watched a stationary arc while their account was being opened.

              `Button` already knows how to do this: it renders the shared
              `Spinner`, disables itself, and sets `aria-busy`. The remaining
              `disabled` is the two reasons that are NOT loading — Button ORs
              them.
            */}
            <Button type="submit" size="sm" loading={create.isPending}>
              {create.isPending ? t('accounts.opening') : t('accounts.openConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
/*
 * `accountTypeLabel` is GONE. It rendered an MT5 group path readably because
 * the form asked which GROUP to open — and a path is not a question anybody can
 * answer: `test\API\0-cl` reduced to `0-cl`, which tells a client nothing. The
 * form asks for the currency and product the group stood in for, and derives it.
 */

/**
 * `'1000000.00000000'` → `'1,000,000'`, for the hint text.
 *
 * `Intl.NumberFormat` is out on money paths because it takes a number. This
 * groups the integer part with string surgery and drops the fractional part
 * entirely — a ceiling stated to eight decimal places is noise, and this value
 * is never arithmetic, only prose.
 */
function formatCeiling(amount: string): string {
  const whole = amount.split('.')[0] ?? amount;
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`truncate font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
