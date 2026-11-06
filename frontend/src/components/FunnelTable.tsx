import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { FunnelRow } from '@/types/fbFunnel';

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
    // every row shows its real numbers, however few clicks it has
    render: (row) => <FunnelCell count={row[key] as number} previous={previous(row)} />,
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
    label: 'Total Ad Spend',
    source: 'Total Ad Spend = Original Ad Spend + Provider Fee (used for CPC, CAC and ROAS)',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.total_spend_usd,
    render: (r) => <span className="font-semibold">{formatCurrency(r.total_spend_usd)}</span>,
  },
  {
    key: 'provider_fee_usd',
    label: 'Provider Fee',
    source: 'Provider Fee = Original Ad Spend × provider fee %',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.provider_fee_usd,
    render: (r) => <span className="text-ink-2">{formatCurrency(r.provider_fee_usd)}</span>,
  },
  {
    key: 'spend_usd',
    label: 'Original Ad Spend',
    source: 'Original Ad Spend = amount spent in Facebook Ads, before provider fees',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (r) => r.spend_usd,
    render: (r) => <span className="text-ink-2">{formatCurrency(r.spend_usd)}</span>,
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
    source: 'CPC = Total Ad Spend ÷ clicks (all)',
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
    source: 'CAC = Total Ad Spend ÷ purchases',
    align: 'right',
    defaultDir: 'asc',
    sortValue: (r) => r.cac_usd,
    render: (r) => money(r.cac_usd),
  },
  {
    key: 'roas_pct',
    label: 'ROAS',
    source: 'ROAS = (Revenue − Total Ad Spend) ÷ Total Ad Spend',
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

  // sum of the rows on screen (after the page filters and "Hide inactive ads"), ratios recomputed from the sums
  const total = useMemo<FunnelRow | null>(() => {
    if (rows.length === 0) return null;
    const sum = (k: keyof FunnelRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const ratio = (a: number, b: number, scale = 1) => (b > 0 ? round2((a / b) * scale) : null);
    const total_spend_usd = round2(sum('total_spend_usd'));
    const revenue_usd = round2(sum('revenue_usd'));
    const net = round2(revenue_usd - total_spend_usd);
    const clicks_all = sum('clicks_all');
    const conversions = sum('conversions');
    return {
      ad_name: `Total (${rows.length} row${rows.length === 1 ? '' : 's'})`,
      offer_name: '',
      providers: [],
      first_date: '',
      last_date: '',
      days: 0,
      active: true,
      spend_usd: round2(sum('spend_usd')),
      provider_fee_usd: round2(sum('provider_fee_usd')),
      total_spend_usd,
      impressions: sum('impressions'),
      clicks_all,
      link_clicks: sum('link_clicks'),
      ctr_all: ratio(clicks_all, sum('impressions'), 100),
      cpc_usd: ratio(total_spend_usd, clicks_all),
      first_page_views: sum('first_page_views'),
      questionnaire_starts: sum('questionnaire_starts'),
      questionnaire_completed: sum('questionnaire_completed'),
      add_to_carts: sum('add_to_carts'),
      purchase_events: sum('purchase_events'),
      conversions,
      revenue_usd,
      net_profit_usd: net,
      cac_usd: ratio(total_spend_usd, conversions),
      roas_pct: ratio(net, total_spend_usd, 100),
    };
  }, [rows]);

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
        <table className="w-full min-w-[1650px] border-collapse text-sm">
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
          {total && (
            <tfoot>
              <tr className="border-t-2 border-line-strong bg-surface-2/60 font-bold">
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-4 py-3 tabular-nums text-ink ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.key === 'ad_name' ? 'sticky left-0 z-10 bg-surface-2' : ''}`}
                  >
                    {column.key === 'ad_name' ? (
                      <span title="Sum of the rows shown — follows the filters above and “Hide inactive ads”">{total.ad_name}</span>
                    ) : column.key === 'offer_name' ? (
                      ''
                    ) : (
                      column.render(total)
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
