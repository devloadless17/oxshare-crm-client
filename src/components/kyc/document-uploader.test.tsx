import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentUploader, type DocumentUploaderProps } from './document-uploader';

/**
 * KYC document upload — the component a client uses to submit identity evidence.
 *
 * Three things make it worth testing despite being fiddly:
 *
 *  - A failed upload must not leave the tile looking successful. If it shows a
 *    filename after the request failed, the client believes they submitted a
 *    document they did not, and finds out when their KYC is rejected days later.
 *  - Choosing a file must NOT send it. Nearly every submission comes from a
 *    phone, and an upload that starts before the client has seen the photo means
 *    every discarded attempt costs a full upload over mobile data and leaves an
 *    orphaned identity document on the server.
 *  - There must be two ways to supply a document — camera and file picker. A
 *    bare `capture` attribute makes an input camera-ONLY, which locks out anyone
 *    who photographed their ID with a second device or already has a scan.
 */

function fileOf(name: string, type: string): File {
  return new File(['contents'], name, { type });
}

function apiError(message: string): Error {
  return Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400, data: { message } },
  });
}

/*
 * The image pipeline is stubbed, and tested on its own in lib/image-capture.test.ts.
 *
 * Two reasons. jsdom cannot decode an image, so the real function waits out its
 * decode timeout and every test here takes 15 seconds. And what is under test is
 * the uploader's BEHAVIOUR — choose, confirm, retake, fail — which should not
 * change if the normalisation rules do.
 *
 * The stub passes the file straight through, matching what the real function
 * does for a format it cannot handle.
 */
const { normaliseDocumentImage } = vi.hoisted(() => ({ normaliseDocumentImage: vi.fn() }));
vi.mock('@/lib/image-capture', () => ({ normaliseDocumentImage }));

const onUpload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  onUpload.mockResolvedValue(undefined);
  // Pass-through by default, matching what the real function does for a format
  // it cannot handle.
  normaliseDocumentImage.mockImplementation((file: File) =>
    Promise.resolve({ file, width: 1600, height: 1200, wasResized: false, tooSmall: false }),
  );
});

function renderUploader(props: Partial<DocumentUploaderProps> = {}) {
  return render(
    <DocumentUploader label="Passport front" field="doc_front" onUpload={onUpload} {...props} />,
  );
}

/** The inputs are visually hidden, so reach them directly rather than by role. */
function fileInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll('input[type="file"]'));
}

/** The one WITHOUT `capture` — the "choose an existing file" route. */
function pickerInput(): HTMLInputElement {
  const input = fileInputs().find((i) => !i.hasAttribute('capture'));
  if (!input) throw new Error('no plain file input rendered');
  return input;
}

/** Choose a file and confirm it, which is what actually uploads. */
async function chooseAndConfirm(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(pickerInput(), file);
  await user.click(await screen.findByRole('button', { name: /use this/i }));
}

