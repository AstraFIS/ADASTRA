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
 *
 * Media buyers (see utils/bingBuyer.ts): every query is limited to the buyers the caller may see —
 * ad reports / conversions by the campaign-name suffix (_th, _th2), keyword reports by their
 * media_buyer column. Non-admins never see Unassigned rows.
 *
 *   bing_keyword_reports – Bing keyword export: per keyword × match type, with partner funnel
 *                          joined on campaign · ad group · keyword (shown in its own table)
 *   bing_search_terms    – Bing search term export: per search term, connected on campaign · ad group · keyword
 *                          to the keyword report (bid, Conversion Name) and to the partner funnel
 */
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion, type BingEventStage } from '../models/bingConversion.model.js';
import { BingKeywordReport } from '../models/bingKeywordReport.model.js';
import { BingCampaignBuyer } from '../models/bingCampaignBuyer.model.js';
import { BingSearchTerm } from '../models/bingSearchTerm.model.js';
import type {
  BingClickRow,
  BingSegment,
  BingDailyPoint,
  BingDashboard,
  BingDashboardQuery,
  BingFunnelRow,
  BingKeywordRow,
  BingSearchTermRow,
} from '../types/bing.js';
import type { DateRangeOption } from '../types/facebook.js';
import { dayExpr } from '../utils/bingDate.js';
import { UNASSIGNED_BUYER, bingBuyerScope, buyerMatch, buyerOfCampaign, buyerOptions, normalizeBuyer, rowBuyerMatch, type BingMediaBuyer } from '../utils/bingBuyer.js';
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

async function extent(model: 'ads' | 'conversions' | 'keywords' | 'search_terms', match: Record<string, unknown> = {}): Promise<{ from: string; to: string } | null> {
  type Row = { min: Date | null; max: Date | null };
  const pipeline = (field: string) => [
    { $match: match },
    { $project: { _d: dayExpr(field) } },
    { $group: { _id: null, min: { $min: '$_d' }, max: { $max: '$_d' } } },
  ];
  const [row] =
    model === 'ads'
      ? await BingAdReport.aggregate<Row>(pipeline('report_date'))
      : model === 'conversions'
        ? await BingConversion.aggregate<Row>(pipeline('event_date'))
        : model === 'keywords'
          ? await BingKeywordReport.aggregate<Row>(pipeline('report_date'))
          : await BingSearchTerm.aggregate<Row>(pipeline('report_date'));
  return row?.min && row?.max ? { from: iso(row.min), to: iso(row.max) } : null;
}

