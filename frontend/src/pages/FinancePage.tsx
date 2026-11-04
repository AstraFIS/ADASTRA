import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BarChart from '@/components/BarChart';
import ChartLegend from '@/components/ChartLegend';
import { api } from '@/lib/api';
import { formatCompactCurrency, formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { FinanceFigures, FinanceResult } from '@/types/finance';

type Load =
  | { kind: 'loading'; previous: FinanceResult | null }
  | { kind: 'ok'; data: FinanceResult }
  | { kind: 'error'; message: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NA = '—';
const REVENUE = 'var(--color-revenue)';
const COST = 'var(--color-spend)';

const money = (v: number | null | undefined) => (v === null || v === undefined ? NA : formatCurrency(v));
const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? NA : formatPercent(v / 100, digits));
const tone = (v: number | null | undefined) => (v === null || v === undefined ? 'text-ink-3' : v < 0 ? 'text-loss' : 'text-revenue');
const monthLabel = (m: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));

function shiftMonth(m: string, delta: number): string {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
function monthList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 120; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

function downloadCsv(data: FinanceResult) {
  const head = [
    'Month',
    'Facebook spend',
    'Facebook provider fees',
    'Facebook revenue',
    'Facebook profit',
    'Bing spend',
    'Bing revenue',
    'Bing profit',
    'Total cost',
    'Total revenue',
    'Net profit',
    'ROAS %',
    'Margin %',
    'Purchases',
    'CAC',
  ];
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const line = (label: string, f: FinanceFigures | null, b: FinanceFigures | null, t: FinanceFigures) =>
    [label, n(f?.spend), n(f?.fees), n(f?.revenue), n(f?.profit), n(b?.spend), n(b?.revenue), n(b?.profit), n(t.cost), n(t.revenue), n(t.profit), n(t.roas_pct), n(t.margin_pct), n(t.purchases), n(t.cac)];
  const rows = [
    head,
    ...data.months.map((m) => line(m.month, m.facebook, m.bing, m.total)),
    line('Total', data.totals.facebook, data.totals.bing, data.totals.total),
  ];
  const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance_${data.range.from}_${data.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const fromParam = MONTH_RE.test(params.get('from') ?? '') ? params.get('from')! : '';
  const toParam = MONTH_RE.test(params.get('to') ?? '') ? params.get('to')! : '';
  const [state, setState] = useState<Load>({ kind: 'loading', previous: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    const qs = new URLSearchParams();
    if (fromParam) qs.set('from', fromParam);
    if (toParam) qs.set('to', toParam);
    api
      .get<FinanceResult>(`/platforms/finance${qs.toString() ? `?${qs}` : ''}`)
      .then((data) => !cancelled && setState({ kind: 'ok', data }))
      .catch((err: unknown) => !cancelled && setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' }));
    return () => {
      cancelled = true;
    };
  }, [fromParam, toParam]);

  const data = state.kind === 'ok' ? state.data : state.kind === 'loading' ? state.previous : null;
  const busy = state.kind === 'loading';

  function setRange(from: string, to: string) {
    const next = new URLSearchParams(params);
    if (from) next.set('from', from);
    else next.delete('from');
    if (to) next.set('to', to);
    else next.delete('to');
    setParams(next, { replace: true });
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-loss/40 bg-surface p-6">
        <p className="font-semibold text-loss">Could not load the finance view</p>
        <p className="mt-1 text-sm text-ink-2">{state.message}</p>
      </div>
    );
  }
  if (!data) return <div className="h-96 animate-pulse rounded-xl border border-line bg-surface" aria-label="Loading finance" />;

  const { totals, months } = data;
  const t = totals.total;
  const latest = data.available.to ?? data.range.to;
  const earliest = data.available.from ?? data.range.from;
  const options = monthList(earliest < data.range.from ? earliest : data.range.from, latest > data.range.to ? latest : data.range.to);
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Last 3 months', from: shiftMonth(latest, -2), to: latest },
    { label: 'Last 6 months', from: shiftMonth(latest, -5), to: latest },
    { label: 'This year', from: `${latest.slice(0, 4)}-01`, to: latest },
    { label: 'All time', from: '', to: '' },
  ];
  const isPreset = (p: { from: string; to: string }) =>
    p.from === '' ? !fromParam && !toParam : fromParam === p.from && toParam === p.to;

  return (
    <div className={`space-y-6 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">Direct Meds ED · Media Performance</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Finance</h1>
          <p className="mt-1 text-sm text-ink-2">
            Cost, revenue and profit by month for {[data.platforms.facebook && 'Facebook', data.platforms.bing && 'Bing'].filter(Boolean).join(' and ')} ·{' '}
            cost = media spend + provider fees
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1" role="group" aria-label="Period">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={isPreset(p)}
                onClick={() => setRange(p.from, p.to)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${isPreset(p) ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            From
            <select
              value={data.range.from}
              onChange={(e) => setRange(e.target.value, data.range.to)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-ink"
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            To
            <select
              value={data.range.to}
              onChange={(e) => setRange(data.range.from, e.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-ink"
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* summary */}
      <section aria-label="Period summary" className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Profit &amp; loss</h2>
            <span className="text-xs text-ink-3">
              {monthLabel(data.range.from)} – {monthLabel(data.range.to)}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Figure label="Revenue" value={money(t.revenue)} className="text-revenue" />
            <Figure label="Total cost" value={money(t.cost)} className="text-spend" note={`incl. ${money(t.fees)} provider fees`} />
            <Figure label="Net profit" value={money(t.profit)} className={tone(t.profit)} note={`ROAS ${pct(t.roas_pct)}`} />
            <Figure label="Margin" value={pct(t.margin_pct)} className={tone(t.margin_pct)} note="profit ÷ revenue" />
            <Figure label="Purchases" value={formatInteger(t.purchases)} />
            <Figure label="CAC" value={money(t.cac)} note="cost ÷ purchases" />
            <Figure label="Leads (Add to Cart)" value={formatInteger(t.leads)} />
            <Figure label="Cost per lead" value={money(t.leads > 0 ? t.cost / t.leads : null)} note="cost ÷ leads" />
          </dl>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">By platform</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th className="py-1.5 font-medium">Platform</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
                <th className="py-1.5 text-right font-medium">Revenue</th>
                <th className="py-1.5 text-right font-medium">Profit</th>
                <th className="py-1.5 text-right font-medium">Share of cost</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Facebook', totals.facebook],
                  ['Bing', totals.bing],
                ] as const
              )
                .filter(([, f]) => f)
                .map(([name, f]) => (
                  <tr key={name} className="border-t border-line">
                    <td className="py-2 font-semibold text-ink">{name}</td>
                    <td className="py-2 text-right tabular-nums">{money(f!.cost)}</td>
                    <td className="py-2 text-right tabular-nums">{money(f!.revenue)}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${tone(f!.profit)}`}>{money(f!.profit)}</td>
                    <td className="py-2 text-right tabular-nums text-ink-2">{t.cost > 0 ? formatPercent(f!.cost / t.cost, 1) : NA}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* chart */}
      <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="fin-chart">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fin-chart" className="text-base font-bold text-ink">
            Revenue vs. cost by month
          </h2>
          <ChartLegend
            items={[
              { label: 'Revenue', color: REVENUE },
              { label: 'Cost (spend + fees)', color: COST },
            ]}
          />
        </div>
        <BarChart
          className="mt-3"
          height={280}
          ariaLabel="Revenue and cost by month"
          categories={months.map((m) => m.label)}
          series={[
            { key: 'revenue', label: 'Revenue', color: REVENUE, values: months.map((m) => m.total.revenue) },
            { key: 'cost', label: 'Cost', color: COST, values: months.map((m) => m.total.cost) },
          ]}
          formatValue={formatCompactCurrency}
          formatTooltipValue={(v) => formatCurrency(v)}
          headroom={1.15}
          fallbackMax={100}
        />
      </section>

      <MonthlyTable data={data} />
      {data.platforms.facebook && <ProviderTable data={data} />}
      <OfferTable data={data} />
    </div>
  );
}

