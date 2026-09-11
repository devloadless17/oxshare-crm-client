import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './data-table';

/**
 * A column with no `sortKey` is NOT sortable — the contract the header-text
 * fallback silently broke, and the bug this file exists for.
 *
 * `sortKey` used to fall back to the header TEXT, so every column with a string
 * header offered a sort whatever the caller intended. /transactions marks its
 * Method column unsortable BY OMITTING `sortKey`, exactly as the type intends;
 * the fallback overrode that, sent `?sort=Method`, and the API answered 400 —
 * which the screen rendered as "Could not load your transactions" over an empty
 * page. Reported from the running app.
 *
 * (Client-side the same fallback failed differently and just as quietly: the
 * comparator read `row['Method']`, `undefined` on every row, so the header
 * toggled an arrow and reordered nothing.)
 *
 * Asserted on the RENDERED header rather than on the internals, because the
 * fallback lived in two places in this file and a test of one would have passed
 * while the other still broke the screen.
 */
describe('sortability is declared, never inferred from the header text', () => {
  const rows = [{ id: '1', amount: '9.00000000' }];
  const rowKey = (r: { id: string }) => r.id;

  it('renders no sort control for a column that names no sortKey', () => {
    renderWithProviders(
      <DataTable
        rows={rows}
        rowKey={rowKey}
        columns={[{ header: 'Method', cell: () => 'Whish' }]}
        onSortChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /method/i })).not.toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
  });

  it('offers exactly the declared sortKeys, and hands back nothing else', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    renderWithProviders(
      <DataTable
        rows={rows}
        rowKey={rowKey}
        columns={[
          { header: 'Method', cell: () => 'Whish' },
          { header: 'Amount', sortKey: 'amount', sortType: 'money', cell: (r) => r.amount },
        ]}
        onSortChange={(key) => seen.push(key)}
      />,
    );

    // Click EVERY sort control the table chose to render, not the one column
    // this test knows about: the fallback's whole effect was rendering extra
    // ones, so a test that clicks only the keyed column cannot see it.
    const headers = screen.getAllByRole('columnheader');
    for (const header of headers) {
      const control = within(header).queryByRole('button');
      if (control) await user.click(control);
    }

    expect(seen).toEqual(['amount']);
  });
});
