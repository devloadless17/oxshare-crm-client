import { afterEach, describe, expect, it, vi } from 'vitest';
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

    // The drop zone is back and a new file can be chosen. Asserted on "Choose
    // file", which is present on every device — the camera button belongs to
    // touch devices only and has its own tests below.
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy();
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

/**
 * The bug: on a DESKTOP both buttons opened the identical file dialog.
 *
 * `capture` is honoured by phones and ignored by every desktop browser, so
 * "Take photo" fell back to an ordinary picker — two buttons, one outcome, and
 * a client on the verification step left guessing which one was wrong. The
 * camera button now appears only where a camera actually opens.
 *
 * `(pointer: coarse)` is the signal, and jsdom implements no matchMedia at all,
 * so each case stubs the answer it means. Deleting the `canCapture &&` guard
 * fails the desktop case; hardcoding it to false fails the phone case.
 */
describe('DocumentUploader — the camera button follows the device', () => {
  const props = { label: 'Passport', field: 'document' as const, onUpload: vi.fn() };

  const pointerIs = (coarse: boolean) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('coarse') ? coarse : !coarse,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }));
  };

  afterEach(() => vi.unstubAllGlobals());

  it('offers BOTH routes on a touch device, where capture opens a camera', () => {
    pointerIs(true);
    renderWithProviders(<DocumentUploader {...props} />);

    expect(screen.getByRole('button', { name: /take photo/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy();
  });

  it('offers ONE route on a desktop, because the second would do the same thing', () => {
    pointerIs(false);
    renderWithProviders(<DocumentUploader {...props} />);

    expect(screen.queryByRole('button', { name: /take photo/i })).toBeNull();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy();
  });
});
