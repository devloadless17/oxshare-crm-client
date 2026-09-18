/**
 * Is this capture good enough to be worth a reviewer's time?
 *
 * ## ⚠️ THIS IS A QUALITY CHECK. IT IS NOT A SECURITY CONTROL.
 *
 * Nothing here can be one, and the reason is structural rather than a limit of
 * the implementation: it runs in the client's browser, and the client is the
 * person it would be guarding against. `POST /kyc/upload` accepts any JPEG from
 * anyone, so a submission can skip this file entirely with one `curl`. Anybody
 * reading these numbers as anti-fraud has read them wrong.
 *
 * What it is worth is the ordinary case, which is most of them: a client in a
 * dark room, or one who moved, uploads something a reviewer will reject, and
 * learns that a day later by email. Catching it while the camera is still open
 * turns a day into five seconds and removes a rejection from the queue. That is
 * the whole claim.
 *
 * Both thresholds are deliberately LOW. A gate that refuses a usable photo is
 * worse than no gate — the client cannot argue with it, cannot see what it saw,
 * and has no way forward except to give up. These are set to catch the
 * unmistakable cases (a lens cap, a dark room, a hand moving) and to wave
 * through anything arguable.
 */

/** Mean luminance below which a frame is too dark to read a face in. */
const MIN_MEAN_LUMINANCE = 40; // 0–255

/**
 * Variance-of-Laplacian below which a frame is unmistakably out of focus.
 *
 * The standard cheap sharpness measure: a blurred image has little
 * high-frequency content, so the second derivative is flat and its variance is
 * small. Not calibrated against a dataset and not presented as if it were —
 * chosen low enough that only obvious motion blur trips it.
 */
const MIN_FOCUS_VARIANCE = 12;

export type QualityProblem = 'too_dark' | 'too_blurry';

/**
 * Sampled on a DOWNSCALED copy, not the full frame.
 *
 * A 1280×720 capture is nearly a million pixels and this runs on the main
 * thread between pressing the button and seeing the result. The measures are
 * statistical — a mean and a variance — so they survive downscaling, and 160px
 * on the long edge keeps the work at a few thousand pixels.
 */
const SAMPLE_EDGE = 160;

function toGrayscale(data: Uint8ClampedArray): number[] {
  // `Array.from({ length })`, not `new Array(n)`: the latter is typed `any[]`,
  // which the type-aware lint rightly refuses to assign to `number[]`.
  const gray: number[] = Array.from({ length: data.length / 4 }, () => 0);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Rec. 601 luma. Averaging the channels instead would call a saturated blue
    // as bright as a mid grey, which is wrong in exactly the low-light case this
    // is here to judge.
    gray[p] = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
  }
  return gray;
}

function meanLuminance(gray: readonly number[]): number {
  let total = 0;
  for (const value of gray) total += value;
  return total / gray.length;
}

/** Variance of the 4-neighbour Laplacian — higher is sharper. */
function focusVariance(gray: readonly number[], width: number, height: number): number {
  const values: number[] = [];
  /*
   * Read through a helper rather than by index: `noUncheckedIndexedAccess` is on,
   * and every access here is already inside the array by construction (the loop
   * starts at 1 and stops one short of each edge). The `?? 0` is unreachable —
   * it satisfies the compiler without introducing a silent default that could
   * mask a real out-of-bounds read later.
   */
  const px = (i: number): number => gray[i] ?? 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      values.push(4 * px(i) - px(i - 1) - px(i + 1) - px(i - width) - px(i + width));
    }
  }
  if (values.length === 0) return Number.POSITIVE_INFINITY;

  let total = 0;
  for (const v of values) total += v;
  const mean = total / values.length;

  let sq = 0;
  for (const v of values) sq += (v - mean) ** 2;
  return sq / values.length;
}

/**
 * The first problem worth telling the client about, or `null`.
 *
 * Returns `null` on ANY internal failure — a canvas that will not allocate, a
 * context the browser withholds, a zero-sized frame. A quality hint that cannot
 * run must never become a reason somebody cannot finish onboarding, so the
 * failure mode is silence and the upload proceeds.
 */
export function findQualityProblem(source: HTMLCanvasElement): QualityProblem | null {
  try {
    const scale = SAMPLE_EDGE / Math.max(source.width, source.height);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    if (width < 8 || height < 8) return null;

    const sample = document.createElement('canvas');
    sample.width = width;
    sample.height = height;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(source, 0, 0, width, height);
    return measureQuality(context.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return null;
  }
}

/**
 * The measurement, separated from the canvas that produced it.
 *
 * Exported because it is the half worth testing and the half a test can reach:
 * jsdom has no 2D context, so a test written against `findQualityProblem`
 * SKIPS — and a skipped test reports as passing, which is the failure this
 * codebase already has an `E2E_STRICT` flag to stop elsewhere. Four silently
 * skipped cases would have been worse than none, because they read as coverage.
 *
 * Splitting it also says which part is the logic: the canvas work is plumbing
 * that browsers get right, and the thresholds are the part with a judgement in
 * them.
 */
export function measureQuality(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): QualityProblem | null {
  if (width < 8 || height < 8 || rgba.length < width * height * 4) return null;

  const gray = toGrayscale(rgba);
  if (meanLuminance(gray) < MIN_MEAN_LUMINANCE) return 'too_dark';
  if (focusVariance(gray, width, height) < MIN_FOCUS_VARIANCE) return 'too_blurry';
  return null;
}
