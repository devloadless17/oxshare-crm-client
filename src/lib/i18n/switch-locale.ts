import { storeLocale } from './locale-storage';
import { currentLocale, type Locale } from './index';

/** How long a signed-in switch waits to save the choice on the account before reloading. */
const SAVE_TIMEOUT_MS = 2500;

/**
 * Change the portal's language: remember it, tell the account, reload.
 *
 * RELOAD, not a re-render. The cookie is what the server renders from, so the
 * reloaded page is Arabic (or English) from its first byte, `<html dir>`
 * included. A re-render would keep everything already computed in the old
 * language — the API's sentences in React Query's cache, open toasts, labels a
 * module built at import — and a half-translated screen is worse than either.
 *
 * `saveToAccount` (signed in only) records the choice on the account so the
 * server's own emails follow it. Best effort and bounded: a slow or failed save
 * must not hold the switch, and the next switch saves again.
 */
export async function switchLocale(
  next: Locale,
  saveToAccount?: (locale: Locale) => Promise<void>,
): Promise<void> {
  if (next === currentLocale()) return;
  storeLocale(next);
  if (saveToAccount) {
    await Promise.race([
      saveToAccount(next).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, SAVE_TIMEOUT_MS)),
    ]);
  }
  window.location.reload();
}
