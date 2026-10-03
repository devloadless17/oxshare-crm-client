'use client';

import { walletName } from '@/lib/wallet-name';
import * as React from 'react';
import { Download, FileSpreadsheet, FileText, Printer, Share } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { FilterSelect } from '@/components/transactions/transaction-filters';
import {
  ActionSheet,
  MobileFilterSheet,
  NativeDateRange,
} from '@/components/transactions/mobile-sheets';
import { StatementBody } from '@/components/transactions/statement-body';
import { downloadCsv, printStatement } from '@/components/transactions/statement-export';
import { EmptyPanel, Surface } from '@/components/partner/partner-ui';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { EMPTY_RANGE, normalizeRange, type DateRange } from '@/lib/date-range';
import { periodRange, STATEMENT_PERIODS, type StatementPeriod } from '@/lib/statement';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const PERIOD_LABEL: Record<StatementPeriod, MessageKey> = {
  thisMonth: 'statement.periodThisMonth',
  lastMonth: 'statement.periodLastMonth',
  last3Months: 'statement.periodLast3Months',
  yearToDate: 'statement.periodYearToDate',
  last12Months: 'statement.periodLast12Months',
  custom: 'statement.periodCustom',
};

/** A wallet by the name the client knows it by — no currency code or wallet number beside it. */
// Composed from kind + currency, in the reader's language (`lib/wallet-name`).
const walletLabel = (wallet: Wallet) => walletName(wallet);

/**
 * A wallet's ACCOUNT STATEMENT — the document a client files, prints, or hands
 * to an accountant.
 *
 * ## What makes it a statement rather than another list
 *
 * It RECONCILES. Opening balance, every movement with the balance it left, and
 * the closing balance — so a client can tick each line off against their own
 * records. The activity list answers "what happened"; this answers "and where
 * did that leave me", which no list of transactions can: a refused
 * withdrawal's refund, a rebate and a commission move are ledger lines with no
 * transaction row.
 *
 * Every figure is the API's (`GET /wallet/statement`), including the running
 * balance: the `balance_after` the ledger stored under the wallet's lock, never
 * re-added here. The only arithmetic in the browser is splitting a signed
 * amount into the Money in / Money out columns.
 *
 * ## Controls
 *
 * From `md`, one toolbar: wallet, period, and the two exports. On a phone the
 * wallet and period live in a bottom sheet and the exports in an action sheet,
 * so the statement itself starts at the top of the screen.
 */
export function AccountStatement() {
  const { user } = useUser();
  const wallets = useResource(keys.wallets.all(), (signal) => walletApi.getWallets(signal));

  const [walletId, setWalletId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState<StatementPeriod>('thisMonth');
  const [custom, setCustom] = React.useState<DateRange>(EMPTY_RANGE);

  // The first wallet until the client picks one; their choice after that.
  const wallet: Wallet | undefined =
    (wallets.data ?? []).find((w) => w.id === walletId) ?? wallets.data?.[0];

  const range =
    period === 'custom'
      ? custom.from && custom.to
        ? normalizeRange(custom)
        : null
      : periodRange(period);

  const params =
    wallet && range?.from && range.to
      ? { walletId: wallet.id, from: range.from, to: range.to }
      : null;

  const statement = useResource(
    keys.transactions.statement(params),
    (signal) => walletApi.getStatement(params!, signal),
    { enabled: params !== null },
  );

  if (wallets.status !== 'ready') {
    return (
      <AsyncBoundary
        status={wallets.status}
        label={t('statement.loading')}
        endpoints={['GET /wallet']}
        onRetry={() => void wallets.refetch()}
        errorMessage={t('statement.loadFailed')}
        error={wallets.error}
      >
        {null}
      </AsyncBoundary>
    );
  }

  if (!wallet) {
    return (
      <Surface className="flex-1">
        <EmptyPanel
          icon={FileText}
          title={t('statement.noWallet')}
          body={t('statement.noWalletBody')}
        />
      </Surface>
    );
  }

  const data = statement.data;
  const name = walletLabel(wallet);
  const client = {
    name: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    email: user?.email ?? '',
  };
  const exportCsv = () => data && downloadCsv(data, name);
  const exportPdf = () => data && printStatement(data, name, client);

  const walletSelect = (
    <FilterSelect
      label={t('statement.wallet')}
      value={wallet.id}
      onValueChange={setWalletId}
      options={(wallets.data ?? []).map((w) => ({ value: w.id, label: walletLabel(w) }))}
    />
  );
  const periodSelect = (
    <FilterSelect
      label={t('statement.period')}
      value={period}
      onValueChange={(value) => setPeriod(value as StatementPeriod)}
      options={STATEMENT_PERIODS.map((p) => ({ value: p, label: t(PERIOD_LABEL[p]) }))}
    />
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* ── From md: one toolbar ── */}
      <div className="hidden gap-3 rounded-2xl border border-border bg-card p-4 md:flex md:flex-col lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {walletSelect}
          {periodSelect}
          {period === 'custom' && (
            <label className="space-y-1.5">
              <span className="block text-[11px] font-semibold text-muted-foreground">
                {t('statement.customRange')}
              </span>
              <DateRangePicker
                value={custom}
                onChange={setCustom}
                label={t('statement.customRange')}
              />
            </label>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!data} onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('statement.downloadCsv')}
          </Button>
          <Button type="button" size="sm" disabled={!data} onClick={exportPdf}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t('statement.print')}
          </Button>
        </div>
      </div>

      {/* ── Below md: a sheet for the choices, an action sheet for the exports ── */}
      <MobileFilterSheet
        title={`${name} · ${t(PERIOD_LABEL[period])}`}
        description={t('sheets.statementOptions')}
        activeCount={0}
        onClear={() => {
          setPeriod('thisMonth');
          setCustom(EMPTY_RANGE);
        }}
        trailing={
          <ActionSheet
            title={t('sheets.exportTitle')}
            trigger={(open) => (
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0"
                disabled={!data}
                onClick={open}
              >
                <Share className="h-4 w-4" aria-hidden="true" />
                {t('sheets.export')}
              </Button>
            )}
            actions={[
              {
                icon: FileSpreadsheet,
                label: t('statement.downloadCsv'),
                description: t('sheets.csvBody'),
                onSelect: exportCsv,
                disabled: !data,
              },
              {
                icon: Printer,
                label: t('statement.print'),
                description: t('sheets.pdfBody'),
                onSelect: exportPdf,
                disabled: !data,
              },
            ]}
          />
        }
      >
        <div className="grid gap-4">
          {walletSelect}
          {periodSelect}
          {period === 'custom' && (
            <NativeDateRange
              value={custom}
              onChange={setCustom}
              label={t('statement.customRange')}
            />
          )}
        </div>
      </MobileFilterSheet>

      {params === null ? (
        <Surface className="flex-1">
          <EmptyPanel icon={FileText} title={t('statement.pickRange')} />
        </Surface>
      ) : (
        <AsyncBoundary
          status={statement.status}
          label={t('statement.loading')}
          endpoints={['GET /wallet/statement']}
          onRetry={() => void statement.refetch()}
          errorMessage={t('statement.loadFailed')}
          error={statement.error}
        >
          {data && (
            <StatementBody statement={data} walletName={name} dimmed={statement.isFetching} />
          )}
        </AsyncBoundary>
      )}
    </div>
  );
}
