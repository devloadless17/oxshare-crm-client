import { describe, expect, it } from 'vitest';
import { csvCell, describeLine, periodRange, shortReference, statementCsv } from './statement';
import type { StatementLine } from '@/lib/api/wallet';

/**
 * The statement's pure rules. Each has a wrong answer that renders perfectly:
 * a period one day short, a refund labelled as a deposit, a CSV cell a
 * spreadsheet executes.
 */

const line = (patch: Partial<StatementLine>): StatementLine => ({
  id: 'l1',
  createdAt: '2026-09-10T10:00:00.000Z',
  entryType: 'deposit',
  referenceType: 'transaction',
  referenceId: '0f3c9a2e-1111-4222-8333-444455556666',
  amount: '100.00000000',
  balanceAfter: '100.00000000',
  methodName: null,
  provider: null,
  tradingAccountLogin: null,
  tradingAccountName: null,
  transferDirection: null,
  ...patch,
});

describe('periodRange', () => {
  // 25 Sep 2026, local time.
  const now = new Date(2026, 8, 25, 21, 30);

  it('this month runs from the 1st to today, in local dates', () => {
    expect(periodRange('thisMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-25' });
  });

  it('last month is the whole previous calendar month, crossing a year boundary', () => {
    expect(periodRange('lastMonth', now)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(periodRange('lastMonth', new Date(2026, 0, 15))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('last 12 months fits the 366-day ceiling the API enforces', () => {
    const { from, to } = periodRange('last12Months', now);
    expect(from).toBe('2025-09-26');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    expect(days).toBeLessThanOrEqual(366);
  });
});

describe('describeLine', () => {
  it('names the rail on a deposit and a withdrawal', () => {
    expect(describeLine(line({ methodName: 'Whish Money' }))).toBe('Deposit · Whish Money');
    expect(
      describeLine(line({ entryType: 'withdrawal', amount: '-50.00000000', methodName: 'USDT' })),
    ).toBe('Withdrawal · USDT');
  });

  it('calls a refused withdrawal’s refund a refund, not a deposit', () => {
    expect(
      describeLine(
        line({
          entryType: 'adjustment',
          referenceId: '0f3c9a2e-1111-4222-8333-444455556666:refund',
          methodName: 'USDT',
        }),
      ),
    ).toBe('Withdrawal refunded · USDT');
  });

  it('says who placed a manual credit', () => {
    expect(describeLine(line({ provider: 'manual_admin' }))).toBe('Added by our team');
  });

  it('names both ends of a transfer — this wallet and the exact account', () => {
    expect(
      describeLine(
        line({
          entryType: 'transfer',
          referenceType: 'transfer',
          amount: '-5',
          tradingAccountLogin: '7001',
          tradingAccountName: 'Main',
        }),
        'USD Wallet',
      ),
    ).toBe('Transfer: USD Wallet → Main · #7001');
    expect(
      describeLine(
        line({
          entryType: 'transfer',
          referenceType: 'transfer',
          tradingAccountLogin: '7001',
          tradingAccountName: 'Main',
        }),
        'USD Wallet',
      ),
    ).toBe('Transfer: Main · #7001 → USD Wallet');
  });
});

describe('shortReference', () => {
  it('quotes the same id for a debit and its refund', () => {
    const id = '0f3c9a2e-1111-4222-8333-444455556666';
    expect(shortReference(id)).toBe('0F3C9A2E');
    expect(shortReference(`${id}:refund`)).toBe('0F3C9A2E');
  });
});

describe('CSV', () => {
  it('neutralises a cell a spreadsheet would execute', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('Deposit')).toBe('"Deposit"');
  });

  it('writes money as the API’s own decimal strings, split into in and out', () => {
    const csv = statementCsv({
      currency: 'USD',
      from: '2026-09-01',
      to: '2026-09-30',
      walletNumber: 'w1',
      openingBalance: '10.00000000',
      closingBalance: '1005.50000000',
      lines: [
        line({ amount: '1000.00000000', balanceAfter: '1010.00000000' }),
        line({
          id: 'l2',
          entryType: 'withdrawal',
          amount: '-4.50000000',
          balanceAfter: '1005.50000000',
        }),
      ],
    });
    const rows = csv.replace('﻿', '').trim().split('\r\n');
    expect(rows).toHaveLength(5);
    expect(rows[2]).toContain(',1000.00000000,,1010.00000000,');
    expect(rows[3]).toContain(',,4.50000000,1005.50000000,');
  });
});
