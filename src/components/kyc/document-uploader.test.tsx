import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
    expect(screen.queryByLabelText(/choose file/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /replace/i }));

    // The drop zone is back and a new file can be chosen. Asserted on "Choose
    // file", which is present on every device — the camera button belongs to
    // touch devices only and has its own tests below.
    expect(screen.getByLabelText(/choose file/i)).toBeTruthy();
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

    expect(screen.getByLabelText(/take photo/i)).toBeTruthy();
    expect(screen.getByLabelText(/choose file/i)).toBeTruthy();
    // Native file inputs inside their labels, so a tap opens the picker without
    // a scripted click (which some phone browsers ignore). Only the camera one
    // carries `capture`.
    const camera = screen.getByLabelText(/take photo/i);
    const gallery = screen.getByLabelText(/choose file/i);
    expect(camera).toHaveAttribute('type', 'file');
    expect(camera).toHaveAttribute('capture');
    expect(camera.closest('label')).not.toBeNull();
    expect(gallery).toHaveAttribute('type', 'file');
    expect(gallery).not.toHaveAttribute('capture');
    expect(gallery.closest('label')).not.toBeNull();
  });

  it('offers ONE route on a desktop, because the second would do the same thing', () => {
    pointerIs(false);
    renderWithProviders(<DocumentUploader {...props} />);

    expect(screen.queryByLabelText(/take photo/i)).toBeNull();
    expect(screen.getByLabelText(/choose file/i)).toBeTruthy();
  });
});

describe('DocumentUploader — a dropped connection is not the client’s problem', () => {
  it('says it is trying again, and finishes the upload without the client doing anything', async () => {
    const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    const onUpload = vi
      .fn<(field: string, file: File) => Promise<void>>()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <DocumentUploader label="Passport" field="document" onUpload={onUpload} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' }));
    await user.click(await screen.findByRole('button', { name: /use this/i }));

    expect(await screen.findByText(/connection lost/i)).toBeInTheDocument();
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2), { timeout: 5000 });
    // Finished: no error was ever shown, and the same file went both times.
    expect(screen.queryByText(/could not reach|failed/i)).not.toBeInTheDocument();
    expect(onUpload.mock.calls[1]?.[1]).toBe(onUpload.mock.calls[0]?.[1]);
  });
});
