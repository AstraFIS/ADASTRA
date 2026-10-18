import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import BingCampaignBuyers from '@/components/BingCampaignBuyers';
import BingGeoSection from '@/components/BingGeoSection';
import BingFunnelTable, { type BingTableView } from '@/components/BingFunnelTable';
import BingKeywordTable from '@/components/BingKeywordTable';
import ChartLegend from '@/components/ChartLegend';
import CustomDateRange from '@/components/CustomDateRange';
import ErrorBoundary from '@/components/ErrorBoundary';
import FilterSelect from '@/components/FilterSelect';
import LineChart from '@/components/LineChart';
import StatCard from '@/components/StatCard';
import { api } from '@/lib/api';
import { normalizeBingDashboard } from '@/lib/apiCompat';
import { formatCompactCurrency, formatCurrency, formatDate, formatDayMonth, formatInteger, formatPercent } from '@/lib/format';
import type { BingDashboard } from '@/types/bing';

type State =
  | { kind: 'loading'; previous: BingDashboard | null }
  | { kind: 'ok'; data: BingDashboard; outdated: boolean }
  | { kind: 'error'; message: string };

type FilterKey = 'range' | 'offer' | 'campaign' | 'buyer';

const ALL = '';
const DEFAULT_RANGE = 'all_time';
const CUSTOM = 'custom';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayParam = (value: string | null) => (value && ISO_DAY.test(value) ? value : '');
const AD_GROUP_LIMIT = 25;

const REVENUE_COLOR = 'var(--color-revenue)';
const PROFIT_COLOR = 'var(--color-violet)';
const LOSS_COLOR = 'var(--color-loss)';

const TABLE_VIEWS: { key: BingTableView; label: string }[] = [
  { key: 'offer', label: 'By Offer' },
  { key: 'ad_group', label: 'By Ad Group' },
  { key: 'date', label: 'By Date' },
];

// an exact zero reads as "$0" / "0%" on the tiles rather than "$0.00" / "0.00%"
const money = (value: number) => (value === 0 ? '$0' : formatCurrency(value));
const percent = (value: number | null, digits: number) =>
  value === null ? '—' : value === 0 ? '0%' : formatPercent(value / 100, digits);

