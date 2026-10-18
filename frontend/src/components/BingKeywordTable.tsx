import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { BingKeywordRow, BingSearchTermRow } from '@/types/bing';

/**
 * Search Terms report. Everything is computed here from the rows the dashboard already sends
 * (no extra request, no extra collection):
 *
 *   - four views of the same rows: Search Terms · Keywords · Ad Groups · Campaigns
 *   - in the Keywords view, a keyword's search terms open underneath it (when the export has them)
 *   - "Conversion Name" is the keyword report's Goal column (blank when the report has none)
 *   - the Search Terms view reads the search term report (bing_search_terms); each row is already
 *     connected by the API to its keyword (bid, Conversion Name) and to the partner funnel
 *   - columns grouped into Delivery · Cost · Results, a totals row, sticky header and first column
 */

type View = 'search_term' | 'keyword' | 'ad_group' | 'campaign';
type MetricKey =
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'top'
  | 'abs_top'
  | 'bid'
  | 'cpc'
  | 'spend'
  | 'lp_views'
  | 'purchases'
  | 'revenue'
  | 'roas'
  | 'conv'
  | 'all_conv';
type SortKey = 'name' | MetricKey;

type GoalCount = { name: string; conversions: number; all_conversions: number };
/** A keyword-report row, or a search-term row put in the same shape. */
type Row = Omit<BingKeywordRow, 'conversions' | 'all_conversions' | 'conversion_goals'> & {
  conversions?: number;
  all_conversions?: number;
  goalNames: string[]; // conversion goals this row (or its keyword) converted on
  goalCounts?: GoalCount[]; // per-goal conversions (keyword report rows only)
  close_variant?: boolean;
  excluded?: boolean; // search term "Excluded" (added as a negative)
};

function keywordToRow(r: BingKeywordRow): Row {
  const goals = r.conversion_goals ?? [];
  return { ...r, goalNames: goals.map((g) => g.name), goalCounts: goals };
}

function termToRow(t: BingSearchTermRow): Row {
  return {
    keyword: t.keyword,
    search_term: t.search_term,
    goal: t.conversion_name,
    match_type: t.match_type,
    campaign_name: t.campaign_name,
    ad_group_name: t.ad_group_name,
    media_buyer: t.media_buyer,
    bid_usd: t.bid_usd,
    impressions: t.impressions,
    clicks: t.clicks,
    spend_usd: t.spend_usd,
    ctr: t.ctr,
    cpc_usd: t.cpc_usd,
    top_impr_rate_pct: t.top_impr_rate_pct,
    abs_top_impr_rate_pct: t.abs_top_impr_rate_pct,
    active_days: 0,
    landing_page_views: t.landing_page_views,
    purchases: t.purchases,
    revenue_usd: t.revenue_usd,
    roas_pct: t.roas_pct,
    conversions: t.conversions,
    all_conversions: t.all_conversions,
    goalNames: t.conversion_goals ?? [],
    close_variant: t.close_variant,
    excluded: (t.added_excluded ?? '').toLowerCase() === 'excluded',
  };
}

const ANY_GOAL = '__any';
/** Limit a row to one goal: keyword rows report that goal's conversions only. */
function forGoal(r: Row, goal: string): Row {
  if (!goal || goal === ANY_GOAL || !r.goalCounts) return r;
  const g = r.goalCounts.find((x) => x.name === goal);
  return { ...r, conversions: g?.conversions ?? 0, all_conversions: g?.all_conversions ?? 0, goalCounts: g ? [g] : [] };
}
const kwKey = (r: Pick<Row, 'campaign_name' | 'ad_group_name' | 'keyword'>) =>
  `${r.campaign_name}\u0001${r.ad_group_name}\u0001${r.keyword.trim().toLowerCase()}`;

/** Summed figures for any set of rows; rates are recomputed, never averaged. */
interface Metrics {
  impressions: number;
  clicks: number;
  spend: number;
  lp_views: number;
  purchases: number;
  revenue: number;
  ctr: number | null;
  cpc: number | null;
  top: number | null; // impression-weighted
  abs_top: number | null;
  bid: number | null; // keyword view only
  roas: number | null; // null when no partner event matched any of the rows
  conv: number | null; // Bing "Conv."
  all_conv: number | null; // Bing "All conv."
}

