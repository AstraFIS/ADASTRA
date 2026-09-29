import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import BarChart from '@/components/BarChart';
import ChartLegend from '@/components/ChartLegend';
import CreativeTaxonomyCard from '@/components/CreativeTaxonomyCard';
import DailyPerformanceTable from '@/components/DailyPerformanceTable';
import FilterSelect from '@/components/FilterSelect';
import LineChart from '@/components/LineChart';
import StatCard, { type CaptionTone } from '@/components/StatCard';
import { api, ApiError } from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatFixed,
  formatInteger,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import type { AdDetail, AudienceBucket, MetricComparison, ReadStatus } from '@/types/facebook';
import type { FbAdStatisticsResult } from '@/types/fbAdStatistics';
import type { FbChartsResult } from '@/types/fbCharts';
import type { FbDailyTrendResult } from '@/types/fbDailyTrend';

type State =
  | { kind: 'loading'; previous: AdDetail | null }
  | { kind: 'ok'; data: AdDetail }
  | { kind: 'error'; message: string; notFound: boolean };

type StatsState =
  | { kind: 'loading'; previous: FbAdStatisticsResult | null }
  | { kind: 'ok'; data: FbAdStatisticsResult }
  | { kind: 'error'; message: string; notFound: boolean };

type TrendState =
  | { kind: 'loading'; previous: FbDailyTrendResult | null }
  | { kind: 'ok'; data: FbDailyTrendResult }
  | { kind: 'error'; message: string };

type ChartsState =
  | { kind: 'loading'; previous: FbChartsResult | null }
  | { kind: 'ok'; data: FbChartsResult }
  | { kind: 'error'; message: string };

const REVENUE_COLOR = 'var(--color-revenue)';
const SPEND_COLOR = 'var(--color-spend)';
const PROFIT_COLOR = 'var(--color-violet)';
const LOSS_COLOR = 'var(--color-loss)';

const FUNNEL_STAGES: { key: 'first_page_views' | 'questionnaire_starts' | 'leads_partial' | 'add_to_carts' | 'purchase_events'; label: string }[] = [
  { key: 'first_page_views', label: 'First Page View' },
  { key: 'questionnaire_starts', label: 'Q.S.' },
  { key: 'leads_partial', label: 'Lead/Partial' },
  { key: 'add_to_carts', label: 'Add To Cart' },
  { key: 'purchase_events', label: 'Purchase' },
];

const STATUS_CLASSES: Record<ReadStatus, string> = {
  scale: 'border-revenue/60 text-revenue',
  monitor: 'border-spend/60 text-spend',
  review: 'border-loss/60 text-loss',
  low_sample: 'border-line-strong text-ink-2',
  no_data: 'border-line-strong text-ink-3',
};

const captionToneFor = (c: MetricComparison | null): CaptionTone =>
  c === null || c.sentiment === 'neutral' ? 'default' : c.sentiment;

