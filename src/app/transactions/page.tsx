'use client';

import * as React from 'react';
import { TransactionDetails } from '@/components/transactions/transaction-details';
import { ChevronRight, Receipt } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import {
  hasActiveFilters,
  INITIAL_FILTERS,
  STATE,
  toQuery,
  TransactionFilters,
  type Filters,
} from '@/components/transactions/transaction-filters';
import {
  MANUAL_ADMIN_PROVIDER,
  paymentsApi,
  type Transaction,
  type TransactionQuery,
} from '@/lib/api/payments';
import { SignedAmount } from '@/components/money/signed-amount';
import { t, type MessageKey } from '@/lib/i18n';
import { movementLabelKey } from '@/lib/movement-label';
import { keys } from '@/lib/query-keys';

/**
 * The client's own transaction history — CORE-13's state machine, client side.
 *
 * This screen existed as a dead nav link for months while
 * `GET /payments/transactions` was already being served. The audit's closing
 * note names why that matters more than it looks: a funded client who cannot
 * enumerate their own money movements cannot detect an error in them, which
 * makes the ledger's correctness unverifiable by the only party with the
 * incentive to check it.
 *
 * ## The table is ADMIN'S table
 *
 * `components/data-table.tsx` is a twin file, ported here whole along with
 * `pagination.tsx`, `cursor-pagination.tsx` and `lib/table-sort.ts`. This screen
 * previously hand-rolled its own `<table>`, its own sortable headers and its own
 * pager — which is how two apps in one product end up with tables that sort
 * differently, page differently and disagree about where the row count goes.
 *
 * What comes with it, and is no longer this file's problem: three-state header
 * sorting (asc → desc → back to the list's own order), the numbered pager with
 * first/last, rows-per-page, the sticky header under `fill`, and an empty state
 * that keeps the frame and the column labels instead of replacing them.
 *
 * ## Money is still money
 *
 * `formatMoney` (decimal.js, strings in and out) and never coerced — `Number()`
 * and `parseFloat` are lint errors on this path. The amount column declares
 * `sortType: 'money'`, which is what routes its comparison through decimal.js;
 * without it the shared comparator falls back to text and sorts '100.00000000'
 * below '9.00000000'.
 */
