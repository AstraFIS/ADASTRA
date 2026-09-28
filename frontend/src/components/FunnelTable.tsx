import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { AdBreakdown } from '@/types/facebook';

const LOW_SAMPLE_CLICKS = 10;

type SortDir = 'asc' | 'desc';

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  /** Value used for sorting. */
  sortValue: (ad: AdBreakdown) => number | string | null;
  render: (ad: AdBreakdown) => ReactNode;
  defaultDir: SortDir;
}

/** "503 (77.27%)" — count plus step-over-step conversion from the previous stage. */
function FunnelCell({ count, previous }: { count: number; previous: number }) {
  return (
    <>
      {formatInteger(count)}{' '}
      <span className="text-revenue">
        ({previous > 0 ? formatPercent(count / previous, 2) : '—'})
      </span>
    </>
  );
}

const lowSample = <span className="text-ink-3">low sample</span>;

function funnelColumn(
  key: string,
  label: string,
  pick: (ad: AdBreakdown) => number,
  previous: (ad: AdBreakdown) => number,
): Column {
  return {
    key,
    label,
    align: 'right',
    defaultDir: 'desc',
    sortValue: (ad) => pick(ad),
    render: (ad) =>
      ad.linkClicks < LOW_SAMPLE_CLICKS ? lowSample : <FunnelCell count={pick(ad)} previous={previous(ad)} />,
  };
}

const money = (v: number | null) => (v === null ? '—' : formatCurrency(v));

const COLUMNS: Column[] = [
  {
    key: 'adName',
    label: 'Ad Name',
    align: 'left',
    defaultDir: 'asc',
    sortValue: (ad) => ad.adName.toLowerCase(),
    render: (ad) => <AdNameLink ad={ad} />,
  },
  {
    key: 'offer',
    label: 'Offer Name',
    align: 'left',
    defaultDir: 'asc',
    sortValue: (ad) => ad.offer.toLowerCase(),
    render: (ad) => <span className="text-ink">{ad.offer}</span>,
  },
  {
    key: 'spend',
    label: 'Amount Spent',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (ad) => ad.spend,
    render: (ad) => formatCurrency(ad.spend),
  },
  {
    key: 'linkClicks',
    label: 'Link Clicks',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (ad) => ad.linkClicks,
    render: (ad) => formatInteger(ad.linkClicks),
  },
  {
    key: 'ctr',
    label: 'CTR (all)',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (ad) => ad.ctr,
    render: (ad) => (ad.ctr === null ? '—' : formatPercent(ad.ctr, 2)),
  },
  {
    key: 'cpc',
    label: 'CPC (all)',
    align: 'right',
    defaultDir: 'asc',
    sortValue: (ad) => ad.cpc,
    render: (ad) => money(ad.cpc),
  },
  funnelColumn('firstPageView', 'First Page View', (ad) => ad.funnel.firstPageView, (ad) => ad.linkClicks),
  funnelColumn('qs', 'Q.S.', (ad) => ad.funnel.qs, (ad) => ad.funnel.firstPageView),
  funnelColumn('lead', 'Lead / Partial', (ad) => ad.funnel.lead, (ad) => ad.funnel.qs),
  funnelColumn('addToCart', 'Add To Cart', (ad) => ad.funnel.addToCart, (ad) => ad.funnel.lead),
  funnelColumn('purchase', 'Purchase', (ad) => ad.funnel.purchase, (ad) => ad.funnel.addToCart),
  {
    key: 'revenue',
    label: 'Revenue',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (ad) => ad.revenue,
    render: (ad) => formatCurrency(ad.revenue),
  },
  {
    key: 'cac',
    label: 'CAC',
    align: 'right',
    defaultDir: 'asc',
    sortValue: (ad) => ad.cac,
    render: (ad) => money(ad.cac),
  },
  {
    key: 'roas',
    label: 'ROAS',
    align: 'right',
    defaultDir: 'desc',
    sortValue: (ad) => ad.roas,
    render: (ad) =>
      ad.roas === null ? (
        '—'
      ) : (
        <span className={ad.roas < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(ad.roas, 1)}</span>
      ),
  },
];

function AdNameLink({ ad }: { ad: AdBreakdown }) {
  const [params] = useSearchParams();
  const range = params.get('range');
  const href = `/platforms/facebook/ads/${encodeURIComponent(ad.adName)}${range ? `?range=${range}` : ''}`;
  return (
    <Link
      to={href}
      title={`Open the detail page for ${ad.adName}`}
      className="font-bold text-ink underline decoration-ink-3 decoration-dotted underline-offset-4 hover:decoration-revenue"
    >
      {ad.adName}
      {!ad.active && <span className="ml-2 text-xs font-medium text-ink-3">(inactive)</span>}
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
  ads: AdBreakdown[];
}

export default function FunnelTable({ ads }: Props) {
  const [hideInactive, setHideInactive] = useState(true);
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: 'spend', dir: 'desc' });

  const rows = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[2]!;
    return ads
      .filter((ad) => !hideInactive || ad.active)
      .slice()
      .sort((a, b) => compare(column.sortValue(a), column.sortValue(b), sort.dir) || a.adName.localeCompare(b.adName));
  }, [ads, hideInactive, sort]);

  const hiddenCount = ads.length - ads.filter((ad) => ad.active).length;

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
        {hiddenCount > 0 && <span className="text-ink-3">({hiddenCount} hidden)</span>}
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
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`whitespace-nowrap px-4 py-3.5 text-sm font-semibold ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.key === 'adName' ? 'sticky left-0 z-10 bg-surface' : ''}`}
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
                  No ads match the current filters.
                </td>
              </tr>
            )}
            {rows.map((ad) => (
              <tr key={ad.adName} className="border-t border-line hover:bg-surface-2/40">
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-4 py-3 tabular-nums text-ink ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.key === 'adName' ? 'sticky left-0 z-10 bg-surface' : ''}`}
                  >
                    {column.render(ad)}
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
