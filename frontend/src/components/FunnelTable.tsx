import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { FunnelRow } from '@/types/fbFunnel';

const LOW_SAMPLE_CLICKS = 10;

type SortDir = 'asc' | 'desc';

interface Column {
  key: string;
  label: string;
  /** Source field(s) in facebook_ad_reports, shown as a tooltip on the header. */
  source: string;
  align: 'left' | 'right';
  sortValue: (row: FunnelRow) => number | string | null;
  render: (row: FunnelRow) => ReactNode;
  defaultDir: SortDir;
}

/** "503 (77.27%)" — count plus step-over-step conversion from the previous stage. */
function FunnelCell({ count, previous }: { count: number; previous: number }) {
  return (
    <>
      {formatInteger(count)}{' '}
      <span className="text-revenue">({previous > 0 ? formatPercent(count / previous, 2) : '—'})</span>
    </>
  );
}

const lowSample = <span className="text-ink-3">low sample</span>;

function funnelColumn(
  key: keyof FunnelRow & string,
  label: string,
  previous: (row: FunnelRow) => number,
): Column {
  return {
    key,
    label,
    source: key,
    align: 'right',
    defaultDir: 'desc',
    sortValue: (row) => row[key] as number,
    render: (row) =>
      row.link_clicks < LOW_SAMPLE_CLICKS ? (
        lowSample
      ) : (
        <FunnelCell count={row[key] as number} previous={previous(row)} />
      ),
  };
}

const money = (v: number | null) => (v === null ? '—' : formatCurrency(v));

const COLUMNS: Column[] = [
  {
    key: 'ad_name',
    label: 'Ad Name',
    source: 'ad_name',
    align: 'left',
    defaultDir: 'asc',
    sortValue: (r) => String(r.ad_name).toLowerCase(),
    render: (r) => <AdNameLink row={r} />,
  },
  {
    key: 'offer_name',
    label: 'Offer Name',
    source: 'offer_name',
    align: 'left',
    defaultDir: 'asc',
    sortValue: (r) => String(r.offer_name).toLowerCase(),
    render: (r) => <span className="text-ink">{r.offer_name}</span>,
  },
  {
    key: 'total_spend_usd',
    label: 'Amount Spent',
    source: 'total_spend_usd = spend_usd + provider_fee_usd',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.total_spend_usd,
    render: (r) => formatCurrency(r.total_spend_usd),
  },
  {
    key: 'link_clicks',
    label: 'Link Clicks',
    source: 'link_clicks',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.link_clicks,
    render: (r) => formatInteger(r.link_clicks),
  },
  {
    key: 'ctr_all',
    label: 'CTR (all)',
    source: 'ctr_all = clicks_all ÷ impressions',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.ctr_all,
    render: (r) => (r.ctr_all === null ? '—' : formatPercent(r.ctr_all / 100, 2)),
  },
  {
    key: 'cpc_usd',
    label: 'CPC (all)',
    source: 'cpc_usd = spend_usd ÷ clicks_all',
    align: 'right',
    defaultDir: 'asc',
    sortValue: (r) => r.cpc_usd,
    render: (r) => money(r.cpc_usd),
  },
  funnelColumn('first_page_views', 'First Page View', (r) => r.link_clicks),
  funnelColumn('questionnaire_starts', 'Q.S.', (r) => r.first_page_views),
  funnelColumn('questionnaire_completed', 'Q.C.', (r) => r.questionnaire_starts),
  funnelColumn('add_to_carts', 'Add To Cart', (r) => r.questionnaire_completed),
  funnelColumn('purchase_events', 'Purchase', (r) => r.add_to_carts),
  {
    key: 'revenue_usd',
    label: 'Revenue',
    source: 'revenue_usd',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.revenue_usd,
    render: (r) => formatCurrency(r.revenue_usd),
  },
  {
    key: 'cac_usd',
    label: 'CAC',
    source: 'cac_usd = total_spend_usd ÷ conversions',
    align: 'right',
    defaultDir: 'asc',
    sortValue: (r) => r.cac_usd,
    render: (r) => money(r.cac_usd),
  },
  {
    key: 'roas_pct',
    label: 'ROAS',
    source: 'roas_pct = net_profit_usd ÷ total_spend_usd',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.roas_pct,
    render: (r) =>
      r.roas_pct === null ? (
        '—'
      ) : (
        <span className={r.roas_pct < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(r.roas_pct / 100, 1)}</span>
      ),
  },
];

function AdNameLink({ row }: { row: FunnelRow }) {
  const [params] = useSearchParams();
  const range = params.get('range');
  const href = `/platforms/facebook/ads/${encodeURIComponent(String(row.ad_name))}${range ? `?range=${range}` : ''}`;
  return (
    <Link
      to={href}
      title={`Open the detail page for ${row.ad_name}`}
      className="font-bold text-ink underline decoration-ink-3 decoration-dotted underline-offset-4 hover:decoration-revenue"
    >
      {row.ad_name}
      {!row.active && <span className="ml-2 text-xs font-medium text-ink-3">(inactive)</span>}
    </Link>
  );
}

function compare(a: number | string | null, b: number | string | null, dir: SortDir): number {
  // nulls always sink to the bottom regardless of direction
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b);
  return dir === 'asc' ? result : -result;
}

interface Props {
  rows: FunnelRow[];
  /** Days without data after which an ad counts as inactive (from the API). */
  activeWindowDays?: number;
}

export default function FunnelTable({ rows: input, activeWindowDays }: Props) {
  const [hideInactive, setHideInactive] = useState(true);
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: 'total_spend_usd', dir: 'desc' });

  const rows = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[2]!;
    return input
      .filter((r) => !hideInactive || r.active)
      .slice()
      .sort(
        (a, b) =>
          compare(column.sortValue(a), column.sortValue(b), sort.dir) ||
          String(a.ad_name).localeCompare(String(b.ad_name)) ||
          String(a.offer_name).localeCompare(String(b.offer_name)),
      );
  }, [input, hideInactive, sort]);

  const hiddenCount = input.length - input.filter((r) => r.active).length;

  function toggleSort(column: Column) {
    setSort((current) =>
      current.key === column.key
        ? { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, dir: column.defaultDir },
    );
  }

  return (
    <div>
      <label className="mt-4 inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={hideInactive}
          onChange={(e) => setHideInactive(e.target.checked)}
          className="h-4 w-4 rounded border-line bg-surface-2 accent-[var(--color-revenue)]"
        />
        Hide inactive ads
        <span className="text-ink-3">
          {activeWindowDays ? `(no data in the last ${activeWindowDays} days` : '('}
          {hiddenCount > 0 ? `${activeWindowDays ? ' · ' : ''}${hiddenCount} hidden` : ''})
        </span>
      </label>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[1400px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2/60">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.source}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`whitespace-nowrap px-4 py-3.5 text-sm font-semibold ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.key === 'ad_name' ? 'sticky left-0 z-10 bg-surface' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={`inline-flex items-center gap-1 ${active ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
                    >
                      {column.label}
                      {active && <span aria-hidden="true">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-ink-3">
                  {input.length === 0
                    ? 'No report rows in the database for this selection yet.'
                    : 'Every ad in this selection is inactive — untick "Hide inactive ads" to see them.'}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={`${row.ad_name}::${row.offer_name}`} className="border-t border-line hover:bg-surface-2/40">
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-4 py-3 tabular-nums text-ink ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.key === 'ad_name' ? 'sticky left-0 z-10 bg-surface' : ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
