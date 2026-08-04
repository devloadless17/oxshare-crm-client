import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import KycStepPage from './page';

/**
 * Guards the KYC step page against rendering a form it has no fields for.
 *
 * This page carried `.catch(() => ({ data: [] }))` on `/kyc/config` and
 * `.catch(() => ({ data: null }))` on `/kyc/status`. A failed request therefore
 * became an empty config, and the page rendered a verification step with no
 * fields and no error — the user saw a broken form and was told nothing.
 *
 * Both responses are required for a correct render: without the config there are
 * no fields, and without the status we lose prefill and, worse, the rejection
 * notice on a returned KYC.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get, post: vi.fn() } }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ step: '1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const CONFIG = [
  {
    id: 'step-1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    description: 'Legal identity details.',
    icon: 'User',
    enabled: true,
    fields: [{ id: 'f-1', name: 'firstName', label: 'First Name', type: 'text', required: true }],
  },
];

const STATUS = { userId: 'u-1', status: 'in_progress', createdAt: '2026-08-03T00:00:00.000Z' };

/** What axios actually rejects with: an Error carrying `response`. */
function apiError(message: string, status = 500): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { message } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

function mockRoutes(config: unknown, status: unknown) {
  get.mockImplementation((url: string) => {
    if (url === '/kyc/config') return Promise.resolve({ data: config });
    if (url === '/kyc/status') return Promise.resolve({ data: status });
    return Promise.resolve({ data: null });
  });
}

describe('KYC step page — load failures', () => {
  it('renders the step once both requests succeed', async () => {
    mockRoutes(CONFIG, STATUS);

    renderWithProviders(<KycStepPage />);

    expect(await screen.findByText(/personal information/i)).toBeInTheDocument();
  });

  it('shows an error with a retry when the config request fails', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/kyc/config') {
        return Promise.reject(apiError('Config unavailable.'));
      }
      return Promise.resolve({ data: STATUS });
    });

    renderWithProviders(<KycStepPage />);

    // The bug: this used to render an empty form instead.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/config unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('does not fail open when the status request fails', async () => {
    // Losing the status silently costs prefill and the rejection notice on a
    // returned KYC, so it is an error too, not a degraded success.
    get.mockImplementation((url: string) => {
      if (url === '/kyc/status') {
        return Promise.reject(apiError('Status unavailable.'));
      }
      return Promise.resolve({ data: CONFIG });
    });

    renderWithProviders(<KycStepPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/status unavailable/i)).toBeInTheDocument();
  });

  it('never renders a step form with zero fields', () => {
    // The precise shape of the original defect: an empty array reaching the
    // renderer as if it were a valid configuration.
    mockRoutes([], STATUS);

    renderWithProviders(<KycStepPage />);

    // With no steps there is nothing legitimate to show, so the page must not
    // present itself as a working form.
    const submit = screen.queryByRole('button', { name: /continue|submit|next/i });
    expect(submit).toBeNull();
  });
});
