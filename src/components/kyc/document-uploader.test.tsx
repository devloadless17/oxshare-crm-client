import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DocumentUploader } from './document-uploader';

/**
 * The regression: Replace did nothing on an already-uploaded document.
 *
 * `uploaded` is a PROP. `retake` clears everything this component owns, but it
 * cannot clear the parent's flag, so `isUploaded` stayed true, the same view
 * re-rendered, and the button looked dead. Nothing threw and nothing logged —
 * the only symptom was a click with no effect, which is exactly the kind of bug
 * a type-check and a lint pass sail straight past.
 *
 * These assert the two halves of the guarantee: the picker appears, and the
 * confirmed-upload view is gone. Deleting `&& !replacing` from `isUploaded`
 * fails both — verified by breaking it before committing.
 */
describe('DocumentUploader — replacing an uploaded document', () => {
  const props = {
    label: 'Passport',
    field: 'document' as const,
    uploaded: true,
    onUpload: vi.fn(),
  };

  it('reveals the file picker when Replace is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentUploader {...props} />);

    // Before the click there is no way to choose a file — that was the bug.
    expect(screen.queryByRole('button', { name: /choose file/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /replace/i }));

    // The drop zone is back, with BOTH routes to a new file. Asserting on the
    // camera as well, because `capture` on a lone input would make it the only
    // option — a regression the component's own comment warns about.
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /take photo/i })).toBeTruthy();
  });

  it('leaves the uploaded confirmation behind after Replace', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentUploader {...props} />);

    expect(screen.queryByText(/uploaded/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /replace/i }));

    // The "uploaded" confirmation must not survive the click — that state was
    // the entire bug.
    expect(screen.queryByText(/uploaded/i)).toBeNull();
  });
});
