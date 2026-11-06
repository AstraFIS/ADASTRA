import type { ReactNode } from 'react';
import { formatCurrency, formatInteger, formatNumber, formatPercent } from '@/lib/format';
import type { BingFunnelRow } from '@/types/bing';

export type BingTableView = 'date' | 'offer' | 'ad_group';

interface Column {
  key: string;
  label: string;
  /** Where the figure comes from, shown as a tooltip on the header. */
  source: string;
  align: 'left' | 'right';
  render: (row: BingFunnelRow) => ReactNode;
}

const pending = <span className="italic text-ink-3">Pending</span>;
const est = <span className="ml-1 text-[10px] font-semibold uppercase text-spend" title="Split from a multi-offer landing page by landing-page-view share">est.</span>;

/** Spend-based figure: "Pending" when the Bing Ads export does not cover the row, "—" when it cannot be computed. */
function spendBased(row: BingFunnelRow, value: number | null, format: (value: number) => ReactNode): ReactNode {
  if (row.spend_usd === null) return pending;
  return value === null ? '—' : format(value);
}

const count = (key: keyof BingFunnelRow & string, label: string, source: string): Column => ({
  key,
  label,
  source,
  align: 'right',
  render: (r) => {
    const v = r[key] as number;
    return v === 0 ? <span className="text-ink-3">0</span> : formatInteger(v);
  },
});

const DATE_COLUMN: Column = { key: 'date', label: 'Date', source: 'report date', align: 'left', render: (r) => r.date };

function labelColumn(view: BingTableView): Column {
  return {
    key: 'label',
    label: view === 'ad_group' ? 'Campaign · Ad Group' : 'Offer',
    source: view === 'ad_group' ? 'Bing Ads: campaign / ad group' : 'partner export: offer',
    align: 'left',
    render: (r) =>
      r.sub_label ? (
        <span className="flex flex-col">
          <span>{r.label}</span>
          <span className="text-xs text-ink-3">{r.sub_label}</span>
        </span>
      ) : (
        r.label
      ),
  };
}

const COLUMNS: Column[] = [
  {
    key: 'spend_usd',
    label: 'Amount Spent',
    source: 'Bing Ads: spend',
    align: 'right',
    render: (r) => (r.spend_usd === null ? pending : <>{formatCurrency(r.spend_usd)}{r.spend_estimated && est}</>),
  },
  {
    key: 'clicks',
    label: 'Clicks',
    source: 'Bing Ads: clicks',
    align: 'right',
    render: (r) => (Number.isInteger(r.clicks) ? formatInteger(r.clicks) : formatNumber(r.clicks, 1)),
  },
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
  count('base', 'LP Views', 'partner export: Base (landing page views)'),
  count('start_quiz', 'Start Quiz', 'partner export: quiz / intake start'),
  count('quiz_completed', 'Quiz Completed', 'partner export: quiz / intake completed'),
  count('lead', 'Lead', 'partner export: lead'),
  count('add_to_cart', 'Add To Cart', 'partner export: add to cart / begin checkout'),
  count('purchase', 'Purchase', 'partner export: purchase'),
  {
    key: 'revenue_usd',
    label: 'Revenue',
    source: 'partner export: revenue',
    align: 'right',
    render: (r) =>
      r.revenue_usd === null ? pending : r.revenue_usd === 0 ? <span className="text-ink-3">$0</span> : (
        <span className="font-semibold text-revenue">{formatCurrency(r.revenue_usd)}</span>
      ),
  },
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
      r.revenue_usd === null
        ? pending
        : spendBased(r, r.roas_pct, (v) => (
            <span className={v < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(v / 100, 1)}</span>
          )),
  },
];

interface Props {
  rows: BingFunnelRow[];
  view: BingTableView;
}

export default function BingFunnelTable({ rows, view }: Props) {
  const columns = [...(view === 'date' ? [DATE_COLUMN] : []), labelColumn(view), ...COLUMNS];

  if (rows.length === 0) {
    return <p className="mt-6 text-sm text-ink-3">No Bing Ads or partner rows for this selection.</p>;
  }

  // sum of the rows shown; ratios recomputed from the sums (rows whose spend is still pending add no spend)
  const sum = (k: keyof BingFunnelRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const ratio = (a: number, b: number, scale = 1) => (b > 0 ? round2((a / b) * scale) : null);
  const spend = round2(sum('spend_usd'));
  const revenue = round2(sum('revenue_usd'));
  const clicks = sum('clicks');
  const purchases = sum('purchase');
  const pendingRows = rows.filter((r) => r.spend_usd === null).length;
  const total: BingFunnelRow = {
    date: 'Total',
    label: view === 'date' ? '' : 'Total',
    sub_label: null,
    impressions: sum('impressions'),
    clicks,
    spend_usd: spend,
    spend_estimated: false,
    base: sum('base'),
    start_quiz: sum('start_quiz'),
    quiz_completed: sum('quiz_completed'),
    lead: sum('lead'),
    add_to_cart: sum('add_to_cart'),
    purchase: purchases,
    revenue_usd: revenue,
    ctr: ratio(clicks, sum('impressions'), 100),
    cpc_usd: ratio(spend, clicks),
    cac_usd: ratio(spend, purchases),
    roas_pct: ratio(revenue - spend, spend, 100),
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1240px] border-collapse text-sm">
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
            <tr
              key={`${row.date ?? 'all'}::${row.sub_label ?? ''}::${row.label}`}
              className={`border-t border-line hover:bg-surface-2/40 ${row.revenue_usd ? 'bg-revenue/5' : ''}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2.5 text-ink ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong bg-surface-2/60 font-bold">
            {columns.map((c, i) => (
              <td
                key={c.key}
                className={`whitespace-nowrap px-3 py-3 text-ink ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
              >
                {i === 0 ? (
                  <span title="Sum of the rows shown — follows the filters above">
                    Total ({rows.length} row{rows.length === 1 ? '' : 's'})
                    {pendingRows > 0 && <span className="ml-1 text-xs font-normal text-ink-3">· {pendingRows} with spend pending</span>}
                  </span>
                ) : c.key === 'label' ? (
                  ''
                ) : (
                  c.render(total)
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
