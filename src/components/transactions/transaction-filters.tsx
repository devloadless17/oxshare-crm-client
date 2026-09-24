'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { Transaction, TransactionQuery } from '@/lib/api/payments';
import { EMPTY_RANGE, type DateRange } from '@/lib/date-range';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The transactions toolbar, and the query it produces.
 *
 * Extracted from the page so the page stays a page: the filter STATE shape and
 * its translation to the wire are one concern, and keeping them beside the table
 * meant one file owning both "what the client's history is" and "how it is being
 * sliced".
 *
 * ## The narrowing itself has MOVED TO THE SERVER
 *
 * This file used to export `applyFilters`, `sortRows` and `paginate` — pure
 * functions that ran in the browser over what was documented as the client's
 * whole history. It was not the whole history: the endpoint capped its array at
 * 100 rows, so anyone past that was filtering the newest hundred while the count
 * on screen claimed otherwise.
 *
 * `toQuery` is what replaced them: the toolbar's state as query parameters the
 * database applies. Still pure, still the one place `'all'` becomes "no
 * parameter", and still worth its own tests for that reason.
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

export interface Filters {
  direction: 'all' | Transaction['direction'];
  state: 'all' | Transaction['state'];
  currency: string;
  range: DateRange;
}

export const INITIAL_FILTERS: Filters = {
  direction: 'all',
  state: 'all',
  currency: 'all',
  range: EMPTY_RANGE,
};

/** True when anything is narrowing the list — drives the "Clear" affordance. */
export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.direction !== 'all' ||
    filters.state !== 'all' ||
    filters.currency !== 'all' ||
    filters.range.from !== null ||
    filters.range.to !== null
  );
}

/**
 * The toolbar's state, as the API's query parameters.
 *
 * ## ⚠️ Filtering is the DATABASE's job now, and this is the whole seam
 *
 * `applyFilters`, `sortRows` and `paginate` used to live here and ran in the
 * browser. That was documented as correct because the endpoint "returns the
 * client's whole history as a bare array" — and it did not: `listForUser`
 * carried a `LIMIT 100`. So a client with more history than that was filtering
 * the newest hundred while the screen reported the result as a filter over
 * everything, which is R-2.5's under-report on the one screen a client would use
 * to check their own ledger.
 *
 * The server applies every constraint now, against the whole table, and returns
 * the real matching count. What is left here is the translation between the
 * toolbar's shape and the API's — pure, and the only place `'all'` is turned
 * into an absent parameter.
 *
 * `'all'` maps to `undefined`, never to an empty string: `state=` reaches the
 * API as `''` and fails its `@IsIn`, so "no filter" has to be the absence of the
 * parameter rather than a blank one.
 */
export function toQuery(filters: Filters): TransactionQuery {
  return {
    direction: filters.direction === 'all' ? undefined : filters.direction,
    state: filters.state === 'all' ? undefined : filters.state,
    currency: filters.currency === 'all' ? undefined : filters.currency,
    /*
     * The range is already `YYYY-MM-DD` — `lib/date-range.ts` keeps it that way
     * precisely so it can cross a wire without a timezone conversion. Never
     * `toISOString().split('T')[0]` here: that converts to UTC first and returns
     * tomorrow for eastern zones in the evening.
     */
    from: filters.range.from ?? undefined,
    to: filters.range.to ?? undefined,
  };
}

/**
 * The toolbar: type, status, currency and a date range.
 *
 * ## What is NOT here any more
 *
 * The free-text SEARCH and the sort SELECT are gone. Sorting moved to the table
 * headers, where the column being ordered is the thing being clicked. The search
 * box matched provider references and raw amount strings — a field whose useful
 * inputs were values the client had to already have copied from somewhere else,
 * sitting permanently above a table they can now order and page through.
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

      {/*
        FIVE columns, not four, so the date range can have two of them.

        Every control here was one equal cell, which for a range is not enough:
        its trigger renders "2026-08-01 — 2026-08-31", roughly twice the longest
        label any of the three selects can show, so it truncated to an ellipsis
        and the client could not read the range they had just chosen. Widening
        the field is the fix; making it TALLER than its neighbours would have
        been a row of controls that no longer line up.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label={t('transactions.filterType')}
          value={filters.direction}
          onValueChange={(value) => onChange('direction', value as Filters['direction'])}
          options={[
            { value: 'all', label: t('transactions.filterAll') },
            { value: 'deposit', label: t('transactions.deposit') },
            { value: 'withdrawal', label: t('transactions.withdrawal') },
          ]}
        />

        <FilterSelect
          label={t('transactions.filterStatus')}
          value={filters.state}
          onValueChange={(value) => onChange('state', value as Filters['state'])}
          options={[
            { value: 'all', label: t('transactions.filterAll') },
            /* Driven by the same typed map the badges use, so a new state cannot
               appear in one and be missing from the other. */
            ...(Object.keys(STATE) as Transaction['state'][]).map((state) => ({
              value: state,
              label: t(STATE[state].key),
            })),
          ]}
        />

        <FilterSelect
          label={t('transactions.filterCurrency')}
          value={filters.currency}
          onValueChange={(value) => onChange('currency', value)}
          options={[
            { value: 'all', label: t('transactions.filterAll') },
            ...currencies.map((currency) => ({ value: currency, label: currency })),
          ]}
        />

        {/*
          The two-calendar range picker, behind one trigger — and TWO cells wide.

          `sm:col-span-2` gives it the whole row at the two-column breakpoint,
          where a half-width trigger is narrower still than it is on desktop.
        */}
        <label className="space-y-1.5 sm:col-span-2">
          {/* `block`, like every other caption in this row: an inline caption sits
              in the label's taller line box and lands lower than its neighbours. */}
          <span className="block text-[11px] font-semibold text-muted-foreground">
            {t('transactions.filterDateRange')}
          </span>
          <DateRangePicker
            value={filters.range}
            onChange={(range) => onChange('range', range)}
            label={t('transactions.filterDateRange')}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * One labelled filter, on the app's own Select rather than a native one.
 *
 * These were native `<select>`s, chosen because the lists are short and flat and
 * the native control brings its own mobile picker for free. They are the Radix
 * one now for consistency: every other select on this app — the deposit
 * destination, the withdraw account — is already `ui/select`, and two controls
 * that do the same job while looking and behaving differently is the thing that
 * reads as unfinished. The native control also cannot be themed, so these were
 * the one place in the portal where dark mode fell back to the OS palette.
 *
 * NOT wrapped in a `<label>`: the trigger is a button, and a label wrapping a
 * button makes the whole label a second click target for it. `aria-label` names
 * it instead, and the visible caption sits above.
 */
function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label} className="h-9 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
