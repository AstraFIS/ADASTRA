import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import AdRevenueSpendBars from '@/components/AdRevenueSpendBars';
import AudienceCard from '@/components/AudienceCard';
import ChartLegend from '@/components/ChartLegend';
import CustomDateRange from '@/components/CustomDateRange';
import ErrorBoundary from '@/components/ErrorBoundary';
import FilterSelect from '@/components/FilterSelect';
import FunnelTable from '@/components/FunnelTable';
import GeoDeviceSection from '@/components/GeoDeviceSection';
import LineChart from '@/components/LineChart';
import ProviderTable from '@/components/ProviderTable';
import StatCard from '@/components/StatCard';
import { api } from '@/lib/api';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatInteger,
  formatPercent,
} from '@/lib/format';
import { FACEBOOK_ACCESS_GROUPS } from '@/types/auth';
import type { FacebookDashboard } from '@/types/facebook';
import type { FbChartsResult } from '@/types/fbCharts';
import type { FbDailyTrendResult } from '@/types/fbDailyTrend';
import type { FbFunnelResult } from '@/types/fbFunnel';
import type { FbGeoDeviceResult } from '@/types/fbGeoDevice';
import type { FbOptionsResult, FbStatisticsResult } from '@/types/fbStatistics';

type State =
  | { kind: 'loading'; previous: FacebookDashboard | null }
  | { kind: 'ok'; data: FacebookDashboard }
  | { kind: 'error'; message: string };

type StatsState =
  | { kind: 'loading'; previous: FbStatisticsResult | null }
  | { kind: 'ok'; data: FbStatisticsResult }
  | { kind: 'error'; message: string };

type ChartsState =
  | { kind: 'loading'; previous: FbChartsResult | null }
  | { kind: 'ok'; data: FbChartsResult }
  | { kind: 'error'; message: string };

type TrendState =
  | { kind: 'loading'; previous: FbDailyTrendResult | null }
  | { kind: 'ok'; data: FbDailyTrendResult }
  | { kind: 'error'; message: string };

type FunnelState =
  | { kind: 'loading'; previous: FbFunnelResult | null }
  | { kind: 'ok'; data: FbFunnelResult }
  | { kind: 'error'; message: string };

type GeoDeviceState =
  | { kind: 'loading'; previous: FbGeoDeviceResult | null }
  | { kind: 'ok'; data: FbGeoDeviceResult }
  | { kind: 'error'; message: string };

const ALL = '';
const CUSTOM = 'custom';
const TOP_ADS = 10;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayParam = (value: string | null) => (value && ISO_DAY.test(value) ? value : '');
const groupParam = (value: string | null) =>
  (FACEBOOK_ACCESS_GROUPS as readonly string[]).includes(value ?? '') ? (value as string) : ALL;

const REVENUE_COLOR = 'var(--color-revenue)';
const SPEND_COLOR = 'var(--color-spend)';
const PROFIT_COLOR = 'var(--color-violet)';
const LOSS_COLOR = 'var(--color-loss)';

