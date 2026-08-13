'use client';

import Decimal from 'decimal.js';
import {
  AmountField,
  AmountPresets,
  DestinationSelect,
  MoneySection,
  type DestinationGroup,
} from '@/components/money/money-shell';
import type { PaymentMethod } from '@/lib/api/deposits';
import type { TradingAccount } from '@/lib/api/trading';
import type { Wallet } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';
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
}: {
  method: PaymentMethod;
  wallets: Wallet[];
  accounts: TradingAccount[];
  destination: DepositDestination;
  onDestinationChange: (destination: DepositDestination) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  disabled?: boolean;
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
  const groups: DestinationGroup[] = [
    {
      label: t('deposit.groupWallet'),
      options: [
        {
          value: WALLET_VALUE,
          label: t('deposit.toWallet', { currency: method.currency }),
          hint: wallet ? formatMoney(wallet.available, wallet.currency) : undefined,
        },
      ],
    },
    {
      label: t('deposit.groupAccounts'),
      options: fundable.map((account) => ({
        value: account.id,
        label: t('deposit.toAccount', { login: account.login ?? '—' }),
        hint: formatMoney(account.balance, account.currency),
      })),
    },
  ];

  return (
    <>
      <MoneySection title={t('deposit.destinationTitle')}>
        <DestinationSelect
          label={t('deposit.destinationLabel')}
          value={destination.tradingAccountId ?? WALLET_VALUE}
          onChange={(value) =>
            onDestinationChange({ tradingAccountId: value === WALLET_VALUE ? null : value })
          }
          groups={groups}
          disabled={disabled}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {destination.tradingAccountId === null
            ? t('deposit.toWalletHint')
            : t('deposit.toAccountHint')}
        </p>
      </MoneySection>

      <MoneySection title={t('money.stepAmount')}>
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
    </>
  );
}
