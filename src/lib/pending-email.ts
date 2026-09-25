/**
 * The address a verification code was just sent to — for the one tab that asked.
 *
 * Sign-up and sign-in hand it to `/auth/confirm-email` here rather than in the
 * URL. An email address in a query string lands in browser history, in the next
 * page's Referer, and in every access log between the browser and the API: the
 * same reason the verification token is stripped from the address bar the
 * moment it is spent.
 *
 * `sessionStorage`, so it dies with the tab. That is the right lifetime — a
 * code is for the screen in front of you and expires in fifteen minutes anyway.
 * A reload keeps it; a new tab or another device is asked for the address,
 * which the screen handles.
 *
 * `sentAt` is what lets the resend countdown survive a reload. Without it a
 * refresh offered "Resend" at once, and the server — which sends nothing inside
 * its 30-second cooldown — would quietly send nothing.
 *
 * Every access is wrapped: Safari private mode and some enterprise policies
 * THROW from `sessionStorage` rather than returning null, and a storage failure
 * must degrade to "type your address", never take the screen down.
 */

const KEY = 'oxshare.pending-email';

/** The screen that takes the code. Public: it works signed in or out. */
export const CONFIRM_EMAIL_PATH = '/auth/confirm-email';

/**
 * Which screen sent the client here — it decides the wording and where "Back"
 * goes. Not sensitive, so it rides in the URL where the address may not.
 */
export type ConfirmOrigin = 'register' | 'login';

/**
 * The code screen's URL. `next` is carried through untouched; the screen runs
 * it through `safeReturnTo` before it navigates anywhere, because a value
 * that arrived in a URL is attacker-supplied however it got there.
 */
export function confirmEmailPath(origin: ConfirmOrigin, next?: string | null): string {
  const params = new URLSearchParams({ from: origin });
  if (next) params.set('next', next);
  return `${CONFIRM_EMAIL_PATH}?${params.toString()}`;
}

/**
 * How long a remembered address is offered back. A day — the link in the same
 * email lasts that long — so a tab abandoned mid sign-up does not keep
 * announcing somebody's address to whoever opens the screen next.
 */
const REMEMBER_FOR_MS = 24 * 60 * 60_000;

/** The longest a real address can be (RFC 5321), and so the longest we keep. */
const MAX_EMAIL_LENGTH = 254;

export interface PendingEmail {
  email: string;
  /** When the server was last asked to send a code, in epoch milliseconds. */
  sentAt: number;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remember the address a code was just requested for. */
export function rememberPendingEmail(email: string, sentAt: number = Date.now()): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    storage()?.setItem(KEY, JSON.stringify({ email: trimmed, sentAt }));
  } catch {
    // Quota or policy. The screen asks for the address instead.
  }
}

/**
 * What this tab is waiting on, or null.
 *
 * Validated rather than trusted: the value is ours, but storage is shared with
 * every script on this origin and survives deploys, so a malformed or stale
 * entry reads as "nothing remembered" instead of an address the screen then
 * shows back to somebody.
 */
export function recallPendingEmail(now: number = Date.now()): PendingEmail | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { email, sentAt } = parsed as { email?: unknown; sentAt?: unknown };
    if (typeof email !== 'string' || !email.includes('@') || email.length > MAX_EMAIL_LENGTH) {
      return null;
    }
    if (typeof sentAt !== 'number' || !Number.isFinite(sentAt)) return null;
    // A future stamp is a clock that moved, not a send that has not happened.
    if (sentAt > now + 60_000 || now - sentAt > REMEMBER_FOR_MS) return null;
    return { email, sentAt };
  } catch {
    return null;
  }
}

/** Forget it — the address is confirmed, abandoned, or the session ended. */
export function forgetPendingEmail(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to release */
  }
}