/** One table line: a keyword, ad group or campaign, with its search terms / rows underneath. */
interface Line {
  key: string;
  name: string;
  matchType: string | null;
  goals: GoalCount[] | string[]; // conversion goals (with counts when the keyword report has them)
  excluded: boolean;
  keyword: string | null; // search term view: the keyword the term matched
  closeVariant: boolean;
  context: string; // second line: where it lives
  buyers: string[];
  m: Metrics;
  terms: { key: string; term: string; goal: string | null; m: Metrics }[];
}

const PAGE = 25;
const VIEWS: { key: View; label: string }[] = [
  { key: 'search_term', label: 'Search Terms' },
  { key: 'keyword', label: 'Keywords' },
  { key: 'ad_group', label: 'Ad Groups' },
  { key: 'campaign', label: 'Campaigns' },
];
const MATCH_FILTERS = [
  { key: '', label: 'All' },
  { key: 'exact', label: 'Exact' },
  { key: 'phrase', label: 'Phrase' },
  { key: 'broad', label: 'Broad' },
];
const MATCH_STYLE: Record<string, string> = {
  exact: 'bg-azure/15 text-azure',
  phrase: 'bg-violet/15 text-violet',
  broad: 'bg-spend/15 text-spend',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function measure(rows: Row[], withBid: boolean): Metrics {
  let impressions = 0, clicks = 0, spend = 0, lp = 0, purchases = 0, revenue = 0, conv = 0, allConv = 0, hasConv = false;
  let topW = 0, topN = 0, absW = 0, absN = 0, matched = false;
  let bid: number | null = null;
  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    spend += r.spend_usd;
    lp += r.landing_page_views;
    purchases += r.purchases;
    revenue += r.revenue_usd;
    if (r.top_impr_rate_pct !== null) { topW += r.top_impr_rate_pct * r.impressions; topN += r.impressions; }
    if (r.abs_top_impr_rate_pct !== null) { absW += r.abs_top_impr_rate_pct * r.impressions; absN += r.impressions; }
    if (r.roas_pct !== null || r.landing_page_views > 0 || r.revenue_usd > 0) matched = true;
    if (withBid && r.bid_usd !== null) bid = Math.max(bid ?? 0, r.bid_usd);
    if (typeof r.conversions === 'number') { conv += r.conversions; hasConv = true; }
    if (typeof r.all_conversions === 'number') { allConv += r.all_conversions; hasConv = true; }
  }
  return {
    impressions,
    clicks,
    spend: round2(spend),
    lp_views: lp,
    purchases,
    revenue: round2(revenue),
    ctr: impressions ? (clicks / impressions) * 100 : null,
    cpc: clicks ? spend / clicks : null,
    top: topN ? topW / topN : null,
    abs_top: absN ? absW / absN : null,
    bid,
    roas: matched && spend > 0 ? ((revenue - spend) / spend) * 100 : null,
    conv: hasConv ? conv : null,
    all_conv: hasConv ? allConv : null,
  };
}

