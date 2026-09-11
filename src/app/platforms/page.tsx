'use client';

import { Apple, Download, Monitor, Smartphone } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { platformsApi, type PlatformKey, type PlatformLink } from '@/lib/api/platforms';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Where a client downloads the trading terminal.
 *
 * The three links are operator data held in `platform_links` and set from the
 * admin settings screen — not environment variables, because they change with
 * every terminal build and the person who changes them does not ship releases.
 *
 * ## An unconfigured platform says so
 *
 * `GET /platforms` always returns all three keys, with `url: null` for the ones
 * nobody has set up. That is deliberate on the API side and it is what this
 * screen is built around, because the two obvious alternatives are both worse:
 *
 *   - Hide the row. The client cannot discover that an Android build exists at
 *     all, and support fields the question instead.
 *   - Render a button anyway. It goes nowhere, and a dead download button on a
 *     trading platform reads as a broken product.
 *
 * So the row renders with the platform named, the state stated, and no link.
 * Same rule as the wallet showing "not opened yet" rather than a fabricated
 * $0.00: say what is true rather than showing something plausible.
 *
 * The URL itself is never constructed here. The API refuses anything that is
 * not `https:` — an admin-set value becomes an `href` in every client's
 * browser, so `javascript:` there would be stored XSS — and this screen adds no
 * opinion of its own on top of that.
 */

interface PlatformMeta {
  icon: React.ElementType;
  label: MessageKey;
  hint: MessageKey;
}

/**
 * Presentation order and copy, keyed by the API's own keys.
 *
 * A `Record` rather than an array the page maps over: the ORDER comes from the
 * API (it returns them in presentation order) and the labels come from here, so
 * a key the backend adds later renders with a missing label rather than
 * silently disappearing from the page.
 */
const META: Record<PlatformKey, PlatformMeta> = {
  desktop: { icon: Monitor, label: 'platforms.desktop', hint: 'platforms.desktopHint' },
  ios: { icon: Apple, label: 'platforms.ios', hint: 'platforms.iosHint' },
  android: { icon: Smartphone, label: 'platforms.android', hint: 'platforms.androidHint' },
};

export default function PlatformsPage() {
  const platforms = useResource(keys.platforms.all(), (signal) => platformsApi.list(signal));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('platforms.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('platforms.subtitle')}</p>
      </header>

      <AsyncBoundary
        status={platforms.status}
        label={t('platforms.loading')}
        endpoints={['GET /platforms']}
        onRetry={() => void platforms.refetch()}
        errorMessage={t('platforms.loadFailed')}
        error={platforms.error}
        // Centres the spinner in the space actually left below the header,
        // rather than inside its own min-height.
        fill
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(platforms.data ?? []).map((platform) => (
            <PlatformCard key={platform.key} platform={platform} />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function PlatformCard({ platform }: { platform: PlatformLink }) {
  const meta = META[platform.key];
  // A key the backend added that the portal does not know about yet. Skipped
  // rather than crashed: a new platform appearing before its copy does should
  // not take the whole page down.
  if (!meta) return null;

  const Icon = meta.icon;
  const available = Boolean(platform.url);

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
          available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <h2 className="mt-4 text-sm font-semibold text-foreground">{t(meta.label)}</h2>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
        {available ? t(meta.hint) : t('platforms.unavailableHint')}
      </p>

      <div className="mt-5">
        {available ? (
          <Button asChild className="w-full">
            {/*
              `rel="noopener noreferrer"` because this href is operator-supplied
              and points off-site. Without `noopener` the destination gets a
              handle on this tab through `window.opener` and can navigate it —
              to a copy of the sign-in screen, on a page the client reached from
              inside their own portal. `noreferrer` keeps the portal URL, which
              carries no secrets but names the product, out of their logs.

              A new tab rather than a navigation: leaving the portal to fetch an
              installer would lose whatever the client was doing.
            */}
            <a
              href={platform.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={t('platforms.opensExternally')}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{t('platforms.download')}</span>
            </a>
          </Button>
        ) : (
          /*
            Rendered as a span, not a disabled button and not a link with a dead
            href. An anchor with no destination is still focusable and still
            navigable by middle-click, and a disabled <button> invites the
            client to keep trying it.
          */
          <span
            aria-disabled="true"
            className="inline-flex h-10 w-full cursor-not-allowed select-none items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-4 text-sm font-semibold text-muted-foreground/70"
          >
            {t('platforms.unavailable')}
          </span>
        )}
      </div>
    </article>
  );
}
