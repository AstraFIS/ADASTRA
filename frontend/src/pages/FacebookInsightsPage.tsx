import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import CustomDateRange from '@/components/CustomDateRange';
import FacebookViewSwitch from '@/components/FacebookViewSwitch';
import FilterSelect from '@/components/FilterSelect';
import MultiSearchSelect from '@/components/MultiSearchSelect';
import ProviderAccountSelect from '@/components/ProviderAccountSelect';
import CreativeGallery, { mergeTwins } from '@/components/insights/CreativeGallery';
import {
  AdLink,
  Card,
  cpaTone,
  DataTable,
  dec,
  HBars,
  int,
  num1,
  pct,
  plural,
  Pill,
  PillButton,
  roasTone,
  shortDay,
  Tile,
  times,
  usd,
  VERDICT_TONE,
  type Column,
} from '@/components/insights/parts';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { FACEBOOK_ACCESS_GROUPS } from '@/types/auth';
import type { FbInsightsResult, InsightCreative, InsightRow, NewDecision } from '@/types/fbInsights';
import type { FbOptionsResult } from '@/types/fbStatistics';

const RANGES = [
  { value: 'all_time', label: 'All time' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'custom', label: 'Custom Range' },
];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayParam = (v: string | null) => (v && ISO_DAY.test(v) ? v : '');
const isGroup = (v: string) => (FACEBOOK_ACCESS_GROUPS as readonly string[]).includes(v);
const ED = ['DirectMax (ED)', 'MEDVi QUAD (ED)'];
const PRODUCTS = ['DirectMax (ED)', 'MEDVi QUAD (ED)', 'GLP-1 (DirectMeds)', 'TrimRX GLP-1'];
const VERDICTS = ['Scale', 'Keep & watch', 'Over break-even', 'Promising', 'Still testing', 'Near cut', 'Cut', 'No purchase data yet'];
const NEW_ORDER: NewDecision[] = ['Scale', 'Turn back on', 'Keep', 'Watch', 'Too early', 'Not spending', 'Cut', 'No tracking'];

type Load = { kind: 'loading'; previous: FbInsightsResult | null } | { kind: 'ok'; data: FbInsightsResult } | { kind: 'error'; message: string };