describe('DocumentUploader — choosing is not sending', () => {
  it('does NOT upload when a file is merely chosen', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(pickerInput(), fileOf('passport.png', 'image/png'));

    // The confirm step exists so a blurry or cropped photo costs nothing to
    // redo. Uploading here would put it on the API host's disk, attached to the
    // submission, before the client had seen it at any usable size.
    await screen.findByRole('button', { name: /use this/i });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('uploads once the client confirms', async () => {
    const user = userEvent.setup();
    renderUploader();

    const file = fileOf('passport.png', 'image/png');
    await chooseAndConfirm(user, file);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    // The field id is what the backend stores the file against, so it must be
    // passed through unchanged. The third argument is the progress callback.
    expect(onUpload).toHaveBeenCalledWith('doc_front', file, expect.any(Function));
  });

  it('lets the client back out without sending anything', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(pickerInput(), fileOf('blurry.png', 'image/png'));
    await user.click(await screen.findByRole('button', { name: /retake/i }));

    expect(onUpload).not.toHaveBeenCalled();
    // Back to the start, both routes offered again.
    expect(await screen.findByRole('button', { name: /take photo/i })).toBeInTheDocument();
  });

  it('refuses an oversize file locally, before any request', async () => {
    const user = userEvent.setup();
    renderUploader();

    const huge = fileOf('huge.png', 'image/png');
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(pickerInput(), huge);

    // Told immediately rather than after uploading megabytes they were always
    // going to be refused.
    expect(await screen.findByRole('alert')).toHaveTextContent(/10/);
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe('DocumentUploader — the image is prepared before it is sent', () => {
  it('normalises the file, and uploads THAT rather than the original', async () => {
    /*
     * The wiring, asserted — a stubbed dependency would otherwise let someone
     * delete the call and every other test here would still pass.
     *
     * Normalisation is what rotates a sideways ID upright, strips the GPS
     * coordinates a phone camera writes into EXIF, and brings a 12 MB camera
     * original under the upload limit. Sending the original instead would undo
     * all three silently.
     */
    const user = userEvent.setup();
    const original = fileOf('IMG_4821.jpg', 'image/jpeg');
    const prepared = fileOf('IMG_4821.jpg', 'image/jpeg');
    normaliseDocumentImage.mockResolvedValueOnce({
      file: prepared,
      width: 2000,
      height: 1500,
      wasResized: true,
      tooSmall: false,
    });
    renderUploader();

    await chooseAndConfirm(user, original);

    expect(normaliseDocumentImage).toHaveBeenCalledWith(original);
    expect(onUpload).toHaveBeenCalledWith('doc_front', prepared, expect.any(Function));
  });

  it('measures size AFTER normalising, not before', async () => {
    // Normalisation is usually what brings a 12 MB camera original under the
    // limit. Checking first would refuse photos that were about to become
    // perfectly acceptable — which is where signup gets abandoned.
    const user = userEvent.setup();
    const huge = fileOf('huge.jpg', 'image/jpeg');
    Object.defineProperty(huge, 'size', { value: 12 * 1024 * 1024 });
    const shrunk = fileOf('huge.jpg', 'image/jpeg');
    normaliseDocumentImage.mockResolvedValueOnce({
      file: shrunk,
      width: 2000,
      height: 1500,
      wasResized: true,
      tooSmall: false,
    });
    renderUploader();

    await user.upload(pickerInput(), huge);

    expect(await screen.findByRole('button', { name: /use this/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('WARNS about a low-resolution photo without refusing it', async () => {
    // Advisory on purpose: a legitimate small scan refused outright is a worse
    // outcome than a marginal one a reviewer can judge for themselves.
    const user = userEvent.setup();
    normaliseDocumentImage.mockResolvedValueOnce({
      file: fileOf('small.jpg', 'image/jpeg'),
      width: 640,
      height: 480,
      wasResized: false,
      tooSmall: true,
    });
    renderUploader();

    await user.upload(pickerInput(), fileOf('small.jpg', 'image/jpeg'));

    expect(await screen.findByRole('status')).toHaveTextContent(/hard to read/i);
    // Still submittable — the warning informs, it does not block.
    expect(screen.getByRole('button', { name: /use this/i })).toBeEnabled();
  });
});

describe('DocumentUploader — both ways in', () => {
  it('offers a camera route and a file route', async () => {
    renderUploader();

    expect(await screen.findByRole('button', { name: /take photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeInTheDocument();
  });

  it('opens the REAR camera for a document by default', () => {
    renderUploader();

    const camera = fileInputs().find((i) => i.hasAttribute('capture'));
    expect(camera?.getAttribute('capture')).toBe('environment');
  });

  it('can open the FRONT camera, for a face', () => {
    renderUploader({ capture: 'user' });

    const camera = fileInputs().find((i) => i.hasAttribute('capture'));
    expect(camera?.getAttribute('capture')).toBe('user');
  });

  it('keeps a plain input alongside it, so an existing file is still choosable', () => {
    // The requirement is BOTH. A single input carrying `capture` is camera-only
    // on iOS and Android, which is why this is asserted rather than assumed.
    renderUploader();

    expect(fileInputs()).toHaveLength(2);
    expect(pickerInput().hasAttribute('capture')).toBe(false);
  });
});

describe('DocumentUploader — successful upload', () => {
  it('shows the filename once the upload has actually succeeded', async () => {
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('passport.png', 'image/png'));

    expect(await screen.findByText('passport.png')).toBeInTheDocument();
  });

  it('accepts a PDF as well as an image', async () => {
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('statement.pdf', 'application/pdf'));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('statement.pdf')).toBeInTheDocument();
  });
});

describe('DocumentUploader — failed upload', () => {
  it('reports the API message rather than a generic string', async () => {
    onUpload.mockRejectedValueOnce(apiError('File exceeds the 10MB limit.'));
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('huge.png', 'image/png'));

    expect(await screen.findByText(/exceeds the 10mb limit/i)).toBeInTheDocument();
  });

  it('keeps the chosen file so the client can simply try again', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('passport.png', 'image/png'));
    await screen.findByText(/upload rejected/i);

    // A failed SEND is not a bad photo. Making them re-pick the file — which on
    // a phone means reopening the camera roll — would be punishing them for a
    // dropped connection.
    expect(screen.getByRole('button', { name: /use this/i })).toBeInTheDocument();
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('does NOT claim success after a failed upload', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('passport.png', 'image/png'));

    await screen.findByText(/upload rejected/i);
    // The whole point: a client must not believe they submitted a document that
    // never landed. The confirm button still being there IS the "not sent" state.
    expect(screen.queryByText(/uploaded/i)).not.toBeInTheDocument();
  });

  it('announces the failure to assistive technology', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('passport.png', 'image/png'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/upload rejected/i);
  });

  it('falls back to error.message when there is no HTTP response', async () => {
    // A network failure carries no `response`, which is exactly the case an
    // inline `err.response.data.message` read used to lose.
    onUpload.mockRejectedValueOnce(new Error('Network Error'));
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('passport.png', 'image/png'));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });

  it('lets the client retry after a failure', async () => {
    onUpload.mockRejectedValueOnce(apiError('Upload rejected.'));
    const user = userEvent.setup();
    renderUploader();

    await chooseAndConfirm(user, fileOf('passport.png', 'image/png'));
    await screen.findByText(/upload rejected/i);

    onUpload.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: /use this/i }));

    expect(await screen.findByText('passport.png')).toBeInTheDocument();
    expect(screen.queryByText(/upload rejected/i)).not.toBeInTheDocument();
  });
});
