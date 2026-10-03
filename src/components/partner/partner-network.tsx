'use client';

import { Network } from 'lucide-react';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Pill, TABLE_FRAME, TABLE_PAGE_SIZE, formatDate } from '@/components/partner/partner-ui';
import type { IbSubPartner } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * The partners placed beneath this one.
 *
 * ## DIRECT only, and that is the payout ladder rather than a shortcut
 *
 * Commission resolution stops at a single parent — there is no closure table and
 * no recursive walk — so one hop is the whole structure the payout logic
 * honours. Drawing a deeper tree would show a shape the money does not follow,
 * and a partner counting a third level into their expectations is a support
 * conversation that ends badly.
 *
 * ## A suspended sub-partner is shown, not hidden
 *
 * They keep their tree and stop earning, and both halves matter to the partner
 * above them: the row explains why a branch of the book has gone quiet. Removing
 * it would make that look like clients leaving.
 */
const paging = () => ({
  // Resolved per render: the noun lands inside a translated sentence.
  noun: [t('partner.nounPartner'), t('partner.nounPartners')] as [string, string],
  pageSize: TABLE_PAGE_SIZE,
});

export function PartnerNetwork({ subPartners }: { subPartners: IbSubPartner[] }) {
  const columns: Column<IbSubPartner>[] = [
    {
      header: t('partner.colPartner'),
      cell: (row) => <span className="font-medium">{row.name}</span>,
      sortable: true,
      sortKey: 'name',
    },
    {
      header: t('partner.colStatus'),
      cell: (row) => (
        <Pill tone={row.active ? 'success' : 'warning'}>
          {row.active ? t('partner.subPartnerActive') : t('partner.subPartnerSuspended')}
        </Pill>
      ),
      sortable: true,
      sortKey: 'active',
    },
    {
      header: t('partner.colSince'),
      cell: (row) => formatDate(row.since),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'since',
      sortType: 'date',
    },
  ];

  return (
    <div className={TABLE_FRAME}>
      <DataTable
        caption={t('partner.tabNetwork')}
        columns={columns}
        rows={subPartners}
        rowKey={(row) => String(row.userId)}
        clientPagination={paging()}
        fill
        empty={<EmptyState icon={Network} message={t('partner.subPartnersEmpty')} />}
      />
    </div>
  );
}
