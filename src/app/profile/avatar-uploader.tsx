'use client';

import * as React from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/api/account';
import { apiErrorMessage } from '@/lib/api/errors';
import { API_BASE_URL } from '@/lib/env';
import { t } from '@/lib/i18n';

/**
 * The client's profile photo, with the edit control ON the photo.
 *
 * The first version put a "Upload a photo" button and a hint beside the avatar,
 * which took a whole row of the header to say something the badge says by being
 * there. The corner badge is also the pattern people already know from every
 * account screen they use, so it needs no label to be understood.
 *
 * ## The URL needs the API base in front of it
 *
 * `avatarUrl` comes back as `/uploads/avatars/<uuid>.png` — a path on the API,
 * not on this app. Rendering it directly asks Next for that path and gets a
 * 404. `API_BASE_URL` is `/api`, which next.config.ts rewrites to the API, so
 * composing it here is what reaches the route serving the bytes — and it keeps
 * the session cookie attached, which that route requires.
 *
 * ## Why the file input lives inside a <label>
 *
 * `<input type="file">` cannot be styled, and the usual workaround — a button
 * that calls `.click()` on a ref — throws away keyboard activation and the
 * screen-reader announcement. A label wrapping a visually-hidden input keeps
 * all of the native behaviour and carries the appearance itself.
 */
export function AvatarUploader({
  avatarUrl,
  firstName,
  lastName,
  onChanged,
}: {
  avatarUrl: string | null | undefined;
  firstName: string;
  lastName: string;
  /** Refetches the profile, so every avatar in the chrome updates at once. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const MAX_BYTES = 2 * 1024 * 1024;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    /*
     * Checked here so the client is told immediately, NOT because the browser
     * is trusted. The API enforces the same ceiling and decides the accepted
     * types from the file's own magic bytes; this only saves uploading two
     * megabytes to be told no.
     *
     * The TYPE is deliberately not checked here — the browser's guess is the
     * very claim the server refuses to believe.
     */
    if (file.size > MAX_BYTES) {
      setError(t('profile.photoTooLarge'));
      return;
    }

    setBusy(true);
    try {
      await accountApi.uploadAvatar(file);
      onChanged();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('profile.photoFailed')));
    } finally {
      setBusy(false);
      // Cleared so choosing the SAME file again still fires `change`. Without
      // this, a client who fixes a rejected upload and re-picks the same
      // filename gets no event at all.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      await accountApi.removeAvatar();
      onChanged();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('profile.photoFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0">
      <div className="relative w-fit">
        <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
          <AvatarImage src={avatarUrl ? `${API_BASE_URL}${avatarUrl}` : undefined} alt="" />
          <AvatarFallback className="text-2xl">{initialsOf(firstName, lastName)}</AvatarFallback>
        </Avatar>

        {/*
          NOT `bg-primary`. The avatar's initials fallback is already amber, so
          an amber badge on top of it is one amber shape overlapping another and
          the control disappears exactly when there is no photo to look at —
          which is the case where the client most needs to find it.

          `bg-foreground` is the page's text colour, so it is near-black on the
          light theme and near-white on the dark one. Both read clearly against
          amber, and against a photo of anything. The usual objection to
          foreground/background inversion does not apply here: what it sits on
          is the avatar, which does not flip with the theme.

          `ring-card` rather than a border, so it reads as sitting ON the avatar
          rather than beside it, at any size.
        */}
        <label
          title={avatarUrl ? t('profile.photoChange') : t('profile.photoUpload')}
          className={`absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-card transition-opacity focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[color:var(--ring)] ${
            busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            // A hint for the picker only. `accept` is bypassed by choosing
            // "all files", which is why the server decides from the bytes.
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            className="sr-only"
          />
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {/* The icon carries no name of its own, and this control opens a file
              picker that replaces the client's photo. */}
          <span className="sr-only">
            {avatarUrl ? t('profile.photoChange') : t('profile.photoUpload')}
          </span>
        </label>
      </div>

      {/* Remove sits BELOW rather than as a second badge: two corner buttons on
          a 20px radius are a mis-tap waiting to happen, and this one is
          destructive. It appears only when there is something to remove. */}
      {avatarUrl && !busy && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleRemove()}
          className="mt-2 h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-transparent hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          <span>{t('profile.photoRemove')}</span>
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 max-w-[12rem] text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
