import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { IbCommissionRow } from '@/lib/api/partner';
import { PartnerCommissions } from './partner-commissions';

/**
 * The partner's Commissions table: what produced each commission.
 *
 * The live MT5 feed writes `deal`, and the table knew only `position` as a
 * trade, so every live trade read "Deposit". A partner who closed four trades
 * and saw eight "Deposit" rows is why this exists (the other four were the
 * clients' rebates, which the API no longer lists here).
 */
const { commissions } = vi.hoisted(() => ({ commissions: vi.fn() }));

vi.mock('@/lib/api/partner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/partner')>();
  return { ...actual, partnerApi: { ...actual.partnerApi, commissions } };
});

function row(over: Partial<IbCommissionRow>): IbCommissionRow {
  return {
    id: 'a-1',
    clientName: 'Client One',
    source: 'deal',
    baseAmount: '10.00000000',
    rateValue: '70.0000',
    amount: '7.00000000',
    currency: 'USD',
    status: 'pending',
    depth: 1,
    createdAt: '2026-09-25T10:00:00.000Z',
    confirmedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("what produced a partner's commission", () => {
  it('calls a trade closed on MT5 a closed trade, not a deposit', async () => {
    commissions.mockResolvedValue([row({ id: 'a-1', source: 'deal' })]);
    renderWithProviders(<PartnerCommissions />);

    expect(await screen.findByText('Closed trade')).toBeInTheDocument();
    expect(screen.queryByText('Deposit')).toBeNull();
  });

  it('keeps "Deposit" for the historical deposit rows only', async () => {
    commissions.mockResolvedValue([
      row({ id: 'a-1', source: 'position', clientName: 'Old Trade' }),
      row({ id: 'a-2', source: 'transaction', clientName: 'Old Deposit' }),
    ]);
    renderWithProviders(<PartnerCommissions />);

    expect(await screen.findByText('Closed trade')).toBeInTheDocument();
    expect(screen.getByText('Deposit')).toBeInTheDocument();
  });
});
