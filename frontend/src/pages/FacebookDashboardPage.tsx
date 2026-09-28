import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BarChart from '@/components/BarChart';
import ChartLegend from '@/components/ChartLegend';
import FilterSelect from '@/components/FilterSelect';
import FunnelTable from '@/components/FunnelTable';
import LineChart from '@/components/LineChart';
import ProviderFeeCard from '@/components/ProviderFeeCard';
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
import type { AudienceBucket, FacebookDashboard } from '@/types/facebook';

type State =
  | { kind: 'loading'; previous: FacebookDashboard | null }
  | { kind: 'ok'; data: FacebookDashboard }
  | { kind: 'error'; message: string };

const ALL = '';
const TOP_ADS = 10;

const REVENUE_COLOR = 'var(--color-revenue)';
const SPEND_COLOR = 'var(--color-spend)';
const PROFIT_COLOR = 'var(--color-violet)';
const LOSS_COLOR = 'var(--color-loss)';

export default function FacebookDashboardPage() {
  const [params, setParams] = useSearchParams();
  const range = params.get('range') ?? 'this_month';
  const ad = params.get('ad') ?? ALL;
  const offer = params.get('offer') ?? ALL;

  const [state, setState] = useState<State>({ kind: 'loading', previous: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [showAllAds, setShowAllAds] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));

    const qs = new URLSearchParams({ range });
    if (ad) qs.set('ad', ad);
    if (offer) qs.set('offer', offer);

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
    return () => {
      cancelled = true;
    };
  }, [range, ad, offer, reloadKey]);

  function setFilter(key: 'range' | 'ad' | 'offer', value: string) {
    const next = new URLSearchParams(params);
    if (value === ALL || (key === 'range' && value === 'this_month')) next.delete(key);
    else next.set(key, value);
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

  const { kpis, providers, filters, byAd, audience, daily } = data;
  const busy = state.kind === 'loading';

  const periodLabel =
    filters.options.dateRanges.find((r) => r.key === filters.dateRange)?.label.toLowerCase() ??
    'selected period';
  const periodCaption = `across all ads · ${periodLabel}`;
  const audienceCaption = `${filters.ad ?? 'All ads'} · ${periodLabel}`;
  const trendCaption = `${filters.options.dateRanges.find((r) => r.key === filters.dateRange)?.label ?? 'Selected period'} · ${filters.ad ?? 'all ads'}`;
  const visibleAds = showAllAds ? byAd : byAd.slice(0, TOP_ADS);
  const roasCaption = `${kpis.roas === null ? 'n/a' : formatPercent(kpis.roas, 1)} ROAS · ${periodCaption}`;

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
        <p className="mt-2 text-base text-ink-2">
          Data last updated: {formatDate(data.lastUpdated, 'long')} · data through{' '}
          {formatDate(data.dataThrough, 'short')} · Source: {data.sourceNote}
        </p>
      </header>

      <section aria-label="Filters" className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <FilterSelect
          id="date-range"
          label="Date Range"
          value={filters.dateRange}
          options={filters.options.dateRanges.map((r) => ({ value: r.key, label: r.label }))}
          onChange={(v) => setFilter('range', v)}
          className="w-full sm:w-auto sm:min-w-[300px]"
        />
        <FilterSelect
          id="ad-name"
          label="Filter by Ad Name"
          value={filters.ad ?? ALL}
          options={[{ value: ALL, label: 'All Ads' }, ...filters.options.ads.map((a) => ({ value: a, label: a }))]}
          onChange={(v) => setFilter('ad', v)}
          className="w-full sm:w-auto sm:min-w-[360px]"
        />
        <FilterSelect
          id="offer"
          label="Filter by Offer"
          value={filters.offer ?? ALL}
          options={[
            { value: ALL, label: 'All Offers' },
            ...filters.options.offers.map((o) => ({ value: o, label: o })),
          ]}
          onChange={(v) => setFilter('offer', v)}
          className="w-full flex-1 sm:min-w-[360px]"
        />
        <div className="flex gap-3">
          <ActionButton icon="📋" label="Recommendations" />
          <ActionButton icon="🎨" label="Creatives" />
        </div>
      </section>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7"
      >
        <StatCard
          size="md"
          tone="revenue"
          label="Total Revenue"
          value={formatCurrency(kpis.revenue)}
          caption={periodCaption}
        />
        <StatCard
          size="md"
          tone="spend"
          label="Total Amount Spent"
          value={formatCurrency(kpis.spend)}
          caption={`${periodCaption} · incl. ${formatCurrency(kpis.providerFees)} provider fees`}
        />
        <StatCard
          size="md"
          tone={kpis.netProfit < 0 ? 'spend' : 'revenue'}
          label="Net Profit / ROAS"
          value={formatCurrency(kpis.netProfit)}
          caption={roasCaption}
        />
        <StatCard
          size="md"
          label="Landing Page Views"
          value={formatInteger(kpis.landingPageViews)}
          caption="across all ads"
        />
        <StatCard
          size="md"
          label="Link Clicks"
          value={formatInteger(kpis.linkClicks)}
          caption="across all ads"
        />
        <StatCard
          size="md"
          label="CPC (All)"
          value={kpis.cpc === null ? '—' : formatCurrency(kpis.cpc)}
          caption="blended, spend ÷ link clicks"
        />
        <StatCard
          size="md"
          label="CTR (All)"
          value={kpis.ctr === null ? '—' : formatPercent(kpis.ctr, 2)}
          caption="weighted by link clicks"
        />
      </section>

      <section aria-labelledby="provider-fees-heading" className="space-y-5">
        <h2
          id="provider-fees-heading"
          className="text-center text-sm font-bold uppercase tracking-[0.12em] text-ink-2"
        >
          Ad Platform Provider Fees
        </h2>
        <div className="mx-auto grid max-w-[820px] gap-6 md:grid-cols-2">
          {providers.map((p) => (
            <ProviderFeeCard key={p.name} provider={p} />
          ))}
        </div>
      </section>

      <section aria-label="Breakdowns" className="grid gap-6 2xl:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-line bg-surface p-7 2xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-ink">Revenue vs. Amount Spent by Ad Name</h2>
            <div className="flex flex-wrap items-center gap-5">
              <ChartLegend
                items={[
                  { label: 'Revenue', color: REVENUE_COLOR },
                  { label: 'Amount Spent', color: SPEND_COLOR },
                ]}
              />
              {byAd.length > TOP_ADS && (
                <button
                  type="button"
                  onClick={() => setShowAllAds((v) => !v)}
                  className="rounded-full bg-surface-2 px-4 py-1.5 text-sm font-bold text-revenue transition-colors hover:bg-line"
                >
                  {showAllAds ? `Show top ${TOP_ADS}` : `Show all ${byAd.length} ads →`}
                </button>
              )}
            </div>
          </div>

          {byAd.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-20 text-sm text-ink-3">
              No ads have data for the selected filters.
            </div>
          ) : (
            <BarChart
              className="mt-6 min-h-[380px] flex-1"
              ariaLabel="Revenue and amount spent by ad name"
              categories={visibleAds.map((a) => a.adName)}
              series={[
                { key: 'revenue', label: 'Revenue', color: REVENUE_COLOR, values: visibleAds.map((a) => a.revenue) },
                { key: 'spend', label: 'Amount Spent', color: SPEND_COLOR, values: visibleAds.map((a) => a.spend) },
              ]}
              formatValue={formatCompactCurrency}
              formatTick={(v) => formatCurrency(v, { whole: true })}
              formatTooltipValue={(v) => formatCurrency(v)}
              intervals={4}
              headroom={1.15}
              barMaxWidth={60}
            />
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-1">
          <AudienceCard
            title="Audience by Age"
            caption={audienceCaption}
            buckets={audience.age}
            color={REVENUE_COLOR}
          />
          <AudienceCard
            title="Audience by Gender"
            caption={audienceCaption}
            buckets={audience.gender}
            color={SPEND_COLOR}
          />
        </div>
      </section>

      <section aria-labelledby="trend-heading" className="rounded-xl border border-line bg-surface p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="trend-heading" className="text-lg font-bold text-ink">
            Revenue vs. Gross Profit — Daily Trend
          </h2>
          <p className="text-sm text-ink-2">{trendCaption}</p>
        </div>

        {daily.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-ink-3">
            No daily data for the selected filters.
          </div>
        ) : (
          <>
            <LineChart
              className="mt-4"
              height={330}
              ariaLabel="Daily revenue and gross profit"
              labels={daily.map((d) => formatDayMonth(d.date))}
              tooltipLabels={daily.map((d) => formatDate(d.date, 'medium'))}
              series={[
                {
                  key: 'revenue',
                  label: 'Revenue',
                  color: REVENUE_COLOR,
                  values: daily.map((d) => d.revenue),
                  labelSide: 'above',
                },
                {
                  key: 'grossProfit',
                  label: 'Gross Profit',
                  color: PROFIT_COLOR,
                  values: daily.map((d) => d.grossProfit),
                  labelSide: 'below',
                  labelColor: (v) => (v < 0 ? LOSS_COLOR : PROFIT_COLOR),
                },
              ]}
              tooltipExtras={[
                { label: 'Spend (before fees)', values: daily.map((d) => d.spendBeforeFees) },
                { label: 'Spend (with fees)', values: daily.map((d) => d.spend) },
              ]}
              formatValue={(v) => formatCurrency(v, { whole: true })}
              intervals={3}
              headroom={1.15}
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

      <section aria-labelledby="funnel-heading" className="rounded-xl border border-line bg-surface p-7">
        <h2 id="funnel-heading" className="text-lg font-bold text-ink">
          Funnel Performance by Ad Name &amp; Offer
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Amount Spent / Link Clicks / CTR / CPC / CAC / ROAS / funnel-stage columns all respect the
          date range selected above · funnel percentages are step-over-step: First Page View % =
          First Page View ÷ Link Clicks · Q.S. % = Q.S. ÷ First Page View · Lead / Partial % = Lead ÷
          Q.S. · Add To Cart % = Add To Cart ÷ Lead · Purchase % = Purchase ÷ Add To Cart (&quot;—&quot;
          when the previous stage is 0) · ads with under 10 clicks show &quot;low sample&quot; · click a
          column to sort
        </p>
        <FunnelTable ads={byAd} />
      </section>
    </div>
  );
}

function AudienceCard({
  title,
  caption,
  buckets,
  color,
}: {
  title: string;
  caption: string;
  buckets: AudienceBucket[];
  color: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <p className="text-sm text-ink-2">{caption}</p>
      </div>
      <BarChart
        className="mt-4"
        height={250}
        ariaLabel={`${title} (link clicks)`}
        categories={buckets.map((b) => b.label)}
        series={[{ key: 'clicks', label: 'Link clicks', color, values: buckets.map((b) => b.value) }]}
        formatValue={(v) => String(Math.round(v))}
        formatTooltipValue={formatInteger}
        intervals={3}
        headroom={1.2}
        barMaxWidth={150}
      />
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
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${block} h-32`} />
        ))}
      </div>
      <div className="mx-auto grid max-w-[820px] gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={`${block} h-52`} />
        ))}
      </div>
      <div className="grid gap-6 2xl:grid-cols-3">
        <div className={`${block} h-[560px] 2xl:col-span-2`} />
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-1">
          <div className={`${block} h-[268px]`} />
          <div className={`${block} h-[268px]`} />
        </div>
      </div>
      <div className={`${block} h-[420px]`} />
      <div className={`${block} h-[640px]`} />
    </div>
  );
}
