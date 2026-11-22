import { AdTaxonomy } from '../models/adTaxonomy.model.js';
import { isoDay } from '../utils/dateRange.js';
import {
  dateMatch,
  describeRange,
  NO_AD_NAME,
  num,
  reportAggregate,
  reportBaseMatch,
  resolveReportBounds,
  TOTAL_SPEND,
  type FbStatisticsQuery,
} from './fbStatistics.service.js';

/**
 * Creative insights: what to scale, relaunch, test or cut, and why.
 *
 * Everything is computed on request from the blended report rows (facebook_ad_reports +
 * facebook_conversions, provider fees from facebook_providers), so a new upload shows up
 * on the next request. Partner events join Meta rows by exact ad name and day.
 *
 * Purchases are only tracked for the ED offers (DirectMax and MEDVi). Break-even cost per
 * purchase is the average partner revenue per ED purchase in the selected period; every
 * threshold below scales with it.
 */

export const ED_PRODUCTS = ['DirectMax (ED)', 'MEDVi QUAD (ED)'] as const;
export const PRODUCTS = ['DirectMax (ED)', 'MEDVi QUAD (ED)', 'GLP-1 (DirectMeds)', 'TrimRX GLP-1'] as const;
export type Product = (typeof PRODUCTS)[number];
const FALLBACK_BREAK_EVEN = 240;

export type Verdict =
  | 'Scale'
  | 'Keep & watch'
  | 'Over break-even'
  | 'Promising'
  | 'Still testing'
  | 'Near cut'
  | 'Cut'
  | 'No purchase data yet';

export type NewDecision = 'Scale' | 'Turn back on' | 'Keep' | 'Watch' | 'Too early' | 'Not spending' | 'Cut' | 'No tracking';

export interface InsightCreative {
  ad: string;
  product: Product;
  verdict: Verdict;
  cost: number;
  purchases: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
  add_to_carts: number;
  cost_per_atc: number | null;
  quiz_start_rate: number | null;
  ctr: number | null;
  cpm: number | null;
  impressions: number;
  link_clicks: number;
  first_views: number;
  days_live: number;
  first_day: string;
  last_day: string;
  live_last7: boolean;
  days_with_purchase: number;
  purchase_day_rate: number;
  spend_to_first_purchase: number | null;
  cost_last7: number;
  purchases_last7: number;
  accounts: string[];
  campaigns: number;
  format: string | null;
  hook_type: string | null;
  angle: string | null;
  offer_type: string | null;
  cta: string | null;
  /** Same name with other capital letters that ran earlier (likely the same creative relaunched). */
  earlier_name: string | null;
  /** Set for creatives whose first day is in the last 7 days of the period. */
  new_decision: NewDecision | null;
  new_why: string | null;
}

export interface InsightRow {
  label: string;
  ads: number;
  cost: number;
  purchases: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
  add_to_carts: number;
  cost_per_atc: number | null;
  impressions: number;
  link_clicks: number;
  ctr: number | null;
  cpm: number | null;
  quiz_start_rate: number | null;
}

export interface FbInsightsResult {
  range: ReturnType<typeof describeRange>;
  /** Last day with data in the selection (YYYY-MM-DD) and the first day of its 7-day window. */
  data_through: string | null;
  last7_from: string | null;
  break_even_cpa: number;
  break_even_is_fallback: boolean;
  totals: InsightRow & { break_even_cpa: number };
  last7: { cost: number; purchases: number; cpa: number | null; revenue: number };
  products: InsightRow[];
  funnel: { step: string; count: number; rate_from_prev: number | null; cost_per: number | null }[];
  weekly: { week: string; cost: number; revenue: number; purchases: number; add_to_carts: number; cpa: number | null; roas: number | null }[];
  creatives: InsightCreative[];
  traits: (InsightRow & { dimension: string })[];
  spend_levels: { bucket: string; ads: number; ads_with_sale: number; cost: number; purchases: number; purchases_per_1k: number | null }[];
  ad_age: { stage: string; cost: number; purchases: number; add_to_carts: number; cpa: number | null; ctr: number | null }[];
  segments: (InsightRow & { level: 'campaign' | 'adset'; product: string })[];
  audience: { age: string; gender: string; cost: number; share: number; ctr: number | null; cost_per_lpv: number | null }[];
  devices: { device: string; first_views: number; quiz_starts: number; add_to_carts: number; purchases: number; quiz_start_rate: number | null; purchases_per_1k_views: number | null }[];
  regions: { region: string; first_views: number; add_to_carts: number; purchases: number; purchases_per_1k_views: number | null }[];
  indicators: {
    ed_ads: number;
    ads_with_purchase: number;
    ads_under_break_even_spend: number;
    spend_under_break_even: number;
    median_spend_to_first_purchase: number | null;
    p90_spend_to_first_purchase: number | null;
    corr_ctr: number | null;
    corr_quiz_start: number | null;
    corr_atc: number | null;
    corr_ads: number;
  };
  unmatched: { ad_name: string; purchases: number; add_to_carts: number; revenue: number }[];
}