function Figure({ label, value, note, className = 'text-ink' }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums ${className}`}>{value}</dd>
      {note && <dd className="truncate text-[11px] text-ink-3">{note}</dd>}
    </div>
  );
}

const th = 'whitespace-nowrap px-2 py-2 text-right font-medium';
const td = 'whitespace-nowrap px-2 py-2 text-right tabular-nums';
const empty = (f: { cost: number; revenue: number }) => f.cost === 0 && f.revenue === 0;

function MonthlyTable({ data }: { data: FinanceResult }) {
  const { facebook: fb, bing } = data.platforms;
  const rows = [...data.months].reverse();
  const cells = (f: FinanceFigures | null, kind: 'facebook' | 'bing') =>
    f === null ? null : empty(f) ? (
      <>
        <td className={`${td} border-l border-line text-ink-3`}>{NA}</td>
        {kind === 'facebook' && <td className={`${td} text-ink-3`}>{NA}</td>}
        <td className={`${td} text-ink-3`}>{NA}</td>
        <td className={`${td} text-ink-3`}>{NA}</td>
      </>
    ) : (
      <>
        <td className={`${td} border-l border-line`}>{money(f.spend)}</td>
        {kind === 'facebook' && <td className={`${td} text-ink-2`}>{money(f.fees)}</td>}
        <td className={td}>{money(f.revenue)}</td>
        <td className={`${td} ${tone(f.profit)}`}>{money(f.profit)}</td>
      </>
    );
  const totalCells = (t: FinanceFigures, prev: FinanceFigures | null) => {
    const change = prev && prev.profit !== 0 ? (t.profit - prev.profit) / Math.abs(prev.profit) : null;
    return (
      <>
        <td className={`${td} border-l border-line`}>{money(t.cost)}</td>
        <td className={td}>{money(t.revenue)}</td>
        <td className={`${td} font-semibold ${tone(t.profit)}`}>
          {money(t.profit)}
          {change !== null && (
            <span className={`block text-[10px] font-normal ${change < 0 ? 'text-loss' : 'text-revenue'}`} title="Change in net profit vs. the month before">
              {change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(change), 0)}
            </span>
          )}
        </td>
        <td className={`${td} ${tone(t.roas_pct)}`}>{pct(t.roas_pct)}</td>
        <td className={`${td} ${tone(t.margin_pct)}`}>{pct(t.margin_pct)}</td>
        <td className={td}>{formatInteger(t.purchases)}</td>
        <td className={td}>{money(t.cac)}</td>
      </>
    );
  };
  const byMonth = new Map(data.months.map((m, i) => [m.month, i]));

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="fin-monthly">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="fin-monthly" className="text-base font-bold text-ink">
            Monthly profit &amp; loss
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">Newest month first · ▲▼ = net profit change vs. the month before</p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(data)}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-line"
        >
          ⬇ Export CSV
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
              <th rowSpan={2} className="px-3 py-2 text-left font-medium">
                Month
              </th>
              {fb && (
                <th colSpan={4} className="border-l border-line px-3 pt-2 text-center font-semibold text-azure">
                  Facebook
                </th>
              )}
              {bing && (
                <th colSpan={3} className="border-l border-line px-3 pt-2 text-center font-semibold text-violet">
                  Bing
                </th>
              )}
              <th colSpan={7} className="border-l border-line px-3 pt-2 text-center font-semibold text-ink">
                Total
              </th>
            </tr>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
              {fb && (
                <>
                  <th className={`${th} border-l border-line`}>Spend</th>
                  <th className={th}>Fees</th>
                  <th className={th}>Revenue</th>
                  <th className={th}>Profit</th>
                </>
              )}
              {bing && (
                <>
                  <th className={`${th} border-l border-line`}>Spend</th>
                  <th className={th}>Revenue</th>
                  <th className={th}>Profit</th>
                </>
              )}
              <th className={`${th} border-l border-line`}>Cost</th>
              <th className={th}>Revenue</th>
              <th className={th}>Net profit</th>
              <th className={th}>ROAS</th>
              <th className={th}>Margin</th>
              <th className={th}>Purchases</th>
              <th className={th}>CAC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const i = byMonth.get(m.month)!;
              const prev = i > 0 ? data.months[i - 1]!.total : null;
              return (
                <tr key={m.month} className="border-t border-line hover:bg-surface-2/40">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-ink">
                    {m.label}
                  </th>
                  {cells(m.facebook, 'facebook')}
                  {cells(m.bing, 'bing')}
                  {totalCells(m.total, prev)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong font-bold text-ink">
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              {cells(data.totals.facebook, 'facebook')}
              {cells(data.totals.bing, 'bing')}
              {totalCells(data.totals.total, null)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ProviderTable({ data }: { data: FinanceResult }) {
  const months = data.months.map((m) => m.month);
  const totals = months.map((m) => data.providers.reduce((s, p) => s + (p.months[m]?.fee ?? 0), 0));
  const totalFee = data.providers.reduce((s, p) => s + p.fee, 0);
  const totalSpend = data.providers.reduce((s, p) => s + p.spend, 0);
  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="fin-providers">
      <h2 id="fin-providers" className="text-base font-bold text-ink">
        Facebook provider fees by month
      </h2>
      <p className="mt-0.5 text-xs text-ink-3">Fee in each cell, with the spend it was charged on underneath · fee = spend × fee %</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className={th}>Fee %</th>
              {data.months.map((m) => (
                <th key={m.month} className={th}>
                  {m.label}
                </th>
              ))}
              <th className={`${th} border-l border-line`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.providers.length === 0 && (
              <tr>
                <td colSpan={months.length + 3} className="px-3 py-6 text-center text-ink-3">
                  No Facebook spend in this period.
                </td>
              </tr>
            )}
            {data.providers.map((p) => (
              <tr key={p.provider_name} className="border-t border-line">
                <th scope="row" className={`px-3 py-2 text-left ${p.no_provider ? 'font-normal italic text-ink-2' : 'font-semibold text-ink'}`}>
                  {p.provider_name}
                </th>
                <td className={`${td} text-ink-2`}>{p.fee_pct === null ? NA : formatPercent(p.fee_pct / 100, 2)}</td>
                {months.map((m) => {
                  const c = p.months[m];
                  return (
                    <td key={m} className={td}>
                      {c ? (
                        <>
                          <span className="font-semibold text-ink">{money(c.fee)}</span>
                          <span className="block text-[11px] text-ink-3">on {money(c.spend)}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">{NA}</span>
                      )}
                    </td>
                  );
                })}
                <td className={`${td} border-l border-line`}>
                  <span className="font-bold text-ink">{money(p.fee)}</span>
                  <span className="block text-[11px] text-ink-3">on {money(p.spend)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          {data.providers.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line-strong font-bold text-ink">
                <th scope="row" className="px-3 py-2 text-left">
                  All providers
                </th>
                <td className={`${td} text-ink-2`} title="Blended fee rate">
                  {totalSpend > 0 ? formatPercent(totalFee / totalSpend, 2) : NA}
                </td>
                {totals.map((v, i) => (
                  <td key={months[i]} className={td}>
                    {money(v)}
                  </td>
                ))}
                <td className={`${td} border-l border-line`}>{money(totalFee)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function OfferTable({ data }: { data: FinanceResult }) {
  const [metric, setMetric] = useState<'profit' | 'revenue' | 'cost'>('profit');
  const months = data.months.map((m) => m.month);
  const grouped = useMemo(() => {
    const out: { platform: 'facebook' | 'bing'; rows: FinanceResult['offers'] }[] = [];
    for (const platform of ['facebook', 'bing'] as const) {
      const rows = data.offers.filter((o) => o.platform === platform);
      if (rows.length) out.push({ platform, rows });
    }
    return out;
  }, [data]);
  const cell = (c: { cost: number; revenue: number; profit: number } | undefined) =>
    c === undefined || empty(c) ? <span className="text-ink-3">{NA}</span> : value(c[metric]);
  const value = (v: number) => <span className={metric === 'profit' ? tone(v) : 'text-ink'}>{money(v)}</span>;

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="fin-offers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="fin-offers" className="text-base font-bold text-ink">
            By offer and month
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">Which offers make or lose money, month by month</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm" role="group" aria-label="Show">
          {(['profit', 'revenue', 'cost'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-3 py-1 font-semibold capitalize ${metric === m ? 'bg-surface text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
              <th className="px-3 py-2 text-left font-medium">Offer</th>
              {data.months.map((m) => (
                <th key={m.month} className={th}>
                  {m.label}
                </th>
              ))}
              <th className={`${th} border-l border-line`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr>
                <td colSpan={months.length + 2} className="px-3 py-6 text-center text-ink-3">
                  No data in this period.
                </td>
              </tr>
            )}
            {grouped.map((g) => (
              <Fragment key={g.platform}>
                <tr className="bg-surface-2/50">
                  <th colSpan={months.length + 2} scope="colgroup" className={`px-3 py-1.5 text-left text-xs font-semibold ${g.platform === 'facebook' ? 'text-azure' : 'text-violet'}`}>
                    {g.platform === 'facebook' ? 'Facebook' : 'Bing'}
                  </th>
                </tr>
                {g.rows.map((o) => (
                  <tr key={`${o.platform}|${o.offer_name}`} className="border-t border-line">
                    <th scope="row" className="max-w-[360px] truncate px-3 py-2 text-left font-medium text-ink" title={o.offer_name}>
                      {o.offer_name}
                    </th>
                    {months.map((m) => (
                      <td key={m} className={td}>
                        {cell(o.months[m])}
                      </td>
                    ))}
                    <td className={`${td} border-l border-line font-semibold`}>{cell(o)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
