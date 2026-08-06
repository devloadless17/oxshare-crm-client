import { ServerOff } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * Honest placeholder for a screen whose backend endpoints do not exist yet.
 *
 * This is the project's answer to "never mock data": a screen with no data says
 * so, rather than rendering a plausible zero. Tracked in docs/DECISIONS.md
 * (D-28, D-30).
 *
 * ── Why the endpoint names are no longer on screen ──────────────────────────
 *
 * They used to render as a row of `<code>` chips — `GET /platforms`,
 * `POST /payments/withdrawals` — directly beneath the message. That is a useful
 * to-do for the API owner and the wrong thing to show a CLIENT: it is internal
 * vocabulary on a customer-facing product, it means nothing to the person
 * reading it, and it publishes the shape of the API surface to everyone who
 * happens to open a page that is not finished yet.
 *
 * NOT a twin any more, for exactly that reason: `oxshare-crm-admin` is an
 * internal tool whose readers are the people who own those endpoints, so the
 * chips still earn their place there. The path was removed from
 * scripts/check-twins.sh with that noted, so the divergence is a decision on
 * the record rather than drift.
 *
 * The `endpoints` prop is DELIBERATELY kept. Every call site already passes it,
 * it is the machine-readable record of what a screen is waiting on, and it
 * remains the thing to grep for when wiring an endpoint up. It simply is not
 * painted.
 */
export function BackendPending({
  title,
  endpoints,
}: {
  title?: string;
  /**
   * What this screen is waiting on, e.g. `['GET /trading/accounts']`.
   *
   * Not rendered — see the note above. Kept because it is the to-do, and a prop
   * that call sites already fill in is a better record than a comment that has
   * to be maintained separately.
   */
  endpoints: string[];
}) {
  // Referenced so the parameter is not dead weight a future reader deletes,
  // taking the record with it. `void` rather than a lint disable: the intent is
  // "held, not used", and that is what this says.
  void endpoints;

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center space-y-3">
      <ServerOff className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-foreground">
        {title ?? t('backendPending.title')}
      </h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
        {t('backendPending.body')}
      </p>
    </div>
  );
}