interface SearchTermDoc {
  _d: Date;
  search_term: string;
  added_excluded: string | null;
  match_type: string | null;
  close_variant: boolean;
  campaign_name: string;
  ad_group_name: string;
  keyword: string;
  impressions: number;
  clicks: number;
  spend_usd: number;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
  conversions: number;
  all_conversions: number;
  media_buyer: string | null;
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

interface KeywordDoc {
  _d: Date;
  keyword: string;
  search_term: string | null;
  goal: string | null;
  conversions?: number;
  all_conversions?: number;
  campaign_name: string;
  ad_group_name: string;
  match_type: string | null;
  bid_usd: number | null;
  impressions: number;
  clicks: number;
  spend_usd: number;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
  media_buyer: string | null;
}

/**
 * Day field normalised to a Date (stored as Date or as "DD/MM/YYYY" text), then filtered
 * by date, campaign and media-buyer scope (`scope` is a buyerMatch() condition).
 */
function selectStages(
  field: string,
  range: Record<string, Date> | undefined,
  campaign: string | null,
  scope: Record<string, unknown>,
  keep: string[],
) {
  return [
    { $match: scope },
    { $addFields: { _d: dayExpr(field) } },
    { $match: { _d: range ?? { $ne: null }, ...(campaign && { campaign_name: campaign }) } },
    { $project: Object.fromEntries([['_d', 1], ...keep.map((k) => [k, 1])]) },
  ];
}

/** A rate column stored as 0–100, or as a fraction (≤ 1) when loaded straight from the export. */
const asPct = (v: number | null | undefined) => (typeof v !== 'number' || !Number.isFinite(v) ? null : v <= 1 ? v * 100 : v);
const keywordKey = (campaign: string | null, adGroup: string | null, keyword: string | null) =>
  `${campaign ?? ''}\u0001${adGroup ?? ''}\u0001${(keyword ?? '').trim().toLowerCase()}`;

const groupKey = (date: string, campaign: string, adGroup: string) => `${date}\u0001${campaign}\u0001${adGroup}`;

/** Campaigns with no buyer suffix that appear in the keyword / search term reports → their Media Buyer (most rows wins). */
export async function keywordCampaignBuyers(): Promise<Map<string, BingMediaBuyer>> {
  type Row = { _id: { c: string; b: string | null }; n: number };
  const pipeline = [{ $group: { _id: { c: '$campaign_name', b: '$media_buyer' }, n: { $sum: 1 } } }];
  // keyword and search term reports both carry the Media Buyer column
  const [fromKeywords, fromTerms] = await Promise.all([BingKeywordReport.aggregate<Row>(pipeline), BingSearchTerm.aggregate<Row>(pipeline)]);
  const rows = [...fromKeywords, ...fromTerms].sort((a, b) => b.n - a.n);
  const map = new Map<string, BingMediaBuyer>();
  for (const r of rows) {
    const buyer = normalizeBuyer(r._id.b);
    if (!buyer || !r._id.c || map.has(r._id.c) || buyerOfCampaign(r._id.c) !== UNASSIGNED_BUYER) continue;
    map.set(r._id.c, buyer);
  }
  return map;
}

/** Admin picks from the "Campaign buyers" section (bing_campaign_buyers), for campaigns without a suffix. */
export async function manualCampaignBuyers(): Promise<Map<string, BingMediaBuyer>> {
  const rows = await BingCampaignBuyer.find({}, { campaign_name: 1, media_buyer: 1, _id: 0 }).lean();
  return new Map(
    rows.filter((r) => buyerOfCampaign(r.campaign_name) === UNASSIGNED_BUYER).map((r) => [r.campaign_name, r.media_buyer] as const),
  );
}

/**
 * Buyer of every campaign that has no suffix in its name: the admin's pick first,
 * then the keyword report's Media Buyer. (Suffixed campaigns are matched by regex.)
 */
export async function campaignBuyerMap(): Promise<Map<string, BingMediaBuyer>> {
  const [fromKeywords, manual] = await Promise.all([keywordCampaignBuyers(), manualCampaignBuyers()]);
  return new Map([...fromKeywords, ...manual]);
}

export interface BingViewer {
  role: 'admin' | 'user';
  access: { bing_buyers: BingMediaBuyer[] };
}

export async function getBingDashboard(query: BingDashboardQuery, viewer: BingViewer): Promise<BingDashboard> {
  // which media buyers' rows this caller sees (null = everything)
  const buyers = bingBuyerScope(viewer, query.buyer);
  const campaignBuyers = await campaignBuyerMap();
  const campaignScope = buyerMatch(buyers, 'campaign', 'campaign_name', campaignBuyers);
  // keyword / search term rows: their Media Buyer column, or their campaign's buyer when it is blank
  const keywordScope = rowBuyerMatch(buyers, campaignBuyers);
  const rowBuyer = (code: string | null, campaign: string): string | null => {
    const own = normalizeBuyer(code) ?? (code?.trim() || null);
    if (own) return own;
    const fromCampaign = buyerOfCampaign(campaign);
    return fromCampaign !== UNASSIGNED_BUYER ? fromCampaign : (campaignBuyers.get(campaign) ?? null);
  };

  const [adsExtent, partnerExtent, keywordsExtent, termsExtent, partnerOffers, adCampaigns, keywordCampaigns, termCampaigns, allOffers] = await Promise.all([
    extent('ads'),
    extent('conversions'),
    extent('keywords', keywordScope),
    extent('search_terms', keywordScope),
    BingConversion.distinct('offer_name', campaignScope) as Promise<string[]>,
    BingAdReport.distinct('campaign_name', campaignScope) as Promise<string[]>,
    BingKeywordReport.distinct('campaign_name', keywordScope) as Promise<string[]>,
    BingSearchTerm.distinct('campaign_name', keywordScope) as Promise<string[]>,
    // offer attribution needs every partner offer name, whoever's campaign it came from
    BingConversion.distinct('offer_name') as Promise<string[]>,
  ]);
  const offerSet = new Set(allOffers);
  const campaigns = [...new Set([...adCampaigns, ...keywordCampaigns, ...termCampaigns])];

  // ranges are anchored on the latest day any export covers
  // Ranges are anchored on the latest day any export covers — but never after today, so one
  // mis-dated row (e.g. "12/10/2026" read month-first as 10 Dec) can't push "This Month" into an empty future month.
  const today = iso(new Date());
  const latestData = [adsExtent?.to, partnerExtent?.to, keywordsExtent?.to, termsExtent?.to].filter(Boolean).sort().pop() ?? null;
  const anchor = latestData && latestData > today ? today : latestData;
  // a custom from / to (either end may be open) replaces the named range
  const custom = !!(query.from || query.to);
  const earliest = [adsExtent?.from, partnerExtent?.from, keywordsExtent?.from, termsExtent?.from].filter(Boolean).sort()[0] ?? null;
  const bounds = custom
    ? { from: query.from ?? earliest ?? query.to!, to: query.to ?? latestData ?? query.from! }
    : anchor
      ? resolveRange(query.range, anchor)
      : null;
  const offer = query.offer ?? null;
  const campaign = query.campaign ?? null;

  const dateFilter = bounds ? { $gte: new Date(`${bounds.from}T00:00:00Z`), $lte: new Date(`${bounds.to}T00:00:00Z`) } : undefined;
  const [ads, conversions, keywordDocs, termDocs] = await Promise.all([
    BingAdReport.aggregate<AdDoc>(
      selectStages('report_date', dateFilter, campaign, campaignScope, ['campaign_name', 'ad_group_name', 'offer_name', 'impressions', 'clicks', 'spend_usd']),
    ),
    BingConversion.aggregate<ConversionDoc & { keyword: string | null }>(
      selectStages('event_date', dateFilter, campaign, campaignScope, [
        'sub_id', 'event_raw', 'event_stage', 'offer_name', 'event_count', 'revenue_usd', 'region', 'device', 'campaign_name', 'ad_group_name', 'keyword',
      ]),
    ),
    BingKeywordReport.aggregate<KeywordDoc>(
      selectStages('report_date', dateFilter, campaign, keywordScope, [
        'keyword', 'search_term', 'goal', 'conversions', 'all_conversions', 'campaign_name', 'ad_group_name', 'match_type', 'bid_usd', 'impressions', 'clicks', 'spend_usd',
        'top_impr_rate_pct', 'abs_top_impr_rate_pct', 'media_buyer',
      ]),
    ),
    BingSearchTerm.aggregate<SearchTermDoc>(
      selectStages('report_date', dateFilter, campaign, keywordScope, [
        'search_term', 'added_excluded', 'match_type', 'close_variant', 'campaign_name', 'ad_group_name', 'keyword',
        'impressions', 'clicks', 'spend_usd', 'top_impr_rate_pct', 'abs_top_impr_rate_pct', 'conversions', 'all_conversions', 'media_buyer',
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

  // ---- keywords: one row per campaign · ad group · keyword · match type ----
  // partner funnel joined on campaign · ad group · keyword (the keyword parsed from the ad group name);
  // the offer filter does not apply here — keyword spend has no offer
  const partnerByKeyword = new Map<string, { base: number; purchase: number; revenue: number }>();
  for (const c of conversions) {
    if (!c.campaign_name || !c.ad_group_name) continue;
    const k = keywordKey(c.campaign_name, c.ad_group_name, c.keyword);
    const p = partnerByKeyword.get(k) ?? { base: 0, purchase: 0, revenue: 0 };
    if (c.event_stage === 'first_page_view') p.base += c.event_count;
    if (c.event_stage === 'purchase') p.purchase += c.event_count;
    p.revenue += c.revenue_usd;
    partnerByKeyword.set(k, p);
  }
  interface KwAcc {
    keyword: string; searchTerm: string | null; goals: Set<string>; match: string | null; campaign: string; adGroup: string; buyer: string | null;
    impressions: number; clicks: number; spend: number; days: Set<string>; bid: number | null; bidDate: string;
    topW: number; topImpr: number; absW: number; absImpr: number;
    conv: number; allConv: number; byGoal: Map<string, { conversions: number; all_conversions: number }>;
  }
  const goalList = (m: Map<string, { conversions: number; all_conversions: number }>) =>
    [...m].map(([name, v]) => ({ name, ...v })).sort((x, y) => y.all_conversions - x.all_conversions || x.name.localeCompare(y.name));
  const kw = new Map<string, KwAcc>();
  for (const d of keywordDocs) {
    const date = iso(d._d);
    const term = d.search_term?.trim() || null;
    const k = `${keywordKey(d.campaign_name, d.ad_group_name, d.keyword)}\u0001${d.match_type ?? ''}\u0001${term ?? ''}`;
    const a = kw.get(k) ?? {
      keyword: d.keyword, searchTerm: term, goals: new Set<string>(), match: d.match_type, campaign: d.campaign_name, adGroup: d.ad_group_name,
      buyer: rowBuyer(d.media_buyer, d.campaign_name),
      impressions: 0, clicks: 0, spend: 0, days: new Set<string>(), bid: null, bidDate: '', topW: 0, topImpr: 0, absW: 0, absImpr: 0,
      conv: 0, allConv: 0, byGoal: new Map(),
    };
    a.impressions += d.impressions;
    a.clicks += d.clicks;
    a.spend += d.spend_usd;
    a.conv += d.conversions ?? 0;
    a.allConv += d.all_conversions ?? 0;
    const goalName = d.goal?.trim();
    if (goalName && goalName !== '-') {
      a.goals.add(goalName);
      const g = a.byGoal.get(goalName) ?? { conversions: 0, all_conversions: 0 };
      g.conversions += d.conversions ?? 0;
      g.all_conversions += d.all_conversions ?? 0;
      a.byGoal.set(goalName, g);
    }
    if (d.impressions > 0) a.days.add(date);
    if (typeof d.bid_usd === 'number' && date >= a.bidDate) { a.bid = d.bid_usd; a.bidDate = date; }
    const top = asPct(d.top_impr_rate_pct);
    const abs = asPct(d.abs_top_impr_rate_pct);
    if (top !== null) { a.topW += top * d.impressions; a.topImpr += d.impressions; }
    if (abs !== null) { a.absW += abs * d.impressions; a.absImpr += d.impressions; }
    kw.set(k, a);
  }
  // partner events are per keyword, so with search terms they are shown once, on the keyword's top-spend term
  const partnerShown = new Set<string>();
  const keywords: BingKeywordRow[] = [...kw.values()]
    .sort((x, y) => y.spend - x.spend || y.clicks - x.clicks)
    .map((a) => {
      const pk = keywordKey(a.campaign, a.adGroup, a.keyword);
      const p = partnerShown.has(pk) ? undefined : partnerByKeyword.get(pk);
      if (p) partnerShown.add(pk);
      const revenue = p ? round2(p.revenue) : 0;
      const spend = round2(a.spend);
      return {
        keyword: a.keyword,
        search_term: a.searchTerm,
        goal: a.goals.size ? [...a.goals].sort().join(', ') : null,
        match_type: a.match,
        campaign_name: a.campaign,
        ad_group_name: a.adGroup,
        media_buyer: a.buyer,
        bid_usd: a.bid,
        impressions: a.impressions,
        clicks: a.clicks,
        spend_usd: spend,
        ctr: a.impressions ? round2((a.clicks / a.impressions) * 100) : null,
        cpc_usd: a.clicks ? round2(a.spend / a.clicks) : null,
        top_impr_rate_pct: a.topImpr ? round2(a.topW / a.topImpr) : null,
        abs_top_impr_rate_pct: a.absImpr ? round2(a.absW / a.absImpr) : null,
        active_days: a.days.size,
        conversions: a.conv,
        all_conversions: a.allConv,
        conversion_goals: goalList(a.byGoal),
        landing_page_views: p?.base ?? 0,
        purchases: p?.purchase ?? 0,
        revenue_usd: revenue,
        roas_pct: spend > 0 && p ? round2(((revenue - spend) / spend) * 100) : null,
      };
    })
    .sort((x, y) => y.spend_usd - x.spend_usd || y.clicks - x.clicks || y.impressions - x.impressions || x.keyword.localeCompare(y.keyword));

  // ---- search terms: one row per campaign · ad group · keyword · search term · match type ----
  // Connected on campaign · ad group · keyword to the keyword report for the bid.
  // Conversion goals: Bing's search term report has no goal column, so a search term gets a goal only
  // when the term itself converted on a day its keyword recorded that goal (keyword-level goals are
  // NOT copied onto every search term). Partner results can't be tied to a search term (no click id
  // in Bing's report), so they stay on the keyword rows and are 0 here.
  const keywordInfo = new Map<string, { bid: number | null; bidDate: string }>();
  const keywordGoalsByDay = new Map<string, Set<string>>();
  for (const d of keywordDocs) {
    const k = keywordKey(d.campaign_name, d.ad_group_name, d.keyword);
    const info = keywordInfo.get(k) ?? { bid: null, bidDate: '' };
    const date = iso(d._d);
    if (typeof d.bid_usd === 'number' && date >= info.bidDate) { info.bid = d.bid_usd; info.bidDate = date; }
    keywordInfo.set(k, info);
    const goalName = d.goal?.trim();
    if (goalName && goalName !== '-' && ((d.all_conversions ?? 0) > 0 || (d.conversions ?? 0) > 0)) {
      const dk = `${k}\u0001${date}`;
      keywordGoalsByDay.set(dk, (keywordGoalsByDay.get(dk) ?? new Set()).add(goalName));
    }
  }
  interface StAcc {
    term: string; keyword: string; match: string | null; close: boolean; added: string | null; campaign: string; adGroup: string;
    buyer: string | null; impressions: number; clicks: number; spend: number; conv: number; allConv: number;
    topW: number; topImpr: number; absW: number; absImpr: number; goals: Set<string>;
  }
  const st = new Map<string, StAcc>();
  for (const d of termDocs) {
    const k = `${keywordKey(d.campaign_name, d.ad_group_name, d.keyword)}\u0001${d.search_term.trim().toLowerCase()}\u0001${d.match_type ?? ''}\u0001${d.close_variant ? 1 : 0}`;
    const a = st.get(k) ?? {
      term: d.search_term, keyword: d.keyword, match: d.match_type, close: !!d.close_variant, added: d.added_excluded,
      campaign: d.campaign_name, adGroup: d.ad_group_name, buyer: rowBuyer(d.media_buyer, d.campaign_name),
      impressions: 0, clicks: 0, spend: 0, conv: 0, allConv: 0, topW: 0, topImpr: 0, absW: 0, absImpr: 0, goals: new Set<string>(),
    };
    a.impressions += d.impressions;
    a.clicks += d.clicks;
    a.spend += d.spend_usd;
    a.conv += d.conversions ?? 0;
    a.allConv += d.all_conversions ?? 0;
    // this term converted today → it carries the goals its keyword recorded on the same day
    if ((d.all_conversions ?? 0) > 0 || (d.conversions ?? 0) > 0) {
      for (const g of keywordGoalsByDay.get(`${keywordKey(d.campaign_name, d.ad_group_name, d.keyword)}\u0001${iso(d._d)}`) ?? []) a.goals.add(g);
    }
    const top = asPct(d.top_impr_rate_pct);
    const abs = asPct(d.abs_top_impr_rate_pct);
    if (top !== null) { a.topW += top * d.impressions; a.topImpr += d.impressions; }
    if (abs !== null) { a.absW += abs * d.impressions; a.absImpr += d.impressions; }
    st.set(k, a);
  }
  const searchTerms: BingSearchTermRow[] = [...st.values()]
    .sort((x, y) => y.spend - x.spend || y.clicks - x.clicks)
    .map((a) => {
      const info = keywordInfo.get(keywordKey(a.campaign, a.adGroup, a.keyword));
      const spend = round2(a.spend);
      const goals = [...a.goals].sort();
      return {
        search_term: a.term,
        keyword: a.keyword,
        match_type: a.match,
        close_variant: a.close,
        added_excluded: a.added,
        campaign_name: a.campaign,
        ad_group_name: a.adGroup,
        media_buyer: a.buyer,
        conversion_name: goals.length ? goals.join(', ') : null,
        conversion_goals: goals,
        bid_usd: info?.bid ?? null,
        in_keyword_report: !!info,
        impressions: a.impressions,
        clicks: a.clicks,
        spend_usd: spend,
        ctr: a.impressions ? round2((a.clicks / a.impressions) * 100) : null,
        cpc_usd: a.clicks ? round2(a.spend / a.clicks) : null,
        cpm_usd: a.impressions ? round2((a.spend / a.impressions) * 1000) : null,
        top_impr_rate_pct: a.topImpr ? round2(a.topW / a.topImpr) : null,
        abs_top_impr_rate_pct: a.absImpr ? round2(a.absW / a.absImpr) : null,
        conversions: a.conv,
        all_conversions: a.allConv,
        // partner results are per keyword (see the Keywords view), never split onto search terms
        landing_page_views: 0,
        purchases: 0,
        revenue_usd: 0,
        roas_pct: null,
      };
    });

  // ---- KPIs ----
  const total = row(selected, null, 'total', null, false);
  const spend = total.spend_usd ?? 0;
  const revenue = total.revenue_usd ?? 0;
  const net = round2(revenue - spend);

  const extents = [adsExtent, partnerExtent, keywordsExtent, termsExtent].filter((e): e is { from: string; to: string } => !!e);
  const allPeriod = extents.length
    ? formatPeriod(extents.map((e) => e.from).sort()[0]!, extents.map((e) => e.to).sort().pop()!)
    : null;
  // every option shows the days it covers, e.g. "This Month (Oct 1–16, 2026)"
  const dateRanges: DateRangeOption[] = [
    { key: 'all_time', label: allPeriod ? `All Time (${allPeriod})` : 'All Time' },
    ...DATE_RANGE_OPTIONS.filter((o) => o.key !== 'all_time').map((o) => {
      const b = anchor ? resolveRange(o.key, anchor) : null;
      return b && b.from <= b.to ? { ...o, label: `${o.label} (${formatPeriod(b.from, b.to)})` } : o;
    }),
  ];

  return {
    range: {
      key: custom ? 'custom' : query.range,
      label: custom && bounds ? `Custom (${formatPeriod(bounds.from, bounds.to)})` : (dateRanges.find((o) => o.key === query.range)?.label ?? query.range),
      from: bounds?.from ?? null,
      to: bounds?.to ?? null,
    },
    filters: { offer, campaign, buyer: query.buyer ?? null },
    options: {
      date_ranges: dateRanges,
      offers: [...partnerOffers].sort(),
      campaigns: [...campaigns].sort(),
      buyers: buyerOptions(viewer),
    },
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
    keywords,
    search_terms: searchTerms,
    meta: {
      ad_rows: ads.length,
      conversion_rows: conversions.length,
      ads_period: adsExtent ? formatPeriod(adsExtent.from, adsExtent.to) : null,
      partner_period: partnerExtent ? formatPeriod(partnerExtent.from, partnerExtent.to) : null,
      ads_through: adsExtent?.to ?? null,
      partner_through: partnerExtent?.to ?? null,
      unattributed_events: selectedConversions.filter((c) => !c.campaign_name).length,
      keyword_rows: keywordDocs.length,
      keywords_period: keywordsExtent ? formatPeriod(keywordsExtent.from, keywordsExtent.to) : null,
      search_term_rows: termDocs.length,
      /** Latest data day when it is after today (a mis-dated row); null when all dates look right. */
      future_dated_through: latestData && latestData > today ? latestData : null,
      search_terms_period: termsExtent ? formatPeriod(termsExtent.from, termsExtent.to) : null,
    },
  };
}
