'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { Transaction } from '@/lib/api/payments';
import { compareMoney } from '@/lib/money';
import { EMPTY_RANGE, withinRange, type DateRange } from '@/lib/date-range';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The transactions toolbar, and the filtering it drives.
 *
 * Extracted from the page so the page stays a page: the filter STATE shape, the
 * comparators and the narrowing rules are one concern, and keeping them beside
 * the table meant one file owning both "what the client's history is" and "how
 * it is being sliced".
 *
 * `applyFilters` is exported and pure, so the rules that are expensive to get
 * wrong — money sorted as text, a search that misses the formatted amount — are
 * assertions rather than something you find by clicking.
 */

/** The five states a transaction can hold, mapped to copy and colour. */
export const STATE: Record<Transaction['state'], { key: MessageKey; className: string }> = {
  pending: {
    key: 'transactions.statePending',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  approved: { key: 'transactions.stateApproved', className: 'bg-info/10 text-info border-info/20' },
  success: {
    key: 'transactions.stateSuccess',
    className: 'bg-success/10 text-success border-success/20',
  },
  rejected: {
    key: 'transactions.stateRejected',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  failure: {
    key: 'transactions.stateFailure',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export type SortKey = 'newest' | 'oldest' | 'amountDesc' | 'amountAsc';

const SORTS: { key: SortKey; label: MessageKey }[] = [
  { key: 'newest', label: 'transactions.sortNewest' },
  { key: 'oldest', label: 'transactions.sortOldest' },
  { key: 'amountDesc', label: 'transactions.sortAmountDesc' },
  { key: 'amountAsc', label: 'transactions.sortAmountAsc' },
];

export interface Filters {
  direction: 'all' | Transaction['direction'];
  state: 'all' | Transaction['state'];
  currency: string;
  search: string;
  range: DateRange;
  sort: SortKey;
}

export const INITIAL_FILTERS: Filters = {
  direction: 'all',
  state: 'all',
  currency: 'all',
  search: '',
  range: EMPTY_RANGE,
  sort: 'newest',
};

/** True when anything is narrowing the list — drives the "Clear" affordance. */
export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.direction !== 'all' ||
    filters.state !== 'all' ||
    filters.currency !== 'all' ||
    filters.search.trim() !== '' ||
    filters.range.from !== null ||
    filters.range.to !== null
  );
}

/**
 * Narrow and order the rows.
 *
 * CLIENT-SIDE, and correct only because `GET /payments/transactions` returns the
 * client's whole history as a bare array — it accepts no query parameters. So
 * the counts are honest ("showing 4 of 37" counts the real total) and a sort
 * covers the entire set rather than one page.
 *
 * IF THAT ENDPOINT EVER GROWS PAGING, this must move server-side. Filtering a
 * page and presenting it as a filter over the history is the failure R-2.5
 * names, and here it would silently under-report a client's own money.
 */
export function applyFilters(rows: Transaction[], filters: Filters): Transaction[] {
  const needle = filters.search.trim().toLowerCase();

  const matched = rows.filter((row) => {
    if (filters.direction !== 'all' && row.direction !== filters.direction) return false;
    if (filters.state !== 'all' && row.state !== filters.state) return false;
    if (filters.currency !== 'all' && row.currency !== filters.currency) return false;
    if (!withinRange(row.createdAt, filters.range)) return false;

    if (needle) {
      /*
       * Matched against the RAW amount string, not the formatted one.
       *
       * `formatMoney` inserts a currency symbol and grouping separators, so
       * searching the formatted text would make "1234" fail to match
       * "$1,234.00" — the exact number the client can see on screen. The raw
       * string is also what they are most likely copying from a bank statement.
       */
      const haystack = [row.providerRef, row.amount, row.destination, row.provider]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  /*
   * Sorted on a COPY — `Array.prototype.sort` mutates, and `rows` is React
   * Query's cached array. Sorting it in place would reorder the cache, so the
   * next render would depend on whichever sort was last applied.
   */
  return [...matched].sort((a, b) => {
    switch (filters.sort) {
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt);
      /*
       * Amount sorts go through decimal.js, never `Number()`.
       *
       * These are NUMERIC(28,8) strings: `Number('12345678901234567.89')` has
       * already lost precision before any comparison, and a plain string
       * compare puts '9.00' above '100.00'. Same trap admin's
       * `sortType: 'money'` exists to close.
       */
      case 'amountDesc':
        return compareMoney(b.amount, a.amount);
      case 'amountAsc':
        return compareMoney(a.amount, b.amount);
      case 'newest':
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
}

/**
 * The toolbar.
 *
 * Native `<select>` rather than the Radix `Select` used elsewhere in this app.
 * These are short, flat lists of plain strings with no icons or descriptions,
 * and the native control brings its own mobile picker, keyboard type-ahead and
 * accessibility for free. `ui/select.tsx` stays right where an option must
 * render as something other than text.
 */
export function TransactionFilters({
  filters,
  currencies,
  onChange,
  onClear,
}: {
  filters: Filters;
  currencies: string[];
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onClear: () => void;
}) {
  const selectClass =
    'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted focus-outline';

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-semibold">{t('transactions.filters')}</span>
        </div>
        {/* Only when something is set. A permanently visible "Clear" on an
            untouched toolbar is a control that does nothing. */}
        {hasActiveFilters(filters) && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {t('transactions.filterClear')}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('transactions.filterType')}
          </span>
          <select
            value={filters.direction}
            onChange={(event) => onChange('direction', event.target.value as Filters['direction'])}
            className={selectClass}
          >
            <option value="all">{t('transactions.filterAll')}</option>
            <option value="deposit">{t('transactions.deposit')}</option>
            <option value="withdrawal">{t('transactions.withdrawal')}</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('transactions.filterStatus')}
          </span>
          <select
            value={filters.state}
            onChange={(event) => onChange('state', event.target.value as Filters['state'])}
            className={selectClass}
          >
            <option value="all">{t('transactions.filterAll')}</option>
            {/* Driven by the same typed map the badges use, so a new state
                cannot appear in one and be missing from the other. */}
            {(Object.keys(STATE) as Transaction['state'][]).map((state) => (
              <option key={state} value={state}>
                {t(STATE[state].key)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('transactions.filterCurrency')}
          </span>
          <select
            value={filters.currency}
            onChange={(event) => onChange('currency', event.target.value)}
            className={selectClass}
          >
            <option value="all">{t('transactions.filterAll')}</option>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>

        {/* The two-calendar range picker, behind one trigger. */}
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('transactions.filterDateRange')}
          </span>
          <DateRangePicker
            value={filters.range}
            onChange={(range) => onChange('range', range)}
            label={t('transactions.filterDateRange')}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('transactions.filterSearch')}
          </span>
          <Input
            value={filters.search}
            onChange={(event) => onChange('search', event.target.value)}
            placeholder={t('transactions.filterSearchPlaceholder')}
            className="h-9 text-xs"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('transactions.sortLabel')}
          </span>
          <select
            value={filters.sort}
            onChange={(event) => onChange('sort', event.target.value as SortKey)}
            className={selectClass}
          >
            {SORTS.map((sort) => (
              <option key={sort.key} value={sort.key}>
                {t(sort.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
