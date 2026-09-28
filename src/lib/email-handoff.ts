/**
 * An address handed from one sign-in screen to the next, so the client does not
 * type it again: sign-up's "this email already has an account" panel hands it
 * to the password reset or to sign-in.
 *
 * `sessionStorage`, never the URL — an address in a query string reaches
 * history, Referer headers and access logs, the rule `pending-email.ts` follows
 * too. TAKEN once: the next screen reads and clears it, so a later visit starts
 * blank rather than with somebody's address already in the box.
 */
const KEY = 'oxshare.handed-email';
const MAX_EMAIL_LENGTH = 254;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function handEmailOver(email: string): void {
  const trimmed = email.trim().slice(0, MAX_EMAIL_LENGTH);
  if (!trimmed) return;
  try {
    storage()?.setItem(KEY, trimmed);
  } catch {
    // Quota or policy: the next screen simply asks for the address.
  }
}

/** The handed address, once — `''` when there is none. */
export function takeHandedEmail(): string {
  try {
    const store = storage();
    const email = store?.getItem(KEY) ?? '';
    store?.removeItem(KEY);
    return email.slice(0, MAX_EMAIL_LENGTH);
  } catch {
    return '';
  }
}
