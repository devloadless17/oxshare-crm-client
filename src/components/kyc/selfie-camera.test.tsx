import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelfieCamera } from './selfie-camera';

/**
 * The selfie camera when a photo is ALREADY ON FILE — the correction round.
 *
 * Reported 28 Sep 2026: a client "changed" their selfie while correcting, and
 * the reviewer kept seeing the old one. Two things made that easy:
 *
 *  - the first Retake after a photo taken this visit did nothing: clearing the
 *    photo re-ran the "a selfie is on file" effect, which closed the camera the
 *    instant it opened and put "Selfie Captured" back on screen;
 *  - after Retake, nothing said the old photo stays on file until a new one is
 *    TAKEN, so leaving the camera open and moving on read as a change.
 *
 * jsdom has no camera and no canvas: both are stood in for below, and the
 * quality hint (which reads pixels) is switched off.
 */

vi.mock('@/lib/image-quality', () => ({ findQualityProblem: () => null }));

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AA');
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
    callback(new Blob(['frame'], { type: 'image/jpeg' }));
  });
});

describe('a selfie already on file', () => {
  it('opens the camera on a Retake right after a photo — never bounces back to "captured"', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SelfieCamera onUpload={onUpload} uploaded />);

    await user.click(screen.getByRole('button', { name: /retake photo/i }));
    await user.click(await screen.findByRole('button', { name: /snap photo/i }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('selfie', expect.any(File)));
    expect(await screen.findByText(/selfie captured/i)).toBeInTheDocument();

    // The report: this second Retake closed the camera again at once.
    await user.click(screen.getByRole('button', { name: /retake photo/i }));
    expect(await screen.findByRole('button', { name: /snap photo/i })).toBeInTheDocument();
    expect(screen.queryByText(/selfie captured/i)).not.toBeInTheDocument();
  });

  it('says the photo on file stays until a new one is taken — and can keep it', async () => {
    const onUpload = vi.fn();
    const user = userEvent.setup();
    render(<SelfieCamera onUpload={onUpload} uploaded />);

    await user.click(screen.getByRole('button', { name: /retake photo/i }));
    expect(
      await screen.findByText(/your current photo stays on file until you take a new one/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /keep current photo/i }));
    expect(await screen.findByText(/selfie captured/i)).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('says nothing about a photo on file when there is none', async () => {
    render(<SelfieCamera onUpload={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /snap photo/i })).toBeInTheDocument();
    expect(screen.queryByText(/stays on file/i)).not.toBeInTheDocument();
  });

  it('uploads into its OWN field — a broker’s camera never writes the selfie', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SelfieCamera onUpload={onUpload} field="customField_livecam" />);
    await user.click(await screen.findByRole('button', { name: /snap photo/i }));
    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith('customField_livecam', expect.any(File)),
    );
  });
});
