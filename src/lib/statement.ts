/**
 * The Statement screen's pure half: which dates a period means, what each
 * ledger line is called, and the CSV a client downloads.
 *
 * Kept free of React so every boundary is one assertion — a period that is off
 * by a day, or a CSV cell that turns a balance into a formula, ships silently.
 */
import Decimal from 'decimal.js';
import { toIso, todayIso, type IsoDate } from '@/lib/date-range';
import { localized, t } from '@/lib/i18n';
import type { StatementLine } from '@/lib/api/wallet';

export type StatementPeriod =
  'thisMonth' | 'lastMonth' | 'last3Months' | 'yearToDate' | 'last12Months' | 'custom';

export const STATEMENT_PERIODS: readonly StatementPeriod[] = [
  'thisMonth',
  'lastMonth',
  'last3Months',
  'yearToDate',
  'last12Months',
  'custom',
];

/**
 * The inclusive `from`/`to` a preset stands for, in the client's LOCAL calendar.
 *
 * Built from local getters for the reason `todayIso` gives: a UTC-derived date
 * is tomorrow for anyone east of Greenwich in the evening. `last12Months` starts
 * the day after this date last year, so it is 365/366 days and fits the API's
 * 366-day ceiling.
 */
export function periodRange(
  period: Exclude<StatementPeriod, 'custom'>,
  now: Date = new Date(),
): { from: IsoDate; to: IsoDate } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = todayIso(now);
  switch (period) {
    case 'thisMonth':
      return { from: toIso(y, m, 1), to: today };
    case 'lastMonth': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0); // day 0 = the last day of the previous month
      return {
        from: toIso(start.getFullYear(), start.getMonth(), 1),
        to: toIso(end.getFullYear(), end.getMonth(), end.getDate()),
      };
    }
    case 'last3Months': {
      const start = new Date(y, m - 2, 1);
      return { from: toIso(start.getFullYear(), start.getMonth(), 1), to: today };
    }
    case 'yearToDate':
      return { from: toIso(y, 0, 1), to: today };
    case 'last12Months': {
      const start = new Date(y - 1, m, now.getDate() + 1);
      return { from: toIso(start.getFullYear(), start.getMonth(), start.getDate()), to: today };
    }
  }
}

/**
 * What a ledger line WAS, in the client's words.
 *
 * Read from the entry type AND the sign, because one type covers both
 * directions: a `withdrawal` credit is the refund of one that was refused, and
 * a `transfer` is either leg of a wallet ⇄ account move. The payment rail's own
 * name and the MT5 login are appended when the API resolved them — they are
 * what tells one deposit from the next on a statement.
 */
export function describeLine(line: StatementLine, walletName?: string): string {
  const credit = !new Decimal(line.amount).isNegative();
  // The rail's name in the reader's language (`methodNameAr`, 0179).
  const withMethod = (label: string) =>
    line.methodName ? `${label} · ${localized(line.methodName, line.methodNameAr)}` : label;
  /*
   * A transfer names BOTH ends — this wallet and the exact account — because
   * "Transfer to trading account" cannot tell a client with two accounts
   * which one the money went to.
   */
  const wallet = walletName?.trim() || t('statement.thisWallet');
  const account = [
    line.tradingAccountName?.trim() || t('transfer.tradingAccount'),
    line.tradingAccountLogin ? `#${line.tradingAccountLogin}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const route = (from: string, to: string) => t('statement.lineTransfer', { from, to });

  switch (line.entryType) {
    case 'deposit':
      // Placed by hand has no rail to name; saying who placed it is the answer.
      if (line.provider === 'manual_admin') return t('statement.lineManualCredit');
      return withMethod(credit ? t('statement.lineDeposit') : t('statement.lineDepositReversed'));
    case 'withdrawal':
      return withMethod(
        credit ? t('statement.lineWithdrawalRefund') : t('statement.lineWithdrawal'),
      );
    case 'transfer':
      if (line.referenceType === 'ib_transfer') {
        return credit
          ? route(t('transfer.commissionWallet'), wallet)
          : route(wallet, t('statement.mainWallet'));
      }
      return credit ? route(account, wallet) : route(wallet, account);
    case 'commission':
      return t('statement.lineCommission');
    case 'rebate':
      return t('statement.lineRebate');
    case 'payout':
      return t('statement.linePayout');
    case 'adjustment':
      // A refused withdrawal is refunded as an adjustment keyed `<id>:refund` —
      // not a deposit, since no money entered the platform.
      if (line.referenceType === 'transaction' && line.referenceId.endsWith(':refund')) {
        return withMethod(t('statement.lineWithdrawalRefund'));
      }
      return line.referenceType === 'accrual_reversal'
        ? t('statement.lineReversal')
        : t('statement.lineAdjustment');
    default:
      // An entry type this build has not heard of still prints, as itself.
      return line.entryType;
  }
}

/** A short reference a client can quote to support: the first 8 of a uuid, upper-cased. */
export function shortReference(referenceId: string): string {
  // `<uuid>:refund` quotes the same row as its debit — support looks up one id.
  const base = referenceId.split(':')[0] ?? referenceId;
  const compact = base.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(compact) ? base.slice(0, 8).toUpperCase() : base.slice(0, 16);
}

/**
 * One CSV cell, quoted, and made inert if it could be read as a formula.
 *
 * A statement is opened in a spreadsheet, and a cell beginning `=`, `+`, `-` or
 * `@` is EXECUTED there. Descriptions carry operator-typed method names, so
 * that is a real injection surface; the `'` prefix is the OWASP-recommended
 * neutraliser. Numbers are written separately and never pass through this.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * The statement as CSV — money as the API's own decimal strings, never
 * re-formatted (a thousands separator in a CSV number is a second column).
 */
export function statementCsv(
  statement: {
    currency: string;
    from: string;
    to: string;
    walletNumber: string;
    openingBalance: string;
    closingBalance: string;
    lines: StatementLine[];
  },
  walletName?: string,
): string {
  // Headings in the client's language; the data columns stay machine-readable.
  const header = [
    t('transactions.colDate'),
    t('statement.colDescription'),
    t('statement.colReference'),
    t('statement.moneyIn'),
    t('statement.moneyOut'),
    t('statement.colBalance'),
    t('transactions.colCurrency'),
  ];
  const rows: string[] = [header.map(csvCell).join(',')];
  rows.push(
    [
      csvCell(statement.from),
      csvCell(t('statement.openingBalance')),
      '""',
      '',
      '',
      statement.openingBalance,
      csvCell(statement.currency),
    ].join(','),
  );
  for (const line of statement.lines) {
    const amount = new Decimal(line.amount);
    rows.push(
      [
        csvCell(new Date(line.createdAt).toISOString()),
        csvCell(describeLine(line, walletName)),
        csvCell(shortReference(line.referenceId)),
        amount.isNegative() ? '' : amount.toFixed(8),
        amount.isNegative() ? amount.abs().toFixed(8) : '',
        line.balanceAfter,
        csvCell(statement.currency),
      ].join(','),
    );
  }
  rows.push(
    [
      csvCell(statement.to),
      csvCell(t('statement.closingBalance')),
      '""',
      '',
      '',
      statement.closingBalance,
      csvCell(statement.currency),
    ].join(','),
  );
  // CRLF per RFC 4180, and a BOM so Excel reads UTF-8 method names correctly.
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
