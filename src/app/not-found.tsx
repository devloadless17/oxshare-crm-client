import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { translate } from '@/lib/i18n';
import { serverLocale } from '@/lib/i18n/server';

/**
 * A missing route or a bad dynamic segment, inside the product rather than
 * outside it.
 *
 * `/kyc/step/99` used to fall through to the framework default, which renders
 * with no chrome and no way back — the same dead end as a render throw, reached
 * by an ordinary mistyped URL or a stale link in an old email.
 */
export default async function PortalNotFound() {
  // A SERVER component: it renders outside <LocaleProvider>, so it asks for the
  // request's language itself rather than reading `t()`'s module state.
  const locale = await serverLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 overflow-y-auto bg-background px-6 text-center">
      <FileQuestion className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-bold text-foreground">{t('notFound.title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('notFound.body')}</p>
      <Link
        href="/dashboard"
        className="rounded-sm text-sm font-semibold text-primary hover:underline"
      >
        {t('error.backToDashboard')}
      </Link>
    </div>
  );
}