// ---------------------------------------------------------------------------

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const div = (a: number, b: number) => (b ? a / b : null);
const pct = (a: number, b: number) => (b ? r1((a / b) * 100) : null);
const money = (a: number, b: number) => (b ? r2(a / b) : null);
const DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-19" → "19 Nov" */
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export function productOf(offer: string, ad: string): Product {
  const o = offer ?? '';
  const a = (ad ?? '').toLowerCase();
  if (/glp/i.test(o) && !/trimrx/i.test(a)) return 'GLP-1 (DirectMeds)';
  if (a.includes('trimrx') || o === '(unknown offer)') return 'TrimRX GLP-1';
  if (a.includes('glp')) return 'GLP-1 (DirectMeds)';
  if (/quad|medvi/i.test(o) || a.includes('medvi')) return 'MEDVi QUAD (ED)';
  return 'DirectMax (ED)';
}
const isEd = (p: string) => (ED_PRODUCTS as readonly string[]).includes(p);

interface Totals {
  cost: number;
  im: number;
  lc: number;
  lpv: number;
  fpv: number;
  qs: number;
  qc: number;
  atc: number;
  pur: number;
  rev: number;
}
const zero = (): Totals => ({ cost: 0, im: 0, lc: 0, lpv: 0, fpv: 0, qs: 0, qc: 0, atc: 0, pur: 0, rev: 0 });
function add(t: Totals, s: Partial<Totals>, w = 1) {
  for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += (s[k] ?? 0) * w;
}
function row(label: string, t: Totals, ads: number): InsightRow {
  return {
    label,
    ads,
    cost: r2(t.cost),
    purchases: r2(t.pur),
    revenue: r2(t.rev),
    cpa: money(t.cost, t.pur),
    roas: t.cost ? r2(t.rev / t.cost) : null,
    add_to_carts: r2(t.atc),
    cost_per_atc: money(t.cost, t.atc),
    impressions: t.im,
    link_clicks: t.lc,
    ctr: t.im ? r2((t.lc / t.im) * 100) : null,
    cpm: t.im ? r2((t.cost / t.im) * 1000) : null,
    quiz_start_rate: pct(t.qs, t.fpv),
  };
}
function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return r2(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo));
}
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}
function spearman(a: number[], b: number[]): number | null {
  if (a.length < 8) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i]! - ma) * (rb[i]! - mb);
    va += (ra[i]! - ma) ** 2;
    vb += (rb[i]! - mb) ** 2;
  }
  return va && vb ? r2(cov / Math.sqrt(va * vb)) : null;
}

export interface GroupDoc {
  _id: { ad: string; d: Date | null; c: string | null; s: string | null; acc: string | null; o: string | null; src: string | null };
  cost: number;
  im: number;
  lc: number;
  lpv: number;
  fpv: number;
  qs: number;
  qc: number;
  atc: number;
  pur: number;
  rev: number;
}