export default function FacebookDashboardPage() {
  const [params, setParams] = useSearchParams();
  const range = params.get('range') ?? 'this_month';
  // a custom range lives in the URL as from / to (YYYY-MM-DD) and takes precedence over the named range
  const from = dayParam(params.get('from'));
  const to = dayParam(params.get('to'));
  const custom = from !== '' || to !== '';
  const ad = params.get('ad') ?? ALL;
  const offer = params.get('offer') ?? ALL;
  // Meta1 / Meta2 (ad_access groups): admins can narrow the whole page to one group's ads
  const { user } = useAuth();
  const canFilterGroup = user?.role === 'admin';
  const group = canFilterGroup ? groupParam(params.get('group')) : ALL;

  const [state, setState] = useState<State>({ kind: 'loading', previous: null });
  const [stats, setStats] = useState<StatsState>({ kind: 'loading', previous: null });
  const [charts, setCharts] = useState<ChartsState>({ kind: 'loading', previous: null });
  const [trend, setTrend] = useState<TrendState>({ kind: 'loading', previous: null });
  const [funnel, setFunnel] = useState<FunnelState>({ kind: 'loading', previous: null });
  const [geo, setGeo] = useState<GeoDeviceState>({ kind: 'loading', previous: null });
  const [options, setOptions] = useState<FbOptionsResult | null>(null);

  // dropdown choices come from the report collection; reloaded only when the access group changes
  useEffect(() => {
    let cancelled = false;
    api
      .get<FbOptionsResult>(`/platforms/facebook/options${group ? `?group=${encodeURIComponent(group)}` : ''}`)
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => {
        // fall back to the dashboard's own option list
      });
    return () => {
      cancelled = true;
    };
  }, [group]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAllAds, setShowAllAds] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));

    const qs = new URLSearchParams(custom ? {} : { range });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (ad) qs.set('ad', ad);
    if (offer) qs.set('offer', offer);
    if (group) qs.set('group', group);

    api
      .get<FacebookDashboard>(`/platforms/facebook/dashboard?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });

    // KPI tiles come from the statistics API (facebook_ad_reports collection), same filters
    setStats((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbStatisticsResult>(`/platforms/facebook/statistics?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setStats({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStats({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });

    // the by-ad and audience charts come from the charts API (report collections), same filters
    setCharts((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbChartsResult>(`/platforms/facebook/charts?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setCharts({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCharts({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });

    // the daily trend comes from the daily-trend API (report collection), same filters
    setTrend((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbDailyTrendResult>(`/platforms/facebook/daily-trend?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setTrend({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTrend({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });

    // the funnel table comes from the funnel API (report collection), same filters
    setFunnel((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbFunnelResult>(`/platforms/facebook/funnel?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setFunnel({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFunnel({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });

    // country / region and device breakdowns come from the geo-device API (report collection), same filters
    setGeo((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbGeoDeviceResult>(`/platforms/facebook/geo-device?${qs.toString()}`)
      .then((data) => {
        if (!cancelled) setGeo({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGeo({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, from, to, custom, ad, offer, group, reloadKey]);

  function setFilter(key: 'ad' | 'offer' | 'group', value: string) {
    const next = new URLSearchParams(params);
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    // the selected ad may not belong to the new group
    if (key === 'group') next.delete('ad');
    setParams(next, { replace: true });
  }

  /** The day window currently on screen: where a custom range starts, so nothing jumps until a date is edited. */
  function shownWindow(): [string, string] {
    const shown = stats.kind === 'ok' ? stats.data.range : null;
    if (shown?.from && shown.to) return [shown.from, shown.to];
    const days = trend.kind === 'ok' ? trend.data.daily : [];
    const first = days[0];
    const last = days[days.length - 1];
    if (first && last) return [first.date, last.date];
    const end = options?.dataThrough ?? new Date().toISOString().slice(0, 10);
    return [`${end.slice(0, 8)}01`, end];
  }

  function setDates(nextRange: string, bounds: [string, string] | null) {
    const next = new URLSearchParams(params);
    next.delete('range');
    next.delete('from');
    next.delete('to');
    if (bounds) {
      next.set('from', bounds[0]);
      next.set('to', bounds[1]);
    } else if (nextRange !== 'this_month') {
      next.set('range', nextRange);
    }
    setParams(next, { replace: true });
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-loss/40 bg-surface p-6">
        <p className="font-semibold text-loss">Could not load the Facebook dashboard</p>
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
  if (!data) return <FacebookSkeleton />;

  const { filters } = data;
  const busy = state.kind === 'loading';

  const statsData = stats.kind === 'ok' ? stats.data : stats.kind === 'loading' ? stats.previous : null;
  const statsBusy = stats.kind === 'loading';
  const kpi = statsData?.statistics ?? null;
  const roas = kpi && kpi.total_amount_spend > 0 ? kpi.net_profit / kpi.total_amount_spend : null;
  const NA = '—';

  const namedLabel = filters.options.dateRanges.find((r) => r.key === filters.dateRange)?.label;
  const customLabel =
    from && to
      ? from === to
        ? formatDate(from, 'medium')
        : `${formatDate(from, from.slice(0, 4) === to.slice(0, 4) ? 'short' : 'medium')} – ${formatDate(to, 'medium')}`
      : from
        ? `from ${formatDate(from, 'medium')}`
        : `up to ${formatDate(to, 'medium')}`;
  const periodLabel = custom ? customLabel : (namedLabel?.toLowerCase() ?? 'selected period');
  const audienceCaption = `${filters.ad ?? 'All ads'} · ${periodLabel}`;
  const trendCaption = `${custom ? customLabel : (namedLabel ?? 'Selected period')} · ${filters.ad ?? 'all ads'}`;

  const chartsData = charts.kind === 'ok' ? charts.data : charts.kind === 'loading' ? charts.previous : null;
  const chartsBusy = charts.kind === 'loading';
  const adsChart = chartsData?.revenue_vs_spend_by_ad ?? [];
  const visibleAds = showAllAds ? adsChart : adsChart.slice(0, TOP_ADS);
  const ageBuckets = (chartsData?.audience_by_age ?? []).map((b) => ({ label: b.label, value: b.link_clicks }));
  const genderBuckets = (chartsData?.audience_by_gender ?? []).map((b) => ({ label: b.label, value: b.link_clicks }));
  const chartsEmpty = chartsData !== null && chartsData.meta.report_rows === 0;

  const geoData = geo.kind === 'ok' ? geo.data : geo.kind === 'loading' ? geo.previous : null;
  const geoBusy = geo.kind === 'loading';

  const trendData = trend.kind === 'ok' ? trend.data : trend.kind === 'loading' ? trend.previous : null;
  const trendBusy = trend.kind === 'loading';
  const daily = trendData?.daily ?? [];
  const trendTotals = daily.reduce(
    (t, d) => ({
      revenue: t.revenue + d.revenue_usd,
      gross: t.gross + d.gross_profit_usd,
      upDays: t.upDays + (d.gross_profit_usd > 0 ? 1 : 0),
    }),
    { revenue: 0, gross: 0, upDays: 0 },
  );

  const funnelData = funnel.kind === 'ok' ? funnel.data : funnel.kind === 'loading' ? funnel.previous : null;
  const funnelBusy = funnel.kind === 'loading';

  // prefer the database's ad / offer lists; keep the current selection selectable even if it's not listed
  // once the real options have loaded they are authoritative, even when empty (e.g. a group with no rows yet)
  const adOptions = options ? options.ads : filters.options.ads;
  const offerOptions = options ? options.offers : filters.options.offers;
  const withCurrent = (list: string[], current: string | null) =>
    current && !list.includes(current) ? [current, ...list] : list;

  return (
    <div className={`space-y-8 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">
          <Link to="/" className="hover:text-ink-2">
            {data.client}
          </Link>{' '}
          · {data.portfolio} · {data.sourceLabel}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          {data.title}
          <span className="text-spend"> — {data.subtitle}</span>
        </h1>
      </header>

      <section aria-label="Filters" className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <FilterSelect
          id="date-range"
          label="Date Range"
          value={custom ? CUSTOM : filters.dateRange}
          options={[
            ...filters.options.dateRanges.map((r) => ({ value: r.key, label: r.label })),
            { value: CUSTOM, label: 'Custom Range' },
          ]}
          onChange={(v) => setDates(v, v === CUSTOM ? shownWindow() : null)}
          className="w-full sm:w-auto sm:min-w-[300px]"
        />
        {custom && (
          <CustomDateRange
            key={`${from}|${to}`}
            from={from}
            to={to}
            onApply={(start, end) => setDates(CUSTOM, [start, end])}
          />
        )}
        {canFilterGroup && (
          <FilterSelect
            id="access-group"
            label="Access Group"
            value={group}
            options={[
              { value: ALL, label: 'All Groups' },
              ...FACEBOOK_ACCESS_GROUPS.map((g) => ({ value: g, label: g })),
            ]}
            onChange={(v) => setFilter('group', v)}
            className="w-full sm:w-auto sm:min-w-[200px]"
          />
        )}
        <FilterSelect
          id="ad-name"
          label="Filter by Ad Name"
          value={filters.ad ?? ALL}
          options={[{ value: ALL, label: 'All Ads' }, ...withCurrent(adOptions, filters.ad).map((a) => ({ value: a, label: a }))]}
          onChange={(v) => setFilter('ad', v)}
          className="w-full sm:w-auto sm:min-w-[360px]"
        />
        <FilterSelect
          id="offer"
          label="Filter by Offer"
          value={filters.offer ?? ALL}
          options={[
            { value: ALL, label: 'All Offers' },
            ...withCurrent(offerOptions, filters.offer).map((o) => ({ value: o, label: o })),
          ]}
          onChange={(v) => setFilter('offer', v)}
          className="w-full flex-1 sm:min-w-[360px]"
        />
        <div className="flex gap-3">
          <ActionButton icon="🎨" label="Creatives" />
        </div>
      </section>

      <section
        aria-label="Key metrics"
        aria-busy={statsBusy}
        className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-4 xl:grid-cols-7 ${statsBusy ? 'opacity-70' : ''}`}
      >
        <StatCard
          size="sm"
          tone="revenue"
          label="Revenue"
          value={kpi ? formatCurrency(kpi.total_revenue) : NA}
          caption={periodLabel}
        />
        <StatCard
          size="sm"
          tone="spend"
          label="Amount Spent"
          value={kpi ? formatCurrency(kpi.total_amount_spend) : NA}
          caption={
            statsData ? `incl. ${formatCurrency(statsData.meta.provider_fees)} fees` : periodLabel
          }
        />
        <StatCard
          size="sm"
          tone={kpi && kpi.net_profit < 0 ? 'loss' : 'revenue'}
          label="Net Profit"
          value={kpi ? formatCurrency(kpi.net_profit) : NA}
          caption={`ROAS ${roas === null ? 'n/a' : formatPercent(roas, 1)}`}
          captionTone={roas === null ? 'default' : roas < 0 ? 'bad' : 'good'}
        />
        <StatCard
          size="sm"
          label="LP Views"
          value={kpi ? formatInteger(kpi.landing_page_views) : NA}
          caption="landing page views"
        />
        <StatCard
          size="sm"
          label="Link Clicks"
          value={kpi ? formatInteger(kpi.link_clicks) : NA}
          caption="all ads"
        />
        <StatCard
          size="sm"
          label="CPC"
          value={kpi?.cpc == null ? NA : formatCurrency(kpi.cpc)}
          caption="spend ÷ link clicks"
        />
        <StatCard
          size="sm"
          label="CTR"
          value={kpi?.ctr == null ? NA : formatPercent(kpi.ctr / 100, 2)}
          caption="weighted by clicks"
        />
      </section>

      {stats.kind === 'error' && (
        <p role="alert" className="-mt-4 text-sm text-loss">
          Statistics unavailable: {stats.message}
        </p>
      )}
      {stats.kind === 'ok' && stats.data.meta.rows === 0 && (
        <p className="-mt-4 text-sm text-ink-3">
          No report rows in the database for this selection yet — the tiles show zero until Facebook data is
          imported.
        </p>
      )}

      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.9fr)] xl:grid-cols-[minmax(340px,1fr)_minmax(0,2.2fr)]">
      <ProviderTable providers={statsData?.providers ?? []} busy={statsBusy} caption={periodLabel} />

      <ErrorBoundary label="The daily trend chart">
      <section
        aria-labelledby="trend-heading"
        aria-busy={trendBusy}
        className={`flex min-w-0 flex-col rounded-xl border border-line bg-surface p-5 transition-opacity ${trendBusy ? 'opacity-70' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 id="trend-heading" className="text-base font-bold text-ink">
              Revenue vs. Gross Profit — Daily Trend
            </h2>
            <p className="mt-0.5 text-xs text-ink-3">{trendCaption} · gross profit = revenue − spend</p>
          </div>
          {daily.length > 0 && trend.kind !== 'error' && (
            <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-3">Revenue</dt>
                <dd className="text-sm font-bold tabular-nums text-revenue">{formatCurrency(trendTotals.revenue)}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-3">Gross profit</dt>
                <dd className={`text-sm font-bold tabular-nums ${trendTotals.gross < 0 ? 'text-loss' : 'text-violet'}`}>
                  {formatCurrency(trendTotals.gross)}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-3">Profitable days</dt>
                <dd className="text-sm font-bold tabular-nums text-ink">
                  {trendTotals.upDays} / {daily.length}
                </dd>
              </div>
            </dl>
          )}
          <ChartLegend
            items={[
              { label: 'Revenue', color: REVENUE_COLOR },
              { label: 'Gross Profit', color: PROFIT_COLOR },
            ]}
          />
        </div>

        {trend.kind === 'error' ? (
          <div className="flex items-center justify-center py-14 text-sm text-loss">
            Trend data unavailable: {trend.message}
          </div>
        ) : daily.length === 0 ? (
          <div className="flex items-center justify-center py-14 text-sm text-ink-3">
            {trendData ? 'No report rows in the database for this selection yet.' : 'Loading…'}
          </div>
        ) : (
          <LineChart
            className="mt-3"
            height={260}
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
                area: true,
              },
              {
                key: 'grossProfit',
                label: 'Gross Profit',
                color: PROFIT_COLOR,
                values: daily.map((d) => d.gross_profit_usd),
                labelSide: 'below',
                labelColor: (v) => (v < 0 ? LOSS_COLOR : PROFIT_COLOR),
              },
            ]}
            tooltipExtras={[
              { label: 'Spend (before fees)', values: daily.map((d) => d.spend_usd) },
              { label: 'Spend (with fees)', values: daily.map((d) => d.total_spend_usd) },
              { label: 'Net profit', values: daily.map((d) => d.net_profit_usd) },
            ]}
            formatValue={(v) => formatCurrency(v, { whole: true })}
            formatTick={formatCompactCurrency}
            intervals={3}
            headroom={1.15}
            fallbackMax={100}
            labelMinSpacing={52}
          />
        )}
      </section>
      </ErrorBoundary>
      </div>

      <ErrorBoundary label="The by-ad and audience charts">
      <section
        aria-label="Breakdowns"
        className="grid gap-6 md:grid-cols-2 xl:grid-cols-[1.35fr_1.1fr_0.8fr]"
      >
        <div
          aria-busy={chartsBusy}
          className={`flex flex-col rounded-xl md:col-span-2 xl:col-span-1 border border-line bg-surface p-5 transition-opacity ${chartsBusy ? 'opacity-70' : ''}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">Revenue vs. Amount Spent by Ad Name</h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {showAllAds || adsChart.length <= TOP_ADS
                  ? `All ${adsChart.length} ads`
                  : `Top ${TOP_ADS} of ${adsChart.length} ads`}{' '}
                · net = revenue − spent
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ChartLegend
                items={[
                  { label: 'Revenue', color: REVENUE_COLOR },
                  { label: 'Spent', color: SPEND_COLOR },
                ]}
              />
              {adsChart.length > TOP_ADS && (
                <button
                  type="button"
                  onClick={() => setShowAllAds((v) => !v)}
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-revenue transition-colors hover:bg-line"
                >
                  {showAllAds ? `Top ${TOP_ADS}` : `All ${adsChart.length} →`}
                </button>
              )}
            </div>
          </div>

          {charts.kind === 'error' ? (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-loss">
              Chart data unavailable: {charts.message}
            </div>
          ) : adsChart.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-ink-3">
              {chartsData ? 'No report rows in the database for this selection yet.' : 'Loading…'}
            </div>
          ) : (
            <AdRevenueSpendBars
              className={`mt-4 ${showAllAds ? 'max-h-[420px] overflow-y-auto pr-1' : ''}`}
              ads={visibleAds}
              revenueColor={REVENUE_COLOR}
              spendColor={SPEND_COLOR}
            />
          )}
        </div>

        <div className={`transition-opacity ${chartsBusy ? 'opacity-70' : ''}`} aria-busy={chartsBusy}>
          <AudienceCard
            compact
            title="Audience by Age"
            caption={audienceCaption}
            buckets={ageBuckets}
            color={REVENUE_COLOR}
            empty={chartsEmpty}
          />
        </div>
        <div className={`transition-opacity ${chartsBusy ? 'opacity-70' : ''}`} aria-busy={chartsBusy}>
          <AudienceCard
            compact
            title="Audience by Gender"
            caption={audienceCaption}
            buckets={genderBuckets}
            color={SPEND_COLOR}
            empty={chartsEmpty}
          />
        </div>
      </section>
      </ErrorBoundary>

      <ErrorBoundary label="The country and device breakdowns">
        <GeoDeviceSection
          data={geoData}
          busy={geoBusy}
          error={geo.kind === 'error' ? geo.message : null}
          caption={audienceCaption}
        />
      </ErrorBoundary>

      <ErrorBoundary label="The funnel table">
      <section
        aria-labelledby="funnel-heading"
        aria-busy={funnelBusy}
        className={`rounded-xl border border-line bg-surface p-7 transition-opacity ${funnelBusy ? 'opacity-70' : ''}`}
      >
        <h2 id="funnel-heading" className="text-lg font-bold text-ink">
          Funnel Performance by Ad Name &amp; Offer
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Amount Spent / Link Clicks / CTR / CPC / CAC / ROAS / funnel-stage columns all respect the
          date range selected above · funnel percentages are step-over-step: First Page View % =
          First Page View ÷ Link Clicks · Q.S. % = Q.S. ÷ First Page View · Q.C. % = Q.C. ÷
          Q.S. · Add To Cart % = Add To Cart ÷ Q.C. · Purchase % = Purchase ÷ Add To Cart (&quot;—&quot;
          when the previous stage is 0) · ads with under 10 clicks show &quot;low sample&quot; · click a
          column to sort
        </p>
        {funnel.kind === 'error' ? (
          <p className="mt-6 text-sm text-loss">Funnel data unavailable: {funnel.message}</p>
        ) : (
          <FunnelTable rows={funnelData?.rows ?? []} activeWindowDays={funnelData?.meta.active_window_days} />
        )}
      </section>
      </ErrorBoundary>
    </div>
  );
}

function ActionButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-5 py-2.5 text-base font-semibold text-ink disabled:cursor-not-allowed"
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

function FacebookSkeleton() {
  const block = 'animate-pulse rounded-xl border border-line bg-surface';
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading Facebook dashboard">
      <div className="space-y-3">
        <div className="h-4 w-[30rem] max-w-full rounded bg-surface-2" />
        <div className="h-9 w-[36rem] max-w-full rounded bg-surface-2" />
        <div className="h-4 w-full max-w-4xl rounded bg-surface-2" />
      </div>
      <div className="flex flex-wrap gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 w-72 rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${block} h-[88px]`} />
        ))}
      </div>
      <div className="mx-auto grid max-w-[820px] gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={`${block} h-52`} />
        ))}
      </div>
      <div className={`${block} h-[340px]`} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-[1.35fr_1.1fr_0.8fr]">
        <div className={`${block} h-[480px] md:col-span-2 xl:col-span-1`} />
        <div className={`${block} h-[480px]`} />
        <div className={`${block} h-[480px]`} />
      </div>
      <div className={`${block} h-[640px]`} />
    </div>
  );
}
