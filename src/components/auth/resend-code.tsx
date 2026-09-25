'use client';

import * as React from 'react';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';

/**
 * The server's cooldown between codes — `EMAIL_CODE_RESEND_COOLDOWN_MS`.
 *
 * Mirrored, not merely similar: a resend inside the cooldown is answered with
 * the same sentence as a real one and sends NOTHING, so a button offered any
 * sooner than this would tell somebody a code was on its way when none was.
 */
export const RESEND_COOLDOWN_MS = 30_000;

/** Whole seconds until another code may be asked for; 0 when it may now. */
export function secondsUntilResend(sentAt: number, now: number): number {
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 1000));
}

/** `0:22` — the clock face the countdown is read as, not "22s". */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * "Didn't receive the code? Resend in 0:22", then a button.
 *
 * The clock is counted from `sentAt`, which the parent keeps in
 * `lib/pending-email.ts`, so a reload lands mid-countdown rather than offering a
 * resend the server would swallow.
 *
 * It ticks only until the deadline. A timer left running on an idle screen
 * re-renders it once a second for as long as somebody leaves the tab open —
 * which, on a screen people wait on, is a long time.
 */
export function ResendCode({
  email,
  sentAt,
  disabled = false,
  onSent,
  onFailed,
}: {
  email: string;
  sentAt: number;
  disabled?: boolean;
  /** The server accepted the request; `at` is when, for the next countdown. */
  onSent: (at: number) => void;
  onFailed: (error: unknown) => void;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  const [sending, setSending] = React.useState(false);
  const inFlight = React.useRef(false);
  const remaining = secondsUntilResend(sentAt, now);

  React.useEffect(() => {
    const deadline = sentAt + RESEND_COOLDOWN_MS;
    // Only ever called from a timer, so `interval` below is always assigned by then.
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= deadline) clearInterval(interval);
    };
    // Re-read the clock at once: `now` may be from long before this `sentAt`.
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [sentAt]);

  const send = async () => {
    // A ref as well as the state: two taps inside one render would both see
    // `sending` false and ask twice.
    if (inFlight.current || remaining > 0 || disabled) return;
    inFlight.current = true;
    setSending(true);
    try {
      await api.auth.resendVerification(email);
      onSent(Date.now());
    } catch (error: unknown) {
      onFailed(error);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  // Deliberately NOT a live region: the countdown changes every second, and a
  // screen reader would read out every one of them.
  return (
    <p className="text-center text-sm text-muted-foreground">
      {t('auth.confirm.noCodeYet')}{' '}
      {remaining > 0 ? (
        <span className="font-medium tabular-nums text-foreground">
          {t('auth.confirm.resendIn', { time: formatCountdown(remaining) })}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || disabled}
          className="cursor-pointer rounded-xs font-semibold text-link hover:underline focus-outline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? t('auth.confirm.resending') : t('auth.confirm.resend')}
        </button>
      )}
    </p>
  );
}