export default function BingDashboardPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const range = params.get('range') ?? DEFAULT_RANGE;
  // a custom range lives in the URL as from / to (YYYY-MM-DD) and takes precedence over the named range
  const from = dayParam(params.get('from'));
  const to = dayParam(params.get('to'));
  const custom = from !== '' || to !== '';
  const offer = params.get('offer') ?? ALL;
  const campaign = params.get('campaign') ?? ALL;
  const buyer = params.get('buyer') ?? ALL;

  const [state, setState] = useState<State>({ kind: 'loading', previous: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<BingTableView>('offer');
  const [showAllGroups, setShowAllGroups] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));

    const qs = new URLSearchParams(custom ? {} : { range });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (offer) qs.set('offer', offer);
    if (campaign) qs.set('campaign', campaign);
    if (buyer) qs.set('buyer', buyer);

    api
      .get<unknown>(`/platforms/microsoft/dashboard?${qs.toString()}`)
      .then((raw) => {
        // tolerate an older / newer backend: missing fields get safe defaults instead of crashing the page
        const { data, outdated } = normalizeBingDashboard(raw);
        if (!cancelled) setState({ kind: 'ok', data, outdated });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });
    return () => {
      cancelled = true;
    };
  }, [range, from, to, custom, offer, campaign, buyer, reloadKey]);

  /** Switch between a named range and a custom from / to window (bounds = null → named range). */
  function setDates(nextRange: string, bounds: [string, string] | null) {
    const next = new URLSearchParams(params);
    next.delete('range');
    next.delete('from');
    next.delete('to');
    if (bounds) {
      next.set('from', bounds[0]);
      next.set('to', bounds[1]);
    } else if (nextRange !== DEFAULT_RANGE) {
      next.set('range', nextRange);
    }
    setParams(next, { replace: true });
  }

  function setFilter(key: FilterKey, value: string) {
    const next = new URLSearchParams(params);
    if (value === ALL || (key === 'range' && value === DEFAULT_RANGE)) next.delete(key);
    else next.set(key, value);
    // the selected campaign / offer may belong to another media buyer
    if (key === 'buyer') {
      next.delete('campaign');
      next.delete('offer');
    }
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

  /** The day window currently on screen: the resolved range, else the latest month of data. */
  function shownWindow(): [string, string] {
    if (data!.range.from && data!.range.to) return [data!.range.from, data!.range.to];
    const end =
      [data!.meta.ads_through, data!.meta.partner_through].filter((d): d is string => !!d).sort().pop() ?? new Date().toISOString().slice(0, 10);
    const daily = data!.daily;
    const start = daily[0]?.date ?? `${end.slice(0, 8)}01`;
    return [start, daily[daily.length - 1]?.date ?? end];
  }

  const busy = state.kind === 'loading';
  const outdated = state.kind === 'ok' && state.outdated;
  const { statistics: kpi, daily, funnel, meta, filters, options } = data;
  const empty = meta.ad_rows === 0 && meta.conversion_rows === 0 && meta.keyword_rows === 0 && meta.search_term_rows === 0;
  const hasAdData = meta.ad_rows > 0 || meta.conversion_rows > 0;
  // the buyer dropdown only appears when there is a choice (admins, or users with several buyers)
  const buyerChoices = options.buyers;
  const showBuyerFilter = buyerChoices.length > 1;
  const buyerLabel = filters.buyer ?? (showBuyerFilter ? 'all buyers' : buyerChoices[0] ?? null);

  const scope = [buyerLabel, filters.campaign ?? 'all campaigns', filters.offer ?? 'all offers'].filter(Boolean).join(' · ');
  const keep = (list: string[], current: string | null) => (current && !list.includes(current) ? [current, ...list] : list);

  const rowsAll = view === 'date' ? funnel.by_date : view === 'offer' ? funnel.by_offer : funnel.by_ad_group;
  const rows = view === 'ad_group' && !showAllGroups ? rowsAll.slice(0, AD_GROUP_LIMIT) : rowsAll;

  const totalRevenue = daily.reduce((s, d) => s + (d.revenue_usd ?? 0), 0);
  const totalGross = daily.reduce((s, d) => s + (d.gross_profit_usd ?? 0), 0);
  const profitableDays = daily.filter((d) => (d.gross_profit_usd ?? 0) > 0).length;
  const pendingDays = daily.filter((d) => d.revenue_usd === null || d.spend_usd === null);

  return (
    <div className={`space-y-6 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">Bing Ads</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Campaign Performance</h1>
          {showBuyerFilter && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span id="buyer-label" className="text-sm font-medium text-ink-2">
                Media buyer
              </span>
              <div role="radiogroup" aria-labelledby="buyer-label" className="inline-flex flex-wrap rounded-lg bg-surface-2 p-1">
                {[ALL, ...buyerChoices].map((b) => {
                  const active = (filters.buyer ?? ALL) === b;
                  return (
                    <button
                      key={b || 'all'}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFilter('buyer', b)}
                      title={b === 'Unassigned' ? 'Campaigns with no _th / _th2 suffix and no buyer assigned' : undefined}
                      className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                        active ? 'bg-azure font-bold text-canvas' : 'font-medium text-ink-2 hover:text-ink'
                      }`}
                    >
                      {b === ALL ? 'All' : b}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <section aria-label="Filters" className="flex w-full flex-wrap gap-3 xl:w-auto">
          <FilterSelect
            id="date-range"
            label="Date Range"
            hideLabel
            value={custom ? CUSTOM : data.range.key}
            options={[
              ...options.date_ranges.map((r) => ({ value: r.key, label: r.label })),
              { value: CUSTOM, label: custom && data.range.key === CUSTOM ? data.range.label : 'Custom Range' },
            ]}
            // picking Custom starts from the window on screen, so nothing jumps until a date is edited
            onChange={(v) => setDates(v, v === CUSTOM ? shownWindow() : null)}
            className="w-full sm:w-auto sm:min-w-[260px]"
          />
          <FilterSelect
            id="campaign"
            label="Filter by Campaign"
            hideLabel
            value={filters.campaign ?? ALL}
            options={[{ value: ALL, label: 'All Campaigns' }, ...keep(options.campaigns, filters.campaign).map((c) => ({ value: c, label: c }))]}
            onChange={(v) => setFilter('campaign', v)}
            className="w-full sm:w-auto sm:min-w-[220px]"
          />
          <FilterSelect
            id="offer"
            label="Filter by Offer"
            hideLabel
            value={filters.offer ?? ALL}
            options={[{ value: ALL, label: 'All Offers' }, ...keep(options.offers, filters.offer).map((o) => ({ value: o, label: o }))]}
            onChange={(v) => setFilter('offer', v)}
            className="w-full sm:w-auto sm:min-w-[340px] sm:flex-1"
          />
        </section>
      </header>

      {custom && (
        <CustomDateRange key={`${from}|${to}`} from={from} to={to} onApply={(start, end) => setDates(CUSTOM, [start, end])} className="-mt-2" />
      )}

      {outdated && (
        <div role="status" className="rounded-xl border border-spend/40 bg-surface p-4 text-sm text-ink-2">
          <p className="font-semibold text-spend">The backend is running an older version</p>
          <p className="mt-1">
            Some sections below are empty because the API does not send them yet. Redeploy the <b>backend</b> project on
            Vercel (Deployments → latest → Redeploy) and check that its build finished as <b>Ready</b>.
          </p>
        </div>
      )}

      {meta.future_dated_through && (
        <div role="status" className="rounded-xl border border-spend/40 bg-surface p-4 text-sm text-ink-2">
          <p className="font-semibold text-spend">Some Bing rows are dated in the future (latest: {formatDate(meta.future_dated_through, 'medium')})</p>
          <p className="mt-1">
            Date ranges are counted back from today instead. This usually means a date was read month-first during an import
            (e.g. “12/10/2026” stored as 10 December). Find them in Compass with{' '}
            <code>{`{ report_date: { $gt: new Date() } }`}</code> (or <code>event_date</code> in bing_conversions) and fix or re-import
            those rows.
          </p>
        </div>
      )}

      {isAdmin && (
        <ErrorBoundary label="The campaign buyers section">
          <BingCampaignBuyers onSaved={() => setReloadKey((k) => k + 1)} />
        </ErrorBoundary>
      )}

      {empty ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-sm text-ink-2">
          {filters.buyer || !showBuyerFilter
            ? `No Bing data for ${buyerLabel ?? 'your media buyers'} yet.`
            : 'No Bing data in the database yet.'}{' '}
          Load <code>bing_ad_reports</code>, <code>bing_conversions</code>, <code>bing_keyword_reports</code> and{' '}
          <code>bing_search_terms</code> with{' '}
          <code>npm run import:bing -w backend -- &lt;folder&gt; --apply</code>.
        </div>
      ) : (
        <>
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <StatCard size="sm" tone="revenue" label="Revenue" value={money(kpi.total_revenue)} caption={`${kpi.purchases} purchases`} />
            <StatCard
              size="sm"
              tone="spend"
              label="Amount Spent"
              value={money(kpi.total_amount_spend)}
              caption={kpi.spend_estimated ? 'est. share of landing page' : 'Bing Ads'}
            />
            <StatCard
              size="sm"
              tone={kpi.net_profit < 0 ? 'loss' : 'revenue'}
              label="Net Profit"
              value={money(kpi.net_profit)}
              caption={`ROAS ${percent(kpi.roas_pct, 1)}`}
              captionTone={kpi.roas_pct === null ? 'default' : kpi.roas_pct < 0 ? 'bad' : 'good'}
            />
            <StatCard size="sm" label="CAC" value={kpi.cac === null ? '—' : formatCurrency(kpi.cac)} caption="spend ÷ purchases" />
            <StatCard size="sm" label="LP Views" value={formatInteger(kpi.landing_page_views)} caption="partner landing page views" />
            <StatCard size="sm" label="Clicks" value={formatInteger(kpi.link_clicks)} caption={`CTR ${percent(kpi.ctr, 2)}`} />
            <StatCard size="sm" label="CPC" value={kpi.cpc === null ? '—' : formatCurrency(kpi.cpc)} caption="spend ÷ clicks" />
          </section>

          <p className="-mt-2 text-xs text-ink-3">
            {buyerLabel && `${buyerLabel} · `}Bing Ads data: {meta.ads_period ?? 'none'} · Partner data: {meta.partner_period ?? 'none'} · Keyword data:{' '}
            {meta.keywords_period ?? 'none'} · Search terms: {meta.search_terms_period ?? 'none'}
            {!hasAdData &&
              meta.keyword_rows + meta.search_term_rows > 0 &&
              ' · this selection has keyword / search term data only, so the tiles and charts are empty — see the Search Terms report'}
            {meta.unattributed_events > 0 &&
              ` · ${formatInteger(meta.unattributed_events)} partner events in this selection carry no campaign / ad group, so they count toward revenue but not toward any ad group's spend`}
            {kpi.spend_estimated && ' · spend for a multi-offer landing page is split across offers by landing-page-view share'}
          </p>

          <ErrorBoundary label="The daily trend chart">
            <section aria-labelledby="trend-heading" className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <h2 id="trend-heading" className="text-base font-bold text-ink">
                    Revenue vs. Gross Profit — Daily Trend
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {data.range.label} · {scope} · gross profit = revenue − spend
                  </p>
                </div>
                {daily.length > 0 && (
                  <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                    <div className="flex items-baseline gap-2">
                      <dt className="text-ink-3">Revenue</dt>
                      <dd className="text-sm font-bold tabular-nums text-revenue">{formatCurrency(totalRevenue)}</dd>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <dt className="text-ink-3" title="Only days both exports cover">
                        Gross profit{pendingDays.length > 0 && ' (complete days)'}
                      </dt>
                      <dd className={`text-sm font-bold tabular-nums ${totalGross < 0 ? 'text-loss' : 'text-violet'}`}>
                        {formatCurrency(totalGross)}
                      </dd>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <dt className="text-ink-3">Profitable days</dt>
                      <dd className="text-sm font-bold tabular-nums text-ink">
                        {profitableDays} / {daily.length - pendingDays.length}
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

              {daily.length === 0 ? (
                <div className="flex items-center justify-center py-14 text-sm text-ink-3">No rows for this selection.</div>
              ) : (
                <>
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
                        emptyText: 'Pending',
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
                    tooltipExtras={[
                      { label: 'Spend', values: daily.map((d) => d.spend_usd ?? 0) },
                      { label: 'Clicks', values: daily.map((d) => d.clicks), format: formatInteger },
                      { label: 'LP views', values: daily.map((d) => d.landing_page_views), format: formatInteger },
                      { label: 'Purchases', values: daily.map((d) => d.purchases), format: formatInteger },
                    ]}
                    formatValue={(v) => formatCurrency(v, { whole: true })}
                    formatTick={formatCompactCurrency}
                    intervals={3}
                    headroom={1.15}
                    fallbackMax={100}
                    labelMinSpacing={52}
                  />
                  {pendingDays.length > 0 && (
                    <p className="mt-2 text-xs text-ink-3">
                      Pending: {pendingDays.map((d) => formatDate(d.date, 'short')).join(', ')} — one of the two exports does not
                      cover {pendingDays.length === 1 ? 'that day' : 'those days'} yet.
                    </p>
                  )}
                </>
              )}
            </section>
          </ErrorBoundary>

          <ErrorBoundary label="The region, device and click id views">
            <BingGeoSection
              bySegment={data.geo}
              clicks={data.clicks}
              caption={`${data.range.label} · ${filters.offer ? filters.offer.split(' - ')[0] : 'all offers'}`}
              busy={busy}
            />
          </ErrorBoundary>

          <ErrorBoundary label="The funnel table">
            <section aria-labelledby="funnel-heading" className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 id="funnel-heading" className="text-base font-bold text-ink">
                    Funnel Performance
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-3">
                    Spend, clicks, CTR, CPC from Bing Ads · LP views → purchase and revenue from the partner · hover a header for its source
                  </p>
                </div>
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

              <BingFunnelTable rows={rows} view={view} />

              {view === 'ad_group' && rowsAll.length > AD_GROUP_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllGroups((v) => !v)}
                  className="mt-3 rounded-full bg-surface-2 px-4 py-1.5 text-xs font-bold text-azure hover:bg-line"
                >
                  {showAllGroups ? `Show top ${AD_GROUP_LIMIT}` : `Show all ${rowsAll.length} ad groups →`}
                </button>
              )}
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                {view === 'ad_group'
                  ? 'One row per campaign · ad group, sorted by revenue then spend — spend here is exact.'
                  : view === 'offer'
                    ? 'One row per offer. Ads that land on a single offer count fully; ads on the multi-offer landing page are split across the offers visitors clicked (est.); clicks that never reached an offer stay on “Landing page — no offer click”.'
                    : 'One row per day × offer. “Pending” = that export does not cover the day yet.'}
              </p>
            </section>
          </ErrorBoundary>

          <ErrorBoundary label="The search term table">
            <BingKeywordTable rows={data.keywords} searchTerms={data.search_terms} period={meta.keywords_period} searchTermsPeriod={meta.search_terms_period} caption={`${data.range.label} · ${scope}`} />
          </ErrorBoundary>
        </>
      )}
    </div>
  );
}

function BingSkeleton() {
  const block = 'animate-pulse rounded-xl border border-line bg-surface';
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Bing Ads dashboard">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-surface-2" />
          <div className="h-9 w-80 max-w-full rounded bg-surface-2" />
        </div>
        <div className="flex flex-wrap gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 w-60 rounded-lg bg-surface-2" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${block} h-[88px]`} />
        ))}
      </div>
      <div className={`${block} h-[340px]`} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className={`${block} h-[360px]`} />
        <div className={`${block} h-[360px]`} />
      </div>
      <div className={`${block} h-[480px]`} />
    </div>
  );
}
