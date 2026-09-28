import { useCallback, useEffect, useState } from 'react';
import PlatformCard from '@/components/PlatformCard';
import PlatformTabs from '@/components/PlatformTabs';
import RevenueSpendChart from '@/components/RevenueSpendChart';
import StatCard from '@/components/StatCard';
import { api } from '@/lib/api';
import { formatCurrency, joinNames } from '@/lib/format';
import type { PortfolioOverview } from '@/types/platforms';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: PortfolioOverview }
  | { kind: 'error'; message: string };

export default function HomePage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    api
      .get<PortfolioOverview>('/platforms/overview')
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err: unknown) =>
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === 'loading') return <HomeSkeleton />;

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-loss/40 bg-surface p-6">
        <p className="font-semibold text-loss">Could not load the overview</p>
        <p className="mt-1 text-sm text-ink-2">{state.message}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
        >
          Retry
        </button>
      </div>
    );
  }

  const { client, portfolio, totals, platforms } = state.data;
  const connected = platforms.filter((p) => p.connected).map((p) => p.name);
  const pending = platforms.filter((p) => !p.connected).map((p) => p.name);

  const subtitle = [
    connected.length > 0 &&
      `${joinNames(connected)} ${connected.length === 1 ? 'is' : 'are'} fully connected and reporting live.`,
    pending.length > 0 &&
      `${joinNames(pending)} ${pending.length === 1 ? 'is' : 'are'} shown as placeholders — not yet connected.`,
  ]
    .filter(Boolean)
    .join(' ');

  const caption =
    connected.length === 1
      ? `across connected platforms (${connected[0]} only, for now)`
      : `across connected platforms (${joinNames(connected) || 'none yet'})`;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">
          {client} · {portfolio}
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink">
          All Platforms Overview
        </h1>
        <p className="mt-3 text-base text-ink-2">{subtitle}</p>
      </header>

      <PlatformTabs platforms={platforms} />

      <section aria-label="Totals" className="grid gap-6 md:grid-cols-3">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totals.revenue)}
          caption={caption}
          tone="revenue"
        />
        <StatCard
          label="Total Spend"
          value={formatCurrency(totals.spend)}
          caption={caption}
          tone="spend"
        />
        <StatCard
          label="Net Profit"
          value={formatCurrency(totals.netProfit)}
          caption={caption}
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
      <div className="space-y-3">
        <div className="h-4 w-72 rounded bg-surface-2" />
        <div className="h-9 w-96 rounded bg-surface-2" />
        <div className="h-4 w-[34rem] max-w-full rounded bg-surface-2" />
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
