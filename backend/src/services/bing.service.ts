/**
 * Bing Ads dashboard, built from two collections joined on day × campaign × ad group:
 *
 *   bing_ad_reports   – Bing Ads export: impressions, clicks, spend (no offer / device / region)
 *   bing_conversions  – partner export: one funnel event with offer, revenue, device, region
 *
 * Offer attribution of spend:
 *   - an ad whose landing `offer_name` is itself a partner offer (e.g. SKAG ED TEST → Quad ED)
 *     puts all its spend on that offer (exact);
 *   - an ad landing on a multi-offer page (e.g. MenCare Vault) has its ad-group-day spend split
 *     across the offers its visitors clicked, by landing-page-view share (estimate, flagged);
 *     ad-group days with no offer click keep their spend on a "no offer click" line.
 * Partner events without campaign / ad group (tracking added Oct 5) are kept, with no spend.
 */
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion, type BingEventStage } from '../models/bingConversion.model.js';
import type {
  BingClickRow,
  BingSegment,
  BingDailyPoint,
  BingDashboard,
  BingDashboardQuery,
  BingFunnelRow,
} from '../types/bing.js';
import type { DateRangeOption } from '../types/facebook.js';
import { dayExpr } from '../utils/bingDate.js';
import { DATE_RANGE_OPTIONS, resolveRange } from '../utils/dateRange.js';

export const NO_OFFER = 'Landing page — no offer click';
/** Upper bound on click rows sent to the page (newest first). */
const MAX_CLICK_ROWS = 5000;

const SEGMENT_FIELD: Record<BingEventStage, Exclude<keyof BingSegment, 'key' | 'label' | 'visitors' | 'revenue_usd'>> = {
  first_page_view: 'first_page_views',
  questionnaire_start: 'questionnaire_starts',
  questionnaire_completed: 'questionnaire_completed',
  lead: 'leads',
  add_to_cart: 'add_to_carts',
  purchase: 'purchase_events',
};
const UNATTRIBUTED = '(unattributed)';

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Funnel {
  base: number;
  start_quiz: number;
  quiz_completed: number;
  lead: number;
  add_to_cart: number;
  purchase: number;
  revenue: number;
}
const STAGE_KEY: Record<BingEventStage, Exclude<keyof Funnel, 'revenue'>> = {
  first_page_view: 'base',
  questionnaire_start: 'start_quiz',
  questionnaire_completed: 'quiz_completed',
  lead: 'lead',
  add_to_cart: 'add_to_cart',
  purchase: 'purchase',
};
const emptyFunnel = (): Funnel => ({ base: 0, start_quiz: 0, quiz_completed: 0, lead: 0, add_to_cart: 0, purchase: 0, revenue: 0 });
const funnelEvents = (f: Funnel) => f.base + f.start_quiz + f.quiz_completed + f.lead + f.add_to_cart + f.purchase;

/** One day × campaign × ad group × offer: Bing delivery (possibly a share) + partner funnel. */
interface Fact extends Funnel {
  date: string;
  campaign: string;
  adGroup: string;
  offer: string;
  impressions: number;
  clicks: number;
  spend: number;
  estimated: boolean;
}

/** "Sep 19–24, 2026", "Sep 28 – Oct 3, 2026" or "Dec 30, 2026 – Jan 2, 2027". */
function formatPeriod(fromIso: string, toIso: string): string {
  const part = (v: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(`${v}T00:00:00Z`));
  const monthDay = (v: string) => part(v, { month: 'short', day: 'numeric' });
  const year = (v: string) => v.slice(0, 4);
  if (fromIso === toIso) return `${monthDay(fromIso)}, ${year(fromIso)}`;
  if (year(fromIso) !== year(toIso)) return `${monthDay(fromIso)}, ${year(fromIso)} – ${monthDay(toIso)}, ${year(toIso)}`;
  if (fromIso.slice(0, 7) === toIso.slice(0, 7)) return `${monthDay(fromIso)}–${part(toIso, { day: 'numeric' })}, ${year(toIso)}`;
  return `${monthDay(fromIso)} – ${monthDay(toIso)}, ${year(toIso)}`;
}

async function extent(model: 'ads' | 'conversions'): Promise<{ from: string; to: string } | null> {
  const pipeline = (field: string) => [
    { $project: { _d: dayExpr(field) } },
    { $group: { _id: null, min: { $min: '$_d' }, max: { $max: '$_d' } } },
  ];
  const [row] =
    model === 'ads'
      ? await BingAdReport.aggregate<{ min: Date | null; max: Date | null }>(pipeline('report_date'))
      : await BingConversion.aggregate<{ min: Date | null; max: Date | null }>(pipeline('event_date'));
  return row?.min && row?.max ? { from: iso(row.min), to: iso(row.max) } : null;
}

