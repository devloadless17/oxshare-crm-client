import { parseStringRecord } from './json';

/**
 * The withdrawal a client is part-way through, kept in `sessionStorage`.
 *
 * ## The defect this fixes
 *
 * `/withdraw` held the step, the amount, the destination and the idempotency
 * key in component state alone. Nothing was in the URL and nothing was
 * persisted, so a refresh on the confirm step dropped back to `details` with
 * every field cleared.
 *
 * That is worse than losing typing, because the code already sitting in the
 * client's inbox is bound by HMAC to the intent it was issued for (backend
 * R-3.7). Re-entering the same amount mints a NEW intent, so the emailed code
 * can never be accepted. The client types the six digits they were sent, is
 * told they are wrong, requests another, and has no way to learn why the first
 * failed. Nothing on screen said anything about it.
 *
 * Restoring the intent is the fix rather than explaining the failure: with the
 * same amount, currency, destination and provider, the code they were emailed
 * is valid and simply works.
 *
 * ## Why the idempotency key is stored with it
 *
 * This is the half that matters on a money system. The key names the user's
 * INTENT (R-5.2), and it was a `useRef` — so it died with the refresh. A client
 * who submitted, lost the response to a dropped connection, and reloaded would
 * submit again under a NEW key, and the server would correctly read that as a
 * second, different withdrawal. Persisting it means the retry collapses into
 * the first request, which is the entire purpose of the header.
 *
 * ## What is deliberately NOT stored
 *
 * The OTP itself. It is a credential; the intent is not. Leaving a live
 * withdrawal code in `sessionStorage` on a shared device would hand the next
 * person the one factor that the amount and destination cannot give them.
 *
 * ## Lifecycle
 *
 * `sessionStorage`, per-tab, and dying with it — the same choice, for the same
 * reasons, as `lib/kyc-draft.ts`. Cleared on a completed withdrawal, on leaving
 * the confirm step, on logout, and by a TTL enforced on READ, because a timer
 * does not run in a backgrounded tab and the read is the only moment the value
 * can actually be used.
 */

const INTENT_KEY = 'oxshare_withdraw_intent';
const WRITTEN_AT_KEY = 'oxshare_withdraw_intent_written_at';

/**
 * How long a part-finished withdrawal is worth restoring.
 *
 * Fifteen minutes, deliberately short — and shorter than the KYC draft's twelve
 * hours, because these are two different things. A half-filled onboarding form
 * is worth keeping across a commute. A withdrawal the client walked away from
 * is one they have abandoned, and the emailed code expires on the server on
 * roughly this scale anyway, so restoring an older one would produce exactly
 * the "this code is wrong" confusion this module exists to remove.
 */
const INTENT_TTL_MS = 15 * 60 * 1000;

export interface WithdrawIntent {
  amount: string;
  currency: string;
  destination: string;
  /** The R-5.2 key, so a retry after a lost response is the same withdrawal. */
  idempotencyKey: string;
  /** Whether the server asked for a code, so the restored form matches what was sent. */
  otpRequired: boolean;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Safari in private mode, and any browser with storage disabled. A portal
    // that throws here would be a portal that cannot render, so a client who
    // simply loses the restore is the right failure.
    return null;
  }
}

export function saveWithdrawIntent(intent: WithdrawIntent): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      INTENT_KEY,
      JSON.stringify({
        amount: intent.amount,
        currency: intent.currency,
        destination: intent.destination,
        idempotencyKey: intent.idempotencyKey,
        otpRequired: String(intent.otpRequired),
      }),
    );
    store.setItem(WRITTEN_AT_KEY, String(Date.now()));
  } catch {
    /* quota, or a storage that accepts a read and refuses a write */
  }
}

/** The stored intent, or null if there is none, it is malformed, or it has expired. */
export function readWithdrawIntent(): WithdrawIntent | null {
  const store = storage();
  if (!store) return null;

  const writtenAt = Number(store.getItem(WRITTEN_AT_KEY));
  if (!writtenAt || Date.now() - writtenAt > INTENT_TTL_MS) {
    clearWithdrawIntent();
    return null;
  }

  // `parseStringRecord` takes the RAW string and swallows a malformed one into
  // `{}` — so a hand-edited or half-written entry falls through the
  // every-field-or-nothing check below rather than throwing on a money screen.
  const parsed = parseStringRecord(store.getItem(INTENT_KEY));

  const { amount, currency, destination, idempotencyKey } = parsed;
  // Every field or nothing. A partial restore would put the form into a state
  // the client never chose, on a screen that moves money.
  if (!amount || !currency || !destination || !idempotencyKey) {
    clearWithdrawIntent();
    return null;
  }

  return {
    amount,
    currency,
    destination,
    idempotencyKey,
    otpRequired: parsed['otpRequired'] !== 'false',
  };
}

export function clearWithdrawIntent(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(INTENT_KEY);
    store.removeItem(WRITTEN_AT_KEY);
  } catch {
    /* nothing to release */
  }
}
