'use client';

/**
 * The last resort: a throw in the ROOT layout itself.
 *
 * `error.tsx` sits inside the root layout, so it cannot catch a failure in the
 * layout that renders it — the providers, the theme script, the CSP nonce read.
 * Next falls back to its own built-in page for that, which in production is an
 * unbranded "Application error" with a stack-trace digest and nothing else.
 *
 * This one renders its own `<html>` and `<body>` because at this point no layout
 * has produced them, and it deliberately uses inline styles and a plain string
 * rather than the design system or `t()`: whatever broke may be the stylesheet,
 * the theme provider or the i18n module, and a fallback that depends on the
 * thing that failed is not a fallback.
 *
 * The same reasoning keeps its two languages HERE rather than in the catalogue:
 * the cookie is read directly (`oxshare-portal-locale`, see
 * lib/i18n/locale-storage), and an Arabic reader gets Arabic, right to left.
 */
const COPY = {
  en: {
    title: 'Something went wrong',
    body: 'The OxShare portal could not load. Your account and balances are unaffected.',
    retry: 'Try again',
  },
  ar: {
    title: 'حدث خطأ ما',
    body: 'تعذّر تحميل بوابة OXShare. حسابك وأرصدتك لم تتأثر.',
    retry: 'حاول مرة أخرى',
  },
} as const;

function cookieLocale(): 'en' | 'ar' {
  if (typeof document === 'undefined') return 'en';
  return /(?:^|;\s*)oxshare-portal-locale=ar(?:;|$)/.test(document.cookie) ? 'ar' : 'en';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = cookieLocale();
  const copy = COPY[locale];
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{copy.title}</h1>
        <p style={{ maxWidth: '28rem', fontSize: '0.875rem', opacity: 0.75 }}>{copy.body}</p>
        {error.digest && (
          <p dir="ltr" style={{ fontFamily: 'monospace', fontSize: '0.6875rem', opacity: 0.6 }}>
            {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
            background: 'none',
            border: 0,
            padding: 0,
            color: 'inherit',
          }}
        >
          {copy.retry}
        </button>
      </body>
    </html>
  );
}
