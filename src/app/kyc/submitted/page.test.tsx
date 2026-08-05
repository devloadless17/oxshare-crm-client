import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import KycSubmittedPage from './page';
import { readPersonalDraft, writePersonalDraft } from '@/lib/kyc-draft';

/**
 * The KYC status screen — what a client is told about their own verification.
 *
 * Two things are worth holding onto here, and both are about honesty rather
 * than layout.
 *
 * This screen used to seed `useState('submitted')` and swallow the request
 * failure, so a client whose status could not be read was told confidently that
 * their documents were submitted and under review. On a compliance screen "we
 * do not know" and "submitted" are not the same sentence, and the difference
 * decides whether someone waits patiently or chases it.
 *
 * It also clears the local draft. Half-typed personal data — a date of birth,
 * a home address — sitting in session storage after submission is personal data
 * retained for no purpose.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { get };
  return { api, default: api };
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  get.mockResolvedValue({ data: { status: 'submitted' } });
});

describe('what the client is told', () => {
  it('says the documents are under review while they are', async () => {
    renderWithProviders(<KycSubmittedPage />);
    expect(await screen.findByText(/under compliance review/i)).toBeInTheDocument();
  });

  it('says verified once approved, and names what it unlocked', async () => {
    get.mockResolvedValue({ data: { status: 'approved' } });
    renderWithProviders(<KycSubmittedPage />);
    expect(await screen.findByText(/verified successfully/i)).toBeInTheDocument();
  });

  it('says rejected, and that the client should re-submit', async () => {
    // A rejected client needs to know there is something to DO. "Under review"
    // would leave them waiting for a decision that already arrived.
    get.mockResolvedValue({ data: { status: 'rejected' } });
    renderWithProviders(<KycSubmittedPage />);
    expect(await screen.findByText(/not approved/i)).toBeInTheDocument();
    expect(screen.getByText(/re-submit/i)).toBeInTheDocument();
  });

  it('NEVER claims "submitted" when the status could not be read', async () => {
    // The regression this file exists for. An optimistic default plus a
    // swallowed error is a screen that lies with confidence.
    get.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<KycSubmittedPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/under compliance review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified successfully/i)).not.toBeInTheDocument();
  });
});

describe('the local draft', () => {
  it('is cleared on arrival, so personal data does not linger', async () => {
    // Date of birth and home address, kept in session storage for a form that
    // has been submitted, is personal data retained for no purpose.
    writePersonalDraft({ dateOfBirth: '1990-01-01', address: '1 Example St' });
    expect(readPersonalDraft()['dateOfBirth']).toBe('1990-01-01');

    renderWithProviders(<KycSubmittedPage />);
    await screen.findByText(/under compliance review/i);

    expect(readPersonalDraft()['dateOfBirth']).toBeUndefined();
  });

  it('is cleared even when the status request fails', async () => {
    // Clearing hangs off mount rather than off a successful query — the draft
    // should go whether or not we could read the status.
    writePersonalDraft({ dateOfBirth: '1990-01-01' });
    get.mockRejectedValue({ response: { status: 500 } });

    renderWithProviders(<KycSubmittedPage />);
    await screen.findByRole('button', { name: /retry/i });

    expect(readPersonalDraft()['dateOfBirth']).toBeUndefined();
  });
});