interface AdDoc {
  _d: Date;
  campaign_name: string;
  ad_group_name: string;
  offer_name: string;
  impressions: number;
  clicks: number;
  spend_usd: number;
}
interface ConversionDoc {
  _d: Date;
  sub_id: string;
  event_raw: string;
  event_stage: BingEventStage;
  offer_name: string;
  event_count: number;
  revenue_usd: number;
  region: string | null;
  device: string | null;
  campaign_name: string | null;
  ad_group_name: string | null;
}

/** Day field normalised to a Date (stored as Date or as "DD/MM/YYYY" text), then filtered. */
function selectStages(field: string, range: Record<string, Date> | undefined, campaign: string | null, keep: string[]) {
  return [
    { $addFields: { _d: dayExpr(field) } },
    { $match: { _d: range ?? { $ne: null }, ...(campaign && { campaign_name: campaign }) } },
    { $project: Object.fromEntries([['_d', 1], ...keep.map((k) => [k, 1])]) },
  ];
}

const groupKey = (date: string, campaign: string, adGroup: string) => `${date}\u0001${campaign}\u0001${adGroup}`;

export async function getBingDashboard(query: BingDashboardQuery): Promise<BingDashboard> {
  const [adsExtent, partnerExtent, partnerOffers, campaigns] = await Promise.all([
    extent('ads'),
    extent('conversions'),
    BingConversion.distinct('offer_name') as Promise<string[]>,
    BingAdReport.distinct('campaign_name') as Promise<string[]>,
  ]);
  const offerSet = new Set(partnerOffers);

  // ranges are anchored on the latest day either export covers
  const anchor = [adsExtent?.to, partnerExtent?.to].filter(Boolean).sort().pop() ?? null;
  const bounds = anchor ? resolveRange(query.range, anchor) : null;
  const offer = query.offer ?? null;
  const campaign = query.campaign ?? null;

  const dateFilter = bounds ? { $gte: new Date(`${bounds.from}T00:00:00Z`), $lte: new Date(`${bounds.to}T00:00:00Z`) } : undefined;
  const [ads, conversions] = await Promise.all([
    BingAdReport.aggregate<AdDoc>(
      selectStages('report_date', dateFilter, campaign, ['campaign_name', 'ad_group_name', 'offer_name', 'impressions', 'clicks', 'spend_usd']),
    ),
    BingConversion.aggregate<ConversionDoc>(
      selectStages('event_date', dateFilter, campaign, [
        'sub_id', 'event_raw', 'event_stage', 'offer_name', 'event_count', 'revenue_usd', 'region', 'device', 'campaign_name', 'ad_group_name',
      ]),
    ),
  ]);

  // ---- Bing delivery per day × campaign × ad group ----
  const adGroups = new Map<string, { date: string; campaign: string; adGroup: string; landing: string; impressions: number; clicks: number; spend: number }>();
  for (const a of ads) {
    const date = iso(a._d);
    const k = groupKey(date, a.campaign_name, a.ad_group_name);
    const g = adGroups.get(k) ?? { date, campaign: a.campaign_name, adGroup: a.ad_group_name, landing: a.offer_name, impressions: 0, clicks: 0, spend: 0 };
    g.impressions += a.impressions;
    g.clicks += a.clicks;
    g.spend += a.spend_usd;
    adGroups.set(k, g);
  }

  // ---- partner funnel per day × campaign × ad group × offer ----
  const partner = new Map<string, { date: string; campaign: string; adGroup: string; offers: Map<string, Funnel> }>();
  for (const c of conversions) {
    const date = iso(c._d);
    const camp = c.campaign_name ?? UNATTRIBUTED;
    const grp = c.ad_group_name ?? UNATTRIBUTED;
    const k = groupKey(date, camp, grp);
    const p = partner.get(k) ?? { date, campaign: camp, adGroup: grp, offers: new Map<string, Funnel>() };
    const f = p.offers.get(c.offer_name) ?? emptyFunnel();
    f[STAGE_KEY[c.event_stage]] += c.event_count;
    f.revenue += c.revenue_usd;
    p.offers.set(c.offer_name, f);
    partner.set(k, p);
  }

  // ---- join → facts ----
  const facts: Fact[] = [];
  for (const k of new Set([...adGroups.keys(), ...partner.keys()])) {
    const ad = adGroups.get(k);
    const p = partner.get(k);
    const base = ad ?? p!;
    const offers = p?.offers ?? new Map<string, Funnel>();
    const push = (offerName: string, share: number, estimated: boolean) =>
      facts.push({
        date: base.date,
        campaign: base.campaign,
        adGroup: base.adGroup,
        offer: offerName,
        impressions: (ad?.impressions ?? 0) * share,
        clicks: (ad?.clicks ?? 0) * share,
        spend: (ad?.spend ?? 0) * share,
        estimated,
        ...(offers.get(offerName) ?? emptyFunnel()),
      });

    if (!ad) {
      for (const o of offers.keys()) push(o, 0, false);
    } else if (offerSet.has(ad.landing)) {
      push(ad.landing, 1, false); // the ad links straight to this offer
      for (const o of offers.keys()) if (o !== ad.landing) push(o, 0, false);
    } else if (offers.size > 0) {
      const weights = [...offers].map(([o, f]) => [o, f.base || funnelEvents(f) || 1] as const);
      const total = weights.reduce((s, [, w]) => s + w, 0);
      for (const [o, w] of weights) push(o, w / total, true);
    } else {
      push(NO_OFFER, 1, false);
    }
  }

  const selected = offer ? facts.filter((f) => f.offer === offer) : facts;
  const selectedConversions = offer ? conversions.filter((c) => c.offer_name === offer) : conversions;

  // ---- coverage: a day outside an export's extent is "pending", not zero ----
  const adsCovers = (d: string) => !!adsExtent && d >= adsExtent.from && d <= adsExtent.to;
  const partnerCovers = (d: string) => !!partnerExtent && d >= partnerExtent.from && d <= partnerExtent.to;

  function row(
    group: Fact[],
    date: string | null,
    label: string,
    subLabel: string | null,
    pendingAware: boolean,
  ): BingFunnelRow {
    const s = (pick: (f: Fact) => number) => group.reduce((t, f) => t + pick(f), 0);
    const impressions = s((f) => f.impressions);
    const clicks = s((f) => f.clicks);
    const spendRaw = s((f) => f.spend);
    const revenueRaw = s((f) => f.revenue);
    const purchase = s((f) => f.purchase);
    const spend = pendingAware && date && !adsCovers(date) ? null : round2(spendRaw);
    const revenue = pendingAware && date && !partnerCovers(date) ? null : round2(revenueRaw);
    const both = spend !== null && revenue !== null;
    return {
      date,
      label,
      sub_label: subLabel,
      impressions: Math.round(impressions),
      clicks: round2(clicks),
      spend_usd: spend,
      spend_estimated: group.some((f) => f.estimated),
      base: s((f) => f.base),
      start_quiz: s((f) => f.start_quiz),
      quiz_completed: s((f) => f.quiz_completed),
      lead: s((f) => f.lead),
      add_to_cart: s((f) => f.add_to_cart),
      purchase,
      revenue_usd: revenue,
      ctr: spend === null || impressions === 0 ? null : round2((clicks / impressions) * 100),
      cpc_usd: spend === null || clicks === 0 ? null : round2(spendRaw / clicks),
      cac_usd: spend === null || purchase === 0 || spendRaw === 0 ? null : round2(spendRaw / purchase),
      roas_pct: !both || spendRaw === 0 ? null : round2(((revenueRaw - spendRaw) / spendRaw) * 100),
    };
  }

  const groupBy = (keyOf: (f: Fact) => string) => {
    const m = new Map<string, Fact[]>();
    for (const f of selected) m.set(keyOf(f), [...(m.get(keyOf(f)) ?? []), f]);
    return m;
  };
  const active = (r: BingFunnelRow) => r.impressions > 0 || r.base + r.start_quiz + r.quiz_completed + r.lead + r.add_to_cart + r.purchase > 0;
  const byValue = (a: BingFunnelRow, b: BingFunnelRow) =>
    (b.revenue_usd ?? 0) - (a.revenue_usd ?? 0) || (b.spend_usd ?? 0) - (a.spend_usd ?? 0) || b.base - a.base || a.label.localeCompare(b.label);

  const byDate = [...groupBy((f) => `${f.date}\u0001${f.offer}`)]
    .map(([, g]) => row(g, g[0]!.date, g[0]!.offer, null, true))
    .filter(active)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || byValue(a, b));

  const byOffer = [...groupBy((f) => f.offer)].map(([, g]) => row(g, null, g[0]!.offer, null, false)).filter(active).sort(byValue);

  const byAdGroup = [...groupBy((f) => `${f.campaign}\u0001${f.adGroup}`)]
    // a whole ad group's spend is exact; the offer split only matters when rows are per offer
    .map(([, g]) => ({ ...row(g, null, g[0]!.adGroup, g[0]!.campaign === UNATTRIBUTED ? 'no campaign from partner' : g[0]!.campaign, false), spend_estimated: false }))
    .filter(active)
    .sort(byValue);

  const daily: BingDailyPoint[] = [...groupBy((f) => f.date)]
    .map(([date, g]) => {
      const r = row(g, date, date, null, true);
      return {
        date,
        revenue_usd: r.revenue_usd,
        spend_usd: r.spend_usd,
        gross_profit_usd: r.revenue_usd === null || r.spend_usd === null ? null : round2(r.revenue_usd - r.spend_usd),
        // (days only one export covers stay null so the chart shows them as pending, not as a loss)
        clicks: Math.round(r.clicks),
        landing_page_views: r.base,
        purchases: r.purchase,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- partner-side region / device segments: event counts per funnel stage ----
  function segments(field: 'device' | 'region'): BingSegment[] {
    const m = new Map<string, BingSegment & { ids: Set<string> }>();
    for (const c of selectedConversions) {
      const label = c[field] ?? 'Unknown';
      const key = c[field] ? label.toLowerCase() : 'unknown';
      const seg =
        m.get(key) ??
        { key, label, visitors: 0, first_page_views: 0, questionnaire_starts: 0, questionnaire_completed: 0, leads: 0, add_to_carts: 0, purchase_events: 0, revenue_usd: 0, ids: new Set<string>() };
      seg[SEGMENT_FIELD[c.event_stage]] += c.event_count;
      seg.revenue_usd += c.revenue_usd;
      seg.ids.add(c.sub_id);
      m.set(key, seg);
    }
    return [...m.values()].map(({ ids, ...seg }) => ({ ...seg, visitors: ids.size, revenue_usd: round2(seg.revenue_usd) }));
  }

  // ---- click-level rows for the Click ID table (newest first) ----
  const clicks: BingClickRow[] = selectedConversions
    .map((c) => ({
      sub_id: c.sub_id,
      date: iso(c._d),
      event_stage: c.event_stage,
      event_raw: c.event_raw,
      offer_name: c.offer_name,
      region: c.region,
      device: c.device,
      campaign_name: c.campaign_name,
      ad_group_name: c.ad_group_name,
      revenue_usd: round2(c.revenue_usd),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.revenue_usd - a.revenue_usd || a.sub_id.localeCompare(b.sub_id))
    .slice(0, MAX_CLICK_ROWS);

  // ---- KPIs ----
  const total = row(selected, null, 'total', null, false);
  const spend = total.spend_usd ?? 0;
  const revenue = total.revenue_usd ?? 0;
  const net = round2(revenue - spend);

  const allPeriod = adsExtent || partnerExtent
    ? formatPeriod(
        [adsExtent?.from, partnerExtent?.from].filter(Boolean).sort()[0]!,
        [adsExtent?.to, partnerExtent?.to].filter(Boolean).sort().pop()!,
      )
    : null;
  const dateRanges: DateRangeOption[] = [
    { key: 'all_time', label: allPeriod ? `All Time (${allPeriod})` : 'All Time' },
    ...DATE_RANGE_OPTIONS.filter((o) => o.key !== 'all_time'),
  ];

  return {
    range: {
      key: query.range,
      label: dateRanges.find((o) => o.key === query.range)?.label ?? query.range,
      from: bounds?.from ?? null,
      to: bounds?.to ?? null,
    },
    filters: { offer, campaign },
    options: { date_ranges: dateRanges, offers: [...partnerOffers].sort(), campaigns: [...campaigns].sort() },
    statistics: {
      total_revenue: revenue,
      total_amount_spend: spend,
      net_profit: net,
      roas_pct: spend > 0 ? round2((net / spend) * 100) : null,
      landing_page_views: total.base,
      link_clicks: Math.round(total.clicks),
      impressions: total.impressions,
      purchases: total.purchase,
      cpc: total.cpc_usd,
      ctr: total.ctr,
      cac: total.cac_usd,
      spend_estimated: !!offer && total.spend_estimated,
    },
    daily,
    geo: { by_region: segments('region'), by_device: segments('device') },
    clicks,
    funnel: { by_date: byDate, by_offer: byOffer, by_ad_group: byAdGroup },
    meta: {
      ad_rows: ads.length,
      conversion_rows: conversions.length,
      ads_period: adsExtent ? formatPeriod(adsExtent.from, adsExtent.to) : null,
      partner_period: partnerExtent ? formatPeriod(partnerExtent.from, partnerExtent.to) : null,
      ads_through: adsExtent?.to ?? null,
      partner_through: partnerExtent?.to ?? null,
      unattributed_events: selectedConversions.filter((c) => !c.campaign_name).length,
    },
  };
}
