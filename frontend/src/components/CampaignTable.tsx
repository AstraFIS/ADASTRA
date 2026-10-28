import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import type { CampaignAdRow, CampaignAdSetRow, CampaignMetrics, CampaignRow, FbCampaignsResult } from '@/types/fbCampaigns';

type SortDir = 'asc' | 'desc';
type Load =
  | { kind: 'loading'; previous: FbCampaignsResult | null }
  | { kind: 'ok'; data: FbCampaignsResult }
  | { kind: 'error'; message: string };

interface Column {
  key: string;
  label: string;
  title: string;
  value: (m: CampaignMetrics) => number | null;
  render: (m: CampaignMetrics) => ReactNode;
  /** Partner numbers: marked ≈ when they were shared out over several rows. */
  partner?: boolean;
  defaultDir: SortDir;
}

const money = (v: number | null) => (v === null ? '—' : formatCurrency(v));
const count = (k: keyof CampaignMetrics, label: string, title: string): Column => ({
  key: k,
  label,
  title,
  value: (m) => m[k] as number,
  render: (m) => formatInteger(m[k] as number),
  partner: true,
  defaultDir: 'desc',
});

const COLUMNS: Column[] = [
  { key: 'total_spend_usd', label: 'Amount Spent', title: 'Spend + provider fee', value: (m) => m.total_spend_usd, render: (m) => formatCurrency(m.total_spend_usd), defaultDir: 'desc' },
  { key: 'impressions', label: 'Impr.', title: 'Impressions', value: (m) => m.impressions, render: (m) => formatInteger(m.impressions), defaultDir: 'desc' },
  { key: 'link_clicks', label: 'Link Clicks', title: 'Link clicks', value: (m) => m.link_clicks, render: (m) => formatInteger(m.link_clicks), defaultDir: 'desc' },
  { key: 'ctr_all', label: 'CTR', title: 'Clicks (all) ÷ impressions', value: (m) => m.ctr_all, render: (m) => (m.ctr_all === null ? '—' : formatPercent(m.ctr_all / 100, 2)), defaultDir: 'desc' },
  { key: 'cpc_usd', label: 'CPC', title: 'Spend ÷ clicks (all)', value: (m) => m.cpc_usd, render: (m) => money(m.cpc_usd), defaultDir: 'asc' },
  { key: 'landing_page_views', label: 'LP Views', title: 'Landing page views (Facebook)', value: (m) => m.landing_page_views, render: (m) => formatInteger(m.landing_page_views), defaultDir: 'desc' },
  count('first_page_views', 'First Page', 'First page views (partner)'),
  count('questionnaire_starts', 'Q.S.', 'Questionnaire starts (partner)'),
  count('questionnaire_completed', 'Q.C.', 'Questionnaire completed (partner)'),
  count('add_to_carts', 'ATC', 'Add to cart (partner)'),
  count('purchase_events', 'Purchase', 'Purchases (partner)'),
  { key: 'revenue_usd', label: 'Revenue', title: 'Revenue (partner)', value: (m) => m.revenue_usd, render: (m) => formatCurrency(m.revenue_usd), partner: true, defaultDir: 'desc' },
  {
    key: 'net_profit_usd',
    label: 'Net Profit',
    title: 'Revenue − amount spent',
    value: (m) => m.net_profit_usd,
    render: (m) => <span className={m.net_profit_usd < 0 ? 'text-loss' : 'text-revenue'}>{formatCurrency(m.net_profit_usd)}</span>,
    defaultDir: 'desc',
  },
  {
    key: 'roas_pct',
    label: 'ROAS',
    title: 'Net profit ÷ amount spent',
    value: (m) => m.roas_pct,
    render: (m) => (m.roas_pct === null ? '—' : <span className={m.roas_pct < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(m.roas_pct / 100, 1)}</span>),
    defaultDir: 'desc',
  },
  { key: 'cac_usd', label: 'CAC', title: 'Amount spent ÷ conversions', value: (m) => m.cac_usd, render: (m) => money(m.cac_usd), defaultDir: 'asc' },
];

function sorter<T extends CampaignMetrics>(column: Column, dir: SortDir) {
  return (a: T, b: T) => {
    const x = column.value(a);
    const y = column.value(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return dir === 'asc' ? x - y : y - x;
  };
}

function Offers({ offers }: { offers: string[] }) {
  if (offers.length === 0) return <span className="text-ink-3">—</span>;
  return (
    <span className="flex max-w-[260px] flex-wrap gap-1">
      {offers.map((o) => (
        <span key={o} title={o} className="max-w-[260px] truncate rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
          {o}
        </span>
      ))}
    </span>
  );
}

/** One marker per row: partner numbers on this row are a share (see the note under the table). */
function Est({ m }: { m: CampaignMetrics }) {
  return m.estimated ? (
    <span
      className="ml-1.5 rounded bg-spend/15 px-1 text-[10px] font-semibold text-spend"
      title="Partner results (funnel, purchases, revenue) on this row are an estimated share"
    >
      ≈ est.
    </span>
  ) : null;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-block w-3 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}>
      ▶
    </span>
  );
}

