'use client';

import Decimal from 'decimal.js';
import { TileGroups, type TileGroup } from '@/components/money/tile-groups';
import { AmountField, AmountPresets, MoneySection } from '@/components/money/money-shell';
import type { PaymentMethod } from '@/lib/api/deposits';
import type { TradingAccount } from '@/lib/api/trading';
import type { Wallet } from '@/lib/api/wallet';
import { DISPLAY_SCALE, formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The per-method half of the deposit screen — two sections of the one card.
 *
 * ## One form, because both flows ask the same two questions
 *
 * Where the money should go, and how much. A gateway client pays immediately
 * afterwards and a manual client quotes a reference on a bank transfer, but that
 * difference lands AFTER submission — `DepositCreated` is where the two screens
 * genuinely diverge.
 *
 * This file used to branch on the method's `kind`, a column dropped in migration
 * 0043. If a method ever needs genuinely bespoke fields — a crypto network
 * picker, say — the branch belongs here and must be driven by something the
 * method actually carries, never by `key`. `schema.ts` states the rule: "a
 * screen that branches on `key === 'whish'` has to be edited every time a method
 * is added".
 *
 * ## No steps, and one card
 *
 * Everything is visible at once: method, destination, amount, pay. A deposit is
 * three short decisions, and a wizard turns them into three screens with two
 * transitions and a back button — slower for the client and more code for us.
 *
 * The destination is a SELECT rather than a list of radio cards. A client can
 * hold several wallets and many trading accounts; thirty cards push the amount
 * field two screens down and scroll the thing being chosen out of view while
 * choosing it.
 */

export interface DepositDestination {
  /** `null` means the wallet; otherwise the trading account to fund. */
  tradingAccountId: string | null;
}

/**
 * The select's stand-in value for "my wallet".
 *
 * A Radix `SelectItem` cannot carry an empty value, and accounts are keyed by
 * their own uuid — so the wallet needs a sentinel that no account id can
 * collide with.
 */
const WALLET_VALUE = 'wallet';

/**
 * The bounds a deposit must fall within, resolved by the SERVER.
 *
 * Read off the method rather than computed here. The API applies the tighter of
 * the platform limits and any per-method ones, so this is the same number the
 * validator will use — a portal that derived its own would eventually show a
 * floor the server does not enforce, and refuse or accept differently.
 */
function bounds(method: PaymentMethod): { min: Decimal | null; max: Decimal | null } {
  return {
    min: method.minAmount ? new Decimal(method.minAmount) : null,
    max: method.maxAmount ? new Decimal(method.maxAmount) : null,
  };
}

/**
 * Is this amount acceptable, and if not, why?
 *
 * Returns the message the client should see BEFORE they submit — the server
 * still re-derives every constraint (R-5.1) and its refusal is authoritative.
 * This exists so the common mistake is caught while they are still looking at
 * the field, not after a round trip.
 *
 * decimal.js, never `Number()`: these are NUMERIC(28,8) strings on a money path.
 */
export function amountProblem(method: PaymentMethod, amount: string): string | null {
  if (!amount.trim()) return null;

  let value: Decimal;
  try {
    value = new Decimal(amount);
  } catch {
    return null; // Let the server phrase "that is not a number".
  }
  if (!value.isFinite() || !value.isPositive()) return null;

  /*
   * MORE PRECISION THAN THE RAIL CAN TAKE — checked here, first.
   *
   * Without it the screen contradicted itself. The pay button renders the
   * amount through `formatMoney`, which rounds HALF-UP for display, so typing
   * `50.129` produced a button promising "Pay $50.13" — while the server, which
   * suggested rounding DOWN, answered "Try 50.12 USD". Two different numbers for
   * one input, on one screen, and clicking the button failed.
   *
   * The button was the worse half: `formatMoney` is a DISPLAY helper, right for
   * a balance and wrong for a control that promises an exact payment. Catching
   * the problem here means the CTA never gets to make that promise.
   *
   * Rounded HALF-UP to match what the client is already being shown, and what
   * they meant — a deposit has no balance to overshoot, so there is nothing to
   * protect by rounding down. (A WITHDRAWAL is the opposite and still floors:
   * suggesting more than the client holds trades one refusal for another.)
   */
  /*
   * DISPLAY_SCALE deliberately — the same constant `formatMoney` rounds to.
   * The defect being fixed is a mismatch between what is CHECKED and what is
   * SHOWN, so the check has to read from the display's own number or it can
   * drift apart again. The server remains authoritative and derives its bound
   * from the currency and the rail (D-77); this is the client-side echo.
   */
  if (value.decimalPlaces() > DISPLAY_SCALE) {
    return t('deposit.amountTooPrecise', {
      method: method.name,
      currency: method.currency,
      places: String(DISPLAY_SCALE),
      suggestion: value.toFixed(DISPLAY_SCALE, Decimal.ROUND_HALF_UP),
    });
  }

  const { min, max } = bounds(method);
  if (min && value.lessThan(min)) {
    return t('deposit.amountBelowMin', { min: formatMoney(min.toFixed(8), method.currency) });
  }
  if (max && value.greaterThan(max)) {
    return t('deposit.amountAboveMax', { max: formatMoney(max.toFixed(8), method.currency) });
  }
  return null;
}

/** "Between $10.00 and $5,000.00", from the server's own numbers. */
export function boundsHint(method: PaymentMethod): string | undefined {
  const { min, max } = bounds(method);
  if (!min || !max) return undefined;
  return t('deposit.amountRange', {
    min: formatMoney(min.toFixed(8), method.currency),
    max: formatMoney(max.toFixed(8), method.currency),
  });
}

/** Round numbers, filtered to the ones this method actually accepts. */
const PRESETS = ['50', '100', '250', '500', '1000'];

/** The form for the selected method: where the money goes, and how much. */
export function DepositForm({
  method,
  wallets,
  accounts,
  destination,
  onDestinationChange,
  amount,
  onAmountChange,
  disabled,
  section,
}: {
  method: PaymentMethod;
  wallets: Wallet[];
  accounts: TradingAccount[];
  destination: DepositDestination;
  onDestinationChange: (destination: DepositDestination) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  disabled?: boolean;
  /**
   * WHICH STEP is being drawn.
   *
   * This rendered destination and amount together when the deposit screen was
   * one page. They are separate steps now, and the split lives here rather than
   * in the page because the method-specific knowledge — which accounts a method
   * can fund, what its bounds are — is already here.
   */
  section: 'destination' | 'amount';
}) {
  const { min, max } = bounds(method);
  const presets = PRESETS.filter((value) => {
    const decimal = new Decimal(value);
    if (min && decimal.lessThan(min)) return false;
    if (max && decimal.greaterThan(max)) return false;
    return true;
  });

  /*
   * The wallet this deposit would land in, if one is open. `undefined` is not
   * an error: a currency with no wallet has simply not been opened yet, and the
   * deposit is what opens it — so the option is offered either way, without a
   * fabricated `$0.00` beside it.
   */
  const wallet = wallets.find((w) => w.currency === method.currency);

  /*
   * Only LIVE accounts in the method's own currency.
   *
   * A demo account cannot receive real money, and a cross-currency deposit has
   * no rate to convert at — `TransfersService` refuses a mismatch rather than
   * inventing one, so offering it here would produce a refusal the client
   * cannot explain.
   */
  const fundable = accounts.filter(
    (a) => a.environment === 'live' && a.status === 'active' && a.currency === method.currency,
  );

  /*
   * Grouped, because "my wallet" and "a trading account" are different kinds of
   * destination. A flat list of thirty entries makes the client read every one
   * to work out which is which.
   */
  const groups: TileGroup[] = [
    {
      label: t('deposit.groupWallet'),
      options: [
        {
          key: WALLET_VALUE,
          title: t('deposit.toWallet', { currency: method.currency }),
          /*
           * "Not opened yet" rather than a zero when the client holds no wallet
           * in this currency — depositing is what opens it, so the option must
           * stay selectable. A formatted 0.00 would state a balance that does
           * not exist, which is the rule /wallet was rewritten for.
           */
          hint: wallet
            ? formatMoney(wallet.available, wallet.currency)
            : t('transfer.walletUnopened'),
        },
      ],
    },
    {
      label: t('deposit.groupAccounts'),
      options: fundable.map((account) => ({
        key: account.id,
        title: t('deposit.toAccount', { login: account.login ?? '—' }),
        hint: formatMoney(account.balance, account.currency),
      })),
    },
  ];

  if (section === 'destination') {
    /*
     * NO section title.
     *
     * The tile groups below carry their own headings — "My wallets" and
     * "Trading accounts" — and the step rail already says Destination. A third
     * label over the same question is the one a reader stops seeing, along with
     * whatever sits next to it.
     */
    return (
      <MoneySection>
        <TileGroups
          name="deposit-destination"
          groups={groups}
          selected={destination.tradingAccountId ?? WALLET_VALUE}
          onSelect={(value) =>
            onDestinationChange({ tradingAccountId: value === WALLET_VALUE ? null : value })
          }
          disabled={disabled}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {destination.tradingAccountId === null
            ? t('deposit.toWalletHint')
            : t('deposit.toAccountHint')}
        </p>
      </MoneySection>
    );
  }

  return (
    <MoneySection title={t('deposit.amountTitle')}>
      <div className="space-y-4">
        <AmountField
          label={t('deposit.amountLabel')}
          labelHidden
          value={amount}
          onChange={onAmountChange}
          currency={method.currency}
          disabled={disabled}
          hint={boundsHint(method)}
        />
        {presets.length > 0 && (
          <AmountPresets
            presets={presets}
            currency={method.currency}
            onPick={onAmountChange}
            disabled={disabled}
          />
        )}
      </div>
    </MoneySection>
  );
}
