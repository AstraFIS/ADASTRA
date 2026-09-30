import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AudienceCard from '@/components/AudienceCard';
import BingFunnelTable from '@/components/BingFunnelTable';
import ChartLegend from '@/components/ChartLegend';
import ErrorBoundary from '@/components/ErrorBoundary';
import FilterSelect from '@/components/FilterSelect';
import LineChart from '@/components/LineChart';
import StatCard from '@/components/StatCard';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDayMonth, formatInteger, formatPercent } from '@/lib/format';
import type { BingDashboard } from '@/types/bing';

type State =
  | { kind: 'loading'; previous: BingDashboard | null }
  | { kind: 'ok'; data: BingDashboard }
  | { kind: 'error'; message: string };

type TableView = 'date' | 'offer';

const ALL = '';
const DEFAULT_RANGE = 'all_time';

const REVENUE_COLOR = 'var(--color-revenue)';
const PROFIT_COLOR = 'var(--color-violet)';
const LOSS_COLOR = 'var(--color-loss)';
const AGE_COLOR = 'var(--color-azure)';
const GENDER_COLOR = 'var(--color-spend)';

const TABLE_VIEWS: { key: TableView; label: string }[] = [
  { key: 'date', label: 'By Date' },
  { key: 'offer', label: 'By Offer (summed)' },
];

// an exact zero reads as "$0" / "0%" on the tiles rather than "$0.00" / "0.00%"
const money = (value: number) => (value === 0 ? '$0' : formatCurrency(value));
const percent = (value: number, digits: number) => (value === 0 ? '0%' : formatPercent(value / 100, digits));

