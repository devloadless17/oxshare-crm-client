'use client';

import { walletName } from '@/lib/wallet-name';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CommissionTransferDialog } from '@/components/partner/commission-transfer-dialog';
import {
  EmptyPanel,
  Pill,
  SectionHeader,
  Surface,
  formatDate,
} from '@/components/partner/partner-ui';
import type { Wallet } from '@/lib/api/wallet';
import { currenciesApi } from '@/lib/api/currencies';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi } from '@/lib/api/partner';
import { useResource } from '@/hooks/use-resource';
import { keys } from '@/lib/query-keys';
import { compareMoney, isZeroMoney } from '@/lib/money';
import { moneyText } from '@/lib/bidi';
import { t } from '@/lib/i18n';

/**
 * A partner's earnings, one balance per currency, and the control that moves
 * each of them.
 *
 * ## THIS IS THE MULTI-CURRENCY ANSWER, and it is why the card metaphor went
 *
 * A partner does not choose what they earn in: an accrual takes the currency of
 * the trade that produced it, so a partner whose clients trade in two currencies
 * ends up holding two commission wallets. The server already handles that
 * correctly — `openCommissionWallet` opens the DEFAULT currency at approval, and
 * `WalletService.post` opens any other lazily on the first confirmed commission
 * in it, so `GET /ib/overview.commissionWallets` is a complete list of every
 * currency the partner holds.
 *
 * The screen was the part that did not handle it. It drew ONE credit-card object
 * and put the rest behind a carousel, so a partner with two balances saw one and
 * a swipe hint — on the screen whose entire job is telling them what they have.
 * Worse, a carousel makes the money control ambiguous: after a swipe lands
 * mid-animation, "Move to wallet" acts on a card the reader cannot be certain
 * of.
 *
 * Every currency is now a cell in one grid, each with its own labelled amount
 * and its own named button. It reads at a glance at one currency and at five,
 * and no control is ever ambiguous about which balance it moves.
 *
 * ## NO WALLET IS NOT A ZERO
 *
 * The rule /wallet turns on, and it holds here. A partner with no commission
 * wallet at all has never been credited — the wallet is opened by the first
 * confirmed accrual, or at approval — which is a different sentence from "you
 * earned nothing and spent it". That state is a panel that says so, never
 * `$0.00`.
 *
 * A wallet that EXISTS and holds zero is a third state and reads differently
 * again: they have been paid and have already moved it. That one does show a
 * zero, because it is a true balance rather than a missing one.
 *
 * ## The exit is the same one the backend offers, and only that one
 *
 * Same currency, into the main wallet, where withdraw and trading-account
 * transfer already work unchanged. There is no cross-currency option because
 * there is no FX source in this system — the same constraint that stops the
 * totals above being added together.
 */
export function CommissionBalances({ wallets }: { wallets: Wallet[] }) {
  /*
   * Largest first, so the balance most worth acting on leads.
   *
   * `compareMoney`, never `Number(a) - Number(b)` — that loses precision before
   * comparing — and never `localeCompare`, which sorts '9.00' above '100.00'. A
   * partner holding two currencies hits the second on the first mixed row.
   */
  const sorted = React.useMemo(
    () => [...wallets].sort((a, b) => compareMoney(b.available, a.available)),
    [wallets],
  );

  /*
   * Every OFFERED currency the partner holds no commission wallet in, as a cell
   * they can open (owner, 26 Sep 2026). Adding a currency opens no wallets for
   * anybody; the partner opens the ones they want. Commission is still credited
   * into a wallet opened on the first confirmed payout, so this is about seeing
   * the balance before then, never about being able to earn.
   */
  const currencies = useResource(keys.currencies.all(), (signal) => currenciesApi.list(signal));
  const held = new Set(wallets.map((wallet) => wallet.currency));
  const unopened = (currencies.data ?? []).filter((currency) => !held.has(currency.code));

  const queryClient = useQueryClient();
  const openWallet = useMutation({
    mutationFn: (currency: string) => partnerApi.openCommissionWallet(currency),
    onSuccess: (wallet) => {
      void queryClient.invalidateQueries({ queryKey: keys.partner.overview() });
      toast.success(t('partner.commissionWalletOpened', { currency: wallet.currency }));
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, t('partner.commissionWalletOpenFailed'))),
  });
  const cells = sorted.length + unopened.length;

  return (
    <Surface>
      <SectionHeader
        title={t('partner.balancesHeading')}
        description={t('partner.commissionNote')}
        /* The count is only worth showing once there is more than one currency:
           a lone "1" in the corner of a panel holding one balance is a number
           with nothing to compare against. */
        meta={sorted.length > 1 ? t('partner.balancesCount', { count: sorted.length }) : undefined}
      />

      {cells === 0 ? (
        <EmptyPanel
          icon={Coins}
          title={t('partner.commissionEmpty')}
          body={t('partner.commissionEmptyBody')}
        />
      ) : (
        /*
         * The column count follows the number of balances, rather than being a
         * fixed three.
         *
         * A single wallet in a three-column grid left two thirds of the panel
         * empty — the state MOST partners are in, since commission is opened in
         * the default currency at approval and a second currency only appears if
         * their clients trade in one. The sole cell now takes the full width and
         * lays itself out along that width instead.
         */
        <div
          className={`grid gap-px bg-border ${
            cells === 1 ? '' : cells === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
          }`}
        >
          {sorted.map((wallet) => (
            <BalanceCell key={wallet.id} wallet={wallet} sole={cells === 1} />
          ))}
          {unopened.map((currency) => (
            <UnopenedCell
              key={currency.code}
              currency={currency.code}
              sole={cells === 1}
              opening={openWallet.isPending && openWallet.variables === currency.code}
              onOpen={() => openWallet.mutate(currency.code)}
            />
          ))}
        </div>
      )}
    </Surface>
  );
}

