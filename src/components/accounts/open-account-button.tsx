'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MailCheck, Plus, ShieldAlert } from 'lucide-react';
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
import { useResource } from '@/hooks/use-resource';
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

/**
 * Open a trading account of ONE environment.
 *
 * ## One button per tab, not one button offering a choice
 *
 * The first cut was a single button whose dialog asked live-or-demo. Once the
 * page became tabs that was wrong twice over: a client standing in the Demo tab
 * was asked again which kind they wanted, and could answer "live" from inside
 * it. The environment is the tab, so the button inherits it and the dialog asks
 * only what it does not already know.
 *
 * ## Availability is asked, not assumed
 *
 * `GET /trading/accounts/self-service` says which environments the broker has
 * switched on. A tab whose environment is off shows no button rather than one
 * that fails: offering something the API will refuse teaches a client that a
 * feature is not for them by making them press it.
 */
export function OpenAccountButton({
  environment,
  held,
  explainWhenClosed = false,
  variant = 'default',
}: {
  environment: TradingEnvironment;
  /**
   * How many accounts of this environment the client already has.
   *
   * Passed in rather than fetched: the page is already rendering them, so
   * comparing against the cap costs nothing and needs no second request.
   */
  held: number;
  /**
   * Say WHY when this environment is switched off, instead of rendering
   * nothing.
   *
   * Set on the empty state and not on the toolbar. An empty tab with no button
   * and no explanation reads as a broken page — the honest reading is "the
   * broker has not enabled this online yet", and the client cannot get there on
   * their own. In the toolbar, beside accounts they already hold, the same
   * sentence is standing noise.
   */
  explainWhenClosed?: boolean;
  variant?: 'default' | 'outline';
}) {
  const [open, setOpen] = React.useState(false);

  const availability = useResource<SelfServiceAvailability>(
    ['trading-accounts', 'self-service'],
    (signal) => tradingApi.getSelfServiceAvailability(signal),
  );

  // Nothing while we do not yet know: a button that appears a second late beats
  // one that appears and then vanishes.
  const options = availability.data;
  if (!options) return null;

  /*
   * The door is shut for this environment — the broker has configured no
   * account types for it. Usually that is live accounts on a deployment whose
   * MT5 manager account has not been granted a real group yet.
   */
  if (!options[environment]) {
    if (!explainWhenClosed) return null;
    return (
      <p className="max-w-sm text-xs text-muted-foreground">
        {environment === 'live' ? t('accounts.liveClosed') : t('accounts.demoClosed')}
      </p>
    );
  }

  /*
   * At the cap, the button is REPLACED by the reason rather than removed or
   * disabled.
   *
   * Removed, a client who opened five demo accounts finds the control gone and
   * assumes a bug. Disabled, they hover a dead button looking for a tooltip.
   * One line naming the limit answers the question they are about to ask
   * support, and it is the same limit the API enforces.
   */
  const cap = environment === 'live' ? options.maxLiveAccounts : options.maxDemoAccounts;
  if (held >= cap) {
    return (
      <p className="text-xs text-muted-foreground">{t('accounts.capReached', { max: cap })}</p>
    );
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {environment === 'live' ? t('accounts.openLive') : t('accounts.openDemo')}
      </Button>
      {open && (
        <OpenAccountDialog
          environment={environment}
          options={options}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** What a demo account starts with unless the client says otherwise. */
const DEFAULT_DEMO_FUNDING = '10000';

function OpenAccountDialog({
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
  const currencies = React.useMemo(
    () => [...new Set(types.map((type) => type.currency))].filter(Boolean).sort(),
    [types],
  );

  const [currency, setCurrency] = React.useState(currencies[0] ?? '');

  /*
   * The products available IN THE CHOSEN CURRENCY, in the order the API sent
   * them — `offeredTo` orders by the product's sort order then its name, so
   * "first offered" is the broker's own preference rather than an accident of
   * iteration.
   */
  const productsForCurrency = React.useMemo(
    () => types.filter((type) => type.currency === currency),
    [types, currency],
  );

  const [product, setProduct] = React.useState(productsForCurrency[0]?.product ?? '');

  const [leverage, setLeverage] = React.useState(
    /*
     * The median rung, not the maximum: a default should not hand somebody the
     * riskiest leverage the broker allows.
     */
    String(leverages[Math.floor(leverages.length / 2)] ?? leverages[0] ?? 100),
  );
  const [name, setName] = React.useState('');
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
  const group = isDemo
    ? (productsForCurrency[0]?.group ?? '')
    : (productsForCurrency.find((type) => type.product === product)?.group ?? '');

  const create = useMutation({
    mutationFn: () =>
      tradingApi.openAccount({
        environment,
        ...(group ? { group } : {}),
        ...(leverage ? { leverage: Number.parseInt(leverage, 10) } : {}),
        // Omitted rather than sent empty: the API falls back to the client's own
        // name, which is what MT5 expects in that field.
        ...(name.trim() ? { name: name.trim() } : {}),
        // Demo only. The API REFUSES this on a live account rather than
        // ignoring it, so sending it would turn a valid request into an error.
        ...(isDemo && startingBalance.trim() ? { startingBalance: startingBalance.trim() } : {}),
      }),
    onSuccess: (account) => {
      setError(null);
      setNeedsKyc(false);
      setOpened(account);
      void queryClient.invalidateQueries({ queryKey: ['trading-accounts'] });
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isDemo ? t('accounts.openDemoTitle') : t('accounts.openLiveTitle')}
          </DialogTitle>
        </DialogHeader>

        {/*
          TWO COLUMNS from `sm` up, ONE below it.

          The form grew from one field to four, and stacked they pushed the
          submit button off a laptop screen — a dialog that scrolls to reach its
          own confirm button is a dialog people abandon. The pairs are read
          together anyway: type with leverage (the terms), name with balance
          (what this particular account is).

          Everything that is not a field spans both columns, so the intro, the
          KYC notice, the error and the buttons stay full width at every size.
        */}
        <form
          className="grid gap-x-4 gap-y-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {isDemo ? t('accounts.demoBody') : t('accounts.liveBody')}
          </p>

          {needsKyc && (
            <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 sm:col-span-2">
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
            currencies={currencies}
            currency={currency}
            onCurrency={(next) => {
              setCurrency(next);
              /*
                The product is re-chosen with the currency, never carried
                across. Products are not offered in every currency, so a kept
                selection can name a pairing that has no group, and the form
                would look complete while resolving to nothing.
              */
              setProduct(types.find((type) => type.currency === next)?.product ?? '');
              setError(null);
            }}
            productsForCurrency={productsForCurrency}
            product={product}
            onProduct={(next) => {
              setProduct(next);
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
            <p className="text-[11px] text-muted-foreground">{t('accounts.leverageHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-name" className="text-xs">
              {t('accounts.fieldName')}
            </Label>
            <Input
              id="account-name"
              maxLength={64}
              placeholder={t('accounts.namePlaceholder')}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            <p className="text-[11px] text-muted-foreground">{t('accounts.nameHint')}</p>
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
            <p role="alert" className="text-xs font-medium text-destructive sm:col-span-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('accounts.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