export default function FacebookAdDetailPage() {
  const { adName = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const range = params.get('range') ?? 'this_month';

  const [state, setState] = useState<State>({ kind: 'loading', previous: null });
  const [stats, setStats] = useState<StatsState>({ kind: 'loading', previous: null });
  const [trend, setTrend] = useState<TrendState>({ kind: 'loading', previous: null });
  const [charts, setCharts] = useState<ChartsState>({ kind: 'loading', previous: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));

    api
      .get<AdDetail>(`/platforms/facebook/ads/${encodeURIComponent(adName)}?range=${encodeURIComponent(range)}`)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error', notFound });
      });

    // KPI tiles come from the report collection (per-ad statistics), same range
    setStats((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbAdStatisticsResult>(
        `/platforms/facebook/ads/${encodeURIComponent(adName)}/statistics?range=${encodeURIComponent(range)}`,
      )
      .then((data) => {
        if (!cancelled) setStats({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setStats({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error', notFound });
      });

    // daily trend + daily performance table come from the report collection, filtered to this ad
    setTrend((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbDailyTrendResult>(
        `/platforms/facebook/daily-trend?ad=${encodeURIComponent(adName)}&range=${encodeURIComponent(range)}`,
      )
      .then((data) => {
        if (!cancelled) setTrend({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setTrend({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });

    // audience by age / gender for this ad (from the report rows' breakdown)
    setCharts((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbChartsResult>(`/platforms/facebook/charts?ad=${encodeURIComponent(adName)}&range=${encodeURIComponent(range)}`)
      .then((data) => {
        if (!cancelled) setCharts({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setCharts({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });
    return () => {
      cancelled = true;
    };
  }, [adName, range, reloadKey]);

  function setRange(value: string) {
    const next = new URLSearchParams(params);
    if (value === 'this_month') next.delete('range');
    else next.set('range', value);
    setParams(next, { replace: true });
  }

  const backHref = `/platforms/facebook${range !== 'this_month' ? `?range=${range}` : ''}`;

  const statsData = stats.kind === 'ok' ? stats.data : stats.kind === 'loading' ? stats.previous : null;
  const statsBusy = stats.kind === 'loading';

  if (state.kind === 'error' && stats.kind === 'error') {
    return (
      <div className="space-y-6">
        <BackButton to={backHref} />
        <div className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-semibold text-loss">
            {state.notFound && stats.notFound ? `No ad named "${adName}"` : 'Could not load this ad'}
          </p>
          <p className="mt-1 text-sm text-ink-2">{stats.message}</p>
          {!(state.notFound && stats.notFound) && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const data = state.kind === 'ok' ? state.data : state.kind === 'loading' ? state.previous : null;
  if (!data && !statsData) return <AdDetailSkeleton />;

  // header + tiles prefer the report collection; the remaining sections use the detail
  // endpoint and are simply omitted for ads it does not know about
  const busy = state.kind === 'loading' || statsBusy;
  const rangeOptions = statsData
    ? [
        { key: 'this_month', label: 'This Month' },
        { key: 'last_month', label: 'Last Month' },
        { key: 'last_7_days', label: 'Last 7 Days' },
        { key: 'last_30_days', label: 'Last 30 Days' },
        { key: 'all_time', label: 'All Time' },
      ]
    : (data?.dateRangeOptions ?? []);
  const period = statsData?.range.label ?? data?.dateRangeLabel ?? 'Selected period';
  const headerName = statsData?.ad.ad_name ?? data?.ad.adName ?? adName;
  const headerOffer = statsData ? statsData.ad.offers.join(', ') || '—' : (data?.ad.offer ?? '—');
  const headerActive = statsData ? statsData.ad.active : (data?.ad.active ?? true);
  const k = statsData?.statistics ?? null;
  const cmp = statsData?.comparisons ?? null;
  const NA = '—';

  const trendData = trend.kind === 'ok' ? trend.data : trend.kind === 'loading' ? trend.previous : null;
  const trendBusy = trend.kind === 'loading';
  const dailyRows = trendData?.daily ?? [];
  const hollowDays = dailyRows.map((d, i) => (d.total_spend_usd > 0 && d.conversions === 0 ? i : -1)).filter((i) => i >= 0);
  const hasCacData = dailyRows.some((d) => d.total_spend_usd > 0);

  // 4-card breakdown row, all from the report collection
  const chartsData = charts.kind === 'ok' ? charts.data : charts.kind === 'loading' ? charts.previous : null;
  const chartsBusy = charts.kind === 'loading';
  const stageShares = k
    ? FUNNEL_STAGES.map((st) => ({ label: st.label, share: k.link_clicks > 0 ? (k[st.key] / k.link_clicks) * 100 : 0 }))
    : [];
  const weakest = stageShares.reduce<{ label: string; share: number } | null>((min, st) => (!min || st.share < min.share ? st : min), null);
  const ageBuckets = (chartsData?.audience_by_age ?? []).filter((b) => b.link_clicks > 0).map((b) => ({ label: b.label, value: b.link_clicks }));
  const genderBuckets = (chartsData?.audience_by_gender ?? []).filter((b) => b.link_clicks > 0).map((b) => ({ label: b.label, value: b.link_clicks }));
  const audienceEmpty = chartsData !== null && chartsData.meta.report_rows === 0;


  return (
    <div className={`space-y-8 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-wrap items-start gap-5">
          <BackButton to={backHref} />
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">
              Ad detail · Charts only
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
              {headerName}
              {!headerActive && (
                <span className="ml-3 align-middle text-sm font-medium text-ink-3">inactive</span>
              )}
            </h1>
            <p className="mt-1 text-base text-ink-2">Offer: {headerOffer}</p>
          </div>
        </div>
        <FilterSelect
          id="ad-date-range"
          label="Date Range"
          value={range}
          options={rangeOptions.map((r) => ({ value: r.key, label: r.label }))}
          onChange={setRange}
          className="w-full sm:w-auto sm:min-w-[320px]"
        />
      </header>

      <section
        aria-label="Key metrics"
        aria-busy={statsBusy}
        className={`grid grid-cols-2 gap-5 transition-opacity md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7 ${statsBusy ? 'opacity-70' : ''}`}
      >
        <StatCard size="md" tone="spend" label="Amount Spent" value={k ? formatCurrency(k.amount_spent) : NA} caption={period} />
        <StatCard size="md" label="Link Clicks" value={k ? formatInteger(k.link_clicks) : NA} caption={period} />
        <StatCard
          size="md"
          label="CTR (All)"
          value={k?.ctr == null ? NA : formatPercent(k.ctr / 100, 2)}
          caption={cmp?.ctr?.label ?? 'no account average yet'}
          captionTone={captionToneFor(cmp?.ctr ?? null)}
        />
        <StatCard
          size="md"
          label="CPC (All)"
          value={k?.cpc == null ? NA : formatCurrency(k.cpc)}
          caption={cmp?.cpc?.label ?? 'no account average yet'}
          captionTone={captionToneFor(cmp?.cpc ?? null)}
        />
        <StatCard
          size="md"
          label="CAC"
          value={k?.cac == null ? NA : formatCurrency(k.cac)}
          caption={cmp?.cac?.label ?? (k && k.cac === null ? 'no purchases yet' : 'no account average yet')}
          captionTone={captionToneFor(cmp?.cac ?? null)}
        />
        <StatCard
          size="md"
          tone={k?.roas == null ? 'neutral' : k.roas < 0 ? 'loss' : 'revenue'}
          label="ROAS"
          value={k?.roas == null ? NA : formatPercent(k.roas / 100, 2)}
          caption="net return vs. spend"
        />
        <StatCard size="md" tone="revenue" label="Revenue" value={k ? formatCurrency(k.revenue) : NA} caption={period} />
      </section>

      {stats.kind === 'error' && (
        <p role="alert" className="-mt-4 text-sm text-loss">
          Statistics unavailable: {stats.message}
        </p>
      )}
      {stats.kind === 'ok' && stats.data.meta.rows === 0 && (
        <p className="-mt-4 text-sm text-ink-3">This ad has no report rows in the selected period.</p>
      )}

      <section
        aria-label="Ad breakdowns"
        aria-busy={statsBusy || chartsBusy}
        className={`grid gap-6 transition-opacity md:grid-cols-2 3xl:grid-cols-4 ${statsBusy || chartsBusy ? 'opacity-70' : ''}`}
      >
        <ChartCard
          title="Funnel Drop-off"
          subtitle={FUNNEL_STAGES.map((st) => st.label).join(' → ')}
        >
          {!k || k.link_clicks === 0 ? (
            <EmptyChart>{k ? 'No link clicks in this period.' : 'Loading…'}</EmptyChart>
          ) : (
            <>
              <BarChart
                className="mt-3"
                height={230}
                ariaLabel="Funnel stages as a share of link clicks"
                categories={stageShares.map((st) => st.label)}
                series={[
                  { key: 'share', label: '% of link clicks', color: REVENUE_COLOR, values: stageShares.map((st) => st.share) },
                ]}
                formatValue={(v) => formatFixed(v, 2)}
                formatTick={(v) => String(Math.round(v))}
                formatTooltipValue={(v) => `${formatFixed(v, 2)}% of clicks`}
                intervals={3}
                headroom={1.2}
                barMaxWidth={72}
              />
              <p className="mt-5 text-sm leading-relaxed text-ink-2">
                Weakest signal: <span className="font-bold text-ink">{weakest?.label ?? '—'}</span> (
                {formatFixed(weakest?.share ?? 0, 2)}%). These are each an independent share of link
                clicks from network tracking rather than a strict step-by-step funnel, so use them
                to spot which stage lags — not as a literal drop-off chain.
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard title="Revenue vs. Amount Spent" caption={headerName}>
          {!k ? (
            <EmptyChart>Loading…</EmptyChart>
          ) : (
          <BarChart
            className="mt-3"
            height={230}
            ariaLabel={`Revenue versus amount spent for ${headerName}`}
            categories={['Revenue', 'Amount Spent']}
            series={[{ key: 'usd', label: 'USD', color: REVENUE_COLOR, values: [k.revenue, k.amount_spent] }]}
            formatValue={(v) => formatNumber(v, 1)}
            formatTick={(v) => String(Math.round(v))}
            formatTooltipValue={(v) => formatCurrency(v)}
            intervals={3}
            headroom={1.2}
            barMaxWidth={180}
          />
          )}
        </ChartCard>

        <AudienceMiniCard title="Audience by Age" caption={headerName} buckets={ageBuckets} color={REVENUE_COLOR} empty={audienceEmpty} loading={!chartsData} error={charts.kind === 'error' ? charts.message : null} />
        <AudienceMiniCard
          title="Audience by Gender"
          caption={headerName}
          buckets={genderBuckets}
          color={SPEND_COLOR}
          empty={audienceEmpty}
          loading={!chartsData}
          error={charts.kind === 'error' ? charts.message : null}
        />
      </section>


      {data ? (
        <AdDetailSeedSections data={data} />
      ) : (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-ink-3">
          Marketing read and creative taxonomy are not available for this ad yet.
        </p>
      )}

      <section
        aria-labelledby="cac-heading"
        aria-busy={trendBusy}
        className={`rounded-xl border border-line bg-surface p-7 transition-opacity ${trendBusy ? 'opacity-70' : ''}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="cac-heading" className="text-lg font-bold text-ink">
            Cost of Acquisition — Daily Trend
          </h2>
          <p className="text-sm text-ink-2">
            {period} · {headerName}
          </p>
        </div>
        {trend.kind === 'error' ? (
          <div className="flex items-center justify-center py-16 text-sm text-loss">
            Trend data unavailable: {trend.message}
          </div>
        ) : !hasCacData ? (
          <div className="flex items-center justify-center py-16 text-sm text-ink-3">
            {trendData ? 'No spend recorded for this ad in the selected period.' : 'Loading…'}
          </div>
        ) : (
          <>
            <LineChart
              className="mt-4"
              height={280}
              ariaLabel={`Daily cost of acquisition for ${headerName}`}
              labels={dailyRows.map((d) => formatDayMonth(d.date))}
              tooltipLabels={dailyRows.map((d) => formatDate(d.date, 'medium'))}
              series={[
                {
                  key: 'cac',
                  label: 'CAC',
                  color: REVENUE_COLOR,
                  values: dailyRows.map((d) => d.cac_usd),
                  labelSide: 'above',
                  hollowAt: hollowDays,
                  hollowColor: LOSS_COLOR,
                  hollowText: 'spent, no purchases',
                  emptyText: 'no spend',
                },
              ]}
              tooltipExtras={[
                { label: 'Spend (with fees)', values: dailyRows.map((d) => d.total_spend_usd), format: (v) => formatCurrency(v) },
                { label: 'Conversions', values: dailyRows.map((d) => d.conversions), format: formatInteger },
              ]}
              formatValue={(v) => formatCurrency(v, { whole: true })}
              intervals={3}
              headroom={1.2}
              fallbackMax={100}
            />
            <p className="mt-3 text-xs text-ink-3">
              <span className="text-revenue" aria-hidden="true">●</span> = CAC that day ·{' '}
              <span className="text-loss" aria-hidden="true">○</span> = spent, zero purchases that day ·
              gap = no spend at all
            </p>
          </>
        )}
      </section>


      <DailyPerformanceTable
        daily={dailyRows}
        busy={trendBusy}
        notice={
          trend.kind === 'error' ? (
            <span className="text-loss">Daily data unavailable: {trend.message}</span>
          ) : !trendData ? (
            <span className="text-ink-3">Loading…</span>
          ) : undefined
        }
      />

      <section
        aria-labelledby="ad-trend-heading"
        aria-busy={trendBusy}
        className={`rounded-xl border border-line bg-surface p-7 transition-opacity ${trendBusy ? 'opacity-70' : ''}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="ad-trend-heading" className="text-lg font-bold text-ink">
            Revenue vs. Gross Profit — Daily Trend
          </h2>
          <p className="text-sm text-ink-2">
            {period} · {headerName}
          </p>
        </div>
        {trend.kind === 'error' ? (
          <div className="flex items-center justify-center py-16 text-sm text-loss">
            Trend data unavailable: {trend.message}
          </div>
        ) : dailyRows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-ink-3">
            {trendData ? 'No report rows for this ad in the selected period.' : 'Loading…'}
          </div>
        ) : (
          <>
            <LineChart
              className="mt-4"
              height={300}
              ariaLabel={`Daily revenue and gross profit for ${headerName}`}
              labels={dailyRows.map((d) => formatDayMonth(d.date))}
              tooltipLabels={dailyRows.map((d) => formatDate(d.date, 'medium'))}
              series={[
                { key: 'revenue', label: 'Revenue', color: REVENUE_COLOR, values: dailyRows.map((d) => d.revenue_usd), labelSide: 'above' },
                {
                  key: 'grossProfit',
                  label: 'Gross Profit',
                  color: PROFIT_COLOR,
                  values: dailyRows.map((d) => d.gross_profit_usd),
                  labelSide: 'below',
                  labelColor: (v) => (v < 0 ? LOSS_COLOR : PROFIT_COLOR),
                },
              ]}
              tooltipExtras={[
                { label: 'Spend (before fees)', values: dailyRows.map((d) => d.spend_usd) },
                { label: 'Spend (with fees)', values: dailyRows.map((d) => d.total_spend_usd) },
                { label: 'Net profit', values: dailyRows.map((d) => d.net_profit_usd) },
              ]}
              formatValue={(v) => formatCurrency(v, { whole: true })}
              intervals={3}
              headroom={1.15}
              fallbackMax={100}
            />
            <div className="mt-3">
              <ChartLegend
                items={[
                  { label: 'Revenue', color: REVENUE_COLOR },
                  { label: 'Gross Profit (Revenue − Spend)', color: PROFIT_COLOR },
                ]}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** The sections still served by the seed-based detail endpoint. */
function AdDetailSeedSections({ data }: { data: AdDetail }) {
  const { read, taxonomy } = data;

  return (
    <>
      <section aria-labelledby="read-heading" className="rounded-xl border border-line bg-surface p-7">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`rounded-full border-2 bg-canvas px-5 py-1.5 text-base font-bold ${STATUS_CLASSES[read.status]}`}
          >
            {read.statusLabel}
          </span>
          <h2 id="read-heading" className="text-lg font-bold text-ink">
            Marketing read on this ad
          </h2>
        </div>
        <ul className="mt-5 list-disc space-y-2 pl-5 text-base text-ink marker:text-ink-2">
          {read.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="mt-6 rounded-lg border border-line bg-canvas/60 px-5 py-4 text-base text-ink">
          <span className="font-bold text-revenue">Recommended next step:</span> {read.nextStep}
        </p>
      </section>

      <CreativeTaxonomyCard taxonomy={taxonomy} />

    </>
  );
}

function ChartCard({
  title,
  caption,
  subtitle,
  children,
}: {
  title: string;
  caption?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {caption && <p className="shrink-0 text-sm text-ink-2">{caption}</p>}
      </div>
      {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      {children}
    </div>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return <div className="flex h-[230px] items-center justify-center text-sm text-ink-3">{children}</div>;
}

function AudienceMiniCard({
  title,
  caption,
  buckets,
  color,
  empty = false,
  loading = false,
  error = null,
}: {
  title: string;
  caption: string;
  buckets: AudienceBucket[];
  color: string;
  empty?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <ChartCard title={title} caption={caption}>
      {error ? (
        <EmptyChart>
          <span className="text-loss">Audience data unavailable: {error}</span>
        </EmptyChart>
      ) : loading ? (
        <EmptyChart>Loading…</EmptyChart>
      ) : empty || buckets.length === 0 ? (
        <EmptyChart>No audience data in this period.</EmptyChart>
      ) : (
        <BarChart
          className="mt-3"
          height={230}
          ariaLabel={`${title} (link clicks)`}
          categories={buckets.map((b) => b.label)}
          series={[{ key: 'clicks', label: 'Link clicks', color, values: buckets.map((b) => b.value) }]}
          formatValue={(v) => String(Math.round(v))}
          formatTooltipValue={formatInteger}
          intervals={3}
          headroom={1.2}
          barMaxWidth={120}
        />
      )}
    </ChartCard>
  );
}

function BackButton({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-5 py-3 text-base font-semibold text-ink hover:bg-line"
    >
      ← Back to dashboard
    </Link>
  );
}

function AdDetailSkeleton() {
  const block = 'animate-pulse rounded-xl border border-line bg-surface';
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading ad detail">
      <div className="flex items-start justify-between gap-6">
        <div className="flex gap-5">
          <div className="h-12 w-48 rounded-lg bg-surface-2" />
          <div className="space-y-2">
            <div className="h-4 w-44 rounded bg-surface-2" />
            <div className="h-8 w-56 rounded bg-surface-2" />
            <div className="h-4 w-64 rounded bg-surface-2" />
          </div>
        </div>
        <div className="h-11 w-80 rounded-lg bg-surface-2" />
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${block} h-32`} />
        ))}
      </div>
      <div className={`${block} h-64`} />
      <div className="grid gap-6 md:grid-cols-2 3xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-80`} />
        ))}
      </div>
      <div className={`${block} h-[440px]`} />
      <div className={`${block} h-[360px]`} />
      <div className={`${block} h-[420px]`} />
      <div className={`${block} h-[400px]`} />
    </div>
  );
}
