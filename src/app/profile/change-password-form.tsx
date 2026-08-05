'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountApi } from '@/lib/api/account';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * Change the password from inside a live session.
 *
 * The API requires the current password and ends every OTHER session on
 * success; the caller's own survives. Both facts are stated on screen before
 * the client submits, because "why am I signed out on my phone" is a support
 * ticket that a sentence prevents.
 */
export function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    /*
     * Checked here so the client is told before a round trip — NOT because the
     * browser is trusted. The API enforces the same bound and its answer is the
     * one that counts; this only saves a request and a wasted throttle slot,
     * which matters because the endpoint allows five attempts in fifteen
     * minutes.
     *
     * The confirm field is checked ONLY here, deliberately: it is a typing aid,
     * so sending it to the API would ask the server to care about a control
     * that exists purely to catch a slip in this form.
     */
    if (next.length < 8) return setError(t('profile.passwordTooShort'));
    if (next !== confirm) return setError(t('profile.passwordMismatch'));

    setBusy(true);
    try {
      const res = await accountApi.changePassword(current, next);
      // The API's OWN message, not a local string: it reports how many other
      // sessions were signed out, and only the server knows that number.
      setSuccess(res.message);
      setCurrent('');
      setNext('');
      setConfirm('');
      // The session list is now stale — every other row has just been revoked.
      onChanged?.();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('profile.passwordChangeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('profile.securitySubtitle')}</p>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="current-password">{t('profile.currentPassword')}</Label>
          <Input
            id="current-password"
            type="password"
            // Tells a password manager this is a change form rather than a
            // login, so it offers to update the stored entry instead of
            // autofilling the old one into the "new" field.
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password">{t('profile.newPassword')}</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">{t('profile.confirmPassword')}</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t('profile.changingPassword')}</span>
          </>
        ) : (
          <span>{t('profile.changePasswordCta')}</span>
        )}
      </Button>
    </form>
  );
}