export default function FacebookInsightsPage() {
  const [params, setParams] = useSearchParams();
  const from = dayParam(params.get('from'));
  const to = dayParam(params.get('to'));
  const custom = from !== '' || to !== '';
  // insights read the whole history by default: verdicts need more than one month
  const range = params.get('range') ?? 'all_time';
  const categories = params.getAll('category').filter(Boolean);
  const providers = params.getAll('provider').filter(Boolean);
  const accounts = params.getAll('account').filter(Boolean);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const groups = isAdmin ? params.getAll('group').filter(isGroup) : [];

  const query = useMemo(() => {
    const qs = new URLSearchParams(custom ? {} : { range });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    for (const [k, vs] of [
      ['category', categories],
      ['provider', providers],
      ['account', accounts],
      ['group', groups],
    ] as const)
      vs.forEach((v) => qs.append(k, v));
    return qs.toString();
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const [load, setLoad] = useState<Load>({ kind: 'loading', previous: null });
  const [reload, setReload] = useState(0);
  const [options, setOptions] = useState<FbOptionsResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbInsightsResult>(`/platforms/facebook/insights?${query}`)
      .then((data) => !cancelled && setLoad({ kind: 'ok', data }))
      .catch((err: unknown) => !cancelled && setLoad({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' }));
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const optionsKey = JSON.stringify([groups, categories]);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    groups.forEach((g) => qs.append('group', g));
    categories.forEach((c) => qs.append('category', c));
    api
      .get<FbOptionsResult>(`/platforms/facebook/options?${qs.toString()}`)
      .then((o) => !cancelled && setOptions(o))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [optionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function setList(key: string, values: string[]) {
    const next = new URLSearchParams(params);
    next.delete(key);
    values.forEach((v) => next.append(key, v));
    setParams(next, { replace: true });
  }
  function setRange(value: string, bounds?: [string, string]) {
    const next = new URLSearchParams(params);
    next.delete('range');
    next.delete('from');
    next.delete('to');
    if (value === 'custom') {
      const d = load.kind === 'ok' ? load.data.data_through : null;
      const end = bounds?.[1] ?? d ?? new Date().toISOString().slice(0, 10);
      next.set('from', bounds?.[0] ?? `${end.slice(0, 8)}01`);
      next.set('to', end);
    } else if (value !== 'all_time') next.set('range', value);
    setParams(next, { replace: true });
  }

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">Direct Meds · Facebook · computed live from the reports</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Creative insights<span className="text-spend"> — what to do next</span>
        </h1>
      </div>
      <FacebookViewSwitch current="insights" />
    </header>
  );

  const filters = (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <FilterSelect
        id="ins-range"
        label="Date Range"
        value={custom ? 'custom' : range}
        options={RANGES}
        onChange={(v) => setRange(v)}
        className="w-full sm:w-auto sm:min-w-[260px]"
      />
      {custom && <CustomDateRange key={`${from}|${to}`} from={from} to={to} onApply={(a, b) => setRange('custom', [a, b])} />}
      {isAdmin && (
        <MultiSearchSelect
          id="ins-group"
          label="Access Group"
          values={groups}
          options={[...FACEBOOK_ACCESS_GROUPS]}
          allLabel="All Groups"
          noun="groups"
          onChange={(v) => setList('group', v)}
          className="w-full sm:w-auto sm:min-w-[200px]"
        />
      )}
      <MultiSearchSelect
        id="ins-category"
        label="Category"
        values={categories}
        options={['ED', 'GLP']}
        allLabel="ED + GLP"
        noun="categories"
        onChange={(v) => setList('category', v)}
        className="w-full sm:w-auto sm:min-w-[180px]"
      />
      <ProviderAccountSelect
        id="ins-provider"
        label="Provider"
        providers={providers}
        accounts={accounts}
        options={options?.providerAccounts ?? (options?.providers ?? []).map((provider) => ({ provider, accounts: [] }))}
        allLabel="All Providers"
        onChange={(p, a) => {
          const next = new URLSearchParams(params);
          next.delete('provider');
          next.delete('account');
          p.forEach((v) => next.append('provider', v));
          a.forEach((v) => next.append('account', v));
          setParams(next, { replace: true });
        }}
        className="w-full sm:w-auto sm:min-w-[220px]"
      />
    </section>
  );

  if (load.kind === 'error') {
    return (
      <div className="space-y-8">
        {header}
        {filters}
        <div className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-semibold text-loss">Could not load the creative insights</p>
          <p className="mt-1 text-sm text-ink-2">{load.message}</p>
          <button
            type="button"
            onClick={() => setReload((k) => k + 1)}
            className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  const data = load.kind === 'ok' ? load.data : load.previous;
  const busy = load.kind === 'loading';

  return (
    <div className={`space-y-8 transition-opacity ${busy && data ? 'opacity-60' : ''}`} aria-busy={busy}>
      {header}
      {filters}
      {!data ? <Skeleton /> : <Insights data={data} />}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-surface" />
    </div>
  );
}

// ===========================================================================

function Insights({ data }: { data: FbInsightsResult }) {
  const BE = data.break_even_cpa;
  const t = data.totals;
  const ed = data.creatives.filter((c) => ED.includes(c.product));
  const hasEd = t.cost > 0;
  const fstep = (name: string) => data.funnel.find((f) => f.step === name)?.rate_from_prev ?? null;
  const period = data.range.from && data.range.to ? `${formatDate(data.range.from, 'medium')} – ${formatDate(data.range.to, 'medium')}` : data.range.label;

  return (
    <>
      {/* ---------------------------------------------------------------- summary */}
      <section className="space-y-4">
        <p className="max-w-5xl text-lg leading-relaxed text-ink-2">
          {hasEd ? (
            <>
              ED offers (DirectMax and MEDVi), {period.toLowerCase()}: each purchase cost <b className={cpaTone(t.cpa, BE)}>{usd(t.cpa)}</b> while one purchase brings in{' '}
              <b className="text-ink">{usd(BE)}</b>, so every $1 returned <b className={roasTone(t.roas, t.purchases)}>{times(t.roas)}</b>.{' '}
              {(t.roas ?? 0) >= 1
                ? 'The account is profitable: keep scaling the winners below.'
                : 'Winners exist; the lists below say which to scale, relaunch, test longer or stop.'}
            </>
          ) : (
            'No ED spend in this selection, so purchase-based verdicts are not available. Pick another range or category.'
          )}
        </p>
        <p className="text-xs text-ink-3">
          Data through {data.data_through ? formatDate(data.data_through, 'medium') : '—'}. Cost = Meta spend + provider fee. Purchases are partner events joined to ads
          by exact ad name. Break-even = average revenue per ED purchase{data.break_even_is_fallback ? ' (no purchases in this selection, so $240 is assumed)' : ''}.
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Cost" value={usd(t.cost)} sub="ED offers" />
          <Tile label="Purchases" value={int(t.purchases)} sub={`${int(t.add_to_carts)} add-to-carts`} />
          <Tile label="Cost / purchase" value={usd(t.cpa)} tone={t.cpa != null ? (t.cpa <= BE ? 'good' : 'bad') : undefined} sub={`break-even ${usd(BE)}`} />
          <Tile label="Return on spend" value={times(t.roas)} tone={t.roas != null ? (t.roas >= 1 ? 'good' : 'bad') : undefined} sub="1.00× = break-even" />
          <Tile label="Cost / add-to-cart" value={usd(t.cost_per_atc)} sub="early buyer signal" />
          <Tile
            label="Last 7 days"
            value={usd(data.last7.cpa)}
            tone={data.last7.cpa != null ? (data.last7.cpa <= BE ? 'good' : 'bad') : undefined}
            sub={`per purchase · ${int(data.last7.purchases)} sales on ${usd(data.last7.cost)}`}
          />
        </div>
        <nav aria-label="Sections" className="flex flex-wrap gap-2 pt-1">
          {[
            ['#decide', 'What to do'],
            ['#new', 'New creatives'],
            ['#rules', 'Rules'],
            ['#scorecard', 'All creatives'],
            ['#traits', 'What wins & what to make'],
            ['#budget', 'Budget & timing'],
            ['#funnel', 'Funnel & money'],
            ['#campaigns', 'Campaigns'],
            ['#audience', 'Audience'],
            ['#products', 'Products & tracking'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>
      </section>

      <DecisionBoard ed={ed} be={BE} />
      <NewCreatives creatives={data.creatives} from={data.last7_from} to={data.data_through} />
      <Rules data={data} fstep={fstep} />
      <Scorecard creatives={data.creatives} be={BE} />
      <Traits data={data} />

      {/* ---------------------------------------------------------------- budget & timing */}
      <div id="budget" className="grid scroll-mt-6 gap-6 xl:grid-cols-2">
        <Card title="Purchases per $1,000, by total ad spend" sub="ED ads grouped by how much each spent in total. Ads stopped early rarely make a sale.">
          <HBars
            bars={data.spend_levels.map((s) => ({
              label: s.bucket,
              sub: `${plural(s.ads, 'ad')} · ${s.ads_with_sale} with a sale`,
              value: s.purchases_per_1k,
              text: s.purchases_per_1k == null ? '—' : `${s.purchases_per_1k.toFixed(1)} per $1k`,
              tone: (s.purchases_per_1k ?? 0) * BE >= 1000 ? 'good' : 'neutral',
            }))}
            reference={1000 / BE}
            referenceLabel="break-even"
          />
        </Card>
        <Card
          title="Cost per purchase, by days since launch"
          sub="ED ads. The first days cost the most while Meta learns; a rise later would mean the creative is wearing out."
        >
          <HBars
            bars={data.ad_age.map((a) => ({
              label: a.stage,
              sub: `${plural(a.purchases, 'sale')} · CTR ${pct(a.ctr, 2)}`,
              value: a.cpa,
              text: usd(a.cpa),
              tone: a.cpa != null && a.cpa <= BE ? 'good' : 'bad',
            }))}
            reference={BE}
            referenceLabel={`break-even ${usd(BE)}`}
          />
        </Card>
      </div>

      {/* ---------------------------------------------------------------- funnel & weekly */}
      <div id="funnel" className="grid scroll-mt-6 gap-6 xl:grid-cols-2">
        <Card title="Where buyers drop off" sub="ED offers. The % is how many made it from the step before.">
          <HBars
            bars={data.funnel.map((f) => ({
              label: f.step,
              sub: f.cost_per != null ? `${usd(f.cost_per)} each` : undefined,
              value: f.count,
              text: `${int(f.count)}${f.rate_from_prev != null ? ` · ${pct(f.rate_from_prev)}` : ''}`,
            }))}
          />
        </Card>
        <Card title="Cost vs revenue by week" sub="ED offers; weeks start on Monday. Revenue under cost means that week lost money.">
          <Weekly rows={data.weekly} />
        </Card>
      </div>

      <Campaigns rows={data.segments} be={BE} />
      <Audience data={data} />
      <Products data={data} />
    </>
  );
}

// ===========================================================================
// what to do this week

function DecisionBoard({ ed, be }: { ed: InsightCreative[]; be: number }) {
  const win = (c: InsightCreative) => c.verdict === 'Scale' || c.verdict === 'Keep & watch';
  const byPur = (a: InsightCreative, b: InsightCreative) => b.purchases - a.purchases || (a.cpa ?? 0) - (b.cpa ?? 0);
  const lists = [
    {
      title: 'Scale now',
      tone: 'border-t-revenue',
      sub: 'Running and selling at or near break-even. Add 20–30% budget every 2–3 days while cost per sale holds.',
      rows: ed.filter((c) => win(c) && c.live_last7).sort(byPur),
      cols: ['Sales', '$/sale'],
      cells: (c: InsightCreative) => [int(c.purchases), <span className={cpaTone(c.cpa, be)}>{usd(c.cpa)}</span>],
      empty: 'No running creative sells at break-even right now.',
    },
    {
      title: 'Turn back on',
      tone: 'border-t-revenue',
      sub: 'Proven sellers that stopped running. Relaunch with the same post ID so they keep their learning.',
      rows: ed.filter((c) => win(c) && !c.live_last7).sort(byPur),
      cols: ['Sales', '$/sale'],
      cells: (c: InsightCreative) => [int(c.purchases), <span className={cpaTone(c.cpa, be)}>{usd(c.cpa)}</span>],
      empty: 'None.',
    },
    {
      title: 'Give more budget',
      tone: 'border-t-spend',
      sub: `No sale yet, but cheap add-to-carts. Let each reach about ${usd(be)} before deciding.`,
      rows: ed.filter((c) => c.verdict === 'Promising').sort((a, b) => b.add_to_carts - a.add_to_carts),
      cols: ['ATC', 'Spent'],
      cells: (c: InsightCreative) => [int(c.add_to_carts), usd(c.cost)],
      empty: 'None.',
    },
    {
      title: 'Stop / don’t relaunch',
      tone: 'border-t-loss',
      sub: 'Spent at least one break-even CPA with no sale, or sells at 1.25× break-even or more.',
      rows: ed.filter((c) => ['Cut', 'Near cut', 'Over break-even'].includes(c.verdict)).sort((a, b) => b.cost - a.cost),
      cols: ['Spent', 'Running'],
      cells: (c: InsightCreative) => [usd(c.cost), c.live_last7 ? <span className="font-semibold text-loss">yes</span> : 'no'],
      empty: 'None.',
    },
  ];
  return (
    <Card id="decide" title="What to do this week" sub="Every ED creative with a clear result, sorted into four actions. Click an ad to open its page.">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {lists.map((l) => (
          <div key={l.title} className={`rounded-xl border border-line border-t-4 ${l.tone} bg-surface-2/40 p-4`}>
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold text-ink">{l.title}</h3>
              <span className="text-sm font-semibold tabular-nums text-ink-3">{l.rows.length}</span>
            </div>
            <p className="mt-1 text-xs text-ink-3">{l.sub}</p>
            <div className="mt-3 max-h-72 overflow-auto">
              {l.rows.length === 0 ? (
                <p className="py-3 text-sm text-ink-3">{l.empty}</p>
              ) : (
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-ink-3">
                      <th className="py-1 text-left font-semibold">Ad</th>
                      {l.cols.map((c) => (
                        <th key={c} className="py-1 text-right font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {l.rows.map((c) => (
                      <tr key={c.ad} className="border-t border-line/60">
                        <td className="max-w-[170px] truncate py-1.5 pr-2" title={c.ad}>
                          <AdLink name={c.ad} />
                          <span className="block text-xs text-ink-3">last {shortDay(c.last_day)}</span>
                        </td>
                        {l.cells(c).map((v, i) => (
                          <td key={i} className="py-1.5 text-right">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ===========================================================================
// new creatives

function NewCreatives({ creatives, from, to }: { creatives: InsightCreative[]; from: string | null; to: string | null }) {
  const [decision, setDecision] = useState<NewDecision | ''>('');
  const [product, setProduct] = useState('');
  const fresh = creatives.filter((c) => c.new_decision && (!product || c.product === product));
  const rows = fresh
    .filter((c) => !decision || c.new_decision === decision)
    .sort((a, b) => NEW_ORDER.indexOf(a.new_decision!) - NEW_ORDER.indexOf(b.new_decision!) || b.cost - a.cost);
  const cols: Column<InsightCreative>[] = [
    { key: 'ad', label: 'Ad', align: 'left', render: (c) => <AdLink name={c.ad} />, sort: (c) => c.ad },
    {
      key: 'd',
      label: 'Decision',
      align: 'left',
      render: (c) => <Pill tone={VERDICT_TONE[c.new_decision!]}>{c.new_decision}</Pill>,
      sort: (c) => NEW_ORDER.indexOf(c.new_decision!),
    },
    { key: 'why', label: 'Why / next step', align: 'left', wrap: true, render: (c) => <span className="text-ink-2">{c.new_why}</span> },
    { key: 'p', label: 'Product', align: 'left', render: (c) => c.product, sort: (c) => c.product },
    { key: 'first', label: 'Started', render: (c) => shortDay(c.first_day), sort: (c) => c.first_day },
    { key: 'days', label: 'Days', render: (c) => int(c.days_live), sort: (c) => c.days_live },
    { key: 'cost', label: 'Spent', render: (c) => usd(c.cost), sort: (c) => c.cost },
    { key: 'atc', label: 'ATC', render: (c) => int(c.add_to_carts), sort: (c) => c.add_to_carts },
    { key: 'cpatc', label: '$/ATC', render: (c) => usd(c.cost_per_atc), sort: (c) => c.cost_per_atc },
    { key: 'pur', label: 'Sales', render: (c) => int(c.purchases), sort: (c) => c.purchases },
    { key: 'qs', label: 'Quiz start', render: (c) => pct(c.quiz_start_rate), sort: (c) => c.quiz_start_rate },
  ];
  return (
    <Card
      id="new"
      title="New creatives: a decision for each"
      sub={
        <>
          Creatives whose first day is {from ? `${shortDay(from)} – ${shortDay(to)}` : 'in the last 7 days'}. They are judged on early signals because most haven’t had
          time to sell. Scale: a sale at up to 1.25× break-even. Keep: cheap add-to-carts. Watch: pricey add-to-carts. Too early: not enough spend. Not spending: Meta
          barely delivers it. Cut: no add-to-cart after half a break-even CPA, or no sale by the point where 9 in 10 winners had sold. Turn back on: good signs, but
          stopped.
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          id="new-product"
          label="Product"
          value={product}
          options={[{ value: '', label: 'All products' }, ...PRODUCTS.map((p) => ({ value: p, label: p }))]}
          onChange={setProduct}
          className="sm:min-w-[240px]"
        />
        <div className="flex flex-wrap gap-2">
          <PillButton active={decision === ''} onClick={() => setDecision('')}>
            All: {fresh.length}
          </PillButton>
          {NEW_ORDER.map((d) => {
            const n = fresh.filter((c) => c.new_decision === d).length;
            if (!n) return null;
            return (
              <PillButton key={d} tone={VERDICT_TONE[d]} active={decision === d} onClick={() => setDecision(decision === d ? '' : d)}>
                {d}: {n}
              </PillButton>
            );
          })}
        </div>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(c) => c.ad} maxHeight={560} empty="No creative started in this window." />
    </Card>
  );
}

// ===========================================================================
// rules

function Rules({ data, fstep }: { data: FbInsightsResult; fstep: (s: string) => number | null }) {
  const ind = data.indicators;
  const BE = data.break_even_cpa;
  const winners = data.creatives
    .filter((c) => (c.verdict === 'Scale' || c.verdict === 'Keep & watch') && !c.live_last7)
    .slice(0, 3)
    .map((c) => c.ad);
  const rules: [string, ReactNode][] = [
    [
      'Judge a creative by add-to-carts and quiz starts, not by CTR.',
      <>
        Across {ind.corr_ads} ED ads with enough data, CTR {strength(ind.corr_ctr)} purchases (rank correlation {dec(ind.corr_ctr)}); add-to-carts per dollar{' '}
        {strength(ind.corr_atc)} them ({dec(ind.corr_atc)}) and quiz-start rate {strength(ind.corr_quiz_start)} them ({dec(ind.corr_quiz_start)}).
      </>,
    ],
    [
      'Test fairly, then decide.',
      <>
        Creatives that sold needed a median of {usd(ind.median_spend_to_first_purchase)} to their first sale, and 9 in 10 sold within{' '}
        {usd(ind.p90_spend_to_first_purchase)}. Don’t judge on days 1–3. Cut at about {usd(BE / 2)} with no add-to-cart, and at about{' '}
        {usd(ind.p90_spend_to_first_purchase ?? BE)} with no sale.
      </>,
    ],
    [
      'Test fewer creatives, properly.',
      <>
        {int(ind.ads_under_break_even_spend)} of {int(ind.ed_ads)} ED ads spent less than one break-even CPA ({usd(ind.spend_under_break_even)} in total) and taught us
        little. Launch 4–6 new creatives a week per account, each with enough budget to reach about {usd(BE)}.
      </>,
    ],
    [
      'Scale winners instead of switching them off.',
      <>
        A creative with 3+ sales at or under break-even gets 20–30% more budget every 2–3 days while its cost per sale holds.
        {winners.length > 0 && <> Winners that are switched off now: {winners.join(', ')}.</>}
      </>,
    ],
    [
      'Make more of what wins.',
      <>See “Creative traits” below: it ranks every hook, angle, offer, style and button by return on spend and shows the creatives behind each.</>,
    ],
    [
      'Fix the landing-page leak.',
      <>
        Only {pct(fstep('Questionnaire started'))} of visitors start the questionnaire, and {pct(fstep('Purchase'))} of add-to-carts become purchases. Raising either rate
        cuts cost per sale as much as a better creative would.
      </>,
    ],
    [
      'Fix tracking so every dollar can be judged.',
      <>
        {data.unmatched.length > 0 ? `${data.unmatched.length} partner ad names never appear in Meta (list at the bottom). ` : ''}TrimRX sends no partner events. Use the
        exact Meta ad name as the sub-ID on every link.
      </>,
    ],
  ];
  return (
    <Card id="rules" title="Seven rules behind these decisions" sub="Numbers update with the data and the filters above.">
      <ol className="grid gap-3 lg:grid-cols-2">
        {rules.map(([h, body], i) => (
          <li key={h} className="flex gap-3 rounded-xl border border-line bg-surface-2/40 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-revenue ring-1 ring-line-strong">
              {i + 1}
            </span>
            <div className="text-sm leading-relaxed text-ink-2">
              <b className="block text-ink">{h}</b>
              {body}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
const strength = (r: number | null) =>
  r == null ? 'can’t yet be compared with' : Math.abs(r) < 0.15 ? 'barely relates to' : Math.abs(r) < 0.35 ? 'loosely tracks' : 'closely tracks';

// ===========================================================================
// what to make next (from the traits)

// ===========================================================================
// scorecard

function Scorecard({ creatives, be }: { creatives: InsightCreative[]; be: number }) {
  const [verdict, setVerdict] = useState('');
  const [product, setProduct] = useState('');
  const [live, setLive] = useState(false);
  const [q, setQ] = useState('');
  const rows = creatives.filter(
    (c) => (!verdict || c.verdict === verdict) && (!product || c.product === product) && (!live || c.live_last7) && (!q || c.ad.toLowerCase().includes(q.toLowerCase())),
  );
  const cols: Column<InsightCreative>[] = [
    { key: 'ad', label: 'Ad', align: 'left', render: (c) => <AdLink name={c.ad} />, sort: (c) => c.ad },
    { key: 'v', label: 'Verdict', align: 'left', render: (c) => <Pill tone={VERDICT_TONE[c.verdict]}>{c.verdict}</Pill>, sort: (c) => VERDICTS.indexOf(c.verdict) },
    { key: 'cost', label: 'Cost', render: (c) => usd(c.cost), sort: (c) => c.cost },
    { key: 'pur', label: 'Sales', render: (c) => int(c.purchases), sort: (c) => c.purchases },
    { key: 'cpa', label: '$/sale', render: (c) => usd(c.cpa), sort: (c) => c.cpa, className: (c) => cpaTone(c.cpa, be) },
    { key: 'roas', label: 'Return', render: (c) => times(c.roas), sort: (c) => c.roas, className: (c) => roasTone(c.roas, c.purchases) },
    { key: 'atc', label: 'ATC', render: (c) => int(c.add_to_carts), sort: (c) => c.add_to_carts },
    { key: 'cpatc', label: '$/ATC', render: (c) => usd(c.cost_per_atc), sort: (c) => c.cost_per_atc },
    { key: 'qs', label: 'Quiz start', render: (c) => pct(c.quiz_start_rate), sort: (c) => c.quiz_start_rate },
    { key: 'ctr', label: 'CTR', render: (c) => pct(c.ctr, 2), sort: (c) => c.ctr },
    { key: 'days', label: 'Days live', render: (c) => int(c.days_live), sort: (c) => c.days_live },
    { key: 'pdr', label: 'Days with a sale', render: (c) => pct(c.purchase_day_rate, 0), sort: (c) => c.purchase_day_rate },
    { key: 'first', label: 'Spend to 1st sale', render: (c) => usd(c.spend_to_first_purchase), sort: (c) => c.spend_to_first_purchase },
    { key: 'last', label: 'Last day', render: (c) => shortDay(c.last_day), sort: (c) => c.last_day },
    { key: 'hook', label: 'Hook', align: 'left', render: (c) => c.hook_type?.replace(/_/g, ' ') ?? '—', sort: (c) => c.hook_type },
    { key: 'angle', label: 'Angle', align: 'left', render: (c) => c.angle ?? '—', sort: (c) => c.angle },
    { key: 'prod', label: 'Product', align: 'left', render: (c) => c.product, sort: (c) => c.product },
  ];
  return (
    <Card
      id="scorecard"
      title="Every creative, scored"
      sub={`Against break-even (${usd(be)} per sale). Scale: 3+ sales at or under break-even. Keep & watch: under 1.25×. Over break-even: sales at 1.25–2×. Promising: no sale yet but cheap add-to-carts. Still testing: under one break-even of spend. Near cut: 1–2× break-even spent, no sale. Cut: 2× spent with no sale, or sales over 2×. Click a column to sort.`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <FilterSelect
          id="sc-verdict"
          label="Verdict"
          value={verdict}
          options={[{ value: '', label: 'All' }, ...VERDICTS.map((v) => ({ value: v, label: `${v} (${creatives.filter((c) => c.verdict === v).length})` }))]}
          onChange={setVerdict}
          className="sm:min-w-[240px]"
        />
        <FilterSelect
          id="sc-product"
          label="Product"
          value={product}
          options={[{ value: '', label: 'All products' }, ...PRODUCTS.map((p) => ({ value: p, label: p }))]}
          onChange={setProduct}
          className="sm:min-w-[240px]"
        />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="h-4 w-4 accent-revenue" />
          Ran in the last 7 days
        </label>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ad name"
          aria-label="Search ad name"
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none"
        />
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(c) => c.ad}
        initialSort={{ key: 'cost', dir: -1 }}
        limit={40}
        maxHeight={640}
        empty="No creative matches these filters."
      />
    </Card>
  );
}

// ===========================================================================
// traits

/** A trait value worth repeating: 3+ sales at break-even or better. */
const isWinner = (t: InsightRow) => t.purchases >= 3 && (t.roas ?? 0) >= 1;
/** A trait value that loses money: 2 break-evens spent and under half of it back. */
const isLoser = (t: InsightRow, be: number) => t.cost >= be * 2 && (t.roas ?? 0) < 0.5;
const nice = (v: string | null | undefined) => (v ?? '').replace(/_/g, ' ');

function Traits({ data }: { data: FbInsightsResult }) {
  const BE = data.break_even_cpa;
  const dims = [...new Set(data.traits.map((t) => t.dimension))];
  const [dim, setDim] = useState(dims[0] ?? 'Hook type');
  // the row whose creatives are shown on the right; the best one until another is clicked
  const [picked, setPicked] = useState<string | null>(null);
  const rows = data.traits.filter((t) => t.dimension === dim).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.cost - a.cost);
  const value = picked && rows.some((t) => t.label === picked) ? picked : (rows[0]?.label ?? null);
  const row = rows.find((t) => t.label === value) ?? null;
  const shown = value ? data.creatives.filter((c) => c.traits?.[dim] === value) : [];
  const maxRoas = Math.max(1.2, ...rows.map((t) => t.roas ?? 0));

  // the brief: best and worst value of every trait type
  const brief = dims.map((d) => {
    const xs = data.traits.filter((t) => t.dimension === d);
    const best = xs.filter(isWinner).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
    const worst = xs.filter((t) => isLoser(t, BE)).sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0) || b.cost - a.cost)[0];
    return { d, best, worst };
  });
  const go = (d: string, label: string) => {
    setDim(d);
    setPicked(label);
  };
  const briefChip = (d: string, t: InsightRow, good: boolean) => (
    <button
      key={`${d}|${t.label}`}
      type="button"
      onClick={() => go(d, t.label)}
      title={`${nice(t.label)}: ${times(t.roas)} return, ${plural(t.purchases, 'sale')}, ${usd(t.cost)} spent. Click to see its creatives.`}
      className={`inline-flex items-baseline gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
        good ? 'border-revenue/30 bg-revenue/10 hover:border-revenue/70' : 'border-loss/30 bg-loss/10 hover:border-loss/70'
      }`}
    >
      <span className="text-ink-3">{d}</span>
      <span className="font-semibold text-ink">{nice(t.label)}</span>
      <span className={`font-bold tabular-nums ${good ? 'text-revenue' : 'text-loss'}`}>{times(t.roas)}</span>
    </button>
  );

  return (
    <Card
      id="traits"
      title="Creative traits: what wins and what to make next"
      sub={`From each ED creative’s taxonomy; trait values with $300+ spend. Return = revenue ÷ cost (1.00× = break-even, ${usd(BE)} per sale). Click any label or row to see its creatives.`}
    >
      {data.traits.length === 0 ? (
        <p className="text-sm text-ink-3">No taxonomy data for this selection.</p>
      ) : (
        <>
          {/* brief */}
          <div className="mb-5 grid gap-2 rounded-xl border border-line bg-surface-2/40 p-3 md:grid-cols-[auto_1fr]">
            <span className="pt-1 text-xs font-bold uppercase tracking-wider text-revenue">Brief next</span>
            <div className="flex flex-wrap gap-1.5">{brief.filter((b) => b.best).map((b) => briefChip(b.d, b.best!, true))}</div>
            <span className="pt-1 text-xs font-bold uppercase tracking-wider text-loss">Avoid</span>
            <div className="flex flex-wrap gap-1.5">
              {brief.some((b) => b.worst) ? (
                brief.filter((b) => b.worst).map((b) => briefChip(b.d, b.worst!, false))
              ) : (
                <span className="text-xs text-ink-3">Nothing clearly losing yet.</span>
              )}
            </div>
          </div>

          {/* trait type tabs */}
          <div role="tablist" aria-label="Trait type" className="mb-4 flex flex-wrap gap-1.5">
            {dims.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === dim}
                onClick={() => {
                  setDim(d);
                  setPicked(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  d === dim ? 'bg-surface-2 text-ink ring-1 ring-line-strong' : 'text-ink-3 hover:bg-surface-2/60 hover:text-ink'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* ranked table */}
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    <th className="pb-2 text-left">{dim}</th>
                    <th className="w-[34%] pb-2 text-left">Return</th>
                    <th className="pb-2 text-right">Sales</th>
                    <th className="pb-2 text-right">$/sale</th>
                    <th className="pb-2 text-right">$/ATC</th>
                    <th className="pb-2 text-right">Quiz</th>
                    <th className="pb-2 text-right">Ads</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const sel = t.label === value;
                    const win = isWinner(t);
                    const lose = isLoser(t, BE);
                    const good = (t.roas ?? 0) >= 1;
                    return (
                      <tr
                        key={t.label}
                        onClick={() => setPicked(t.label)}
                        aria-selected={sel}
                        className={`cursor-pointer border-t border-line/50 transition-colors ${sel ? 'bg-surface-2' : 'hover:bg-surface-2/50'}`}
                      >
                        <td className={`max-w-[260px] py-1.5 pl-2 pr-2 ${sel ? 'border-l-2 border-revenue' : 'border-l-2 border-transparent'}`}>
                          <span className="flex min-w-0 items-center gap-2">
                            <button type="button" className="min-w-0 truncate text-left font-medium text-ink" title={nice(t.label)}>
                              {nice(t.label)}
                            </button>
                            {(win || lose) && (
                              <span
                                className={`shrink-0 rounded px-1.5 text-[10px] font-bold uppercase tracking-wider ${win ? 'bg-revenue/15 text-revenue' : 'bg-loss/15 text-loss'}`}
                              >
                                {win ? 'Make more' : 'Avoid'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="relative flex h-4 items-center">
                            <span
                              className={`block h-full rounded-r ${good ? 'bg-revenue' : 'bg-loss'} opacity-80`}
                              style={{ width: `${Math.max(1, ((t.roas ?? 0) / maxRoas) * 78)}%` }}
                            />
                            <span className={`ml-1.5 text-xs font-bold ${good ? 'text-revenue' : 'text-loss'}`}>{times(t.roas)}</span>
                            <span
                              className="pointer-events-none absolute inset-y-[-3px] border-l border-dashed border-ink-3"
                              style={{ left: `${(1 / maxRoas) * 78}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 text-right text-ink">{int(t.purchases)}</td>
                        <td className={`py-1.5 text-right ${cpaTone(t.cpa, BE)}`}>{usd(t.cpa)}</td>
                        <td className="py-1.5 text-right text-ink-2">{usd(t.cost_per_atc)}</td>
                        <td className="py-1.5 text-right text-ink-2">{pct(t.quiz_start_rate, 0)}</td>
                        <td className="py-1.5 text-right text-ink-3">{int(t.ads)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-3">
                Dashed line = break-even. “Make more”: 3+ sales at break-even or better. “Avoid”: 2× break-even spent, under half returned.
              </p>
            </div>

            {/* creatives of the selected row */}
            <div className="min-w-0 xl:border-l xl:border-line xl:pl-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold text-ink">
                  {dim}: {nice(value)}
                </h3>
                {row && (
                  <p className="text-xs text-ink-3">
                    {plural(mergeTwins(shown, BE).length, 'creative')} · {usd(row.cost)} · {plural(row.purchases, 'sale')} ·{' '}
                    <span className={roasTone(row.roas, row.purchases)}>{times(row.roas)}</span>
                  </p>
                )}
              </div>
              <div className="max-h-[720px] overflow-y-auto pr-1">
                <CreativeGallery creatives={shown} breakEven={BE} empty="No creative with this trait in the selection." />
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ===========================================================================
// weekly

function Weekly({ rows }: { rows: FbInsightsResult['weekly'] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.cost, r.revenue]));
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-spend" />
          Cost
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-revenue" />
          Revenue
        </span>
      </div>
      <div className="flex h-56 items-end gap-1.5 overflow-x-auto border-b border-line pb-px">
        {rows.map((r) => (
          <div
            key={r.week}
            className="flex h-full min-w-[26px] flex-1 flex-col justify-end"
            title={`Week of ${shortDay(r.week)}: cost ${usd(r.cost)}, revenue ${usd(r.revenue)}, ${int(r.purchases)} sales, ${times(r.roas)}`}
          >
            <div className="flex h-full items-end gap-px">
              <div className="flex-1 rounded-t bg-spend/85" style={{ height: `${(r.cost / max) * 100}%` }} />
              <div className="flex-1 rounded-t bg-revenue/85" style={{ height: `${(r.revenue / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 overflow-x-hidden text-[10px] text-ink-3">
        {rows.map((r, i) => (
          <span key={r.week} className="min-w-[26px] flex-1 text-center">
            {i % 2 === 0 ? shortDay(r.week) : ''}
          </span>
        ))}
      </div>
      <div className="mt-4">
        <DataTable
          rows={[...rows].reverse()}
          rowKey={(r) => r.week}
          limit={6}
          columns={[
            { key: 'w', label: 'Week of', align: 'left', render: (r) => shortDay(r.week), sort: (r) => r.week },
            { key: 'c', label: 'Cost', render: (r) => usd(r.cost), sort: (r) => r.cost },
            { key: 'r', label: 'Revenue', render: (r) => usd(r.revenue), sort: (r) => r.revenue },
            { key: 'p', label: 'Sales', render: (r) => int(r.purchases), sort: (r) => r.purchases },
            { key: 'cpa', label: '$/sale', render: (r) => usd(r.cpa), sort: (r) => r.cpa },
            { key: 'roas', label: 'Return', render: (r) => times(r.roas), sort: (r) => r.roas, className: (r) => roasTone(r.roas, r.purchases) },
          ]}
        />
      </div>
    </div>
  );
}

// ===========================================================================
// campaigns

function Campaigns({ rows, be }: { rows: FbInsightsResult['segments']; be: number }) {
  const [level, setLevel] = useState<'campaign' | 'adset'>('campaign');
  const cols: Column<FbInsightsResult['segments'][number]>[] = [
    { key: 'n', label: 'Name', align: 'left', render: (s) => s.label, sort: (s) => s.label },
    { key: 'p', label: 'Product', align: 'left', render: (s) => s.product, sort: (s) => s.product },
    { key: 'ads', label: 'Ads', render: (s) => int(s.ads), sort: (s) => s.ads },
    { key: 'cost', label: 'Cost', render: (s) => usd(s.cost), sort: (s) => s.cost },
    { key: 'pur', label: 'Sales', render: (s) => num1(s.purchases), sort: (s) => s.purchases },
    { key: 'cpa', label: '$/sale', render: (s) => usd(s.cpa), sort: (s) => s.cpa, className: (s) => cpaTone(s.cpa, be) },
    { key: 'roas', label: 'Return', render: (s) => times(s.roas), sort: (s) => s.roas, className: (s) => roasTone(s.roas, s.purchases) },
    { key: 'atc', label: 'ATC', render: (s) => num1(s.add_to_carts), sort: (s) => s.add_to_carts },
    { key: 'ctr', label: 'CTR', render: (s) => pct(s.ctr, 2), sort: (s) => s.ctr },
  ];
  return (
    <Card
      id="campaigns"
      title="Campaigns and ad sets"
      sub="When an ad runs in several ad sets on one day, that day’s sales are split by spend share. Rows with $100+ cost."
      right={
        <FilterSelect
          id="seg-level"
          label="Level"
          value={level}
          options={[
            { value: 'campaign', label: 'Campaign' },
            { value: 'adset', label: 'Ad set' },
          ]}
          onChange={(v) => setLevel(v as 'campaign' | 'adset')}
          className="sm:min-w-[200px]"
        />
      }
    >
      <DataTable
        rows={rows.filter((s) => s.level === level)}
        columns={cols}
        rowKey={(s) => `${s.level}|${s.label}|${s.product}`}
        initialSort={{ key: 'cost', dir: -1 }}
        limit={25}
        maxHeight={620}
      />
    </Card>
  );
}

// ===========================================================================
// audience, devices, regions

function Audience({ data }: { data: FbInsightsResult }) {
  const ages = [...new Set(data.audience.map((a) => a.age))].sort();
  const genders = [...new Set(data.audience.map((a) => a.gender))].sort();
  const maxShare = Math.max(1, ...data.audience.map((a) => a.share));
  const cell = (age: string, g: string) => data.audience.find((a) => a.age === age && a.gender === g);
  return (
    <Card
      id="audience"
      title="Who sees the ads"
      sub="Share of spend and CTR by age and gender (Meta rows in this selection). Meta doesn’t report purchases by age, so this shows reach and clicks only. Hover a cell for cost per landing view."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold uppercase tracking-wider text-ink-3">Age</th>
              {genders.map((g) => (
                <th key={g} className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ages.map((age) => (
              <tr key={age}>
                <td className="pr-2 font-semibold text-ink-2">{age}</td>
                {genders.map((g) => {
                  const c = cell(age, g);
                  return (
                    <td
                      key={g}
                      title={c ? `Cost ${usd(c.cost)} · cost per landing view ${usd(c.cost_per_lpv)}` : undefined}
                      className="rounded-lg px-3 py-2 text-center"
                      style={{ background: c ? `color-mix(in oklab, var(--color-azure) ${Math.round((c.share / maxShare) * 55)}%, var(--color-surface-2))` : undefined }}
                    >
                      {c ? (
                        <>
                          <b className="text-ink">{pct(c.share)}</b>
                          <span className="block text-xs text-ink-2">CTR {pct(c.ctr, 2)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mb-3 mt-6 font-bold text-ink">Devices and states (partner events)</h3>
      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable
          rows={data.devices}
          rowKey={(d) => d.device}
          columns={[
            { key: 'd', label: 'Device', align: 'left', render: (d) => d.device, sort: (d) => d.device },
            { key: 'v', label: 'Landing views', render: (d) => int(d.first_views), sort: (d) => d.first_views },
            { key: 'q', label: 'Quiz start', render: (d) => pct(d.quiz_start_rate), sort: (d) => d.quiz_start_rate },
            { key: 'a', label: 'ATC', render: (d) => int(d.add_to_carts), sort: (d) => d.add_to_carts },
            { key: 'p', label: 'Sales', render: (d) => int(d.purchases), sort: (d) => d.purchases },
            { key: 'k', label: 'Per 1k views', render: (d) => dec(d.purchases_per_1k_views), sort: (d) => d.purchases_per_1k_views },
          ]}
        />
        <DataTable
          rows={data.regions}
          rowKey={(r) => r.region}
          maxHeight={420}
          initialSort={{ key: 'v', dir: -1 }}
          columns={[
            { key: 'r', label: 'State', align: 'left', render: (r) => r.region, sort: (r) => r.region },
            { key: 'v', label: 'Landing views', render: (r) => int(r.first_views), sort: (r) => r.first_views },
            { key: 'a', label: 'ATC', render: (r) => int(r.add_to_carts), sort: (r) => r.add_to_carts },
            { key: 'p', label: 'Sales', render: (r) => int(r.purchases), sort: (r) => r.purchases },
            { key: 'k', label: 'Per 1k views', render: (r) => dec(r.purchases_per_1k_views), sort: (r) => r.purchases_per_1k_views },
          ]}
          empty="No state has 50+ landing views."
        />
      </div>
    </Card>
  );
}

// ===========================================================================
// products & tracking

function Products({ data }: { data: FbInsightsResult }) {
  const BE = data.break_even_cpa;
  return (
    <Card id="products" title="Products and tracking gaps">
      <DataTable
        rows={data.products}
        rowKey={(p) => p.label}
        columns={[
          { key: 'l', label: 'Product', align: 'left', render: (p) => <span className={p.label.startsWith('All') ? 'font-bold' : ''}>{p.label}</span> },
          { key: 'ads', label: 'Ads', render: (p) => int(p.ads) },
          { key: 'cost', label: 'Cost', render: (p) => usd(p.cost) },
          { key: 'pur', label: 'Sales', render: (p) => int(p.purchases) },
          { key: 'cpa', label: '$/sale', render: (p) => usd(p.cpa), className: (p) => cpaTone(p.cpa, BE) },
          { key: 'roas', label: 'Return', render: (p) => times(p.roas), className: (p) => roasTone(p.roas, p.purchases) },
          { key: 'atc', label: 'ATC', render: (p) => int(p.add_to_carts) },
          { key: 'cpatc', label: '$/ATC', render: (p) => usd(p.cost_per_atc) },
          { key: 'ctr', label: 'CTR', render: (p) => pct(p.ctr, 2) },
          { key: 'cpm', label: 'CPM', render: (p) => usd(p.cpm) },
        ]}
      />
      <p className="mt-3 text-sm text-ink-3">GLP-1 and TrimRX can’t be judged on purchases until their partner events include sales.</p>
      <h3 className="mb-1 mt-6 font-bold text-ink">Partner results with no matching Meta ad name</h3>
      <p className="mb-3 text-sm text-ink-3">These have no known cost in this selection, so they are left out of the scores. Check the sub-ID on these links.</p>
      <DataTable
        rows={data.unmatched}
        rowKey={(u) => u.ad_name}
        columns={[
          { key: 'n', label: 'Ad name in partner data', align: 'left', render: (u) => u.ad_name, sort: (u) => u.ad_name },
          { key: 'p', label: 'Sales', render: (u) => int(u.purchases), sort: (u) => u.purchases },
          { key: 'a', label: 'ATC', render: (u) => int(u.add_to_carts), sort: (u) => u.add_to_carts },
          { key: 'r', label: 'Revenue', render: (u) => usd(u.revenue), sort: (u) => u.revenue },
        ]}
        empty="Every partner result matches a Meta ad."
      />
      <details className="mt-6 text-sm text-ink-3">
        <summary className="cursor-pointer font-semibold text-ink-2 hover:text-ink">How the numbers are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
          <li>Cost is Meta spend plus the provider’s fee % from the provider table, the same as on the dashboard. Amounts are used as stored.</li>
          <li>Purchases, add-to-carts and revenue are partner events joined to Meta rows by exact ad name (capitals matter).</li>
          <li>Break-even cost per sale is the average partner revenue per ED purchase in the selection; every threshold scales with it.</li>
          <li>“Last 7 days” and “new creatives” use the 7 days ending on the last day with data in the selection.</li>
          <li>Quiz start = questionnaire starts ÷ partner landing views. CTR = link clicks ÷ impressions.</li>
          <li>Everything is computed when the page loads, so new uploads appear automatically.</li>
        </ul>
      </details>
    </Card>
  );
}
