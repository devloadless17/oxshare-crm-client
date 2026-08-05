import type { Metadata } from 'next';
import { LineChart, Plus } from 'lucide-react';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Trading Accounts — OXShare' };

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('accounts.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('accounts.subtitle')}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover press focus-outline"
        >
          <Plus className="h-4 w-4" />
          {t('accounts.openNew')}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <LineChart className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <h3 className="mt-4 text-sm font-semibold">{t('accounts.empty')}</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          {t('accounts.emptyBody')}
        </p>
      </div>
    </div>
  );
}
