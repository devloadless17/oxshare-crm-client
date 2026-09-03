'use client';

import * as React from 'react';
import { Search, Users } from 'lucide-react';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Input } from '@/components/ui/input';
import { Pill, TABLE_FRAME, TABLE_PAGE_SIZE, formatDate } from '@/components/partner/partner-ui';
import type { IbOverview, IbReferredClient } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * Every client this partner introduced.
 *
 * ## Why this is a tab rather than a box inside the overview
 *
 * It was a `max-h-[22rem]` scroll box with no sort, no search, and no indication
 * of how much sat below the fold. That treatment gets worse exactly as a partner
 * succeeds — the one with two hundred clients had the least usable view of them.
 *
 * ## Filtering here is CLIENT-SIDE over a CAPPED list, and the copy says so
 *
 * `referredClients` used to be documented as the whole list, and this file
 * carried the warning that "if that field ever grows paging, this must move
 * server-side". It did: the query behind it had no LIMIT at all, so a partner
 * with fifty thousand referrals transferred fifty thousand rows to render this
 * table, and the screen got slower exactly as they succeeded. It is capped at
 * 200 now.
 *
 * So the honest handling, until a dedicated cursor-paged roster endpoint exists:
 *
 *  - the COUNTS come from `referredClientCount` and `verifiedReferredCount`,
 *    which the server counts in SQL over every referral. Never from
 *    `referredClients.length`, which is the count of what FITTED;
 *  - the filter still runs over the rows in hand, and the screen states that it
 *    is searching the most recent 200 rather than implying it searched the book.
 *
 * A filter that quietly covers a subset while the count beside it claims the
 * whole is the failure /transactions guards against, and the fix there was the
 * same: say what is being searched.
 *
 * The EMAIL is absent server-side, deliberately: a partner is owed attribution,
 * not their referrals' contact details.
 */
type Filter = 'all' | 'verified' | 'unverified';

/*
 * Ten rows a page, matching the frame's height — see `TABLE_PAGE_SIZE`. A page
 * that overflowed the frame would scroll inside it, and the page already
 * scrolls; a page shorter than it would leave the pager floating in white space.
 */
const PAGING = { noun: ['client', 'clients'] as [string, string], pageSize: TABLE_PAGE_SIZE };

export function PartnerClients({ data }: { data: IbOverview }) {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');

  /*
   * `filter()` returns a NEW array. React Query hands out the cached response
   * object itself, so sorting or splicing in place would rewrite the cache under
   * every other panel reading the same key — the regression
   * `transaction-filters.test.ts` pins on the other screen.
   */
  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.referredClients.filter((client) => {
      if (filter === 'verified' && !client.verified) return false;
      if (filter === 'unverified' && client.verified) return false;
      return needle === '' || client.name.toLowerCase().includes(needle);
    });
  }, [data.referredClients, query, filter]);

  const columns: Column<IbReferredClient>[] = [
    {
      header: t('partner.clientsColName'),
      cell: (row) => <span className="font-medium">{row.name}</span>,
      sortable: true,
      sortKey: 'name',
    },
    {
      /*
       * Verified against not is the distinction that matters to a partner: an
       * unverified registration cannot fund an account, so it cannot generate
       * anything to be paid on.
       */
      header: t('partner.clientsColStatus'),
      cell: (row) => (
        <Pill tone={row.verified ? 'success' : 'neutral'}>
          {row.verified ? t('partner.clientVerified') : t('partner.clientUnverified')}
        </Pill>
      ),
      sortable: true,
      sortKey: 'verified',
    },
    {
      header: t('partner.clientsColSince'),
      cell: (row) => formatDate(row.since),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'since',
      sortType: 'date',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/*
        The toolbar stays on screen when a filter matches nothing, so the control
        that produced the empty result is still reachable. A filter bar that
        disappears with its own results is one the reader cannot undo.
      */}
      {data.referredClients.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('partner.searchClients')}
              aria-label={t('partner.searchClients')}
              className="h-9 ps-9"
            />
          </div>
          <div className="flex gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              {t('partner.filterAll')}
            </FilterChip>
            <FilterChip active={filter === 'verified'} onClick={() => setFilter('verified')}>
              {t('partner.clientVerified')}
            </FilterChip>
            <FilterChip active={filter === 'unverified'} onClick={() => setFilter('unverified')}>
              {t('partner.clientUnverified')}
            </FilterChip>
          </div>
          {/*
            The TRUE totals, from the server's own count over every referral —
            not `referredClients.length`, which counts only the rows that fitted
            under the cap.
          */}
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {t('partner.clientsCount', {
              count: data.referredClientCount,
              verified: data.verifiedReferredCount,
            })}
          </span>
        </div>
      )}

      {/*
        SAID, not implied, when the list in hand is not the whole book.
        The count beside the filter is the true total, so without this line the
        two disagree on screen and the reader is left to guess which is wrong.
        Rendered only when it is actually true, so an ordinary partner never
        sees it.
      */}
      {data.referredClientCount > data.referredClients.length && (
        <p className="text-xs text-muted-foreground">
          {t('partner.clientsCapped', { shown: data.referredClients.length })}
        </p>
      )}

      <div className={TABLE_FRAME}>
        <DataTable
          caption={t('partner.tabClients')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.userId}
          clientPagination={PAGING}
          fill
          empty={
            <EmptyState
              icon={Users}
              /*
                Two different empty states, because they mean different things: a
                partner with no clients needs to be told what produces one, and a
                partner whose filter matched nothing needs to know the filter is
                why.
              */
              message={
                data.referredClients.length === 0
                  ? t('partner.clientsEmpty')
                  : t('partner.noMatches')
              }
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * One segment of the status filter.
 *
 * Buttons rather than a `<select>`: there are three options, all worth showing,
 * and the current one should be readable without opening anything.
 * `aria-pressed` is what tells a screen reader which is on — colour says nothing.
 */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`focus-outline h-9 cursor-pointer rounded-md border px-3 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
