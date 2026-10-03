'use client';

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { LOCALE_NAMES, currentLocale, t, type Locale } from '@/lib/i18n';
import { switchLocale } from '@/lib/i18n/switch-locale';
import { profileApi } from '@/lib/api/profile';
import { useUser } from '@/context/UserContext';

/**
 * English ⇄ العربية, one click, beside the theme toggle — in the portal header
 * and on every sign-in screen.
 *
 * A TOGGLE rather than a menu: there are two languages, so the button names the
 * one you would switch TO, in that language ("العربية" on an English page,
 * "English" on an Arabic one) — readable by exactly the person who needs it.
 * A third locale is the day this becomes a dropdown.
 *
 * Signed in, the choice is also saved on the account (`PUT /profile/locale`) so
 * the server's emails follow it; signed out it lives in the cookie alone, and
 * registration carries it over.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { isAuthenticated } = useUser();
  const [busy, setBusy] = useState(false);
  const target: Locale = currentLocale() === 'ar' ? 'en' : 'ar';
  const name = LOCALE_NAMES[target];
  const label = t('language.switchTo', { language: name });

  const onClick = () => {
    if (busy) return;
    setBusy(true);
    void switchLocale(
      target,
      isAuthenticated ? (locale) => profileApi.setLocale(locale) : undefined,
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      lang={target}
      className={`flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-outline disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{name}</span>
      <span className="sm:hidden" aria-hidden="true">
        {target === 'ar' ? 'ع' : 'EN'}
      </span>
    </button>
  );
}
