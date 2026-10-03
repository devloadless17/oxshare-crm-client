import Decimal from 'decimal.js';
import type { Statement } from '@/lib/api/wallet';
import { moneyText } from '@/lib/bidi';
import { parseIso } from '@/lib/date-range';
import { describeLine, shortReference, statementCsv } from '@/lib/statement';
import { currentLocale, direction, intlLocale, t } from '@/lib/i18n';

/**
 * `2026-09-01` → the client's own short date, read as a LOCAL calendar day.
 * Through `parseIso` rather than `new Date(iso)`, which parses a bare date as
 * UTC midnight and prints the day before for everyone west of Greenwich.
 */
export function formatDay(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString(intlLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Save the statement as CSV, named for the wallet and the period it covers. */
export function downloadCsv(statement: Statement, walletName: string) {
  const blob = new Blob([statementCsv(statement, walletName)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = walletName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'wallet';
  a.download = `statement-${slug}-${statement.from}-to-${statement.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );

/**
 * The printable statement, as its own document in a new window.
 *
 * Not this page printed: the portal is a fixed-height shell whose `<main>`
 * scrolls, and printing a scroll container prints what is on screen and clips
 * the rest — the one failure a statement cannot have. "Save as PDF" is the
 * browser's own print destination.
 *
 * Everything interpolated is escaped: method names are operator-typed and a
 * client's name is client-typed, and this is HTML written into a window on the
 * portal's origin.
 */
export function printStatement(
  statement: Statement,
  walletName: string,
  client: { name: string; email: string },
) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  const money = (value: string) => escapeHtml(moneyText(value, statement.currency));
  // An id, an email or a reference is a left-to-right run inside the page's text.
  const ltrRun = (value: string) => `<bdi dir="ltr">${escapeHtml(value)}</bdi>`;
  const rtl = direction() === 'rtl';
  const row = (cells: string[], cls = '') =>
    `<tr class="${cls}">${cells.map((c, i) => `<td class="${i >= 3 ? 'num' : ''}">${c}</td>`).join('')}</tr>`;

  const lines = statement.lines
    .map((line) => {
      const amount = new Decimal(line.amount);
      const credit = !amount.isNegative();
      return row([
        escapeHtml(new Date(line.createdAt).toLocaleString(intlLocale())),
        escapeHtml(describeLine(line, walletName)),
        ltrRun(shortReference(line.referenceId)),
        credit ? money(amount.toFixed(8)) : '',
        credit ? '' : money(amount.abs().toFixed(8)),
        money(line.balanceAfter),
      ]);
    })
    .join('');

  const title = `${t('statement.title')} · ${walletName}`;
  const period = `${formatDay(statement.from)} – ${formatDay(statement.to)}`;
  win.document
    .write(`<!doctype html><html lang="${currentLocale()}" dir="${direction()}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box} body{font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,'IBM Plex Sans Arabic','Noto Sans Arabic',Tahoma,sans-serif;color:#111;margin:32px}${rtl ? ' *{letter-spacing:normal!important}' : ''}
  h1{font-size:20px;margin:0 0 4px} .muted{color:#666} .head{display:flex;justify-content:space-between;gap:24px;margin-bottom:20px}
  .sum{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #ddd;border-radius:8px;margin:16px 0 20px}
  .sum div{padding:10px 12px;border-inline-start:1px solid #ddd} .sum div:first-child{border:0}
  .sum b{display:block;font-size:15px;margin-top:4px} table{width:100%;border-collapse:collapse}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:start;border-bottom:1px solid #999;padding:6px}
  td{padding:6px;border-bottom:1px solid #eee;vertical-align:top} .num{text-align:end;white-space:nowrap;font-variant-numeric:tabular-nums}
  tr.bal td{font-weight:600;background:#f5f5f5} footer{margin-top:24px;font-size:10px;color:#888}
  @page{size:A4;margin:14mm} @media print{body{margin:0}}
</style></head><body>
<div class="head"><div><h1>${escapeHtml(t('statement.title'))}</h1>
<div class="muted">${escapeHtml(walletName)}</div></div>
<div style="text-align:end"><b>${escapeHtml(client.name)}</b><div class="muted">${ltrRun(client.email)}</div>
<div class="muted">${escapeHtml(period)}</div></div></div>
<div class="sum">
<div>${escapeHtml(t('statement.openingBalance'))}<b>${money(statement.openingBalance)}</b></div>
<div>${escapeHtml(t('statement.moneyIn'))}<b>${money(statement.totalCredits)}</b></div>
<div>${escapeHtml(t('statement.moneyOut'))}<b>${money(statement.totalDebits)}</b></div>
<div>${escapeHtml(t('statement.closingBalance'))}<b>${money(statement.closingBalance)}</b></div></div>
<table><thead><tr><th>${escapeHtml(t('transactions.colDate'))}</th><th>${escapeHtml(t('statement.colDescription'))}</th><th>${escapeHtml(t('statement.colReference'))}</th>
<th class="num">${escapeHtml(t('statement.moneyIn'))}</th><th class="num">${escapeHtml(t('statement.moneyOut'))}</th><th class="num">${escapeHtml(t('statement.colBalance'))}</th></tr></thead>
<tbody>${row([escapeHtml(formatDay(statement.from)), escapeHtml(t('statement.openingBalance')), '', '', '', money(statement.openingBalance)], 'bal')}
${lines || row(['', escapeHtml(t('statement.noMovements')), '', '', '', ''])}
${row([escapeHtml(formatDay(statement.to)), escapeHtml(t('statement.closingBalance')), '', '', '', money(statement.closingBalance)], 'bal')}</tbody></table>
<footer>${escapeHtml(t('statement.generatedAt', { date: new Date(statement.generatedAt).toLocaleString(intlLocale()) }))}</footer>
</body></html>`);
  win.document.close();
  /*
   * Printed from HERE, not by a <script> in the document: the new window
   * inherits the portal's CSP, whose `script-src` is nonce-only, so an inline
   * script would be refused and the dialog would never open. `document.write`
   * is synchronous, so the content is laid out by the time this runs.
   */
  win.focus();
  win.print();
}