function BalanceCell({ wallet, sole }: { wallet: Wallet; sole: boolean }) {
  const [open, setOpen] = React.useState(false);
  const empty = isZeroMoney(wallet.available);

  return (
    /* One cell in a column of them, and laid out ALONG the row when it is the
       only one — identical content either way, so the panel never has a dead
       half and the eye never has to learn a second arrangement. */
    <div
      className={`flex flex-col gap-4 bg-card p-5 ${
        sole ? 'sm:flex-row sm:items-center sm:justify-between sm:gap-8' : ''
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {/*
            THE WALLET'S OWN NAME, as the server generates it.

            It read "Available" — true of every balance on the screen, and of
            the main wallet balance elsewhere in the portal, so it said nothing
            about WHICH wallet this cell is. The name says it is the commission
            wallet, which is the fact a partner is looking for when they came
            here to move earnings out.
          */}
          <p className="truncate text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {walletName(wallet)}
          </p>
          {/* The CODE, so two balances are never told apart by their symbol
              alone — several currencies share '$'. */}
          <Pill tone="neutral">{wallet.currency}</Pill>
        </div>

        {/*
          The amount is the cell. `break-all` so a long balance wraps inside its
          own column instead of widening the grid, and `tabular-nums` so a
          refresh does not shift the digits sideways.
        */}
        <p className="mt-1.5 text-2xl font-semibold tracking-tight break-all tabular-nums">
          {moneyText(wallet.available, wallet.currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('partner.balanceOpened', { date: formatDate(wallet.createdAt) })}
        </p>
      </div>

      {/*
        Disabled on an empty wallet rather than hidden. A control that
        disappears is indistinguishable from a feature that does not exist, and
        a partner who moved their balance yesterday would come back to a cell
        with nothing on it and no explanation.

        The button NAMES its currency even when there is only one. Every cell
        would read identically otherwise, and a money control that says the same
        thing beside two different balances is the ambiguity this layout exists
        to remove.
      */}
      <Button
        type="button"
        size="sm"
        className={sole ? 'w-full shrink-0 sm:w-auto' : 'w-full'}
        disabled={empty}
        onClick={() => setOpen(true)}
      >
        {t('partner.commissionTransferNamed', { currency: wallet.currency })}
      </Button>

      {/* Kept MOUNTED while closed rather than rendered conditionally: the
          dialog animates on close, and unmounting it the instant `open` flips
          would cut that animation off mid-way. */}
      <CommissionTransferDialog wallet={wallet} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * A currency the partner holds no commission wallet in: not a zero, and says
 * so, with the button that opens it. Same anatomy as `BalanceCell` so the grid
 * reads as one set of currencies.
 */
function UnopenedCell({
  currency,
  sole,
  opening,
  onOpen,
}: {
  currency: string;
  sole: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className={`flex flex-col gap-4 bg-card p-5 ${
        sole ? 'sm:flex-row sm:items-center sm:justify-between sm:gap-8' : ''
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t('partner.commissionWalletLabel')}
          </p>
          <Pill tone="neutral">{currency}</Pill>
        </div>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-muted-foreground">—</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('partner.commissionNotOpened')}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={sole ? 'w-full shrink-0 sm:w-auto' : 'w-full'}
        loading={opening}
        onClick={onOpen}
      >
        {t('partner.openCommissionWallet', { currency })}
      </Button>
    </div>
  );
}
