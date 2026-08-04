import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelfieCamera } from './selfie-camera';

/**
 * Selfie capture for KYC — the last uncovered compliance component.
 *
 * The defect these tests were written to expose: `capture()` swallowed the upload
 * failure with `catch { /* ignore *\/ }`. The captured image is set BEFORE the
 * upload is attempted, and the "Selfie Captured" state renders on `captured ||
 * uploadedSuccess` — so a failed upload left the client looking at their own photo
 * and a success message, believing they had submitted a selfie that never reached
 * the server. They would discover it when KYC was rejected for a missing selfie.
 *
 * That is strictly worse than the DocumentUploader version of the same bug, which
 * at least showed an error.
 */

const getUserMedia = vi.fn();
const onUpload = vi.fn();

/** A MediaStream stub with the one method the component calls on teardown. */
function fakeStream() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

beforeEach(() => {
  vi.clearAllMocks();
  onUpload.mockResolvedValue(undefined);
  getUserMedia.mockResolvedValue(fakeStream().stream);

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });

  // jsdom implements neither of these; the component needs both to capture.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');

  // capture() turns the data URL back into a Blob via fetch.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Blob(['x'], { type: 'image/jpeg' })))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function captureSelfie() {
  const user = userEvent.setup();
  render(<SelfieCamera onUpload={onUpload} />);
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  await user.click(await screen.findByRole('button', { name: /snap photo/i }));
  return user;
}

describe('SelfieCamera — capture and upload', () => {
  it('requests the front-facing camera on mount', async () => {
    render(<SelfieCamera onUpload={onUpload} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    const [constraints] = getUserMedia.mock.calls[0] as [MediaStreamConstraints];
    expect(constraints.video).toMatchObject({ facingMode: 'user' });
  });

  it('uploads the captured frame as a selfie file', async () => {
    await captureSelfie();

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const [field, file] = onUpload.mock.calls[0] as [string, File];
    expect(field).toBe('selfie');
    expect(file.type).toBe('image/jpeg');
  });

  it('confirms capture only once the upload has succeeded', async () => {
    await captureSelfie();

    expect(await screen.findByText(/selfie captured/i)).toBeInTheDocument();
  });
});

describe('SelfieCamera — failed upload', () => {
  it('does NOT claim the selfie was captured when the upload failed', async () => {
    onUpload.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 400'), {
        response: { status: 400, data: { message: 'Selfie rejected: face not detected.' } },
      }),
    );

    await captureSelfie();

    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    // The bug: this used to render regardless, because `captured` alone drives it.
    expect(screen.queryByText(/selfie captured/i)).not.toBeInTheDocument();
  });

  it('tells the client why the upload failed', async () => {
    onUpload.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 400'), {
        response: { status: 400, data: { message: 'Selfie rejected: face not detected.' } },
      }),
    );

    await captureSelfie();

    expect(await screen.findByText(/face not detected/i)).toBeInTheDocument();
  });

  it('reports a network failure rather than staying silent', async () => {
    onUpload.mockRejectedValueOnce(new Error('Network Error'));

    await captureSelfie();

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });

  it('lets the client retake after a failed upload', async () => {
    onUpload.mockRejectedValueOnce(new Error('Network Error'));
    const user = await captureSelfie();

    await screen.findByText(/network error/i);
    await user.click(screen.getByRole('button', { name: /retake/i }));

    // Retaking restarts the camera, so a second attempt is possible. The count is
    // not pinned: handleRetake calls startCamera() and clearing `captured` also
    // re-runs the mount effect, so the camera starts twice. That is harmless —
    // startCamera stops any existing tracks first — but it is an implementation
    // detail, and what matters is that the camera came back.
    await waitFor(() => expect(getUserMedia.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
  });
});

describe('SelfieCamera — camera unavailable', () => {
  it('reports a denied camera permission instead of an empty frame', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));

    render(<SelfieCamera onUpload={onUpload} />);

    // A blocked camera has to say so — the client cannot otherwise tell the
    // difference between "denied" and "still loading".
    expect(await screen.findByText(/camera access required/i)).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
