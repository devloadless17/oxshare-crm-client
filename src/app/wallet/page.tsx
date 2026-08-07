'use client';

import { AsyncBoundary } from '@/components/async-boundary';
import { WalletCard } from '@/components/wallet/wallet-card';
import { useUser } from '@/context/UserContext';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type WalletCurrency } from '@/lib/api/wallet';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The client's balances, and the three things they can do with them.
 *
 * ## A missing wallet is not a zero
 *
 * This is the rule the whole screen turns on, and it is here because this page
 * broke it: it rendered a literal `$0.00` while `GET /wallet` worked, so a
 * client holding $700 was shown nothing. The backend rows a wallet only once it
 * exists, so a currency absent from the response has genuinely NOT BEEN OPENED
 * — which is a different sentence from "you have no money", and is rendered as
 * one. An em dash and an explanation, never a fabricated number.
 *
 * `WalletCard` carries that rule now; the redesign into card form deliberately
 * did not relax it, because a more attractive card is exactly the sort of change
 * that quietly reintroduces a plausible-looking zero.
 *
 * ## The actions live beside the number
 *
 * Deposit, Withdraw and Transfer are `MoneyAction`s rendered under each card,
 * and these cards are the only way into those routes — see the note on
 * `NAV_ITEMS`. Moving money is something a client decides while LOOKING at a
 * balance, so the control belongs next to the figure they are deciding against
 * rather than in a navigation rail two slots away from it.
 */

/**
 * Presentation order for the balance cards, and the only place the two
 * currencies are named on this screen.
 *
 * `WalletCurrency` is the generated enum, so adding a third currency
 * backend-side makes this a compile error rather than a card that silently
 * never renders.
 *
 * MESSAGE KEYS, not resolved strings — the same shape as `NAV_ITEMS`, and for
 * the reason `kycNavBadge` records: `t()` at module scope is evaluated once at
 * import and never again, so a constant built that way keeps the language it
 * was imported in for the life of the tab. `t()` is called in the render below
 * instead.
 */
const CURRENCIES: { code: WalletCurrency; label: MessageKey; note: MessageKey }[] = [
  { code: 'USD', label: 'wallet.usdWallet', note: 'wallet.usdNote' },
  { code: 'USDT', label: 'wallet.usdtWallet', note: 'wallet.usdtNote' },
];

export default function WalletPage() {
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));
  const { user } = useUser();

  const byCurrency = new Map((wallets.data ?? []).map((w) => [w.currency, w]));

  /*
   * The name embossed on the card foot.
   *
   * Undefined rather than a placeholder when the profile has no name on it: a
   * card reading "Client User" is fabricated identity on the customer-facing
   * app, which is the same class of mistake as a fabricated balance. The card
   * simply omits the line.
   */
  const holder = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('wallet.heading')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('wallet.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={wallets.status}
        label={t('wallet.loading')}
        endpoints={['GET /wallet']}
        onRetry={() => wallets.refetch()}
        errorMessage={apiErrorMessage(wallets.error, t('wallet.loadFailed'))}
        error={wallets.error}
      >
        {/*
          `xl:grid-cols-2`, not `md:` — the card has a fixed 1.6 aspect ratio and
          a `max-w-md` cap, so two of them side by side need real width before
          the pair stops feeling cramped against the sidebar. Below that they
          stack, which is also the phone layout this portal is primarily read on.
        */}
        <div className="grid gap-8 xl:grid-cols-2">
          {CURRENCIES.map(({ code, label, note }) => (
            <WalletCard
              key={code}
              label={t(label)}
              note={t(note)}
              currency={code}
              wallet={byCurrency.get(code)}
              holder={holder}
            />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}