const tv = (t: Record<string, { value?: unknown } | undefined> | undefined, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = t?.[k]?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

export async function getFbInsights(query: FbStatisticsQuery): Promise<FbInsightsResult> {
  const bounds = await resolveReportBounds(query);
  const match = { ...reportBaseMatch(query), ...dateMatch(bounds) };
  const sum = (f: string) => ({ $sum: num(f) });

  const [groups, audienceDocs, deviceDocs, regionDocs, taxDocs] = await Promise.all([
    reportAggregate<GroupDoc>([
      { $match: match },
      {
        $group: {
          _id: {
            ad: '$ad_name',
            d: '$report_date',
            c: '$campaign_name',
            s: '$ad_set_name',
            acc: '$account_name',
            o: '$offer_name',
            src: '$_source',
          },
          cost: { $sum: TOTAL_SPEND },
          im: sum('impressions'),
          lc: sum('link_clicks'),
          lpv: sum('landing_page_views'),
          fpv: sum('first_page_views'),
          qs: sum('questionnaire_starts'),
          qc: sum('questionnaire_completed'),
          atc: sum('add_to_carts'),
          pur: sum('purchase_events'),
          rev: sum('revenue_usd'),
        },
      },
    ]),
    reportAggregate<{ _id: { age: string | null; g: string | null }; cost: number; im: number; lc: number; lpv: number }>([
      { $match: { ...match, _source: { $ne: 'partner' } } },
      {
        $group: {
          _id: { age: '$age', g: '$gender' },
          cost: { $sum: TOTAL_SPEND },
          im: sum('impressions'),
          lc: sum('link_clicks'),
          lpv: sum('landing_page_views'),
        },
      },
    ]),
    reportAggregate<{ _id: string | null; fpv: number; qs: number; atc: number; pur: number }>([
      { $match: { ...match, _source: 'partner' } },
      { $group: { _id: '$device', fpv: sum('first_page_views'), qs: sum('questionnaire_starts'), atc: sum('add_to_carts'), pur: sum('purchase_events') } },
    ]),
    reportAggregate<{ _id: string | null; fpv: number; atc: number; pur: number }>([
      { $match: { ...match, _source: 'partner' } },
      { $group: { _id: '$region', fpv: sum('first_page_views'), atc: sum('add_to_carts'), pur: sum('purchase_events') } },
    ]),
    AdTaxonomy.find({}, { ad_name: 1, intention_message: 1, physical_execution: 1 }).lean(),
  ]);

  return computeInsights({ groups, audienceDocs, deviceDocs, regionDocs, taxDocs }, describeRange(query, bounds));
}

type AudienceDoc = { _id: { age: string | null; g: string | null }; cost: number; im: number; lc: number; lpv: number };
type DeviceDoc = { _id: string | null; fpv: number; qs: number; atc: number; pur: number };
type RegionDoc = { _id: string | null; fpv: number; atc: number; pur: number };
type TaxDoc = { ad_name: string; intention_message?: unknown; physical_execution?: unknown };
export interface InsightsInput {
  groups: GroupDoc[];
  audienceDocs: AudienceDoc[];
  deviceDocs: DeviceDoc[];
  regionDocs: RegionDoc[];
  taxDocs: TaxDoc[];
}

/** The whole analysis from the grouped rows (no database access, so it can be tested). */
export function computeInsights(input: InsightsInput, range: FbInsightsResult['range']): FbInsightsResult {
  const { groups, audienceDocs, deviceDocs, regionDocs, taxDocs } = input;
  // ---- per ad, per ad-day, per ad-day-placement
  interface AdAcc {
    t: Totals;
    days: Map<string, Totals>;
    accounts: Set<string>;
    campaigns: Set<string>;
    productCost: Map<Product, number>;
    offer: string;
    hasMeta: boolean;
  }
  const ads = new Map<string, AdAcc>();
  const getAd = (name: string) => {
    let a = ads.get(name);
    if (!a) {
      a = { t: zero(), days: new Map(), accounts: new Set(), campaigns: new Set(), productCost: new Map(), offer: '', hasMeta: false };
      ads.set(name, a);
    }
    return a;
  };
  // (ad|day) → Meta placements that spent, for splitting partner results across campaigns / ad sets
  type Placement = { ad: string; c: string; s: string; product: Product; cost: number };
  const placements = new Map<string, Placement[]>();
  // each ad's biggest placement over the period, for partner results on days it didn't spend
  const mainPlacement = new Map<string, Map<string, Placement>>();
  const partner: { ad: string; day: string; t: Totals }[] = [];
  let lastDay = '';

  for (const g of groups) {
    const ad = String(g._id.ad ?? NO_AD_NAME);
    if (ad === NO_AD_NAME || !(g._id.d instanceof Date)) continue;
    const day = isoDay(g._id.d);
    const t: Totals = { cost: g.cost, im: g.im, lc: g.lc, lpv: g.lpv, fpv: g.fpv, qs: g.qs, qc: g.qc, atc: g.atc, pur: g.pur, rev: g.rev };
    const a = getAd(ad);
    if (g._id.src === 'partner') {
      partner.push({ ad, day, t });
      if (!a.offer && g._id.o) a.offer = g._id.o;
      continue;
    }
    if (day > lastDay) lastDay = day;
    a.hasMeta = true;
    const product = productOf(g._id.o ?? '', ad);
    a.productCost.set(product, (a.productCost.get(product) ?? 0) + g.cost + 1e-9);
    if (g._id.acc) a.accounts.add(g._id.acc);
    const c = g._id.c ?? '(no campaign)';
    const s = g._id.s ?? '(no ad set)';
    a.campaigns.add(c);
    add(a.t, t);
    const dt = a.days.get(day) ?? zero();
    add(dt, t);
    a.days.set(day, dt);
    const key = `${ad}\u0000${day}`;
    const list = placements.get(key) ?? [];
    list.push({ ad, c, s, product, cost: g.cost });
    placements.set(key, list);
    const per = mainPlacement.get(ad) ?? new Map<string, Placement>();
    const pk = `${c}\u0000${s}\u0000${product}`;
    const prev = per.get(pk);
    per.set(pk, { ad, c, s, product, cost: (prev?.cost ?? 0) + g.cost });
    mainPlacement.set(ad, per);
  }

  const productOfAd = (name: string, a: AdAcc): Product => {
    let best: Product | null = null;
    let bestCost = -1;
    for (const [p, c] of a.productCost) if (c > bestCost) [best, bestCost] = [p, c];
    return best ?? productOf(a.offer, name);
  };

  // ---- segments (campaign / ad set), with partner results split by that day's spend share
  const segs = new Map<string, { level: 'campaign' | 'adset'; name: string; product: Product; t: Totals; ads: Set<string> }>();
  const seg = (level: 'campaign' | 'adset', name: string, product: Product) => {
    const k = `${level}|${name}|${product}`;
    let s = segs.get(k);
    if (!s) segs.set(k, (s = { level, name, product, t: zero(), ads: new Set() }));
    return s;
  };
  for (const list of placements.values()) {
    for (const p of list) {
      const ad = p.ad;
      const share: Partial<Totals> = { cost: p.cost };
      for (const level of ['campaign', 'adset'] as const) {
        const s = seg(level, level === 'campaign' ? p.c : `${p.c} › ${p.s}`, p.product);
        add(s.t, share);
        s.ads.add(ad);
      }
    }
  }
  // Meta delivery per placement (impressions, clicks) is needed for CTR: one more pass over groups
  for (const g of groups) {
    if (g._id.src === 'partner' || !(g._id.d instanceof Date)) continue;
    const ad = String(g._id.ad ?? '');
    if (!ad || ad === NO_AD_NAME) continue;
    const product = productOf(g._id.o ?? '', ad);
    const c = g._id.c ?? '(no campaign)';
    const s = g._id.s ?? '(no ad set)';
    for (const level of ['campaign', 'adset'] as const) {
      add(seg(level, level === 'campaign' ? c : `${c} › ${s}`, product).t, { im: g.im, lc: g.lc, lpv: g.lpv });
    }
  }

  const unmatched = new Map<string, Totals>();
  for (const p of partner) {
    const a = ads.get(p.ad)!;
    if (!a.hasMeta) {
      const u = unmatched.get(p.ad) ?? zero();
      add(u, p.t);
      unmatched.set(p.ad, u);
      continue;
    }
    add(a.t, p.t);
    const dt = a.days.get(p.day) ?? zero();
    add(dt, p.t);
    a.days.set(p.day, dt);
    const conv: Partial<Totals> = { fpv: p.t.fpv, qs: p.t.qs, qc: p.t.qc, atc: p.t.atc, pur: p.t.pur, rev: p.t.rev };
    let list = placements.get(`${p.ad}\u0000${p.day}`);
    if (!list || !list.length) {
      // no spend that day: credit the ad's biggest placement over the period
      let best: Placement | null = null;
      for (const x of mainPlacement.get(p.ad)?.values() ?? []) if (!best || x.cost > best.cost) best = x;
      list = best ? [{ ...best, cost: 1 }] : [];
    }
    const tot = list.reduce((s, x) => s + x.cost, 0);
    for (const x of list) {
      const w = tot ? x.cost / tot : 1 / list.length;
      add(seg('campaign', x.c, x.product).t, conv, w);
      add(seg('adset', `${x.c} › ${x.s}`, x.product).t, conv, w);
    }
  }

  // ---- break-even = average revenue per ED purchase
  const productTotals = new Map<Product, { t: Totals; ads: number }>();
  for (const [name, a] of ads) {
    if (!a.hasMeta) continue;
    const p = productOfAd(name, a);
    const pt = productTotals.get(p) ?? { t: zero(), ads: 0 };
    add(pt.t, a.t);
    pt.ads++;
    productTotals.set(p, pt);
  }
  const ed = zero();
  let edAds = 0;
  for (const p of ED_PRODUCTS) {
    const pt = productTotals.get(p);
    if (pt) {
      add(ed, pt.t);
      edAds += pt.ads;
    }
  }
  const fallback = !(ed.pur > 0);
  const BE = fallback ? FALLBACK_BREAK_EVEN : r2(ed.rev / ed.pur);

  // ---- taxonomy
  const tax = new Map<string, TaxDoc>();
  for (const t of taxDocs) tax.set(t.ad_name, t);
  const lowerFirst = new Map<string, { name: string; first: string }[]>();

  // ---- creatives
  const end = lastDay;
  const last7From = end ? isoDay(new Date((dayNum(end) - 6) * DAY)) : '';
  const creatives: InsightCreative[] = [];
  for (const [name, a] of ads) {
    if (!a.hasMeta) continue;
    const live = [...a.days.entries()].filter(([, t]) => t.cost > 0).map(([d]) => d).sort();
    if (!live.length) continue;
    const product = productOfAd(name, a);
    const t = a.t;
    const purDays = [...a.days.entries()].filter(([, x]) => x.pur > 0).map(([d]) => d).sort();
    let spendToFirst: number | null = null;
    if (purDays.length) {
      spendToFirst = 0;
      for (const [d, x] of a.days) if (d <= purDays[0]!) spendToFirst += x.cost;
      spendToFirst = r2(spendToFirst);
    }
    let c7 = 0;
    let p7 = 0;
    for (const [d, x] of a.days) if (d >= last7From) [c7, p7] = [c7 + x.cost, p7 + x.pur];
    const tx = tax.get(name);
    const im = tx?.intention_message as Record<string, { value?: unknown }> | undefined;
    const pe = tx?.physical_execution as Record<string, { value?: unknown }> | undefined;
    const fmt = tv(pe, 'format');

    const cpa = div(t.cost, t.pur);
    let verdict: Verdict;
    if (!isEd(product)) verdict = 'No purchase data yet';
    else if (t.pur >= 3 && cpa! <= BE) verdict = 'Scale';
    else if (t.pur >= 1 && cpa! <= BE * 1.25) verdict = 'Keep & watch';
    else if (t.cost >= 2 * BE && t.pur === 0) verdict = 'Cut';
    else if (t.pur >= 1 && cpa! > 2 * BE) verdict = 'Cut';
    else if (t.pur === 0 && t.atc >= 2 && t.cost / t.atc <= BE / 4) verdict = 'Promising';
    else if (t.cost < BE) verdict = 'Still testing';
    else if (t.pur >= 1) verdict = 'Over break-even';
    else verdict = 'Near cut';

    const lower = name.toLowerCase();
    const list = lowerFirst.get(lower) ?? [];
    list.push({ name, first: live[0]! });
    lowerFirst.set(lower, list);

    creatives.push({
      ad: name,
      product,
      verdict,
      cost: r2(t.cost),
      purchases: r2(t.pur),
      revenue: r2(t.rev),
      cpa: money(t.cost, t.pur),
      roas: t.cost ? r2(t.rev / t.cost) : null,
      add_to_carts: r2(t.atc),
      cost_per_atc: money(t.cost, t.atc),
      quiz_start_rate: pct(t.qs, t.fpv),
      ctr: t.im ? r2((t.lc / t.im) * 100) : null,
      cpm: t.im ? r2((t.cost / t.im) * 1000) : null,
      impressions: t.im,
      link_clicks: t.lc,
      first_views: t.fpv,
      days_live: live.length,
      first_day: live[0]!,
      last_day: live[live.length - 1]!,
      live_last7: c7 > 0,
      days_with_purchase: purDays.length,
      purchase_day_rate: r1((purDays.length / live.length) * 100),
      spend_to_first_purchase: spendToFirst,
      cost_last7: r2(c7),
      purchases_last7: p7,
      accounts: [...a.accounts].sort(),
      campaigns: a.campaigns.size,
      format: fmt ? (/video/i.test(fmt) ? 'Video' : 'Static') : null,
      hook_type: tv(im, 'hook_type'),
      angle: tv(im, 'angle')?.split('/')[0]?.trim() ?? null,
      offer_type: tv(im, 'offer_type'),
      cta: tv(pe, 'cta_type', 'cta_text'),
      earlier_name: null,
      new_decision: null,
      new_why: null,
    });
  }
  // same creative under other capitals that ran earlier ("Ad_static_1" before "ad_static_1")
  for (const c of creatives) {
    const twins = (lowerFirst.get(c.ad.toLowerCase()) ?? []).filter((x) => x.name !== c.ad && x.first < c.first_day);
    if (twins.length) c.earlier_name = twins.sort((a, b) => a.first.localeCompare(b.first))[0]!.name;
  }

  // ---- ED creative stats
  const edCr = creatives.filter((c) => isEd(c.product));
  const firstSpend = edCr.map((c) => c.spend_to_first_purchase).filter((v): v is number => v != null).sort((a, b) => a - b);
  const p90 = quantile(firstSpend, 0.9);
  const cutNoSale = p90 ?? BE * 1.15;
  const cutNoCart = BE / 2;
  const cheapCart = BE / 4;
  const corrSet = edCr.filter((c) => c.cost >= 150 && c.first_views >= 30);
  const perDollar = corrSet.map((c) => c.purchases / c.cost);

  // ---- new creatives: first day inside the last 7 days of the period
  for (const c of creatives) {
    if (!end || c.first_day < last7From) continue;
    const cost = c.cost;
    const atc = c.add_to_carts;
    const p = c.purchases;
    const cpa = div(cost, p);
    const cpatc = div(cost, atc);
    const $ = (v: number) => `$${Math.round(v)}`;
    let d: NewDecision;
    let why: string;
    if (c.product === 'TrimRX GLP-1' && c.first_views === 0) {
      d = 'No tracking';
      why = 'No partner events for TrimRX, so sales can’t be seen. Fix tracking before spending more.';
    } else if (p && cpa! <= BE * 1.25) {
      d = 'Scale';
      why = `${p} sale${p > 1 ? 's' : ''} at ${$(cpa!)} each. Raise budget 20–30% every 2–3 days.`;
    } else if (cost >= cutNoSale && !p) {
      d = 'Cut';
      why = `${$(cost)} spent with no sale.`;
    } else if (cost >= cutNoCart && !atc) {
      d = 'Cut';
      why = `${$(cost)} spent with no add-to-cart.`;
    } else if (atc && cpatc! <= cheapCart) {
      d = 'Keep';
      why = `${atc} add-to-cart${atc > 1 ? 's' : ''} at ${$(cpatc!)} each. Let it reach about ${$(BE)}.`;
    } else if (atc) {
      d = 'Watch';
      why = `Add-to-carts cost ${$(cpatc!)} each. Cut at about ${$(cutNoSale)} if still no sale.`;
    } else if (cost < 15 && c.days_live >= 2) {
      d = 'Not spending';
      why = `Only ${$(cost)} in ${c.days_live} days. Meta isn’t delivering it; move it to its own ad set or drop it.`;
    } else {
      d = 'Too early';
      why = `Only ${$(cost)} spent. Judge it at ${$(cutNoCart)}; it needs an add-to-cart by then.`;
    }
    if (c.last_day < end && (d === 'Keep' || d === 'Scale')) {
      d = 'Turn back on';
      why = `Stopped on ${dayLabel(c.last_day)} but showing good signs: ${why}`;
    } else if (c.last_day < end && d !== 'Cut') why += ` (no spend since ${dayLabel(c.last_day)})`;
    if (c.earlier_name) why += ` Ran before as “${c.earlier_name}”.`;
    c.new_decision = d;
    c.new_why = why;
  }
  creatives.sort((a, b) => b.cost - a.cost);

  // ---- products
  const products: InsightRow[] = [row('All ED (DirectMax + MEDVi)', ed, edAds)];
  for (const p of PRODUCTS) {
    const pt = productTotals.get(p);
    if (pt) products.push(row(p, pt.t, pt.ads));
  }

  // ---- funnel (ED)
  const steps: [string, number][] = [
    ['Link clicks', ed.lc],
    ['Landing page (partner first view)', ed.fpv],
    ['Questionnaire started', ed.qs],
    ['Questionnaire completed', ed.qc],
    ['Add to cart', ed.atc],
    ['Purchase', ed.pur],
  ];
  const funnel = steps.map(([step, count], i) => ({
    step,
    count: r2(count),
    rate_from_prev: i ? pct(count, steps[i - 1]![1]) : null,
    cost_per: money(ed.cost, count),
  }));

  // ---- weekly (ED), weeks start on Monday
  const weeks = new Map<string, Totals>();
  const adAge = new Map<string, Totals>();
  const AGE = (n: number) => (n < 3 ? 'Days 1–3' : n < 7 ? 'Days 4–7' : n < 14 ? 'Days 8–14' : 'Day 15+');
  let l7cost = 0;
  let l7pur = 0;
  let l7rev = 0;
  for (const [name, a] of ads) {
    if (!a.hasMeta || !isEd(productOfAd(name, a))) continue;
    const first = [...a.days.entries()].filter(([, t]) => t.cost > 0).map(([d]) => d).sort()[0];
    for (const [d, t] of a.days) {
      const n = dayNum(d);
      const dow = (new Date(n * DAY).getUTCDay() + 6) % 7;
      const wk = isoDay(new Date((n - dow) * DAY));
      const w = weeks.get(wk) ?? zero();
      add(w, t);
      weeks.set(wk, w);
      if (first && d >= first) {
        const st = AGE(n - dayNum(first));
        const x = adAge.get(st) ?? zero();
        add(x, t);
        adAge.set(st, x);
      }
      if (d >= last7From) [l7cost, l7pur, l7rev] = [l7cost + t.cost, l7pur + t.pur, l7rev + t.rev];
    }
  }
  const weekly = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, t]) => ({
      week,
      cost: r2(t.cost),
      revenue: r2(t.rev),
      purchases: t.pur,
      add_to_carts: t.atc,
      cpa: money(t.cost, t.pur),
      roas: t.cost ? r2(t.rev / t.cost) : null,
    }));
  const ad_age = ['Days 1–3', 'Days 4–7', 'Days 8–14', 'Day 15+']
    .filter((s) => adAge.has(s))
    .map((stage) => {
      const t = adAge.get(stage)!;
      return { stage, cost: r2(t.cost), purchases: t.pur, add_to_carts: t.atc, cpa: money(t.cost, t.pur), ctr: t.im ? r2((t.lc / t.im) * 100) : null };
    });

  // ---- traits (ED ads with taxonomy, groups with $300+)
  const DIMS: [string, (c: InsightCreative) => string | null][] = [
    ['Hook type', (c) => c.hook_type],
    ['Angle', (c) => c.angle],
    ['Visual style', (c) => tv(tax.get(c.ad)?.intention_message as never, 'style_primary')],
    ['Offer', (c) => c.offer_type],
    ['Call to action', (c) => c.cta],
    ['Who is shown', (c) => {
      const pe = tax.get(c.ad)?.physical_execution as Record<string, { value?: unknown }> | undefined;
      if (!pe) return null;
      const g = tv(pe, 'person_gender');
      if (!g || /^(none|no)/i.test(g)) return 'No person';
      return /and|\+|couple/i.test(g) ? 'Couple' : g;
    }],
    ['Format', (c) => c.format],
  ];
  const traits: FbInsightsResult['traits'] = [];
  const adTotals = new Map<string, Totals>();
  for (const [name, a] of ads) adTotals.set(name, a.t);
  for (const [dimension, key] of DIMS) {
    const g = new Map<string, { t: Totals; n: number }>();
    for (const c of edCr) {
      const k = key(c);
      if (!k) continue;
      const x = g.get(k) ?? { t: zero(), n: 0 };
      add(x.t, adTotals.get(c.ad)!);
      x.n++;
      g.set(k, x);
    }
    for (const [k, x] of g) if (x.t.cost >= 300) traits.push({ dimension, ...row(k, x.t, x.n) });
  }

  // ---- spend levels (ED ads by total spend)
  const LEVELS: [string, number][] = [
    ['Under $60', 60],
    ['$60–120', 120],
    ['$120–240', 240],
    ['$240–480', 480],
    ['$480+', Infinity],
  ];
  const spend_levels = LEVELS.map(([bucket, max], i) => {
    const min = i ? LEVELS[i - 1]![1] : 0;
    const xs = edCr.filter((c) => c.cost >= min && c.cost < max);
    const cost = xs.reduce((s, c) => s + c.cost, 0);
    const pur = xs.reduce((s, c) => s + c.purchases, 0);
    return { bucket, ads: xs.length, ads_with_sale: xs.filter((c) => c.purchases > 0).length, cost: r2(cost), purchases: pur, purchases_per_1k: cost ? r2((pur / cost) * 1000) : null };
  });

  // ---- segments
  const segments = [...segs.values()]
    .filter((s) => s.t.cost >= 100)
    .map((s) => ({ level: s.level, product: s.product, ...row(s.name, s.t, s.ads.size) }))
    .sort((a, b) => b.cost - a.cost);

  // ---- audience
  const audTotal = audienceDocs.reduce((s, d) => s + d.cost, 0);
  const audience = audienceDocs
    .map((d) => ({
      age: String(d._id.age ?? 'unknown').toLowerCase() === 'unknown' ? 'unknown' : String(d._id.age),
      gender: String(d._id.g ?? 'unknown').toLowerCase(),
      d,
    }))
    .filter((x) => x.age !== 'unknown' && x.gender !== 'unknown' && x.d.cost > 0)
    .map(({ age, gender, d }) => ({
      age,
      gender,
      cost: r2(d.cost),
      share: audTotal ? r1((d.cost / audTotal) * 100) : 0,
      ctr: d.im ? r2((d.lc / d.im) * 100) : null,
      cost_per_lpv: money(d.cost, d.lpv),
    }))
    .sort((a, b) => a.age.localeCompare(b.age) || a.gender.localeCompare(b.gender));

  const devices = deviceDocs
    .filter((d) => d.fpv > 0)
    .map((d) => ({
      device: d._id ? String(d._id) : 'unknown',
      first_views: d.fpv,
      quiz_starts: d.qs,
      add_to_carts: d.atc,
      purchases: d.pur,
      quiz_start_rate: pct(d.qs, d.fpv),
      purchases_per_1k_views: d.fpv ? r1((d.pur / d.fpv) * 1000) : null,
    }))
    .sort((a, b) => b.first_views - a.first_views);
  const regions = regionDocs
    .filter((d) => d._id && d.fpv >= 50)
    .map((d) => ({
      region: String(d._id),
      first_views: d.fpv,
      add_to_carts: d.atc,
      purchases: d.pur,
      purchases_per_1k_views: r1((d.pur / d.fpv) * 1000),
    }))
    .sort((a, b) => b.first_views - a.first_views);

  const under = edCr.filter((c) => c.cost < BE);
  return {
    range,
    data_through: end || null,
    last7_from: last7From || null,
    break_even_cpa: BE,
    break_even_is_fallback: fallback,
    totals: { ...row('All ED (DirectMax + MEDVi)', ed, edAds), break_even_cpa: BE },
    last7: { cost: r2(l7cost), purchases: l7pur, cpa: money(l7cost, l7pur), revenue: r2(l7rev) },
    products,
    funnel,
    weekly,
    creatives,
    traits,
    spend_levels,
    ad_age,
    segments,
    audience,
    devices,
    regions,
    indicators: {
      ed_ads: edCr.length,
      ads_with_purchase: edCr.filter((c) => c.purchases > 0).length,
      ads_under_break_even_spend: under.length,
      spend_under_break_even: r2(under.reduce((s, c) => s + c.cost, 0)),
      median_spend_to_first_purchase: quantile(firstSpend, 0.5),
      p90_spend_to_first_purchase: p90,
      corr_ctr: spearman(corrSet.map((c) => c.ctr ?? 0), perDollar),
      corr_quiz_start: spearman(corrSet.map((c) => c.quiz_start_rate ?? 0), perDollar),
      corr_atc: spearman(corrSet.map((c) => c.add_to_carts / c.cost), perDollar),
      corr_ads: corrSet.length,
    },
    unmatched: [...unmatched.entries()]
      .filter(([, t]) => t.pur > 0 || t.atc > 0)
      .map(([ad_name, t]) => ({ ad_name, purchases: t.pur, add_to_carts: t.atc, revenue: r2(t.rev) }))
      .sort((a, b) => b.purchases - a.purchases || b.add_to_carts - a.add_to_carts),
  };
}
