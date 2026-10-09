import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import BarChart from '@/components/BarChart';
import CreativeTaxonomyCard from '@/components/CreativeTaxonomyCard';
import DailyPerformanceTable from '@/components/DailyPerformanceTable';
import FilterSelect from '@/components/FilterSelect';
import GeoDeviceSection from '@/components/GeoDeviceSection';
import LineChart from '@/components/LineChart';
import StatCard, { type CaptionTone } from '@/components/StatCard';
import { api, ApiError } from '@/lib/api';
import { getCreativeTaxonomy, type TaxonomyData } from '@/lib/creativeTaxonomy';
import { fetchCreativeOverride, fetchTaxonomyOverride } from '@/lib/adAccess';
import { getAdCreative, mergeCreative, type CreativeOverride } from '@/lib/creatives';
import {
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatFixed,
  formatInteger,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import type { AdDetail, AudienceBucket, MetricComparison } from '@/types/facebook';
import type { FbAdStatisticsResult } from '@/types/fbAdStatistics';
import type { FbChartsResult } from '@/types/fbCharts';
import type { FbDailyTrendResult } from '@/types/fbDailyTrend';
import type { FbGeoDeviceResult } from '@/types/fbGeoDevice';

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

type GeoState =
  | { kind: 'loading'; previous: FbGeoDeviceResult | null }
  | { kind: 'ok'; data: FbGeoDeviceResult }
  | { kind: 'error'; message: string };

const REVENUE_COLOR = 'var(--color-revenue)';
const SPEND_COLOR = 'var(--color-spend)';
const LOSS_COLOR = 'var(--color-loss)';

const FUNNEL_STAGES: { key: 'first_page_views' | 'questionnaire_starts' | 'questionnaire_completed' | 'add_to_carts' | 'purchase_events'; label: string }[] = [
  { key: 'first_page_views', label: 'First Page View' },
  { key: 'questionnaire_starts', label: 'Q.S.' },
  { key: 'questionnaire_completed', label: 'Q.C.' },
  { key: 'add_to_carts', label: 'Add To Cart' },
  { key: 'purchase_events', label: 'Purchase' },
];

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
  const [geo, setGeo] = useState<GeoState>({ kind: 'loading', previous: null });
  const [reloadKey, setReloadKey] = useState(0);
  // links an admin saved on the Ad groups page; they win over creatives.json
  const [linkOverride, setLinkOverride] = useState<CreativeOverride | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLinkOverride(null);
    fetchCreativeOverride(adName)
      .then((o) => !cancelled && setLinkOverride(o))
      .catch(() => undefined); // no override available: creatives.json is used as before
    return () => {
      cancelled = true;
    };
  }, [adName]);

  // taxonomy an admin saved on the Ad groups page; it wins over data.json
  const [savedTaxonomy, setSavedTaxonomy] = useState<TaxonomyData | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSavedTaxonomy(null);
    fetchTaxonomyOverride(adName)
      .then((r) => !cancelled && setSavedTaxonomy(r.taxonomy))
      .catch(() => undefined); // none available: data.json is used as before
    return () => {
      cancelled = true;
    };
  }, [adName]);

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

    // country / region and device breakdown for this ad
    setGeo((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbGeoDeviceResult>(
        `/platforms/facebook/geo-device?ad=${encodeURIComponent(adName)}&range=${encodeURIComponent(range)}`,
      )
      .then((data) => {
        if (!cancelled) setGeo({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setGeo({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
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

  // everything is served by the report collection; the seed detail endpoint only backs
  // the header while the statistics are unavailable
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

  // creative taxonomy: saved on the Ad groups page, else frontend/data.json (matched on the ad name)
  const taxonomy = getCreativeTaxonomy(headerName, savedTaxonomy);

  // 4-card breakdown row, all from the report collection
  const chartsData = charts.kind === 'ok' ? charts.data : charts.kind === 'loading' ? charts.previous : null;
  const chartsBusy = charts.kind === 'loading';
  const stageShares = k
    ? FUNNEL_STAGES.map((st) => ({ label: st.label, share: k.link_clicks > 0 ? (k[st.key] / k.link_clicks) * 100 : 0 }))
    : [];
  const weakest = stageShares.reduce<{ label: string; share: number } | null>((min, st) => (!min || st.share < min.share ? st : min), null);
  const ageBuckets = (chartsData?.audience_by_age ?? []).filter((b) => b.link_clicks > 0).map((b) => ({ label: b.label, value: b.link_clicks }));
  const genderBuckets = (chartsData?.audience_by_gender ?? []).filter((b) => b.link_clicks > 0).map((b) => ({ label: b.label, value: b.link_clicks }));
  const geoData = geo.kind === 'ok' ? geo.data : geo.kind === 'loading' ? geo.previous : null;
  const grossProfit = k?.gross_profit ?? null;
  const profitTone = grossProfit === null ? 'neutral' : grossProfit < 0 ? 'loss' : 'revenue';
  const audienceEmpty = chartsData !== null && chartsData.meta.report_rows === 0;


  return (
    <div className={`space-y-5 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <BackButton to={backHref} />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-3">
              Ad detail
            </p>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink">
              {headerName}
              {!headerActive && (
                <span className="ml-3 align-middle text-sm font-medium text-ink-3">inactive</span>
              )}
            </h1>
            <p className="mt-0.5 text-sm text-ink-2">Offer: {headerOffer}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              Showing {period.toLowerCase()}
              {statsData && statsData.ad.days > 0 && (
                <>
                  {' '}
                  · {statsData.ad.days} day{statsData.ad.days === 1 ? '' : 's'} with data
                  {statsData.ad.last_date && <> · last report {formatDate(statsData.ad.last_date, 'medium')}</>}
                </>
              )}
            </p>
          </div>
        </div>
        <FilterSelect
          id="ad-date-range"
          label="Date Range"
          value={range}
          options={rangeOptions.map((r) => ({ value: r.key, label: r.label }))}
          onChange={setRange}
          className="w-full sm:w-auto sm:min-w-[260px]"
        />
      </header>

      {k && (
        <div
          className={`rounded-xl border bg-surface-2 px-4 py-3 ${
            grossProfit !== null && grossProfit < 0 ? 'border-loss/40' : 'border-revenue/30'
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">At a glance</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            In {period.toLowerCase()} this ad spent <b>{formatCurrency(k.amount_spent)}</b> and earned{' '}
            <b>{formatCurrency(k.revenue)}</b> in revenue, a gross profit of{' '}
            <b className={grossProfit !== null && grossProfit < 0 ? 'text-loss' : 'text-revenue'}>
              {formatCurrency(grossProfit ?? 0)}
            </b>
            {k.roas !== null && <> (ROAS {formatPercent(k.roas / 100, 2)})</>}.
            {weakest && k.link_clicks > 0 && (
              <>
                {' '}
                Weakest funnel stage: <b>{weakest.label}</b>.
              </>
            )}
          </p>
        </div>
      )}

      <section aria-label="Key numbers" aria-busy={statsBusy} className={`space-y-2 transition-opacity ${statsBusy ? 'opacity-70' : ''}`}>
        <SectionHeading title="Key numbers" hint="Money in and out, traffic and cost efficiency." />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <div className="contents">
          <StatCard size="sm" tone="spend" label="Amount Spent" value={k ? formatCurrency(k.amount_spent) : NA} caption="ad spend + provider fees" />
          <StatCard size="sm" tone="revenue" label="Revenue" value={k ? formatCurrency(k.revenue) : NA} caption="money earned" />
          <StatCard
            size="sm"
            tone={profitTone}
            label="Gross Profit (GP)"
            value={grossProfit === null ? NA : formatCurrency(grossProfit)}
            caption="revenue − spend (before fees)"
          />
          <StatCard
            size="sm"
            tone={k?.roas == null ? 'neutral' : k.roas < 0 ? 'loss' : 'revenue'}
            label="ROAS"
            value={k?.roas == null ? NA : formatPercent(k.roas / 100, 2)}
            caption="profit after fees ÷ spend"
          />
        </div>
        <div className="contents">
          <StatCard size="sm" label="Link Clicks" value={k ? formatInteger(k.link_clicks) : NA} caption="people who clicked the ad" />
          <StatCard
            size="sm"
            label="CTR (All)"
            value={k?.ctr == null ? NA : formatPercent(k.ctr / 100, 2)}
            caption={cmp?.ctr?.label ?? 'no account average yet'}
            captionTone={captionToneFor(cmp?.ctr ?? null)}
          />
          <StatCard
            size="sm"
            label="CPC (All)"
            value={k?.cpc == null ? NA : formatCurrency(k.cpc)}
            caption={cmp?.cpc?.label ?? 'no account average yet'}
            captionTone={captionToneFor(cmp?.cpc ?? null)}
          />
          <StatCard
            size="sm"
            label="CAC"
            value={k?.cac == null ? NA : formatCurrency(k.cac)}
            caption={cmp?.cac?.label ?? (k && k.cac === null ? 'no purchases yet' : 'no account average yet')}
            captionTone={captionToneFor(cmp?.cac ?? null)}
          />
        </div>
        </div>
      </section>

      {stats.kind === 'error' && (
        <p role="alert" className="-mt-4 text-sm text-loss">
          Statistics unavailable: {stats.message}
        </p>
      )}
      {stats.kind === 'ok' && stats.data.meta.rows === 0 && (
        <p className="-mt-4 text-sm text-ink-3">This ad has no report rows in the selected period.</p>
      )}

      <div className="grid gap-x-4 gap-y-5 xl:grid-cols-4">
      <section aria-label="Performance" aria-busy={statsBusy} className={`flex flex-col gap-2 xl:col-span-2 transition-opacity ${statsBusy ? 'opacity-70' : ''}`}>
        <SectionHeading title="Performance" hint="Where visitors drop off, and how the money adds up." />
        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Funnel Drop-off">
            {!k || k.link_clicks === 0 ? (
              <EmptyChart>{k ? 'No link clicks in this period.' : 'Loading…'}</EmptyChart>
            ) : (
              <>
                <BarChart
                  className="mt-2"
                  height={200}
                  ariaLabel="Funnel stages as a share of link clicks"
                  categories={stageShares.map((st) => st.label)}
                  series={[
                    { key: 'share', label: '% of link clicks', color: REVENUE_COLOR, values: stageShares.map((st) => st.share) },
                  ]}
                  formatValue={(v) => `${formatFixed(v, 1)}%`}
                  formatTick={(v) => `${Math.round(v)}%`}
                  formatTooltipValue={(v) => `${formatFixed(v, 2)}% of link clicks`}
                  intervals={3}
                  headroom={1.2}
                  barMaxWidth={72}
                />
              </>
            )}
          </ChartCard>

          <ChartCard title="Revenue, Spend & Gross Profit">
            {!k ? (
              <EmptyChart>Loading…</EmptyChart>
            ) : (
              <>
                <BarChart
                  className="mt-2"
                  height={200}
                  ariaLabel={`Revenue, amount spent and gross profit for ${headerName}`}
                  categories={['Revenue', 'Amount Spent', 'Gross Profit']}
                  // bars cannot go below zero; a loss is shown as an empty bar and spelled out below
                  series={[{ key: 'usd', label: 'USD', color: REVENUE_COLOR, values: [k.revenue, k.amount_spent, Math.max(0, k.gross_profit)] }]}
                  formatValue={(v) => formatNumber(v, 1)}
                  formatTick={(v) => String(Math.round(v))}
                  formatTooltipValue={(v) => formatCurrency(v)}
                  intervals={3}
                  headroom={1.2}
                  barMaxWidth={140}
                  fallbackMax={100}
                />
              </>
            )}
          </ChartCard>
        </div>
      </section>

      <section
        aria-label="Audience"
        aria-busy={chartsBusy}
        className={`flex flex-col gap-2 xl:col-span-2 transition-opacity ${chartsBusy ? 'opacity-70' : ''}`}
      >
        <SectionHeading title="Audience" hint="Who clicked this ad, by age and gender (link clicks)." />
        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          <AudienceMiniCard title="Audience by Age" buckets={ageBuckets} color={REVENUE_COLOR} empty={audienceEmpty} loading={!chartsData} error={charts.kind === 'error' ? charts.message : null} />
          <AudienceMiniCard
            title="Audience by Gender"
            buckets={genderBuckets}
            color={SPEND_COLOR}
            empty={audienceEmpty}
            loading={!chartsData}
            error={charts.kind === 'error' ? charts.message : null}
          />
        </div>
      </section>
      </div>

      <GeoDeviceSection
        id="ad-geo-heading"
        data={geoData}
        busy={geo.kind === 'loading'}
        error={geo.kind === 'error' ? geo.message : null}
        caption={`${headerName} · ${period.toLowerCase()}`}
      />

      <CreativeTaxonomyCard
        taxonomy={taxonomy}
        threshold={taxonomy?.threshold}
        adName={headerName}
        creative={mergeCreative(getAdCreative(headerName), linkOverride)}
      />

      <SectionHeading title="Day by day" hint="Cost per purchase and the full daily numbers for this ad." />

      <section
        aria-labelledby="cac-heading"
        aria-busy={trendBusy}
        className={`rounded-xl border border-line bg-surface p-4 transition-opacity ${trendBusy ? 'opacity-70' : ''}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="cac-heading" className="text-base font-bold text-ink">
            Cost of Acquisition — Daily Trend
          </h2>
          <p className="text-xs text-ink-2">
            {period} · {headerName}
          </p>
        </div>
        {trend.kind === 'error' ? (
          <div className="flex items-center justify-center py-10 text-sm text-loss">
            Trend data unavailable: {trend.message}
          </div>
        ) : !hasCacData ? (
          <div className="flex items-center justify-center py-10 text-sm text-ink-3">
            {trendData ? 'No spend recorded for this ad in the selected period.' : 'Loading…'}
          </div>
        ) : (
          <>
            <LineChart
              className="mt-2"
              height={220}
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
    </div>
  );
}

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="text-xs text-ink-2">{hint}</p>
    </div>
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
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {caption && <p className="shrink-0 text-xs text-ink-2">{caption}</p>}
      </div>
      {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
      {children}
    </div>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return <div className="flex h-[180px] items-center justify-center text-sm text-ink-3">{children}</div>;
}

function AudienceMiniCard({
  title,
  buckets,
  color,
  empty = false,
  loading = false,
  error = null,
}: {
  title: string;
  buckets: AudienceBucket[];
  color: string;
  empty?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <ChartCard title={title}>
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
          className="mt-2"
          height={200}
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
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-line"
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
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
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
