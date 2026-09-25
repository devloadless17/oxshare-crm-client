'use client';

import * as React from 'react';
import { MoneyHeader } from '@/components/money/money-shell';
import { MoneyTabs, MONEY_TABS } from '@/components/money/money-tabs';
import { MovementHistory, type HistoryScope } from '@/components/transactions/movement-history';
import { useTabParam } from '@/hooks/use-tab-param';

/**
 * The frame of the Deposit, Withdraw and Transfer screens: the way back, the
 * New / History tabs, and whichever of the two is open.
 *
 * One component rather than the same twenty lines in three pages, because the
 * three must behave identically — the tab in `?tab=` (so a notification can
 * open a history directly), the Suspense boundary `useSearchParams` requires,
 * and the two different layouts below.
 *
 * ## Two layouts, on purpose
 *
 * The FORM fills the viewport: `flex min-h-0 flex-1`, so its step card is
 * bounded by the screen and its body scrolls inside (each page's own note says
 * why). The HISTORY is a document: `flex-1` WITHOUT `min-h-0`, so it is at
 * least the screen's height — its last panel stretches to the bottom rather
 * than stopping mid-screen — and grows past it when the rows need to, with
 * `<main>` scrolling. `min-h-0` there would cap it at the viewport and turn a
 * long table into a second scrollbar inside the page.
 */
export function MoneyScreen({
  scope,
  children,
}: {
  scope: HistoryScope;
  /** The form — rendered only on the New tab. */
  children: React.ReactNode;
}) {
  return (
    <React.Suspense fallback={<div className="flex min-h-0 w-full flex-1" />}>
      <MoneyScreenContent scope={scope}>{children}</MoneyScreenContent>
    </React.Suspense>
  );
}

function MoneyScreenContent({
  scope,
  children,
}: {
  scope: HistoryScope;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(MONEY_TABS, 'new');

  return (
    <div
      className={
        tab === 'history'
          ? 'flex w-full flex-1 flex-col gap-4'
          : 'flex min-h-0 w-full flex-1 flex-col gap-4'
      }
    >
      <MoneyHeader />
      <MoneyTabs scope={scope} value={tab} onValueChange={setTab} />
      {tab === 'history' ? <MovementHistory scope={scope} onNew={() => setTab('new')} /> : children}
    </div>
  );
}
