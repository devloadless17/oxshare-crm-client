import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { setActiveLocale, translate, type MessageKey } from '@/lib/i18n';
import RegisterPage from './page';

/*
 * The same stubs as `page.test.tsx` (kept apart for the file-length cap).
 */
const register = vi.hoisted(() => vi.fn());
const emailAvailable = vi.hoisted(() => vi.fn());
const options = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { auth: { register, emailAvailable } },
}));
vi.mock('@/lib/api/profile', () => ({ profileApi: { options } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const REQUIRED = {
  registration: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'phone', 'country'],
  verification: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({ message: 'Check your inbox.' });
  emailAvailable.mockResolvedValue(true);
  sessionStorage.clear();
});

/**
 * ARABIC SHOWS, ENGLISH IS SENT (0179). The country and nationality lists carry
 * an Arabic label per ENGLISH value; an Arabic reader sees — and picks from —
 * the Arabic, sorted by it, and the registration still carries the English
 * value the server stores and validates.
 */
describe('registering in Arabic', () => {
  const ar = (key: MessageKey) => new RegExp(escapeRegExp(translate('ar', key)));

  beforeEach(() => {
    setActiveLocale('ar');
    options.mockResolvedValue({
      countries: ['Lebanon', 'United Arab Emirates'],
      nationalities: ['Emirati', 'Lebanese'],
      countryLabelsAr: { Lebanon: 'لبنان', 'United Arab Emirates': 'الإمارات العربية المتحدة' },
      nationalityLabelsAr: { Emirati: 'إماراتي', Lebanese: 'لبناني' },
      required: REQUIRED,
    });
  });
  afterEach(() => setActiveLocale('en'));

  it('lists the Arabic labels in Arabic order and submits the English values', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(ar('auth.register.firstName')), 'Ada');
    await user.type(screen.getByLabelText(ar('auth.register.lastName')), 'Lovelace');
    await user.type(screen.getByLabelText(ar('auth.register.email')), 'ada@example.test');
    await user.type(
      screen.getByLabelText(new RegExp(`^${translate('ar', 'auth.register.password')}`)),
      'A-strong-passphrase-1',
    );
    await user.click(screen.getByRole('button', { name: ar('auth.register.continue') }));

    fireEvent.change(await screen.findByLabelText(ar('auth.register.dateOfBirth')), {
      target: { value: '1991-03-09' },
    });

    await user.click(await screen.findByRole('combobox', { name: ar('auth.register.country') }));
    const countries = (await screen.findAllByRole('option')).map((o) => o.textContent);
    // Sorted by the ARABIC: الإمارات (alef) before لبنان (lam) — the English order reversed.
    expect(countries).toEqual(['الإمارات العربية المتحدة', 'لبنان']);
    await user.click(screen.getByRole('option', { name: 'لبنان' }));

    await user.click(screen.getByRole('combobox', { name: ar('auth.register.nationality') }));
    await user.click(await screen.findByRole('option', { name: 'لبناني' }));
    // The trigger reads the Arabic the client picked.
    expect(
      screen.getByRole('combobox', { name: ar('auth.register.nationality') }),
    ).toHaveTextContent('لبناني');

    await user.type(screen.getByLabelText(translate('ar', 'auth.register.phone')), '70 123 456');
    await user.type(screen.getByLabelText(ar('auth.register.city')), 'Beirut');
    await user.click(screen.getByRole('button', { name: ar('auth.register.submitCta') }));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const [body] = register.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ nationality: 'Lebanese', country: 'Lebanon' });
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
