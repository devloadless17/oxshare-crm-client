import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { setActiveLocale } from '@/lib/i18n';
import type { Agency } from '@/lib/api/partner';
import { ApplyPanel } from './apply-panel';

/**
 * The agency choice on the partner application, in Arabic (3 Oct 2026).
 *
 * Found in the Arabic end-to-end test: an agency whose operator wrote only an
 * ARABIC description showed an Arabic reader no description at all, because the
 * panel asked whether the English one existed before choosing what to show.
 */
const { agencies } = vi.hoisted(() => ({ agencies: vi.fn() }));

vi.mock('@/lib/api/partner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/partner')>();
  return { ...actual, partnerApi: { ...actual.partnerApi, agencies } };
});
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ user: { emailVerified: true } }),
}));
vi.mock('@/hooks/use-kyc-access', () => ({
  useKycAccess: () => ({ approved: true, pending: false, rejected: false, reverification: false }),
}));

const agency = (over: Partial<Agency>): Agency => ({
  id: 'a1',
  name: 'Gold Agency',
  nameAr: null,
  description: null,
  descriptionAr: null,
  products: [],
  productsAr: [],
  ...over,
});

afterEach(() => setActiveLocale('en'));

/**
 * Programmes are chosen from a picker; the chosen one's details are drawn in the
 * card beneath it (5 Oct 2026), which is where the description rule now shows.
 */
async function choose(name: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
  // The card, not the closed field echoing the name.
  return within(screen.getByText(name, { selector: 'p' }).closest('div') as HTMLElement);
}

describe('ApplyPanel agency descriptions', () => {
  it('shows an Arabic-only description to an Arabic reader', async () => {
    setActiveLocale('ar');
    agencies.mockResolvedValue([
      agency({ nameAr: 'الوكالة الذهبية', description: null, descriptionAr: 'وصف الوكالة' }),
    ]);
    renderWithProviders(<ApplyPanel onApplied={vi.fn()} inherited={null} />);
    const card = await choose('الوكالة الذهبية');
    expect(card.getByText('وصف الوكالة')).toBeInTheDocument();
  });

  it('shows no empty description line in English when only the Arabic exists', async () => {
    agencies.mockResolvedValue([agency({ description: null, descriptionAr: 'وصف الوكالة' })]);
    renderWithProviders(<ApplyPanel onApplied={vi.fn()} inherited={null} />);
    await choose('Gold Agency');
    expect(screen.queryByText('وصف الوكالة')).not.toBeInTheDocument();
  });

  it('shows the English description in English', async () => {
    agencies.mockResolvedValue([agency({ description: 'Gold tier', descriptionAr: 'ذهبي' })]);
    renderWithProviders(<ApplyPanel onApplied={vi.fn()} inherited={null} />);
    const card = await choose('Gold Agency');
    expect(card.getByText('Gold tier')).toBeInTheDocument();
  });
});
