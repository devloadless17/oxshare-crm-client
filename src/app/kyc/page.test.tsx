import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import KycEntryPage from './page';

/**
 * /kyc — the door a client comes back through.
 *
 * This screen renders almost nothing; it decides where the client GOES, and
 * every wrong answer is a real cost to a real person:
 *
 *  - sent to step 1 after completing four steps → they believe the upload was
 *    lost and re-do it, or give up;
 *  - sent into the wizard after submitting → they edit documents an admin is
 *    reviewing, and the API refuses them with no explanation;
 *  - sent to the "thanks, we're reviewing it" page after being REJECTED → they
 *    wait for a decision that already came, and never fix the document.
 *
 * The steps are resumable server-side, so the only thing that makes resuming
 * work is choosing the right destination here.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { get };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PERSONAL = { firstName: 'Kay', lastName: 'Client' };
const DOC = { docType: 'passport', frontFilePath: '/uploads/a.png' };
const SELFIE = { filePath: '/uploads/b.png' };
const ADDRESS = { docType: 'utility_bill', filePath: '/uploads/c.png' };

const statusOf = (over: Record<string, unknown>) => ({ status: 'in_progress', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: statusOf({}) });
});

describe('resuming an unfinished submission', () => {
  it('starts at step 1 when nothing has been filled in', async () => {
    renderWithProviders(<KycEntryPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc/step/1'));
  });

  it('skips past each step the client has already completed', async () => {
    // The whole point of resuming: a client who uploaded three documents on
    // Monday must not be asked for them again on Tuesday.
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ personalInfo: PERSONAL }, '/kyc/step/2'],
      [{ personalInfo: PERSONAL, document: DOC }, '/kyc/step/3'],
      [{ personalInfo: PERSONAL, document: DOC, selfie: SELFIE }, '/kyc/step/4'],
      [
        { personalInfo: PERSONAL, document: DOC, selfie: SELFIE, addressProof: ADDRESS },
        '/kyc/step/5',
      ],
    ];
    for (const [data, expected] of cases) {
      vi.clearAllMocks();
      get.mockResolvedValue({ data: statusOf(data) });
      renderWithProviders(<KycEntryPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith(expected));
    }
  });

  it('does not count a half-filled personal step as complete', async () => {
    // Both names are required before the step counts, or the client is skipped
    // past a form they never finished.
    get.mockResolvedValue({ data: statusOf({ personalInfo: { firstName: 'Kay' } }) });
    renderWithProviders(<KycEntryPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc/step/1'));
  });
});

describe('when the submission is already with the reviewers', () => {
  it.each(['submitted', 'under_review', 'approved'])(
    'sends a %s submission to the status page, not back into the wizard',
    async (status) => {
      // Editing here would change what an admin is reviewing, and the API
      // refuses it — so the client would meet an error with no explanation.
      get.mockResolvedValue({ data: statusOf({ status, personalInfo: PERSONAL }) });
      renderWithProviders(<KycEntryPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc/submitted'));
    },
  );

  it('lets a REJECTED client back in to fix the problem', async () => {
    // The one status that must NOT go to the status page. A rejected client has
    // something to correct; parking them on "we are reviewing it" means they
    // wait for a decision that already arrived.
    get.mockResolvedValue({
      data: statusOf({
        status: 'rejected',
        personalInfo: PERSONAL,
        document: DOC,
        selfie: SELFIE,
        addressProof: ADDRESS,
      }),
    });
    renderWithProviders(<KycEntryPage />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalledWith('/kyc/submitted');
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/kyc/step/'));
  });
});

describe('when the status cannot be read', () => {
  it('sends the client into the wizard rather than stranding them on a spinner', async () => {
    // Step 1 is safe: the steps are resumable and anything already saved comes
    // back from the server when that page loads. A spinner forever is not.
    get.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<KycEntryPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc/step/1'));
  });

  it('does the same when the endpoint does not exist yet', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<KycEntryPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc/step/1'));
  });

  it('navigates nowhere while the status is still loading', async () => {
    // Redirecting on incomplete data is how a returning client gets thrown back
    // to step 1 for a moment and re-uploads out of panic.
    get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<KycEntryPage />);
    await new Promise((r) => setTimeout(r, 50));
    expect(replace).not.toHaveBeenCalled();
  });
});
