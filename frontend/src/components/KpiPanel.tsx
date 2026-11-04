import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { FbStatistics } from '@/types/fbStatistics';

interface Props {
  kpi: FbStatistics | null;
  /** Provider fees and impressions come from the statistics meta. */
  fees: number | null;
  impressions: number | null;
  caption: string;
  busy?: boolean;
}

const NA = '—';
const pct = (num: number, den: number) => (den > 0 ? formatPercent(num / den, num / den < 0.1 ? 2 : 1) : NA);

interface Step {
  label: string;
  value: number | null;
  /** Cost per item of this step. */
  cost?: { label: string; value: number | null };
  /** Conversion from the previous step. */
  rate?: { label: string; value: string };
  source: string;
}

/**
 * The Facebook page's headline numbers in two panels: money (revenue, spend, profit) and the
 * path from impression to purchase, with each step's count, its conversion from the step
 * before and its cost (CPM, CPC, CPL, CAC).
 */
export default function KpiPanel({ kpi, fees, impressions, caption, busy = false }: Props) {
  const roas = kpi && kpi.total_amount_spend > 0 ? kpi.net_profit / kpi.total_amount_spend : null;
  const loss = (kpi?.net_profit ?? 0) < 0;

  const clicks = kpi?.link_clicks ?? 0;
  const lpv = kpi?.landing_page_views ?? 0;
  const leads = kpi?.leads ?? 0;
  const purchases = kpi?.purchases ?? 0;

  const steps: Step[] = [
    { label: 'Impressions', value: impressions, cost: { label: 'CPM', value: kpi?.cpm ?? null }, source: 'Facebook' },
    {
      label: 'Link clicks',
      value: kpi ? clicks : null,
      rate: { label: 'CTR', value: kpi?.ctr == null ? NA : formatPercent(kpi.ctr / 100, 2) },
      cost: { label: 'CPC', value: kpi?.cpc ?? null },
      source: 'Facebook',
    },
    { label: 'LP views', value: kpi ? lpv : null, rate: { label: 'of clicks', value: pct(lpv, clicks) }, source: 'Facebook' },
    {
      label: 'Leads (Add to Cart)',
      value: kpi?.leads ?? null,
      rate: { label: 'of LP views', value: pct(leads, lpv) },
      cost: { label: 'CPL', value: kpi?.cpl ?? null },
      source: 'Partner',
    },
    {
      label: 'Purchases',
      value: kpi?.purchases ?? null,
      rate: { label: 'of leads', value: pct(purchases, leads) },
      cost: { label: 'CAC', value: kpi?.cac ?? null },
      source: 'Partner',
    },
  ];

  return (
    <section
      aria-label="Key metrics"
      aria-busy={busy}
      className={`grid gap-3 transition-opacity xl:grid-cols-[minmax(400px,1fr)_minmax(0,2fr)] ${busy ? 'opacity-70' : ''}`}
    >
      {/* money */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Profit</h2>
          <span className="text-xs text-ink-3">{caption}</span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-ink-3">Revenue</dt>
            <dd className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums text-revenue">{kpi ? formatCurrency(kpi.total_revenue) : NA}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Amount spent</dt>
            <dd className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums text-spend">{kpi ? formatCurrency(kpi.total_amount_spend) : NA}</dd>
            {fees !== null && <dd className="text-[11px] text-ink-3">incl. {formatCurrency(fees)} fees</dd>}
          </div>
          <div>
            <dt className="text-xs text-ink-3">Net profit</dt>
            <dd className={`mt-0.5 text-xl font-bold tabular-nums ${loss ? 'text-loss' : 'text-revenue'}`}>
              {kpi ? formatCurrency(kpi.net_profit) : NA}
            </dd>
            <dd className={`text-[11px] font-semibold ${roas === null ? 'text-ink-3' : roas < 0 ? 'text-loss' : 'text-revenue'}`}>
              ROAS {roas === null ? 'n/a' : formatPercent(roas, 1)}
            </dd>
          </div>
        </dl>
      </div>

      {/* path to purchase */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">From impression to purchase</h2>
          <span className="text-xs text-ink-3">
            CR (clicks → purchases){' '}
            <b className="text-ink">{kpi?.cr == null ? NA : formatPercent(kpi.cr / 100, 2)}</b>
          </span>
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.label} className="relative min-w-0 rounded-lg bg-surface-2/60 px-3 py-2.5">
              {i > 0 && (
                <span aria-hidden="true" className="absolute -left-2 top-1/2 hidden -translate-y-1/2 text-ink-3 sm:block">
                  ›
                </span>
              )}
              <p className="truncate text-[11px] text-ink-3" title={`${s.label} · from ${s.source}`}>
                {s.label}
              </p>
              <p className="text-lg font-bold tabular-nums text-ink">{s.value == null ? NA : formatInteger(s.value)}</p>
              <p
                className="mt-0.5 h-4 truncate text-[11px] tabular-nums text-revenue"
                title={s.rate ? `${s.rate.label}: conversion from the previous step` : undefined}
              >
                {s.rate ? `${s.rate.value} ${s.rate.label}` : ''}
              </p>
              <p className="h-4 truncate text-[11px] tabular-nums text-ink-2" title={s.cost ? `${s.cost.label}: cost per ${s.label.toLowerCase()}` : undefined}>
                {s.cost && (
                  <>
                    {s.cost.label} <b className="text-ink">{s.cost.value == null ? NA : formatCurrency(s.cost.value)}</b>
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