function buildLines(rows: Row[], view: View, multiBuyer: boolean, termsByKeyword: Map<string, Row[]> | null): Line[] {
  const keyOf = (r: Row) =>
    view === 'search_term'
      ? `${r.campaign_name}\u0001${r.ad_group_name}\u0001${r.keyword}\u0001${r.match_type ?? ''}\u0001${r.close_variant ? 1 : 0}\u0001${r.search_term ?? ''}`
      : view === 'campaign'
      ? r.campaign_name
      : view === 'ad_group'
        ? `${r.campaign_name}\u0001${r.ad_group_name}`
        : `${r.campaign_name}\u0001${r.ad_group_name}\u0001${r.keyword}\u0001${r.match_type ?? ''}`;
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);

  return [...groups].map(([key, g]) => {
    const first = g[0]!;
    const buyers = [...new Set(g.map((r) => r.media_buyer).filter((b): b is string => !!b))].sort();
    // goals with counts (keyword report rows) or just names (search term rows)
    const counted = new Map<string, GoalCount>();
    for (const r of g)
      for (const c of r.goalCounts ?? []) {
        const t = counted.get(c.name) ?? { name: c.name, conversions: 0, all_conversions: 0 };
        t.conversions += c.conversions;
        t.all_conversions += c.all_conversions;
        counted.set(c.name, t);
      }
    const goals: GoalCount[] | string[] = counted.size
      ? [...counted.values()].sort((a, b) => b.all_conversions - a.all_conversions || a.name.localeCompare(b.name))
      : [...new Set(g.flatMap((r) => r.goalNames))].sort();
    const keywordCount = new Set(g.map((r) => `${r.ad_group_name}|${r.keyword}|${r.match_type}`)).size;
    const context =
      view === 'keyword' || view === 'search_term'
        ? `${first.campaign_name} › ${first.ad_group_name}`
        : view === 'ad_group'
          ? `${first.campaign_name} · ${keywordCount} keyword${keywordCount === 1 ? '' : 's'}`
          : `${new Set(g.map((r) => r.ad_group_name)).size} ad groups · ${keywordCount} keywords`;
    // a keyword's search terms: from the search term report when loaded, else from the keyword report itself
    const termRows = view === 'keyword' ? (termsByKeyword ? (termsByKeyword.get(kwKey(first)) ?? []) : g.filter((r) => r.search_term)) : [];
    const terms =
      view === 'keyword'
        ? termRows
            .map((r, i) => ({ key: `${key}\u0001${r.search_term}\u0001${i}`, term: r.search_term!, goal: r.goal, m: measure([r], false) }))
            .sort((a, b) => b.m.spend - a.m.spend || b.m.clicks - a.m.clicks)
        : [];
    return {
      key,
      name:
        view === 'campaign'
          ? first.campaign_name
          : view === 'ad_group'
            ? first.ad_group_name
            : view === 'search_term'
              ? (first.search_term ?? first.keyword)
              : first.keyword,
      matchType: view === 'keyword' || view === 'search_term' ? first.match_type : null,
      goals,
      keyword: view === 'search_term' ? first.keyword : null,
      closeVariant: view === 'search_term' && !!first.close_variant,
      excluded: view === 'search_term' && !!first.excluded,
      context,
      buyers: multiBuyer ? buyers : [],
      m: measure(g, view === 'keyword' || view === 'search_term'),
      terms,
    };
  });
}

// ---- cell formatting ----
const dim = (t: string) => <span className="text-ink-3">{t}</span>;
const int = (v: number) => (v === 0 ? dim('0') : formatInteger(v));
const money = (v: number | null) => (v === null ? dim('—') : v === 0 ? dim('$0') : formatCurrency(v));
const pct = (v: number | null, digits: number) => (v === null ? dim('—') : formatPercent(v / 100, digits));

interface Col {
  key: MetricKey;
  label: string;
  group: 'Delivery' | 'Cost' | 'Results';
  hint: string;
  render: (m: Metrics, maxSpend: number) => ReactNode;
}