interface Props {
  /** Same query string as the other Facebook endpoints (range / from / to / ad / offer / group). */
  query: string;
  reloadKey?: number;
}

/**
 * "By campaign" view: campaign → ad set → ad, each with spend, delivery, the partner funnel and
 * revenue, plus the offer names. Ads can be hidden; campaigns and ad sets fold open and shut.
 */
export default function CampaignTable({ query, reloadKey = 0 }: Props) {
  const [state, setState] = useState<Load>({ kind: 'loading', previous: null });
  const [showAds, setShowAds] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: 'total_spend_usd', dir: 'desc' });
  const [params] = useSearchParams();
  const range = params.get('range');

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ kind: 'loading', previous: s.kind === 'ok' ? s.data : s.kind === 'loading' ? s.previous : null }));
    api
      .get<FbCampaignsResult>(`/platforms/facebook/campaigns?${query}`)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  const data = state.kind === 'ok' ? state.data : state.kind === 'loading' ? state.previous : null;
  const busy = state.kind === 'loading';

  const rows = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0]!;
    const q = search.trim().toLowerCase();
    const hit = (s: string) => s.toLowerCase().includes(q);
    const out: CampaignRow[] = [];
    for (const c of data?.campaigns ?? []) {
      const campaignHit = !q || hit(c.campaign_name) || c.offers.some(hit);
      const adSets: CampaignAdSetRow[] = [];
      for (const s of c.ad_sets) {
        const setHit = campaignHit || hit(s.ad_set_name);
        const ads = setHit ? s.ads : s.ads.filter((a) => hit(a.ad_name) || hit(a.offer_name));
        if (setHit || ads.length) adSets.push({ ...s, ads: [...ads].sort(sorter<CampaignAdRow>(column, sort.dir)) });
      }
      if (campaignHit || adSets.length) out.push({ ...c, ad_sets: adSets.sort(sorter<CampaignAdSetRow>(column, sort.dir)) });
    }
    // the partner-only "(no campaign)" line stays last
    return out.sort(
      (a, b) =>
        Number(a.campaign_name === '(no campaign)') - Number(b.campaign_name === '(no campaign)') ||
        sorter<CampaignRow>(column, sort.dir)(a, b),
    );
  }, [data, search, sort]);

  const totals = useMemo(() => {
    const t = { total_spend_usd: 0, impressions: 0, link_clicks: 0, revenue_usd: 0, purchase_events: 0, conversions: 0 };
    for (const c of data?.campaigns ?? []) {
      t.total_spend_usd += c.total_spend_usd;
      t.impressions += c.impressions;
      t.link_clicks += c.link_clicks;
      t.revenue_usd += c.revenue_usd;
      t.purchase_events += c.purchase_events;
      t.conversions += c.conversions;
    }
    return t;
  }, [data]);

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const collapseAll = () => setCollapsed(new Set(rows.map((c) => c.campaign_name)));
  const expandAll = () => setCollapsed(new Set());

  function toggleSort(column: Column) {
    setSort((cur) =>
      cur.key === column.key ? { key: column.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: column.key, dir: column.defaultDir },
    );
  }

  const cells = (m: CampaignMetrics) =>
    COLUMNS.map((col) => (
      <td key={col.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {col.render(m)}
      </td>
    ));

  const adHref = (adName: string) =>
    `/platforms/facebook/ads/${encodeURIComponent(adName)}${range ? `?range=${range}` : ''}`;

  return (
    <div className={`transition-opacity ${busy ? 'opacity-70' : ''}`} aria-busy={busy}>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaign, ad set, ad or offer…"
          className="w-72 max-w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-ink placeholder:text-ink-3"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-ink-2">
          <input
            type="checkbox"
            checked={showAds}
            onChange={(e) => setShowAds(e.target.checked)}
            className="h-4 w-4 rounded border-line bg-surface-2 accent-[var(--color-revenue)]"
          />
          Show ad names
        </label>
        <span className="flex gap-2">
          <button type="button" onClick={expandAll} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:text-ink">
            Expand all
          </button>
          <button type="button" onClick={collapseAll} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:text-ink">
            Collapse all
          </button>
        </span>
        {data && (
          <span className="text-xs text-ink-3">
            {data.meta.campaigns} campaigns · {data.meta.ad_sets} ad sets · {data.meta.ads} ads
          </span>
        )}
      </div>

      {state.kind === 'error' && <p className="mt-6 text-sm text-loss">Campaign data unavailable: {state.message}</p>}

      {state.kind !== 'error' && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[1500px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-xs">
                <th scope="col" className="sticky left-0 z-10 min-w-[300px] bg-surface px-3 py-3 text-left font-semibold text-ink-2">
                  Campaign / Ad set / Ad
                </th>
                <th scope="col" className="px-3 py-3 text-left font-semibold text-ink-2">
                  Offer
                </th>
                {COLUMNS.map((col) => {
                  const active = sort.key === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      title={col.title}
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="whitespace-nowrap px-3 py-3 text-right font-semibold"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={`inline-flex items-center gap-1 ${active ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
                      >
                        {col.label}
                        {active && <span aria-hidden="true">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-4 py-10 text-center text-ink-3">
                    Loading campaigns…
                  </td>
                </tr>
              )}
              {data && rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-4 py-10 text-center text-ink-3">
                    {data.campaigns.length === 0 ? 'No report rows in the database for this selection yet.' : 'Nothing matches the search.'}
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const open = !collapsed.has(c.campaign_name) || search.trim() !== '';
                return (
                  <Fragment key={c.campaign_name}>
                    <tr className="border-t-2 border-line bg-surface-2/50 font-semibold text-ink">
                      <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 text-left">
                        <button type="button" onClick={() => toggle(c.campaign_name)} aria-expanded={open} className="flex items-start gap-2 text-left">
                          <Chevron open={open} />
                          <span>
                            {c.campaign_name}
                            <span className="ml-2 text-[11px] font-normal text-ink-3">
                              {c.ad_sets.length} ad set{c.ad_sets.length === 1 ? '' : 's'}
                              {c.providers.length > 0 && ` · ${c.providers.join(', ')}`}
                            </span>
                            <Est m={c} />
                          </span>
                        </button>
                      </th>
                      <td className="px-3 py-2.5">
                        <Offers offers={c.offers} />
                      </td>
                      {cells(c)}
                    </tr>
                    {open &&
                      c.ad_sets.map((s) => {
                        const setKey = `${c.campaign_name}\u0000${s.ad_set_name}`;
                        const setOpen = showAds && !collapsed.has(setKey);
                        return (
                          <Fragment key={setKey}>
                            <tr className="border-t border-line text-ink hover:bg-surface-2/30">
                              <th scope="row" className="sticky left-0 z-10 bg-surface py-2.5 pl-8 pr-3 text-left font-medium">
                                <button
                                  type="button"
                                  onClick={() => showAds && toggle(setKey)}
                                  aria-expanded={setOpen}
                                  disabled={!showAds}
                                  className="flex items-start gap-2 text-left disabled:cursor-default"
                                >
                                  {showAds ? <Chevron open={setOpen} /> : <span className="w-3" />}
                                  <span>
                                    {s.ad_set_name}
                                    <span className="ml-2 text-[11px] font-normal text-ink-3">
                                      {s.ads.length} ad{s.ads.length === 1 ? '' : 's'}
                                    </span>
                                    <Est m={s} />
                                  </span>
                                </button>
                              </th>
                              <td className="px-3 py-2.5">
                                <Offers offers={s.offers} />
                              </td>
                              {cells(s)}
                            </tr>
                            {setOpen &&
                              s.ads.map((a) => (
                                <tr key={`${setKey}\u0000${a.ad_name}\u0000${a.offer_name}`} className="border-t border-line/60 text-ink-2 hover:bg-surface-2/30">
                                  <th scope="row" className="sticky left-0 z-10 bg-surface py-2 pl-16 pr-3 text-left font-normal">
                                    {a.ad_name === '(no ad name)' ? (
                                      <span className="italic text-ink-3">{a.ad_name}</span>
                                    ) : (
                                      <Link
                                        to={adHref(a.ad_name)}
                                        className="text-ink underline decoration-ink-3 decoration-dotted underline-offset-4 hover:decoration-revenue"
                                      >
                                        {a.ad_name}
                                      </Link>
                                    )}
                                    <Est m={a} />
                                  </th>
                                  <td className="px-3 py-2">
                                    <Offers offers={[a.offer_name]} />
                                  </td>
                                  {cells(a)}
                                </tr>
                              ))}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
            {data && data.campaigns.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line-strong font-bold text-ink">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-3 text-left">
                    Total
                  </th>
                  <td />
                  <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(totals.total_spend_usd)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(totals.impressions)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(totals.link_clicks)}</td>
                  <td colSpan={7} />
                  <td className="px-3 py-3 text-right tabular-nums">{formatInteger(totals.purchase_events)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(totals.revenue_usd)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className={totals.revenue_usd - totals.total_spend_usd < 0 ? 'text-loss' : 'text-revenue'}>
                      {formatCurrency(totals.revenue_usd - totals.total_spend_usd)}
                    </span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {data && data.meta.estimated_ads > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          <b className="text-spend">≈ est.</b> The partner only reports day + ad name. When an ad ran in more than one ad set on a day, its partner results
          (funnel, purchases, revenue) are shared out by link-click share, so those rows are estimates. Totals are exact.
        </p>
      )}
    </div>
  );
}
