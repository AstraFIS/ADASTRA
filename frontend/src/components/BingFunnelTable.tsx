import type { ReactNode } from 'react';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { BingFunnelRow } from '@/types/bing';

interface Column {
  key: string;
  label: string;
  /** Where the figure comes from, shown as a tooltip on the header. */
  source: string;
  align: 'left' | 'right';
  render: (row: BingFunnelRow) => ReactNode;
}

const pending = <span className="italic text-ink-3">Pending</span>;

/** Spend-based figure: "Pending" until the Bing Ads export covers the row, "—" when it cannot be computed. */
function spendBased(row: BingFunnelRow, value: number | null, format: (value: number) => ReactNode): ReactNode {
  if (row.spend_usd === null) return pending;
  return value === null ? '—' : format(value);
}

const count = (key: keyof BingFunnelRow & string, label: string, source: string): Column => ({
  key,
  label,
  source,
  align: 'right',
  render: (r) => formatInteger(r[key] as number),
});

const DATE_COLUMN: Column = {
  key: 'date',
  label: 'Date',
  source: 'partner export: date',
  align: 'left',
  render: (r) => r.date,
};

const COLUMNS: Column[] = [
  {
    key: 'offer_name',
    label: 'Offer',
    source: 'partner export: offer',
    align: 'left',
    render: (r) => r.offer_name,
  },
  {
    key: 'spend_usd',
    label: 'Amount Spent',
    source: 'Bing Ads: spend',
    align: 'right',
    render: (r) => spendBased(r, r.spend_usd, formatCurrency),
  },
  count('clicks', 'Clicks', 'partner export: clicks'),
  {
    key: 'ctr',
    label: 'CTR',
    source: 'Bing Ads: clicks ÷ impressions',
    align: 'right',
    render: (r) => spendBased(r, r.ctr, (v) => formatPercent(v / 100, 2)),
  },
  {
    key: 'cpc_usd',
    label: 'CPC',
    source: 'Bing Ads: spend ÷ clicks',
    align: 'right',
    render: (r) => spendBased(r, r.cpc_usd, formatCurrency),
  },
  count('base', 'Base', 'partner export: base (landing page views)'),
  count('start_quiz', 'Start Quiz', 'partner export: start quiz'),
  count('quiz_completed', 'Quiz Completed', 'partner export: quiz completed'),
  count('add_to_cart', 'Add To Cart', 'partner export: add to cart'),
  count('purchase', 'Purchase', 'partner export: purchase'),
  {
    key: 'cac_usd',
    label: 'CAC',
    source: 'Bing Ads spend ÷ purchases',
    align: 'right',
    render: (r) => spendBased(r, r.cac_usd, formatCurrency),
  },
  {
    key: 'roas_pct',
    label: 'ROAS',
    source: '(revenue − Bing Ads spend) ÷ spend',
    align: 'right',
    render: (r) =>
      spendBased(r, r.roas_pct, (v) => (
        <span className={v < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(v / 100, 1)}</span>
      )),
  },
];

interface Props {
  rows: BingFunnelRow[];
  /** Per-day rows carry a Date column; rows summed per offer do not. */
  showDate: boolean;
}

export default function BingFunnelTable({ rows, showDate }: Props) {
  const columns = showDate ? [DATE_COLUMN, ...COLUMNS] : COLUMNS;

  if (rows.length === 0) {
    return <p className="mt-6 text-sm text-ink-3">No partner conversion rows for this selection.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                title={c.source}
                className={`whitespace-nowrap px-3 py-3 text-sm font-semibold text-ink-2 ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.date ?? 'all'}::${row.offer_name}`} className="border-t border-line hover:bg-surface-2/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-3 text-ink ${
                    c.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