export default function TransactionsPage() {
  /*
   * `/payments/*` sits behind `EmailVerifiedGuard`, so for an unverified client
   * this request is a guaranteed 403 — and it fired on every visit and on every
   * window refocus, filling the server log with expected authorization failures
   * that bury the unexpected ones.
   *
   * The UI is unchanged: `AsyncBoundary` already renders a "not permitted" state
   * for `forbidden`, so reporting that status directly gives the client exactly
   * the same screen without asking a question we already know the answer to.
   *
   * Reported as `forbidden` rather than left `loading`: a disabled query stays
   * pending forever, which would spin indefinitely instead of explaining itself.
   */
  const { user } = useUser();
  const emailUnverified = user !== null && user.emailVerified === false;

  const [filters, setFilters] = React.useState<Filters>(INITIAL_FILTERS);
  /*
   * The sorts the API will actually accept, named here rather than implied.
   *
   * This list IS `ListTransactionsQueryDto`'s `@IsIn(TRANSACTION_SORT_FIELDS)`
   * on the server. Anything outside it comes back 400 — "sort must be one of
   * the following values: createdAt, amount, direction, currency, state" —
   * which this screen renders as "Could not load your transactions" over an
   * empty page, so a sort header that reorders nothing takes the whole history
   * with it.
   *
   * `SORTABLE` is what makes `sort.column` a UNION rather than a `string`, so
   * the cast that used to sit on the query object is gone and a column naming
   * a field the API cannot sort is now a compile error instead of a 400.
   */
  const SORTABLE = ['createdAt', 'amount', 'direction', 'currency', 'state'] as const;
  type SortColumn = (typeof SORTABLE)[number];
  const isSortable = (key: string): key is SortColumn =>
    (SORTABLE as readonly string[]).includes(key);

  const [sort, setSort] = React.useState<{ column: SortColumn | null; direction: 'asc' | 'desc' }>({
    column: 'createdAt',
    direction: 'desc',
  });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  /*
   * The request, as one object — and it is the QUERY KEY as well as the payload.
   *
   * React Query refetches when the key changes, so keying on the exact
   * parameters sent means every filter, sort and page change is a new request
   * and a separately cached result. Keying on something coarser would serve one
   * filter's rows under another filter's heading.
   */
  const query: TransactionQuery = {
    ...toQuery(filters),
    sort: sort.column ?? undefined,
    order: sort.column ? sort.direction : undefined,
    page,
    limit: pageSize,
  };

  const transactions = useResource(
    keys.transactions.list(query),
    (signal) => paymentsApi.getTransactions(query, signal),
    { enabled: !emailUnverified },
  );

  const status = emailUnverified ? 'forbidden' : transactions.status;
  const rows = React.useMemo(() => transactions.data?.items ?? [], [transactions.data]);
  const total = transactions.data?.total ?? 0;

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    /*
     * Back to page 1 on every filter change. Narrowing 312 rows to 6 while
     * sitting on page 5 asks the server for an offset past the end, which comes
     * back empty — a table that looks like the filter matched nothing at all.
     */
    setPage(1);
  };

  /*
   * The currency filter's options.
   *
   * ⚠️ Derived from the CURRENT PAGE, which is a real limitation now that the
   * server pages. It used to be derived from the whole history because the whole
   * history was in the browser.
   *
   * The alternative is worse in both directions: a hardcoded ['USD','USDT']
   * offers a filter that matches nothing the moment an operator adds a currency,
   * and keeps offering one that was removed. A dedicated endpoint for "which
   * currencies has this client ever held" is the real fix and does not exist.
   *
   * The practical effect is small — a client holds one or two currencies and
   * both appear on any page — but it is stated rather than left to be
   * discovered, because it is the one thing this screen no longer knows about
   * the whole set.
   */
  const currencies = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.currency))).sort(),
    [rows],
  );

  const [detail, setDetail] = React.useState<Transaction | null>(null);

  const columns: Column<Transaction>[] = [
    {
      header: t('transactions.colDate'),
      /*
       * `sortKey` is the ROW PROPERTY, not the header text.
       *
       * `DataTable`'s client-side comparator reads `row[sortKey]`, so a key that
       * does not name a real field sorts every row against `undefined` — which
       * compares equal, leaves the order untouched, and looks like a header that
       * simply does nothing. Every sortable column below names its own field.
       */
      sortKey: 'createdAt',
      /*
       * Date over time on a phone, one line from `md` up.
       *
       * `toLocaleString()` is a single ~20-character string, and it was the
       * widest column here — on a 393px screen it alone claimed more than a
       * third of the table. Splitting it costs nothing on a wide screen (the
       * two spans sit side by side) and buys the room the columns below need.
       */
      cell: (tx) => {
        const at = new Date(tx.createdAt);
        return (
          <span className="text-muted-foreground">
            <span className="block md:inline">{at.toLocaleDateString()}</span>{' '}
            <span className="block md:inline">{at.toLocaleTimeString()}</span>
          </span>
        );
      },
    },
    {
      header: t('transactions.colType'),
      sortKey: 'direction',
      /*
       * A TRANSFER is named as one, and never as a deposit or a withdrawal.
       *
       * The API states `direction` from the WALLET's side for every row, so a
       * transfer that brought money back from a trading account arrives as
       * `deposit` — true of where the money went, and the wrong word to print:
       * a client reading "Deposit" looks for a payment they never made.
       *
       * `kind` is the field to branch on. Not "the method is empty", which is
       * also true of a manual admin credit.
       *
       * The branch itself lives in `lib/movement-label.ts` — this screen, /wallet
       * and the dashboard all render the same names, and they carried three
       * copies of it until a fourth kind arrived.
       */
      /*
       * `whitespace-normal` below `md` ONLY.
       *
       * `DataTable` sets `whitespace-nowrap` on every cell so rows keep one
       * height and the eye has a rhythm to follow — right on a wide screen, and
       * the reason this table could not shrink on a narrow one: a table's
       * min-content width is the sum of its cells', and a cell that may not
       * wrap has no min-content smaller than its longest line. Letting THIS
       * cell wrap (it is the one carrying a folded-in second line) is what lets
       * the table resolve to the 359px it actually has.
       */
      cellClassName: 'max-md:whitespace-normal',
      cell: (tx) => (
        <span className="font-medium">
          {t(movementLabelKey(tx))}
          {/*
            Method and currency FOLD IN HERE below `md`, where their own columns
            are hidden — see the note on the Currency column. They are a
            second, muted line rather than a wider row.
          */}
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground md:hidden">
            {/*
              Inline flow, not a flex row. As a flex row a long method name
              ("Added by our team") wrapped inside its own item and left the
              separator and the currency stranded on a line of their own. Two
              inline spans and a literal dot wrap as one sentence, which is what
              this is.
            */}
            <MethodCell tx={tx} /> · {tx.currency}
          </span>
        </span>
      ),
    },
    {
      header: t('transactions.colAmount'),
      sortKey: 'amount',
      /*
       * ⚠️ NOT decoration. Amounts are NUMERIC(28,8) decimal STRINGS, and the
       * comparator's default is text — which puts '9.00000000' above
       * '100.00000000' because it compares '9' against '1'. Every client holding
       * both a two-figure and a three-figure movement hits that on their first
       * sort. `money` routes the comparison through decimal.js.
       */
      sortType: 'money',
      align: 'right',
      // Sign, colour and formatting all live in `SignedAmount` — this cell, the
      // wallet's activity list and the dashboard's rendered the same ternary
      // three times, which is how a colour ends up changed in two of them.
      cell: (tx) => (
        <span className="inline-flex flex-col items-end gap-1">
          <SignedAmount direction={tx.direction} amount={tx.amount} currency={tx.currency} />
          {/*
            The STATUS, on the phone, under the amount it describes.

            This is the column that made the mobile fix necessary rather than
            cosmetic: "did my withdrawal go through" is the question this screen
            exists to answer, and at 393px the Status column sat 300px off the
            right-hand edge of a table whose horizontal scrollbar is an overlay
            a phone only draws WHILE scrolling. A client had no way to know
            there was anything to scroll to.
          */}
          <span className="md:hidden">
            <StateBadge state={tx.state} kind={tx.kind} />
          </span>
        </span>
      ),
    },
    {
      header: t('transactions.colCurrency'),
      sortKey: 'currency',
      /*
       * ── The three hidden columns, and why hiding is the fix ───────────────
       *
       * This table is 839px wide. Its scroll container on a 393px screen is
       * 359px, so Currency, Method, Status and the details link all sat off the
       * right-hand edge — reachable only by a horizontal drag with no visible
       * affordance, because a phone draws overlay scrollbars and only while the
       * finger is moving. The page passed the `document.scrollWidth` check in
       * `e2e/ux-sweep.spec.ts` the whole time: the overflow is INSIDE a
       * scroll container, so the document itself still fits.
       *
       * Each of these is folded into a column that stays: currency and method
       * under the type, status under the amount. Nothing is dropped — the row
       * carries the same six facts, stacked instead of strung out.
       *
       * Sorting by these three goes with them below `md`, which is the honest
       * trade: the filter panel above already filters by status and currency,
       * and a sort header nobody can see is not a feature.
       */
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (tx) => <span className="text-muted-foreground">{tx.currency}</span>,
    },
    {
      /*
       * HOW the money moved — the payment method's own name, or "Added by our
       * team" for a manual credit.
       *
       * Not sortable: the API's sort allow-list has no column for it (the name
       * comes from a joined table), and a header that reorders nothing is worse
       * than one that does not offer to.
       *
       * ## This is not the `kind` badge that was removed
       *
       * That one predicted the deposit FLOW before the server had decided it,
       * and printed our integration's classification on a control the client was
       * about to use. This is a fact about a movement that has already happened,
       * on a row describing it — the client's own answer to "where did this come
       * from", which their statement could not previously give them.
       */
      header: t('transactions.colMethod'),
      // Folded under the Type cell below `md` — see the Currency column.
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (tx) => <MethodCell tx={tx} />,
    },
    {
      header: t('transactions.colStatus'),
      sortKey: 'state',
      // Folded under the Amount cell below `md` — see the Currency column.
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      /*
       * The BADGE alone. `rejectionReason` used to print underneath it — a
       * provider's own sentence wrapped across two lines inside a status cell,
       * which made the column the widest on the table and the state itself the
       * hardest thing to read in it. The state is what a status column answers.
       *
       * The REFERENCE column is gone for a related reason: it printed the
       * provider's own opaque id, which a client has no use for in a list. It is
       * still on the deposit confirmation, where somebody needs to quote it.
       */
      cell: (tx) => <StateBadge state={tx.state} kind={tx.kind} />,
    },
    {
      header: '',
      /*
       * The way into the DETAIL, which is where prose belongs. A refused
       * withdrawal used to end at the badge on its left: the reason,
       * destination and settlement date were all on the wire and unreachable.
       */
      cell: (tx) => (
        <button
          type="button"
          onClick={() => setDetail(tx)}
          /*
           * `aria-label` unconditionally, because the visible words disappear
           * below `md` and a chevron announces as nothing. The label is the
           * same either way, so what a screen reader says does not depend on
           * the width of the screen.
           */
          aria-label={t('transactions.detailOpen')}
          className="focus-outline rounded px-2 py-1 text-xs font-medium text-link hover:underline"
        >
          <span className="hidden md:inline">{t('transactions.detailOpen')}</span>
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100 md:hidden" aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    /*
     * `min-h-0` is load-bearing, and its absence is a layout bug with no error
     * message.
     *
     * `DataTable` in `fill` mode makes ITSELF the scroll container so the pager
     * stays on screen — but that resolves against the nearest bounded ancestor.
     * Without `min-h-0` on this flex column the table resolves against `auto`,
     * quietly reverts to growing, and the footer goes back below the fold. The
     * component's own doc states this requirement; it is repeated here because
     * this is the file that has to satisfy it.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('transactions.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('transactions.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={status}
        label={t('transactions.loading')}
        endpoints={['GET /payments/transactions']}
        onRetry={() => void transactions.refetch()}
        errorMessage={t('transactions.loadFailed')}
        error={transactions.error}
        fill
      >
        {/*
          ⚠️ "NO HISTORY" AND "NO MATCHES" ARE DIFFERENT SCREENS, and this
          condition is what tells them apart.

          It used to read `rows.length === 0`, which conflated them. `rows` is
          one PAGE now, so any filter matching nothing emptied it — and the
          branch below replaced the entire screen with the whole-history card,
          taking the filter bar with it. The client was left looking at "no
          transactions yet" with no way to see, or undo, the filter that caused
          it. On their own money history that reads as data having vanished.

          So the card is only for a client who genuinely has nothing: no filter
          set, and the server's own count of everything is zero. A filter that
          matches nothing keeps the toolbar and renders the table's own empty
          row instead — frame, column headers and pager intact, because the
          headers are what say WHAT was searched and the toolbar is the way back.

          `total`, not `rows.length`: the count is the database's, across every
          page, so this cannot be fooled by landing on an empty page past the end.
        */}
        {total === 0 && !hasActiveFilters(filters) ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{t('transactions.empty')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('transactions.emptyBody')}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="shrink-0">
              <TransactionFilters
                filters={filters}
                currencies={currencies}
                onChange={update}
                onClear={() => {
                  setFilters(INITIAL_FILTERS);
                  setPage(1);
                }}
              />
            </div>

            {/*
              `pagination` and `onSortChange` — the SERVER-SIDE pair, not
              `clientPagination`. The distinction is a money rule rather than a
              preference.

              `clientPagination` pages the rows the table is HOLDING, and its
              client-side sort orders the same. That is honest only when those
              rows are the entire dataset. They are not: this table holds one
              page, and sorting it would order 25 rows while presenting the
              result as "largest amount" across the client's whole history — the
              under-report R-2.5 names, on the screen a client would use to
              check their own ledger.

              So `onSortChange` sends the column to the API, `pagination` sends
              the page, and `total` is the database's own count of everything
              matching the filters. `DataTable` switches its client-side sorting
              off entirely once `onSortChange` is passed.
            */}
            <TransactionDetails tx={detail} onClose={() => setDetail(null)} />
            {/*
              Tighter cell padding below `md`, reached through the table rather
              than through `DataTable`.

              `DataTable` is a TWIN of the admin app's, compared byte for byte
              by `scripts/check-twins.sh`, so a padding change there is a change
              to every operator table in the console as a side effect of a
              client screen. Four columns at `px-4` spend 128px of a 359px
              screen on whitespace; `px-2` gives half of it back, and only here.
            */}
            <div className="flex min-h-0 flex-1 flex-col max-md:[&_td]:px-2 max-md:[&_th]:px-2">
              <DataTable
                fill
                caption={t('transactions.title')}
                columns={columns}
                rows={rows}
                rowKey={(tx) => tx.id}
                dimmed={transactions.isFetching}
                sortColumn={sort.column ?? undefined}
                sortDirection={sort.direction}
                onSortChange={(column, direction) => {
                  /*
                   * ⚠️ TWO states here, not `DataTable`'s three — and the third one
                   * made the Date header impossible to toggle.
                   *
                   * `DataTable` cycles asc → desc → null, where null means "back to
                   * the list's own default order". That is right for a queue whose
                   * default is something other than the column being clicked. Here
                   * the default IS this column: the API orders by `createdAt desc`
                   * when no sort is given.
                   *
                   * So Date started active-descending, the first click cycled it to
                   * null, and null was resolved back to `createdAt desc` — the
                   * state it was already in. The header could never leave
                   * descending however many times it was pressed, while every other
                   * column worked. "Stuck on one side" is exactly that.
                   *
                   * A null now FLIPS the active column instead of clearing it,
                   * which makes every header a plain two-state toggle. Nothing is
                   * lost: "unsorted" is not a state this endpoint has — it always
                   * orders by something — so the third click was only ever a way
                   * back to a default that one column already occupied.
                   */
                  /*
                   * A column the API cannot sort is IGNORED rather than sent.
                   *
                   * `DataTable` hands back a `string`, so this is the boundary
                   * where it becomes one of the five the server accepts. It
                   * should now be unreachable — a column is only sortable if it
                   * declares a `sortKey`, and every one here names a real field
                   * — but this is the line that decides what goes on the wire,
                   * and the failure it prevents costs the client their entire
                   * history rather than one column's ordering.
                   */
                  setSort((current) =>
                    column === null
                      ? {
                          column: current.column,
                          direction: current.direction === 'asc' ? 'desc' : 'asc',
                        }
                      : isSortable(column)
                        ? { column, direction: direction ?? 'asc' }
                        : current,
                  );
                  setPage(1);
                }}
                pagination={{
                  page,
                  pageSize,
                  total,
                  onPageChange: setPage,
                  onPageSizeChange: (size) => {
                    setPageSize(size);
                    // Page 4 at 25 a page is past the end at 100 a page, which
                    // comes back empty and reads as "no results".
                    setPage(1);
                  },
                  noun: [t('table.row'), t('table.rows')],
                }}
                empty={<EmptyState icon={Receipt} message={t('transactions.noMatches')} />}
              />
            </div>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

/**
 * Where a movement came from, in the client's words rather than the system's.
 *
 * Three cases, in the order they are decided:
 *
 *  1. `methodName` — the operator's own name for the rail ("Whish Money").
 *     Resolved server-side, so it is never a key and never translated: it is a
 *     brand, and the client saw exactly these words when they chose it.
 *
 *     It covers BOTH directions. A deposit's name comes from `payment_methods`
 *     and a withdrawal's from `withdrawal_payment_methods` — different columns
 *     into different tables — and the API coalesces them into this one field.
 *     The list query used to join only the deposit side, so every withdrawal
 *     arrived with a null name and this cell fell through to case 3: an em dash
 *     where "Whish Money" belonged, on the client's own statement.
 *  2. `manual_admin` — money the team placed by hand. The label is OURS and
 *     therefore translated, because it is a sentence rather than a name.
 *  3. Anything else — an em dash. That is now genuinely "no rail was involved"
 *     rather than "this is a withdrawal", and inventing a word ("Unknown",
 *     "Other") would put one where the honest answer is nothing. `provider` is
 *     deliberately NOT shown raw: `manual_bank_transfer` is an internal
 *     identifier, not something to put on a client's statement.
 */
function MethodCell({ tx }: { tx: Transaction }) {
  /*
   * A transfer went through no payment method, and saying so is more useful
   * than an em dash: it names the other end of the movement — the client's own
   * trading account — which is the answer to "where did this come from" on the
   * one row type that has no provider.
   *
   * Checked BEFORE `methodName`, not after. The field is null on a transfer
   * today, and an em dash here would be indistinguishable from the manual-credit
   * case below.
   */
  if (tx.kind === 'transfer') {
    return <span className="text-muted-foreground">{t('transactions.tradingAccountMethod')}</span>;
  }

  /* The other end of a commission transfer is the partner's own commission
     wallet — the same question this column answers for a trading transfer. */
  if (tx.kind === 'commission_transfer') {
    return <span className="text-muted-foreground">{t('transactions.commissionMethod')}</span>;
  }

  if (tx.methodName) return <span>{tx.methodName}</span>;

  if (tx.provider === MANUAL_ADMIN_PROVIDER) {
    return <span className="text-muted-foreground italic">{t('transactions.manualCredit')}</span>;
  }

  return (
    <span className="text-muted-foreground" aria-hidden="true">
      —
    </span>
  );
}

function StateBadge({ state, kind }: { state: string; kind?: string }) {
  /*
   * `state` is a plain `string` here even though `STATE` is keyed by the
   * generated enum, and the two disagreeing on purpose is the point.
   *
   * The MAP is typed so a state added to the schema fails the build rather than
   * quietly falling through — that is what caught `failure` sitting where the
   * enum says `failed`. The LOOKUP is widened because a deployed backend can
   * start returning a new state before this app is redeployed, and at runtime
   * that has to render something rather than throw on a client's history.
   *
   * So: unknown at compile time is an error, unknown at runtime is the raw
   * value below.
   */
  /*
   * A pending TRANSFER reads "Processing". Nobody reviews one — it is waiting on
   * the trading server — where a withdrawal genuinely is reviewed by an operator
   * and keeps the original wording.
   */
  const meta: { key: MessageKey; className: string } | undefined =
    state === 'pending' && kind === 'transfer'
      ? { key: 'transactions.stateProcessing', className: STATE.pending.className }
      : (STATE as Record<string, { key: MessageKey; className: string }>)[state];
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        meta?.className ?? 'border-border bg-muted text-muted-foreground'
      }`}
    >
      {/*
        An unrecognised state renders its raw value rather than nothing. A new
        state added server-side should look unfamiliar here, not invisible —
        blank cells are how a client concludes the screen is broken.
      */}
      {meta ? t(meta.key) : state}
    </span>
  );
}
