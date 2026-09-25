'use client';

import * as React from 'react';
import { FileText, List } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { AccountStatement } from '@/components/transactions/account-statement';
import { ActivityList } from '@/components/transactions/activity-list';
import { useTabParam } from '@/hooks/use-tab-param';
import { t } from '@/lib/i18n';

const TABS = ['statement', 'activity'] as const;

/**
 * STATEMENT — the last item of the sidebar's Transactions group.
 *
 * Two views of the same money, because they answer different questions:
 *
 *   Account statement  "where did it leave me" — one wallet over a period,
 *                      opening to closing balance, printable. The document.
 *   All activity       "what happened" — every movement of every kind, with
 *                      its state, filterable. What `/transactions` always was.
 *
 * The route stays `/transactions` so every link already pointing here — the
 * dashboard's "view all", the wallet, the money flows' "track it" — still
 * lands; they pass `?tab=activity` where the list is what they mean.
 */
export default function StatementPage() {
  return (
    <React.Suspense fallback={<div className="flex min-h-0 w-full flex-1" />}>
      <StatementPageContent />
    </React.Suspense>
  );
}

function StatementPageContent() {
  const [tab, setTab] = useTabParam(TABS, 'statement');

  return (
    <div
      className={
        /*
         * The activity list is a `fill` table that owns the viewport (its own
         * note on `min-h-0`); the statement is a document that scrolls with
         * <main> — `flex-1` without `min-h-0`, so it is at least the screen's
         * height (its last panel reaches the bottom) and grows past it when the
         * lines need to. Each gets the root its layout needs.
         */
        tab === 'activity'
          ? 'flex min-h-0 flex-1 flex-col gap-6'
          : 'flex w-full flex-1 flex-col gap-6'
      }
    >
      <div className="shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('statement.pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('statement.pageSubtitle')}</p>
        </div>
        <Tabs
          idPrefix="statement"
          value={tab}
          onValueChange={(next) => setTab(next as (typeof TABS)[number])}
          tabs={[
            {
              value: 'statement',
              label: t('statement.tabStatement'),
              icon: <FileText className="h-4 w-4" aria-hidden="true" />,
            },
            {
              value: 'activity',
              label: t('statement.tabActivity'),
              icon: <List className="h-4 w-4" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      {tab === 'activity' ? <ActivityList /> : <AccountStatement />}
    </div>
  );
}
