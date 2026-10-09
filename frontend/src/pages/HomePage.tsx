import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FilterSelect from '@/components/FilterSelect';
import PlatformCard from '@/components/PlatformCard';
import PlatformTabs from '@/components/PlatformTabs';
import RevenueSpendChart from '@/components/RevenueSpendChart';
import StatCard from '@/components/StatCard';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent, joinNames } from '@/lib/format';
import type { PortfolioOverview } from '@/types/platforms';

type State =
  | { kind: 'loading'; previous: PortfolioOverview | null }
  | { kind: 'ok'; data: PortfolioOverview; at: Date }
  | { kind: 'error'; message: string };

/** Live numbers: refetch this often while the page is open, and whenever the tab comes back into view. */
const REFRESH_MS = 5 * 60 * 1000;

export default function HomePage() {
  const [params, setParams] = useSearchParams();
  // no ?month= → the server uses the current month, so the page rolls over to a new month by itself
  const month = params.get('month') ?? '';
  const [state, setState] = useState<State>({ kind: 'loading', previous: null });
  const lastOk = useRef<PortfolioOverview | null>(null);

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setState({ kind: 'loading', previous: lastOk.current });
      api
        .get<PortfolioOverview>(`/platforms/overview${month ? `?month=${encodeURIComponent(month)}` : ''}`)
        .then((data) => {
          lastOk.current = data;
          setState({ kind: 'ok', data, at: new Date() });
        })
        .catch((err: unknown) => {
          // a failed background refresh keeps the numbers already on screen
          if (quiet && lastOk.current) return;
          setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        });
    },
    [month],
  );

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  function selectMonth(value: string, current: string) {
    const next = new URLSearchParams(params);
    // picking the current month goes back to "automatic" so it follows the calendar
    if (!value || value === current) next.delete('month');
    else next.set('month', value);
    setParams(next, { replace: true });
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-loss/40 bg-surface p-6">
        <p className="font-semibold text-loss">Could not load the overview</p>
        <p className="mt-1 text-sm text-ink-2">{state.message}</p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
        >
          Retry
        </button>
      </div>
    );
  }

  const data = state.kind === 'ok' ? state.data : state.previous;
  if (!data) return <HomeSkeleton />;
  const busy = state.kind === 'loading';

  const { client, portfolio, totals, platforms, period, months } = data;
  const live = platforms.filter((p) => p.connected && p.metrics);
  const pending = platforms.filter((p) => !p.connected).map((p) => p.name);
  const liveNames = live.map((p) => (p.id === 'microsoft' ? 'Bing' : p.name));

  const subtitle = [
    live.length > 0 && `Live totals from ${joinNames(liveNames)} for ${period.label}.`,
    pending.length > 0 && `${joinNames(pending)} ${pending.length === 1 ? 'is' : 'are'} not connected yet.`,
  ]
    .filter(Boolean)
    .join(' ');

  const caption = `${period.label} · ${joinNames(liveNames) || 'no platforms'}`;
  const roas = totals.spend > 0 ? totals.netProfit / totals.spend : null;
  const updated = state.kind === 'ok' ? state.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className={`space-y-8 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">
            {client} · {portfolio}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink">All Platforms Overview</h1>
          <p className="mt-3 text-base text-ink-2">{subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <FilterSelect
            id="overview-month"
            label="Month"
            hideLabel
            value={period.month}
            options={months.map((m) => ({
              value: m.value,
              label: m.value === period.current_month ? `${m.label} (this month)` : m.label,
            }))}
            onChange={(v) => selectMonth(v, period.current_month)}
            className="w-full sm:w-auto sm:min-w-[240px]"
          />
          <p className="text-xs text-ink-3">
            {period.is_current ? 'Follows the current month automatically' : 'Past month'}
            {updated && ` · updated ${updated}`}
          </p>
        </div>
      </header>

      <PlatformTabs platforms={platforms} />

      <section aria-label="Totals" className="grid gap-6 md:grid-cols-3">
        <StatCard label="Total Revenue" value={formatCurrency(totals.revenue)} caption={caption} tone="revenue" />
        <StatCard label="Total Spend" value={formatCurrency(totals.spend)} caption={caption} tone="spend" />
        <StatCard
          label="Net Profit"
          value={formatCurrency(totals.netProfit)}
          caption={roas === null ? caption : `ROAS ${formatPercent(roas, 1)} · ${caption}`}
          tone={totals.netProfit < 0 ? 'loss' : 'revenue'}
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-7">
        <RevenueSpendChart platforms={platforms} />
      </section>

      <section aria-label="Platforms" className="grid gap-6 md:grid-cols-3">
        {platforms.map((p) => (
          <PlatformCard key={p.id} platform={p} />
        ))}
      </section>
    </div>
  );
}

function HomeSkeleton() {
  const block = 'animate-pulse rounded-xl border border-line bg-surface';
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading overview">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="h-4 w-72 rounded bg-surface-2" />
          <div className="h-9 w-96 rounded bg-surface-2" />
          <div className="h-4 w-[34rem] max-w-full rounded bg-surface-2" />
        </div>
        <div className="h-11 w-60 rounded-lg bg-surface-2" />
      </div>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-11 w-36 rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-40`} />
        ))}
      </div>
      <div className={`${block} h-[500px]`} />
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-80`} />
        ))}
      </div>
    </div>
  );
}
