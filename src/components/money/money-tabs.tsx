'use client';

import { History, Plus } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { t, type MessageKey } from '@/lib/i18n';

export type MoneyTab = 'new' | 'history';
export const MONEY_TABS: readonly MoneyTab[] = ['new', 'history'];

const NEW_LABEL: Record<'deposits' | 'withdrawals' | 'transfers', MessageKey> = {
  deposits: 'history.newDeposit',
  withdrawals: 'history.newWithdrawal',
  transfers: 'history.newTransfer',
};

/**
 * The two faces of a money screen: make one, or see the ones already made.
 *
 * Tabs rather than the history stacked under the form, because the form is a
 * full-height step card with its own scrolling body — a table beneath it would
 * sit below the fold on every screen, and shrinking the card to make room costs
 * the steps the height they were sized for.
 */
export function MoneyTabs({
  scope,
  value,
  onValueChange,
}: {
  scope: 'deposits' | 'withdrawals' | 'transfers';
  value: MoneyTab;
  onValueChange: (value: MoneyTab) => void;
}) {
  return (
    <Tabs
      idPrefix={`money-${scope}`}
      value={value}
      onValueChange={(next) => onValueChange(next as MoneyTab)}
      className="shrink-0"
      tabs={[
        {
          value: 'new',
          label: t(NEW_LABEL[scope]),
          icon: <Plus className="h-4 w-4" aria-hidden="true" />,
        },
        {
          value: 'history',
          label: t('history.tab'),
          icon: <History className="h-4 w-4" aria-hidden="true" />,
        },
      ]}
    />
  );
}
