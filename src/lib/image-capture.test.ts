import { describe, expect, it } from 'vitest';
import {
  MAX_EDGE,
  MIN_READABLE_EDGE,
  isNormalisableImage,
  normaliseDocumentImage,
  targetDimensions,
} from './image-capture';

/**
 * The arithmetic and the routing decisions, tested without a canvas.
 *
 * jsdom has no real image decoding, so `normaliseDocumentImage`'s canvas path
 * cannot be exercised here — which is exactly why the two things that can be
 * wrong silently are pure functions. A bug in the ratio produces an unreadable
 * identity document rather than an exception, and nobody finds out until a
 * reviewer rejects it.
 *
 * What IS asserted about the impure function is its failure behaviour: it must
 * hand back the original file rather than block verification.
 */

function fileOf(name: string, type: string): File {
  return new File(['x'], name, { type });
}

describe('targetDimensions — what gets scaled and what does not', () => {
  it('leaves an image inside the cap completely alone', () => {
    // The pixels the client captured are the pixels stored. Nothing is thrown
    // away for the sake of a smaller file.
    expect(targetDimensions(1600, 1200)).toEqual({
      width: 1600,
      height: 1200,
      wasResized: false,
    });
  });

  it('leaves an image exactly at the cap alone', () => {
    expect(targetDimensions(MAX_EDGE, 1000).wasResized).toBe(false);
  });

  it('scales the LONG edge to the cap, whichever edge that is', () => {
    // Landscape and portrait must both end up with their longest side at the
    // cap — clamping width unconditionally would leave a portrait photo huge.
    expect(targetDimensions(4000, 3000)).toEqual({ width: 2000, height: 1500, wasResized: true });
    expect(targetDimensions(3000, 4000)).toEqual({ width: 1500, height: 2000, wasResized: true });
  });

  it('preserves the aspect ratio', () => {
    // A stretched document is an unreadable one.
    const { width, height } = targetDimensions(4032, 3024);
    expect(width / height).toBeCloseTo(4032 / 3024, 5);
  });

  it('never rounds an edge to zero on an extreme aspect ratio', () => {
    // A zero-width canvas throws rather than producing a thin image, which would
    // turn a strange photo into a failed verification.
    const { width, height } = targetDimensions(20000, 3);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('handles a zero-sized source without dividing by zero', () => {
    expect(targetDimensions(0, 0)).toEqual({ width: 0, height: 0, wasResized: false });
  });

  it('cuts a typical 12MP phone photo to a fraction of its pixels', () => {
    // The point of the exercise: ~12M pixels down to ~3M, which is where the
    // 3–12 MB upload becomes a few hundred KB on mobile data.
    const { width, height } = targetDimensions(4032, 3024);
    expect(width * height).toBeLessThan((4032 * 3024) / 3);
  });
});

describe('isNormalisableImage — what we will decode', () => {
  it('accepts the formats a browser can reliably decode', () => {
    for (const type of ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']) {
      expect(isNormalisableImage(fileOf('doc', type))).toBe(true);
    }
  });

  it('does NOT accept HEIC, even though it is an image', () => {
    /*
     * The reason this is an allow-list and not `image/*`. iPhones photograph in
     * HEIC by default and most browsers cannot decode it, so attempting to
     * would fail AFTER the client has waited for a decode — and then fall back
     * to uploading the original anyway, which the server refuses. Better to
     * pass it straight through to the server's own clear rejection.
     */
    expect(isNormalisableImage(fileOf('IMG_4821.HEIC', 'image/heic'))).toBe(false);
  });

  it('does not touch a PDF', () => {
    // Nothing to orient, no EXIF to strip, and rasterising it would destroy the
    // one format that is already both small and sharp.
    expect(isNormalisableImage(fileOf('statement.pdf', 'application/pdf'))).toBe(false);
  });
});

describe('normaliseDocumentImage — failure must never block verification', () => {
  it('returns a PDF untouched', async () => {
    const pdf = fileOf('statement.pdf', 'application/pdf');
    const result = await normaliseDocumentImage(pdf);

    expect(result.file).toBe(pdf);
    expect(result.wasResized).toBe(false);
  });

  it('returns the ORIGINAL file when decoding fails', { timeout: 20_000 }, async () => {
    /*
     * jsdom cannot decode the one-byte "image" below, so this exercises the
     * real failure path. A client who cannot finish KYC because our
     * optimisation threw is worse off than one who uploads a large file — the
     * server's limits are the control, this is a courtesy.
     *
     * It also proves the decode is BOUNDED. jsdom never fires load or error on
     * an <img>, so without the timeout this promise never settles and the
     * uploader sits on "preparing" forever — which is exactly what a browser
     * failing to decode a corrupt file can do.
     */
    const jpeg = fileOf('passport.jpg', 'image/jpeg');
    const result = await normaliseDocumentImage(jpeg);

    expect(result.file).toBe(jpeg);
  });

  it('does not claim an un-decoded file is too small', { timeout: 20_000 }, async () => {
    // `tooSmall` drives a warning shown to the client. Firing it on a file we
    // never measured would tell people to retake perfectly good photos.
    const result = await normaliseDocumentImage(fileOf('passport.jpg', 'image/jpeg'));

    expect(result.tooSmall).toBe(false);
  });
});

describe('the thresholds themselves', () => {
  it('warns well below the cap, so the two never collide', () => {
    expect(MIN_READABLE_EDGE).toBeLessThan(MAX_EDGE);
  });

  it('keeps a resized document above the readability warning', () => {
    // Anything scaled TO the cap must not then be reported as too small — that
    // would warn every client with a large photo.
    const { width, height } = targetDimensions(6000, 4000);
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(MIN_READABLE_EDGE);
  });
});
