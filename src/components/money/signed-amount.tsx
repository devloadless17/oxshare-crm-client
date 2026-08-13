import { formatMoney } from '@/lib/money';

/**
 * A transaction's amount, signed and coloured by its direction.
 *
 * ## Why this is a component and not three copies of a ternary
 *
 * The transactions table, the wallet's recent activity and the dashboard's each
 * rendered this themselves — same prefix, same `formatMoney`, same
 * `font-mono font-semibold`, and the same colour ternary. Three copies of one
 * decision is how a colour gets changed in two of them.
 *
 * ## Money OUT is red; money in is green
 *
 * A withdrawal rendered `text-foreground` — the same white as every other
 * figure on the page — so the only thing distinguishing it from a deposit was a
 * `−` glyph one character wide. A client scanning their history for "where did
 * my balance go" had to read the sign on every row.
 *
 * Both directions now carry a colour, and the pair is the point: green alone
 * against neutral says "deposits are special", while green against red says
 * "these are opposites". The `−` stays — colour is not the only carrier, because
 * roughly one man in twelve cannot separate these two hues, and the sign is
 * what they read.
 *
 * ## Signed for the READER, never by arithmetic
 *
 * `amount` is stored unsigned with the direction in its own column, so the
 * prefix is a display concern. Producing it by subtraction would put a number
 * where §6.1 requires a string — `formatMoney` takes the decimal string it was
 * given and never coerces it.
 */
export function SignedAmount({
  direction,
  amount,
  currency,
  className = '',
}: {
  direction: 'deposit' | 'withdrawal';
  /** A decimal STRING at NUMERIC(28,8) scale. Never a number. */
  amount: string;
  currency: string;
  /** Size and layout only — the colour is this component's to decide. */
  className?: string;
}) {
  const isDeposit = direction === 'deposit';

  return (
    <span
      className={`font-mono font-semibold ${
        isDeposit ? 'text-success' : 'text-destructive'
      } ${className}`}
    >
      {isDeposit ? '+' : '−'}
      {formatMoney(amount, currency)}
    </span>
  );
}