const COLS: Col[] = [
  { key: 'impressions', label: 'Impr.', group: 'Delivery', hint: 'impressions', render: (m) => int(m.impressions) },
  { key: 'clicks', label: 'Clicks', group: 'Delivery', hint: 'clicks', render: (m) => int(m.clicks) },
  { key: 'ctr', label: 'CTR', group: 'Delivery', hint: 'clicks ÷ impressions', render: (m) => pct(m.ctr, 2) },
  { key: 'top', label: 'Top', group: 'Delivery', hint: 'top impression rate, impression-weighted', render: (m) => pct(m.top, 0) },
  { key: 'abs_top', label: 'Abs. Top', group: 'Delivery', hint: 'absolute top impression rate, impression-weighted', render: (m) => pct(m.abs_top, 0) },
  { key: 'bid', label: 'Bid', group: 'Cost', hint: 'latest bid (highest when a keyword has several)', render: (m) => money(m.bid) },
  { key: 'cpc', label: 'Avg. CPC', group: 'Cost', hint: 'spend ÷ clicks', render: (m) => money(m.cpc) },
  {
    key: 'spend',
    label: 'Spend',
    group: 'Cost',
    hint: 'spend; the bar shows the share of the largest line',
    render: (m, max) =>
      m.spend === 0 ? (
        dim('$0')
      ) : (
        <span className="inline-flex flex-col items-end gap-1">
          <span className="font-semibold text-spend">{formatCurrency(m.spend)}</span>
          <span aria-hidden="true" className="block h-1 w-16 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-spend/70" style={{ width: `${Math.max(4, (m.spend / (max || 1)) * 100)}%` }} />
          </span>
        </span>
      ),
  },
  { key: 'conv', label: 'Conv.', group: 'Results', hint: 'Bing conversions ("Conv."); with a goal picked, that goal only (keyword rows)', render: (m) => (m.conv === null ? dim('—') : int(m.conv)) },
  { key: 'all_conv', label: 'All conv.', group: 'Results', hint: 'Bing all conversions ("All conv."); with a goal picked, that goal only (keyword rows)', render: (m) => (m.all_conv === null ? dim('—') : int(m.all_conv)) },
  { key: 'lp_views', label: 'LP Views', group: 'Results', hint: 'partner landing page views (matched on campaign · ad group · keyword)', render: (m) => int(m.lp_views) },
  { key: 'purchases', label: 'Purch.', group: 'Results', hint: 'partner purchases', render: (m) => int(m.purchases) },
  {
    key: 'revenue',
    label: 'Revenue',
    group: 'Results',
    hint: 'partner revenue',
    render: (m) => (m.revenue === 0 ? dim('$0') : <span className="font-semibold text-revenue">{formatCurrency(m.revenue)}</span>),
  },
  {
    key: 'roas',
    label: 'ROAS',
    group: 'Results',
    hint: '(revenue − spend) ÷ spend; — when no partner event matched',
    render: (m) => (m.roas === null ? dim('—') : <span className={m.roas < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(m.roas / 100, 0)}</span>),
  },
];
const GROUP_TONE: Record<Col['group'], string> = { Delivery: 'text-azure', Cost: 'text-spend', Results: 'text-revenue' };

