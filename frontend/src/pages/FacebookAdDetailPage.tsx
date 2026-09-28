import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ChartLegend from '@/components/ChartLegend';
import CreativeTaxonomyCard from '@/components/CreativeTaxonomyCard';
import FilterSelect from '@/components/FilterSelect';
import LineChart from '@/components/LineChart';
import StatCard, { type CaptionTone } from '@/components/StatCard';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDate, formatDayMonth, formatInteger, formatPercent } from '@/lib/format';
import type { AdDetail, MetricComparison, ReadStatus } from '@/types/facebook';

type State =
  | { kind: 'loading'; previous: AdDetail | null }
  | { kind: 'ok'; data: AdDetail }
  | { kind: 'error'; message: string; notFound: boolean };

const REVENUE_COLOR = 'var(--color-revenue)';
const PROFIT_COLOR = 'var(--color-violet)';
const LOSS_COLOR = 'var(--color-loss)';

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

  if (state.kind === 'error') {
    return (
      <div className="space-y-6">
        <BackButton to={backHref} />
        <div className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-semibold text-loss">
            {state.notFound ? `No ad named "${adName}"` : 'Could not load this ad'}
          </p>
          <p className="mt-1 text-sm text-ink-2">{state.message}</p>
          {!state.notFound && (
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

  const data = state.kind === 'ok' ? state.data : state.previous;
  if (!data) return <AdDetailSkeleton />;

  const { ad, comparisons, read, daily, taxonomy } = data;
  const busy = state.kind === 'loading';
  const period = data.dateRangeLabel;
  const hollowDays = daily.map((d, i) => (d.spend > 0 && d.purchases === 0 ? i : -1)).filter((i) => i >= 0);
  const hasCacData = daily.some((d) => d.spend > 0);

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
              {ad.adName}
              {!ad.active && (
                <span className="ml-3 align-middle text-sm font-medium text-ink-3">inactive</span>
              )}
            </h1>
            <p className="mt-1 text-base text-ink-2">Offer: {ad.offer}</p>
          </div>
        </div>
        <FilterSelect
          id="ad-date-range"
          label="Date Range"
          value={data.dateRange}
          options={data.dateRangeOptions.map((r) => ({ value: r.key, label: r.label }))}
          onChange={setRange}
          className="w-full sm:w-auto sm:min-w-[320px]"
        />
      </header>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-7"
      >
        <StatCard size="md" tone="spend" label="Amount Spent" value={formatCurrency(ad.spend)} caption={period} />
        <StatCard size="md" label="Link Clicks" value={formatInteger(ad.linkClicks)} caption={period} />
        <StatCard
          size="md"
          label="CTR (All)"
          value={ad.ctr === null ? '—' : formatPercent(ad.ctr, 2)}
          caption={comparisons.ctr?.label ?? 'no account average yet'}
          captionTone={captionToneFor(comparisons.ctr)}
        />
        <StatCard
          size="md"
          label="CPC (All)"
          value={ad.cpc === null ? '—' : formatCurrency(ad.cpc)}
          caption={comparisons.cpc?.label ?? 'no account average yet'}
          captionTone={captionToneFor(comparisons.cpc)}
        />
        <StatCard
          size="md"
          label="CAC"
          value={ad.cac === null ? '—' : formatCurrency(ad.cac)}
          caption={comparisons.cac?.label ?? (ad.cac === null ? 'no purchases yet' : 'no account average yet')}
          captionTone={captionToneFor(comparisons.cac)}
        />
        <StatCard
          size="md"
          tone={ad.roas === null ? 'neutral' : ad.roas < 0 ? 'loss' : 'revenue'}
          label="ROAS"
          value={ad.roas === null ? '—' : formatPercent(ad.roas, 2)}
          caption="net return vs. spend"
        />
        <StatCard size="md" tone="revenue" label="Revenue" value={formatCurrency(ad.revenue)} caption={period} />
      </section>

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

      <section aria-labelledby="cac-heading" className="rounded-xl border border-line bg-surface p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="cac-heading" className="text-lg font-bold text-ink">
            Cost of Acquisition — Daily Trend
          </h2>
          <p className="text-sm text-ink-2">
            {period} · {ad.adName}
          </p>
        </div>
        {!hasCacData ? (
          <div className="flex items-center justify-center py-16 text-sm text-ink-3">
            No spend recorded for this ad in the selected period.
          </div>
        ) : (
          <>
            <LineChart
              className="mt-4"
              height={280}
              ariaLabel={`Daily cost of acquisition for ${ad.adName}`}
              labels={daily.map((d) => formatDayMonth(d.date))}
              tooltipLabels={daily.map((d) => formatDate(d.date, 'medium'))}
              series={[
                {
                  key: 'cac',
                  label: 'CAC',
                  color: REVENUE_COLOR,
                  values: daily.map((d) => d.cac),
                  labelSide: 'above',
                  hollowAt: hollowDays,
                  hollowColor: LOSS_COLOR,
                  hollowText: 'spent, no purchases',
                  emptyText: 'no spend',
                },
              ]}
              tooltipExtras={[
                { label: 'Spend (with fees)', values: daily.map((d) => d.spend), format: (v) => formatCurrency(v) },
                { label: 'Purchases', values: daily.map((d) => d.purchases), format: formatInteger },
              ]}
              formatValue={(v) => formatCurrency(v, { whole: true })}
              intervals={3}
              headroom={1.2}
            />
            <p className="mt-3 text-xs text-ink-3">
              <span className="text-revenue" aria-hidden="true">●</span> = CAC that day ·{' '}
              <span className="text-loss" aria-hidden="true">○</span> = spent, zero purchases that day ·
              gap = no spend at all
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="ad-trend-heading" className="rounded-xl border border-line bg-surface p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="ad-trend-heading" className="text-lg font-bold text-ink">
            Revenue vs. Gross Profit — Daily Trend
          </h2>
          <p className="text-sm text-ink-2">
            {period} · {ad.adName}
          </p>
        </div>
        {daily.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-ink-3">
            No daily data for this ad in the selected period.
          </div>
        ) : (
          <>
            <LineChart
              className="mt-4"
              height={300}
              ariaLabel={`Daily revenue and gross profit for ${ad.adName}`}
              labels={daily.map((d) => formatDayMonth(d.date))}
              tooltipLabels={daily.map((d) => formatDate(d.date, 'medium'))}
              series={[
                { key: 'revenue', label: 'Revenue', color: REVENUE_COLOR, values: daily.map((d) => d.revenue), labelSide: 'above' },
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
    </div>
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
      <div className={`${block} h-[440px]`} />
      <div className={`${block} h-[360px]`} />
      <div className={`${block} h-[400px]`} />
    </div>
  );
}
