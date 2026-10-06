import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { PaymentMethod } from '@/lib/api/deposits';
import type { Wallet } from '@/lib/api/wallet';
import DepositPage from './page';

const { listMethods, request, requestOffline, getWallets, getTransferableAccounts } = vi.hoisted(
  () => ({
    listMethods: vi.fn(),
    request: vi.fn(),
    requestOffline: vi.fn(),
    getWallets: vi.fn(),
    getTransferableAccounts: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/deposit',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/image-capture', () => ({
  normaliseDocumentImage: (file: File) =>
    Promise.resolve({ file, width: 800, height: 600, wasResized: false, tooSmall: false }),
}));
vi.mock('@/lib/api/deposits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/deposits')>();
  return {
    ...actual,
    depositsApi: { ...actual.depositsApi, listMethods, request, requestOffline },
  };
});
vi.mock('@/lib/api/wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/wallet')>();
  return { ...actual, walletApi: { ...actual.walletApi, getWallets } };
});
vi.mock('@/lib/api/trading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/trading')>();
  return { ...actual, tradingApi: { ...actual.tradingApi, getTransferableAccounts } };
});

const method = (key: string, name: string): PaymentMethod => ({
  key,
  name,
  nameAr: null,
  currency: 'USD',
  logoUrl: null,
  minAmount: '1',
  maxAmount: '10000',
  enabled: true,
  sortOrder: 0,
  requiresProof: true,
  proofFields: [],
  payToFields: [],
});

const usd = {
  id: 'w-usd',
  currency: 'USD',
  kind: 'main',
  balance: '700.00000000',
  onHold: '0.00000000',
  available: '700.00000000',
} as Wallet;

beforeEach(() => {
  vi.clearAllMocks();
  listMethods.mockResolvedValue([method('bank', 'Bank transfer'), method('omt', 'OMT')]);
  getWallets.mockResolvedValue([usd]);
  getTransferableAccounts.mockResolvedValue([]);
});

describe('the deposit form waits for every read it draws from', () => {
  it('shows an error, not "Not opened yet", when the wallets cannot be read', async () => {
    getWallets.mockRejectedValue(new Error('down'));
    renderWithProviders(<DepositPage />);

    expect(await screen.findByText('Could not load your balances.')).toBeInTheDocument();
    expect(screen.queryByText('Bank transfer')).not.toBeInTheDocument();
    expect(screen.queryByText('Not opened yet')).not.toBeInTheDocument();
  });

  it('shows the wallet balance once every read has landed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepositPage />);

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('$700.00')).toBeInTheDocument();
  });
});

describe('the receipt belongs to one deposit through one method', () => {
  it('is dropped when the client switches method', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepositPage />);

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.upload(
      screen.getByTestId('deposit-proof-input'),
      new File([new Uint8Array(64)], 'receipt.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('receipt.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByText('OMT'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByTestId('deposit-proof-input')).toBeInTheDocument());
    expect(screen.queryByText('receipt.png')).not.toBeInTheDocument();
  });
});