function MatchChip({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${MATCH_STYLE[value] ?? 'bg-surface-2 text-ink-2'}`}>
      {value}
    </span>
  );
}
const Tag = ({ children, tone = 'bg-surface-2 text-ink-2' }: { children: ReactNode; tone?: string }) => (
  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>
);

interface Props {
  rows: BingKeywordRow[];
  /** Search term report rows (bing_search_terms), already connected to keywords and the partner. */
  searchTerms?: BingSearchTermRow[];
  /** "Oct 1–16, 2026" — what each collection covers overall. */
  period: string | null;
  searchTermsPeriod?: string | null;
  caption: string;
}

export default function BingKeywordTable({ rows, searchTerms = [], period, searchTermsPeriod = null, caption }: Props) {
  // search terms come from the search term report; older data may carry them inside the keyword report
  const fromReport = useMemo(() => searchTerms.map(termToRow), [searchTerms]);
  const keywordRows = useMemo(() => rows.map(keywordToRow), [rows]);
  const termSource: Row[] = fromReport.length ? fromReport : keywordRows.filter((r) => r.search_term);
  const hasSearchTerms = termSource.length > 0;
  // open on Search Terms when the export has them, otherwise on Keywords
  const [chosenView, setView] = useState<View | null>(null);
  const view: View = chosenView ?? (hasSearchTerms ? 'search_term' : 'keyword');
  const [query, setQuery] = useState('');
  const [match, setMatch] = useState('');
  const [goal, setGoal] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'spend', desc: true });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const everything: Row[] = [...keywordRows, ...fromReport];
  const goalOptions = [...new Set(everything.flatMap((r) => r.goalNames))].sort();
  const multiBuyer = new Set(everything.map((r) => r.media_buyer ?? '')).size > 1;
  const matchesPresent = new Set(everything.map((r) => r.match_type ?? ''));
  // partner results (LP views → revenue) exist per keyword only, so the Search Terms view leaves them out
  const PARTNER_COLS: MetricKey[] = ['lp_views', 'purchases', 'revenue', 'roas'];
  const cols = COLS.filter(
    (c) => (c.key !== 'bid' || view === 'keyword' || view === 'search_term') && !(view === 'search_term' && PARTNER_COLS.includes(c.key)),
  );
  // the Conversion Name column sits next to the name in the keyword-level views (blank when empty)
  const showConversion = view === 'keyword' || view === 'search_term';

  const keep = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (r: Row) =>
      (!match || r.match_type === match) &&
      (!goal || (goal === ANY_GOAL ? r.goalNames.length > 0 : r.goalNames.includes(goal))) &&
      (!q || [r.keyword, r.search_term, r.goal, r.ad_group_name, r.campaign_name].some((v) => v?.toLowerCase().includes(q)));
  }, [query, match, goal]);
  const filtered = useMemo(() => keywordRows.filter(keep).map((r) => forGoal(r, goal)), [keywordRows, keep, goal]);
  const filteredTerms = useMemo(() => termSource.filter(keep).map((r) => forGoal(r, goal)), [termSource, keep, goal]);
  // Search Terms view → the search term rows; every other view → the keyword report
  const viewRows = view === 'search_term' ? filteredTerms : filtered;
  // keyword view: a keyword opens to show its search terms (connected on campaign · ad group · keyword)
  const termsByKeyword = useMemo(() => {
    if (!fromReport.length) return null;
    const m = new Map<string, Row[]>();
    for (const t of filteredTerms) m.set(kwKey(t), [...(m.get(kwKey(t)) ?? []), t]);
    return m;
  }, [fromReport, filteredTerms]);

  const lines = useMemo(() => {
    const list = buildLines(viewRows, view, multiBuyer, termsByKeyword);
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      if (sort.key === 'name') return dir * a.name.localeCompare(b.name);
      const av = a.m[sort.key];
      const bv = b.m[sort.key];
      if (av === null && bv === null) return b.m.spend - a.m.spend;
      if (av === null) return 1; // empty values always sink
      if (bv === null) return -1;
      return dir * (av - bv) || b.m.spend - a.m.spend;
    });
  }, [viewRows, view, multiBuyer, sort, termsByKeyword]);

  const viewTotal = useMemo(() => measure(viewRows, false), [viewRows]);
  const maxSpend = Math.max(0, ...lines.map((l) => l.m.spend));
  const pages = Math.max(1, Math.ceil(lines.length / PAGE));
  const current = Math.min(page, pages);
  const visible = lines.slice((current - 1) * PAGE, current * PAGE);
  const keywordCount = new Set((filtered.length ? filtered : filteredTerms).map((r) => kwKey(r))).size;
  const termCount = new Set(filteredTerms.map((r) => r.search_term!.trim().toLowerCase())).size;
  const allOpen = visible.length > 0 && visible.every((l) => !l.terms.length || open.has(l.key));

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));
    setPage(1);
  }
  function toggleOpen(key: string) {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const nameLabel =
    view === 'campaign' ? 'Campaign' : view === 'ad_group' ? 'Ad Group' : view === 'search_term' ? 'Search Term' : hasSearchTerms ? 'Keyword / Search Term' : 'Keyword';
  const firstCols = showConversion ? 2 : 1;
  const sortIcon = (key: SortKey) => (
    <span aria-hidden="true" className={`text-[10px] ${sort.key === key ? 'opacity-100' : 'opacity-0'}`}>
      {sort.desc ? '▼' : '▲'}
    </span>
  );
  const groups = (['Delivery', 'Cost', 'Results'] as const).map((g) => ({ g, span: cols.filter((c) => c.group === g).length }));
  const stickyCell = 'sticky left-0 z-10 bg-surface';

  return (
    <section aria-labelledby="keywords-heading" className="rounded-xl border border-line bg-surface p-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="keywords-heading" className="text-base font-bold text-ink">
            Search Terms
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {caption} ·{' '}
            {view === 'search_term'
              ? `search term report${searchTermsPeriod ? ` (${searchTermsPeriod})` : ''}`
              : `keyword report${period ? ` (${period})` : ''}`}
          </p>
        </div>
        <div role="group" aria-label="Table view" className="inline-flex rounded-lg bg-surface-2 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => resetPage(setView)(v.key)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                view === v.key ? 'bg-azure font-bold text-canvas' : 'font-medium text-ink-2 hover:text-ink'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && !hasSearchTerms ? (
        <p className="mt-6 text-sm text-ink-3">
          No search term rows for this selection. Load the export into <code>bing_keyword_reports</code> (see tools/bing/README.md).
        </p>
      ) : (
        <>
          {/* summary tiles */}
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {[
              ['Keywords', formatInteger(keywordCount), 'text-ink'],
              ['Search terms', hasSearchTerms ? formatInteger(termCount) : '—', 'text-ink'],
              ['Impressions', formatInteger(viewTotal.impressions), 'text-ink'],
              ['Clicks', formatInteger(viewTotal.clicks), 'text-ink'],
              ['Spend', formatCurrency(viewTotal.spend), 'text-spend'],
              ['Avg. CPC', viewTotal.cpc === null ? '—' : formatCurrency(viewTotal.cpc), 'text-ink'],
              [goal && goal !== ANY_GOAL && view !== 'search_term' ? goal : 'All conv.', viewTotal.all_conv === null ? '—' : formatInteger(viewTotal.all_conv), 'text-violet'],
              view === 'search_term'
                ? ['Conv.', viewTotal.conv === null ? '—' : formatInteger(viewTotal.conv), 'text-revenue']
                : ['Revenue', formatCurrency(viewTotal.revenue), 'text-revenue'],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded-lg bg-surface-2/60 px-3 py-2">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{k}</dt>
                <dd className={`mt-0.5 text-base font-bold tabular-nums ${tone}`}>{v}</dd>
              </div>
            ))}
          </dl>

          {/* controls */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Match type" className="inline-flex rounded-lg bg-surface-2 p-1">
              {MATCH_FILTERS.filter((m) => !m.key || matchesPresent.has(m.key)).map((m) => (
                <button
                  key={m.key || 'all'}
                  type="button"
                  aria-pressed={match === m.key}
                  onClick={() => resetPage(setMatch)(m.key)}
                  className={`rounded-md px-3 py-1 text-sm transition-colors ${
                    match === m.key ? 'bg-surface font-bold text-ink shadow-sm' : 'font-medium text-ink-2 hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {goalOptions.length > 0 && (
              <label className="relative">
                <span className="sr-only">Conversion goal</span>
                <select
                  value={goal}
                  onChange={(e) => resetPage(setGoal)(e.target.value)}
                  className={`appearance-none rounded-lg border bg-surface-2 py-2 pl-3 pr-9 text-sm font-medium focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue ${
                    goal ? 'border-violet text-ink' : 'border-line text-ink-2'
                  }`}
                >
                  <option value="">All conversion goals</option>
                  <option value={ANY_GOAL}>Any conversion goal</option>
                  {goalOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
            )}
            <label className="relative min-w-0 flex-1 sm:max-w-xs">
              <span className="sr-only">Search the report</span>
              <input
                type="search"
                value={query}
                onChange={(e) => resetPage(setQuery)(e.target.value)}
                placeholder="Search term, keyword, conversion…"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue"
              />
            </label>
            {view === 'keyword' && hasSearchTerms && (
              <button
                type="button"
                onClick={() => setOpen(allOpen ? new Set() : new Set(visible.filter((l) => l.terms.length).map((l) => l.key)))}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {allOpen ? 'Collapse search terms' : 'Expand search terms'}
              </button>
            )}
            <span className="ml-auto text-xs text-ink-3">
              {formatInteger(lines.length)} {VIEWS.find((v) => v.key === view)!.label.toLowerCase()}
            </span>
          </div>

          {goal && view === 'search_term' && (
            <p className="mt-3 rounded-lg bg-violet/10 px-3 py-2 text-xs text-ink-2">
              Showing search terms that converted on{' '}
              <b className="text-violet">{goal === ANY_GOAL ? 'any conversion goal' : goal}</b>: the term had conversions on a day its
              keyword recorded that goal. Bing&apos;s search term report has no goal column, so a term&apos;s Conv. / All conv. are its own
              totals; the Keywords view shows conversions per goal.
            </p>
          )}

          {/* table */}
          <div className="mt-3 max-h-[720px] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-surface">
                <tr className="text-[11px] font-semibold uppercase tracking-wide">
                  <th scope="colgroup" className={`${stickyCell} z-30 px-3 pt-2.5`} />
                  {showConversion && <th scope="colgroup" className="px-3 pt-2.5" />}
                  {groups.map(({ g, span }) => (
                    <th key={g} scope="colgroup" colSpan={span} className={`border-l border-line px-3 pt-2.5 text-center ${GROUP_TONE[g]}`}>
                      {g}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-line">
                  <th scope="col" aria-sort={sort.key === 'name' ? (sort.desc ? 'descending' : 'ascending') : undefined} className={`${stickyCell} z-30 min-w-[360px] px-3 py-2 text-left`}>
                    <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
                      {nameLabel} {sortIcon('name')}
                    </button>
                  </th>
                  {showConversion && (
                    <th scope="col" title="the report's Goal column — blank when the report has none" className="whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-ink-2">
                      Conversion Name
                    </th>
                  )}
                  {cols.map((c, i) => (
                    <th
                      key={c.key}
                      scope="col"
                      title={c.hint}
                      aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                      className={`whitespace-nowrap px-3 py-2 text-right ${i === 0 || cols[i - 1]!.group !== c.group ? 'border-l border-line' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 text-sm font-semibold hover:text-ink ${sort.key === c.key ? 'text-ink' : 'text-ink-2'}`}
                      >
                        {c.label} {sortIcon(c.key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visible.map((line) => {
                  const expandable = line.terms.length > 0;
                  const isOpen = open.has(line.key);
                  return (
                    <Fragment key={line.key}>
                      <tr className={`group border-t border-line ${line.m.revenue > 0 ? 'bg-revenue/5' : ''} hover:bg-surface-2/50`}>
                        <th scope="row" className={`${stickyCell} px-3 py-2.5 text-left font-normal group-hover:bg-surface-2`}>
                          <div className="flex items-start gap-2">
                            {view === 'keyword' && hasSearchTerms && (
                              <button
                                type="button"
                                onClick={() => expandable && toggleOpen(line.key)}
                                disabled={!expandable}
                                aria-expanded={expandable ? isOpen : undefined}
                                aria-label={expandable ? `${isOpen ? 'Hide' : 'Show'} search terms for ${line.name}` : undefined}
                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-line hover:text-ink disabled:invisible"
                              >
                                <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                                  <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-ink">{line.name}</span>
                                <MatchChip value={line.matchType} />
                                {line.closeVariant && <Tag>close variant</Tag>}
                                {line.excluded && <Tag tone="bg-loss/15 text-loss">excluded</Tag>}
                                {line.buyers.map((b) => (
                                  <Tag key={b}>{b}</Tag>
                                ))}
                                {expandable && <span className="whitespace-nowrap text-[11px] text-ink-3">{line.terms.length} terms</span>}
                              </div>
                              <div className="mt-0.5 max-w-[420px] truncate text-xs text-ink-3" title={line.context}>
                                {line.keyword && (
                                  <>
                                    Keyword: <span className="text-ink-2">{line.keyword}</span> ·{' '}
                                  </>
                                )}
                                {line.context}
                              </div>
                            </div>
                          </div>
                        </th>
                        {showConversion && (
                          <td className="px-3 py-2.5 text-left">
                            <span className="flex max-w-[260px] flex-wrap gap-1">
                              {line.goals.map((g) =>
                                typeof g === 'string' ? (
                                  <Tag key={g} tone="bg-violet/15 text-violet">
                                    {g}
                                  </Tag>
                                ) : (
                                  <Tag key={g.name} tone="bg-violet/15 text-violet">
                                    {g.name} <span className="tabular-nums opacity-80">· {formatInteger(g.all_conversions)}</span>
                                  </Tag>
                                ),
                              )}
                            </span>
                          </td>
                        )}
                        {cols.map((c, i) => (
                          <td
                            key={c.key}
                            className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink ${i === 0 || cols[i - 1]!.group !== c.group ? 'border-l border-line/60' : ''}`}
                          >
                            {c.render(line.m, maxSpend)}
                          </td>
                        ))}
                      </tr>

                      {isOpen &&
                        line.terms.map((t) => (
                          <tr key={t.key} className="border-t border-line/40 bg-surface-2/30 text-[13px]">
                            <th scope="row" className={`${stickyCell} bg-surface-2/30 py-2 pl-12 pr-3 text-left font-normal`}>
                              <span className="flex flex-wrap items-center gap-1.5 text-ink-2">
                                <span className="text-ink-3">↳</span> {t.term}
                              </span>
                            </th>
                            {showConversion && <td className="max-w-[220px] truncate px-3 py-2 text-left text-ink-3" title={t.goal ?? ''}>{t.goal ?? ''}</td>}
                            {cols.map((c, i) => (
                              <td
                                key={c.key}
                                className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-2 ${i === 0 || cols[i - 1]!.group !== c.group ? 'border-l border-line/60' : ''}`}
                              >
                                {c.key === 'spend' ? money(t.m.spend) : c.render(t.m, maxSpend)}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={cols.length + firstCols} className="px-3 py-8 text-center text-sm text-ink-3">
                      {view === 'search_term' && !hasSearchTerms ? (
                        <span className="mx-auto block max-w-xl leading-relaxed">
                          <span className="block font-semibold text-ink-2">This export has no search terms yet</span>
                          The loaded report has no <b>Search term</b> column, so only keywords are available (see the Keywords tab).
                          Export Bing&apos;s <b>Search term</b> report (or add the “Search term” column to the keyword export), run{' '}
                          <code>build_keywords.py</code> and import it — this view fills in automatically.
                        </span>
                      ) : query ? (
                        <>Nothing matches “{query}”.</>
                      ) : (
                        'No rows for this filter.'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>

              {lines.length > 0 && (
                <tfoot className="sticky bottom-0 z-20 bg-surface">
                  <tr className="border-t-2 border-line font-bold">
                    <th scope="row" className={`${stickyCell} px-3 py-2.5 text-left text-ink`}>
                      Total <span className="text-xs font-medium text-ink-3">· {formatInteger(lines.length)} lines</span>
                    </th>
                    {showConversion && <td />}
                    {cols.map((c, i) => (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink ${i === 0 || cols[i - 1]!.group !== c.group ? 'border-l border-line/60' : ''}`}
                      >
                        {c.key === 'spend' ? money(viewTotal.spend) : c.key === 'bid' ? '' : c.render(viewTotal, maxSpend)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* pager */}
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
              <span>
                {formatInteger((current - 1) * PAGE + 1)}–{formatInteger(Math.min(current * PAGE, lines.length))} of {formatInteger(lines.length)}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(current - 1)}
                  disabled={current === 1}
                  className="rounded-md px-3 py-1.5 font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="px-2 tabular-nums text-ink-2">
                  {current} / {pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(current + 1)}
                  disabled={current === pages}
                  className="rounded-md px-3 py-1.5 font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                >
                  Next →
                </button>
              </span>
            </nav>
          )}

          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Hover a header for its definition. Rates are recalculated for every line, not averaged. Conversion Name lists the keyword
            report&apos;s conversion goals (with All conv. per goal), blank when there are none. A search term shows a goal only when the
            term itself converted that day. Partner results (LP views, purchases, revenue, ROAS) are per keyword, so they are in the
            Keywords / Ad Groups / Campaigns views (matched on campaign · ad group · keyword), not on search terms. The offer filter does
            not apply here and this spend is not added to the tiles above, which come from the ad report.
          </p>
        </>
      )}
    </section>
  );
}
