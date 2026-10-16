import { isNetworkError } from '@/components/kyc/kyc-errors';

/**
 * A KYC upload that survives the CONNECTION, not just the request.
 *
 * Measured on 16 Oct 2026: 546 uploads succeeded (median 0.4 s, the slowest 1%
 * about 20 s) and 13 did not. Ten of those were one iPhone on a weak line, cut
 * off 10 to 31 seconds in: the client switched app or locked the screen, iOS
 * froze the page and dropped the connection, and the uploader showed an error
 * that the client had to notice and act on. None of it was the server.
 *
 * So a failure that is about the CONNECTION (no answer at all, or a gateway
 * that could not reach the API mid-deploy) is tried again by itself: after the
 * page is visible and online once more, then after a short pause, up to three
 * times. A REFUSAL (a wrong file type, a step that is closed) is the server's
 * answer and is shown at once; sending it again cannot change it.
 *
 * Sending the same page twice is safe: an upload REPLACES the page it names, so
 * a retry whose first attempt did land leaves the record exactly as one would.
 */
const DELAYS_MS = [2_000, 5_000, 10_000];
/** Longest we wait for the page to come back before trying anyway. */
const RETURN_WAIT_MS = 120_000;

export function isWorthRetrying(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return status === 502 || status === 503 || status === 504;
}

export interface UploadRetryOptions {
  /** Told before each retry, so the screen can say what is happening. */
  onRetry?: (attempt: number) => void;
  /** False once the screen is gone: a client who left wants no more attempts. */
  stillWanted?: () => boolean;
  delaysMs?: readonly number[];
  waitForReturn?: () => Promise<void>;
}

export async function uploadWithRetry(
  send: () => Promise<void>,
  {
    onRetry,
    stillWanted = () => true,
    delaysMs = DELAYS_MS,
    waitForReturn = untilVisibleAndOnline,
  }: UploadRetryOptions = {},
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await send();
      return;
    } catch (error) {
      if (!isWorthRetrying(error) || attempt >= delaysMs.length || !stillWanted()) throw error;
      onRetry?.(attempt + 1);
      await waitForReturn();
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      if (!stillWanted()) throw error;
    }
  }
}

/** Resolves once the page is in front of the client and the device is online. */
export function untilVisibleAndOnline(): Promise<void> {
  // "Not hidden" rather than "visible": some browsers report `prerender` for a page in front.
  const ready = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (ready()) done();
    };
    // Never wait for ever: a device that reports offline wrongly still gets tried.
    const timer = setTimeout(done, RETURN_WAIT_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
  });
}
