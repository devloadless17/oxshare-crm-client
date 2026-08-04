import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentUploader, type DocumentUploaderProps } from './document-uploader';

/**
 * KYC document upload — the component a client uses to submit identity evidence.
 *
 * Two things make it worth testing despite being fiddly:
 *
 *  - A failed upload must not leave the tile looking successful. If it shows a
 *    filename after the request failed, the client believes they submitted a
 *    document they did not, and finds out when their KYC is rejected days later.
 *  - `handleFile` is fire-and-forget from two call sites (a drop and an input
 *    change), so its rejection is handled internally or not at all. That is why
 *    those call sites carry an explicit `void`.
 */

function fileOf(name: string, type: string): File {
  return new File(['contents'], name, { type });
}

function apiError(message: string): Error {
  return Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400, data: { message } },
  });
}

const onUpload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  onUpload.mockResolvedValue(undefined);
});

function renderUploader(props: Partial<DocumentUploaderProps> = {}) {
  return render(
    <DocumentUploader label="Passport front" field="doc_front" onUpload={onUpload} {...props} />,
  );
}

/** The file input is visually hidden, so reach it directly rather than by role. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('no file input rendered');
  return input as HTMLInputElement;
}

describe('DocumentUploader — successful upload', () => {
  it('passes the field name and the file to the caller', async () => {
    const user = userEvent.setup();
    renderUploader();

    const file = fileOf('passport.png', 'image/png');
    await user.upload(fileInput(), file);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    // The field id is what the backend stores the file against, so it must be
    // passed through unchanged.
    expect(onUpload).toHaveBeenCalledWith('doc_front', file);
  });

  it('shows the filename once the upload has actually succeeded', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('passport.png', 'image/png'));

    expect(await screen.findByText('passport.png')).toBeInTheDocument();
  });

  it('accepts a PDF as well as an image', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('statement.pdf', 'application/pdf'));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('statement.pdf')).toBeInTheDocument();
  });
});

describe('DocumentUploader — failed upload', () => {
  it('reports the API message rather than a generic string', async () => {
    onUpload.mockRejectedValueOnce(apiError('File exceeds the 10MB limit.'));
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('huge.png', 'image/png'));

    expect(await screen.findByText(/exceeds the 10mb limit/i)).toBeInTheDocument();
  });

  it('does NOT show a filename after a failed upload', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('passport.png', 'image/png'));

    await screen.findByText(/upload rejected/i);
    // The whole point: a client must not believe they submitted a document that
    // never landed.
    expect(screen.queryByText('passport.png')).not.toBeInTheDocument();
  });

  it('announces the failure to assistive technology', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('passport.png', 'image/png'));

    // role="alert" on the message, and the dropzone points at it via
    // aria-describedby — aria-invalid is not supported on role="button".
    expect(await screen.findByRole('alert')).toHaveTextContent(/upload rejected/i);
  });

  it('falls back to error.message when there is no HTTP response', async () => {
    // A network failure carries no `response`, which is exactly the case an
    // inline `err.response.data.message` read used to lose.
    onUpload.mockRejectedValueOnce(new Error('Network Error'));
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('passport.png', 'image/png'));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });

  it('lets the client retry after a failure', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await user.upload(fileInput(), fileOf('passport.png', 'image/png'));
    await screen.findByText(/upload rejected/i);

    onUpload.mockResolvedValueOnce(undefined);
    await user.upload(fileInput(), fileOf('passport-2.png', 'image/png'));

    expect(await screen.findByText('passport-2.png')).toBeInTheDocument();
    expect(screen.queryByText(/upload rejected/i)).not.toBeInTheDocument();
  });
});