export default function BingDashboardPage() {
  const [params, setParams] = useSearchParams();
  const range = params.get('range') ?? DEFAULT_RANGE;
  const offer = params.get('offer') ?? ALL;

  const [state, setState] = useState<State>({ kind: 'loading', previous: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<TableView>('date');

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));

    const qs = new URLSearchParams({ range });
    if (offer) qs.set('offer', offer);

    api
      .get<BingDashboard>(`/platforms/microsoft/dashboard?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, offer, reloadKey]);

  function setFilter(key: 'range' | 'offer', value: string) {
    const next = new URLSearchParams(params);
    if (value === ALL || (key === 'range' && value === DEFAULT_RANGE)) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-loss/40 bg-surface p-6">
        <p className="font-semibold text-loss">Could not load the Bing Ads dashboard</p>
        <p className="mt-1 text-sm text-ink-2">{state.message}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
        >
          Retry
        </button>
      </div>
    );
  }

  // While refetching after a filter change, keep showing the previous data (dimmed).
  const data = state.kind === 'ok' ? state.data : state.previous;
  if (!data) return <BingSkeleton />;

  const busy = state.kind === 'loading';
  const { statistics: kpi, daily, funnel, meta, filters, options } = data;

  const periodCaption = 'across all ads · selected period';
  const roasCaption = `${percent(kpi.roas_pct ?? 0, 1)} ROAS · ${periodCaption}`;
  const trendCaption = `${data.range.label} · ${filters.offer ?? 'all offers'}`;

  // keep the current selection selectable even if it's not listed
  const offerOptions =
    filters.offer && !options.offers.includes(filters.offer) ? [filters.offer, ...options.offers] : options.offers;

  const rows = view === 'date' ? funnel.by_date : funnel.by_offer;
  const spendPending = rows.some((r) => r.spend_usd === null);
  const partnerSource = `your partner conversion export${meta.partner_period ? ` (${meta.partner_period})` : ''}`;

  return (
    <div className={`space-y-8 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">Bing Ads</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Campaign Performance</h1>
        </div>

        <section aria-label="Filters" className="flex w-full flex-wrap gap-3 xl:w-auto">
          <FilterSelect
            id="date-range"
            label="Date Range"
            hideLabel
            value={data.range.key}
            options={options.date_ranges.map((r) => ({ value: r.key, label: r.label }))}
            onChange={(v) => setFilter('range', v)}
            className="w-full sm:w-auto sm:min-w-[300px]"
          />
          <FilterSelect
            id="offer"
            label="Filter by Offer"
            hideLabel
            value={filters.offer ?? ALL}
            options={[{ value: ALL, label: 'All Offers' }, ...offerOptions.map((o) => ({ value: o, label: o }))]}
            onChange={(v) => setFilter('offer', v)}
            className="w-full sm:w-auto sm:min-w-[460px] sm:flex-1"
          />
        </section>
      </header>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7"
      >
        <StatCard
          size="md"
          tone="accent"
          label="Total Revenue"
          value={money(kpi.total_revenue)}
          caption={periodCaption}
        />
        <StatCard
          size="md"
          tone="accent"
          label="Total Amount Spent"
          value={money(kpi.total_amount_spend)}
          caption={periodCaption}
        />
        <StatCard
          size="md"
          tone="accent"
          label="Net Profit / ROAS"
          value={money(kpi.net_profit)}
          caption={roasCaption}
        />
        <StatCard
          size="md"
          tone="accent"
          label="Landing Page Views"
          value={formatInteger(kpi.landing_page_views)}
          caption="across all ads"
        />
        <StatCard
          size="md"
          tone="accent"
          label="Link Clicks"
          value={formatInteger(kpi.link_clicks)}
          caption="across all ads"
        />
        <StatCard
          size="md"
          tone="accent"
          label="CPC (All)"
          value={money(kpi.cpc ?? 0)}
          caption="blended, spend ÷ link clicks"
        />
        <StatCard
          size="md"
          tone="accent"
          label="CTR (All)"
          value={percent(kpi.ctr ?? 0, 2)}
          caption="weighted by link clicks"
        />
      </section>

      {meta.ad_rows === 0 && (
        <p className="-mt-4 text-sm text-ink-3">
          No Bing Ads spend / impression data for this selection yet — the tiles show zero until that export is
          added. Partner-tracked clicks and funnel stages are in the table below.
        </p>
      )}

      <ErrorBoundary label="The trend and audience charts">
        <section aria-label="Breakdowns" className="grid gap-6 xl:grid-cols-3">
          <div className="flex flex-col rounded-xl border border-line bg-surface p-7 xl:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">Revenue vs. Gross Profit — Daily Trend</h2>
              <p className="text-sm text-ink-2">{trendCaption}</p>
            </div>

            {daily.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-20 text-sm text-ink-3">
                No partner conversion rows for this selection.
              </div>
            ) : (
              <>
                <LineChart
                  className="mt-4"
                  height={400}
                  ariaLabel="Daily revenue and gross profit"
                  labels={daily.map((d) => formatDayMonth(d.date))}
                  tooltipLabels={daily.map((d) => formatDate(d.date, 'medium'))}
                  series={[
                    {
                      key: 'revenue',
                      label: 'Revenue',
                      color: REVENUE_COLOR,
                      values: daily.map((d) => d.revenue_usd),
                      labelSide: 'above',
                    },
                    {
                      key: 'grossProfit',
                      label: 'Gross Profit',
                      color: PROFIT_COLOR,
                      values: daily.map((d) => d.gross_profit_usd),
                      labelSide: 'below',
                      labelColor: (v) => (v < 0 ? LOSS_COLOR : PROFIT_COLOR),
                      emptyText: 'Pending',
                    },
                  ]}
                  tooltipExtras={[{ label: 'Clicks', values: daily.map((d) => d.clicks), format: formatInteger }]}
                  formatValue={(v) => formatCurrency(v, { whole: true })}
                  intervals={4}
                  headroom={1.15}
                  fallbackMax={100}
                />
                <div className="mt-auto pt-3">
                  <ChartLegend
                    items={[
                      { label: 'Revenue', color: REVENUE_COLOR },
                      {
                        label: daily.some((d) => d.gross_profit_usd === null)
                          ? 'Gross Profit (Revenue − Spend) — pending Bing Ads spend'
                          : 'Gross Profit (Revenue − Spend)',
                        color: PROFIT_COLOR,
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
            <AudienceCard
              title="Audience by Age"
              buckets={data.audience_by_age.map((b) => ({ label: b.label, value: b.link_clicks }))}
              color={AGE_COLOR}
              empty={data.audience_by_age.length === 0}
              emptyText="No age breakdown yet — it comes with the Bing Ads export."
              height={190}
            />
            <AudienceCard
              title="Audience by Gender"
              buckets={data.audience_by_gender.map((b) => ({ label: b.label, value: b.link_clicks }))}
              color={GENDER_COLOR}
              empty={data.audience_by_gender.length === 0}
              emptyText="No gender breakdown yet — it comes with the Bing Ads export."
              height={190}
            />
          </div>
        </section>
      </ErrorBoundary>

      <ErrorBoundary label="The funnel table">
        <section aria-labelledby="funnel-heading" className="rounded-xl border border-line bg-surface p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="funnel-heading" className="text-lg font-bold text-ink">
              Funnel Performance by Offer
            </h2>
            <div role="group" aria-label="Table rows" className="inline-flex rounded-lg bg-surface-2 p-1">
              {TABLE_VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={view === v.key}
                  onClick={() => setView(v.key)}
                  className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                    view === v.key ? 'bg-azure font-bold text-canvas' : 'font-medium text-ink-2 hover:text-ink'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <BingFunnelTable rows={rows} showDate={view === 'date'} />

          <p className="mt-4 text-xs leading-relaxed text-ink-2">
            {view === 'date' ? 'One row per date' : 'One row per offer, summed over the selected period'}, from{' '}
            {partnerSource}. Clicks, Base, Start Quiz, Quiz Completed, Add To Cart, and Purchase are real.
            {spendPending &&
              ` Amount Spent, CTR, CPC, CAC, and ROAS need your Bing Ads spend/impression data — add that export and these will fill in${view === 'date' ? ' per day' : ''}.`}
          </p>
        </section>
      </ErrorBoundary>
    </div>
  );
}

function BingSkeleton() {
  const block = 'animate-pulse rounded-xl border border-line bg-surface';
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading Bing Ads dashboard">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-surface-2" />
          <div className="h-9 w-80 max-w-full rounded bg-surface-2" />
        </div>
        <div className="flex flex-wrap gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-11 w-72 rounded-lg bg-surface-2" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${block} h-32`} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className={`${block} h-[560px] xl:col-span-2`} />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
          <div className={`${block} h-[268px]`} />
          <div className={`${block} h-[268px]`} />
        </div>
      </div>
      <div className={`${block} h-[420px]`} />
    </div>
  );
}
