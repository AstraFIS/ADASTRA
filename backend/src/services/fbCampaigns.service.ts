import type { DateRangeKey } from '../types/facebook.js';
import { isoDay } from '../utils/dateRange.js';
import {
  dateMatch,
  describeRange,
  type FbStatisticsQuery,
  FEE_USD,
  num,
  reportAggregate,
  reportBaseMatch,
  resolveReportBounds,
  TOTAL_SPEND,
} from './fbStatistics.service.js';

/**
 * "By campaign" view of the Facebook table: campaign → ad set → ad (× offer), each level
 * with spend, delivery, the partner funnel and revenue.
 *
 * Facebook rows carry the campaign and ad set. Partner rows (facebook_conversions) only
 * know the day and the ad name, so each day's partner results for an ad are shared out
 * over that ad's Facebook rows on the same day (same offer first), in proportion to their
 * link clicks (spend if there are none). When an ad ran in more than one ad set that day
 * the split is an estimate and the ad is flagged `estimated`. Partner results for an ad
 * with no Facebook row that day go to a "(no campaign)" line, so totals always add up.
 */

export const NO_CAMPAIGN = '(no campaign)';
export const PARTNER_ONLY_AD_SET = '(partner results without Facebook spend)';

export interface CampaignMetrics {
  spend_usd: number; // before provider fees
  provider_fee_usd: number;
  total_spend_usd: number; // "Amount Spent"
  impressions: number;
  reach: number; // summed per row: an upper bound, Facebook de-duplicates reach
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  ctr_all: number | null; // clicks_all ÷ impressions × 100
  cpc_usd: number | null; // spend_usd ÷ clicks_all
  first_page_views: number;
  questionnaire_starts: number;
  questionnaire_completed: number;
  add_to_carts: number;
  purchase_events: number;
  conversions: number;
  revenue_usd: number;
  net_profit_usd: number; // revenue − total spend
  cac_usd: number | null; // total spend ÷ conversions
  roas_pct: number | null; // net profit ÷ total spend × 100
  first_date: string | null;
  last_date: string | null;
  /** Partner results were split across more than one Facebook row by link-click share. */
  estimated: boolean;
}

export interface CampaignAdRow extends CampaignMetrics {
  ad_name: string;
  offer_name: string;
  providers: string[];
}

export interface CampaignAdSetRow extends CampaignMetrics {
  ad_set_name: string;
  offers: string[];
  ads: CampaignAdRow[];
}

export interface CampaignRow extends CampaignMetrics {
  campaign_name: string;
  offers: string[];
  providers: string[];
  ad_sets: CampaignAdSetRow[];
}

export interface FbCampaignsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  campaigns: CampaignRow[]; // sorted by amount spent, descending
  meta: { campaigns: number; ad_sets: number; ads: number; estimated_ads: number };
}

const SUM_FIELDS = [
  'spend_usd',
  'provider_fee_usd',
  'total_spend_usd',
  'impressions',
  'reach',
  'clicks_all',
  'link_clicks',
  'landing_page_views',
  'first_page_views',
  'questionnaire_starts',
  'questionnaire_completed',
  'add_to_carts',
  'purchase_events',
  'conversions',
  'revenue_usd',
] as const;
type SumField = (typeof SUM_FIELDS)[number];
const PARTNER_FIELDS: SumField[] = [
  'first_page_views',
  'questionnaire_starts',
  'questionnaire_completed',
  'add_to_carts',
  'purchase_events',
  'conversions',
  'revenue_usd',
];

type Sums = Record<SumField, number>;
const zero = (): Sums => Object.fromEntries(SUM_FIELDS.map((f) => [f, 0])) as Sums;

interface Group extends Sums {
  _id: { day: Date | null; campaign: string | null; ad_set: string | null; ad: string; offer: string };
  providers: (string | null)[];
}

/** Running totals for one tree node. */
interface Acc {
  sums: Sums;
  first: number;
  last: number;
  estimated: boolean;
  offers: Set<string>;
  providers: Set<string>;
}
const newAcc = (): Acc => ({
  sums: zero(),
  first: Infinity,
  last: -Infinity,
  estimated: false,
  offers: new Set(),
  providers: new Set(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number, scale = 1): number | null => (b > 0 ? round2((a / b) * scale) : null);
const text = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s === '' || s === 'null' ? null : s;
};
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function finish(acc: Acc): CampaignMetrics {
  const s = acc.sums;
  const total_spend_usd = round2(s.total_spend_usd);
  const revenue_usd = round2(s.revenue_usd);
  const conversions = Math.round(s.conversions);
  const net_profit_usd = round2(revenue_usd - total_spend_usd);
  return {
    spend_usd: round2(s.spend_usd),
    provider_fee_usd: round2(s.provider_fee_usd),
    total_spend_usd,
    impressions: Math.round(s.impressions),
    reach: Math.round(s.reach),
    clicks_all: Math.round(s.clicks_all),
    link_clicks: Math.round(s.link_clicks),
    landing_page_views: Math.round(s.landing_page_views),
    ctr_all: ratio(s.clicks_all, s.impressions, 100),
    cpc_usd: ratio(s.spend_usd, s.clicks_all),
    first_page_views: Math.round(s.first_page_views),
    questionnaire_starts: Math.round(s.questionnaire_starts),
    questionnaire_completed: Math.round(s.questionnaire_completed),
    add_to_carts: Math.round(s.add_to_carts),
    purchase_events: Math.round(s.purchase_events),
    conversions,
    revenue_usd,
    net_profit_usd,
    cac_usd: ratio(total_spend_usd, conversions),
    roas_pct: ratio(net_profit_usd, total_spend_usd, 100),
    first_date: Number.isFinite(acc.first) ? isoDay(new Date(acc.first)) : null,
    last_date: Number.isFinite(acc.last) ? isoDay(new Date(acc.last)) : null,
    estimated: acc.estimated,
  };
}

function addInto(acc: Acc, sums: Partial<Sums>, day: number | null, factor = 1) {
  for (const f of SUM_FIELDS) acc.sums[f] += (sums[f] ?? 0) * factor;
  if (day !== null) {
    acc.first = Math.min(acc.first, day);
    acc.last = Math.max(acc.last, day);
  }
}

export async function getFbCampaigns(query: FbStatisticsQuery): Promise<FbCampaignsResult> {
  const bounds = await resolveReportBounds(query);
  const match = { ...reportBaseMatch(query), ...dateMatch(bounds) };

  const groups = await reportAggregate<Group>([
    { $match: match },
    {
      $group: {
        _id: {
          day: '$report_date',
          campaign: { $ifNull: ['$campaign_name', null] },
          ad_set: { $ifNull: ['$ad_set_name', null] },
          ad: { $toString: '$ad_name' },
          offer: { $toString: { $ifNull: ['$offer_name', ''] } },
        },
        providers: { $addToSet: '$provider_name' },
        spend_usd: { $sum: num('spend_usd') },
        provider_fee_usd: { $sum: FEE_USD },
        total_spend_usd: { $sum: TOTAL_SPEND },
        impressions: { $sum: num('impressions') },
        reach: { $sum: num('reach') },
        clicks_all: { $sum: num('clicks_all') },
        link_clicks: { $sum: num('link_clicks') },
        landing_page_views: { $sum: num('landing_page_views') },
        first_page_views: { $sum: num('first_page_views') },
        questionnaire_starts: { $sum: num('questionnaire_starts') },
        questionnaire_completed: { $sum: num('questionnaire_completed') },
        add_to_carts: { $sum: num('add_to_carts') },
        purchase_events: { $sum: num('purchase_events') },
        conversions: { $sum: num('conversions') },
        revenue_usd: { $sum: num('revenue_usd') },
      },
    },
  ]);

  // leaf = campaign × ad set × ad × offer, summed over the days
  const leaves = new Map<string, { campaign: string; adSet: string; ad: string; offer: string; acc: Acc }>();
  const leafFor = (campaign: string, adSet: string, ad: string, offer: string) => {
    const key = JSON.stringify([campaign, adSet, ad, offer]);
    let leaf = leaves.get(key);
    if (!leaf) leaves.set(key, (leaf = { campaign, adSet, ad, offer, acc: newAcc() }));
    return leaf;
  };

  // Facebook rows (they have a campaign) by day + ad, for sharing out the partner results
  type FbDayRow = { leaf: ReturnType<typeof leafFor>; offer: string; weightClicks: number; weightSpend: number };
  const fbByDayAd = new Map<string, FbDayRow[]>();
  const partner: Group[] = [];

  for (const g of groups) {
    const campaign = text(g._id.campaign);
    const day = g._id.day instanceof Date ? g._id.day.getTime() : null;
    if (!campaign) {
      partner.push(g); // partner events (or anything else without a campaign): shared out below
      continue;
    }
    const offer = text(g._id.offer) ?? '(no offer)';
    const leaf = leafFor(campaign, text(g._id.ad_set) ?? '(no ad set)', g._id.ad, offer);
    addInto(leaf.acc, g, day);
    leaf.acc.offers.add(offer);
    for (const p of g.providers) if (text(p)) leaf.acc.providers.add(String(p));
    const k = `${day}|${g._id.ad}`;
    const list = fbByDayAd.get(k) ?? [];
    list.push({ leaf, offer, weightClicks: g.link_clicks, weightSpend: g.total_spend_usd });
    fbByDayAd.set(k, list);
  }

  for (const g of partner) {
    const day = g._id.day instanceof Date ? g._id.day.getTime() : null;
    const offer = text(g._id.offer) ?? '(no offer)';
    const all = fbByDayAd.get(`${day}|${g._id.ad}`) ?? [];
    const sameOffer = all.filter((r) => r.offer === offer);
    const targets = sameOffer.length ? sameOffer : all;
    const partnerSums = Object.fromEntries(PARTNER_FIELDS.map((f) => [f, g[f]])) as Partial<Sums>;

    if (targets.length === 0) {
      const leaf = leafFor(NO_CAMPAIGN, PARTNER_ONLY_AD_SET, g._id.ad, offer);
      addInto(leaf.acc, partnerSums, day);
      leaf.acc.offers.add(offer);
      continue;
    }
    const clicks = targets.reduce((s, r) => s + r.weightClicks, 0);
    const spend = targets.reduce((s, r) => s + r.weightSpend, 0);
    for (const t of targets) {
      const share =
        clicks > 0 ? t.weightClicks / clicks : spend > 0 ? t.weightSpend / spend : 1 / targets.length;
      if (share <= 0) continue;
      addInto(t.leaf.acc, partnerSums, null, share);
      if (targets.length > 1) t.leaf.acc.estimated = true;
    }
  }

  // roll the leaves up: campaign → ad set → ad
  const campaigns = new Map<string, { acc: Acc; adSets: Map<string, { acc: Acc; ads: CampaignAdRow[] }> }>();
  for (const leaf of leaves.values()) {
    const c = campaigns.get(leaf.campaign) ?? { acc: newAcc(), adSets: new Map() };
    campaigns.set(leaf.campaign, c);
    const s = c.adSets.get(leaf.adSet) ?? { acc: newAcc(), ads: [] };
    c.adSets.set(leaf.adSet, s);
    for (const target of [c.acc, s.acc]) {
      addInto(target, leaf.acc.sums, null);
      if (Number.isFinite(leaf.acc.first)) {
        target.first = Math.min(target.first, leaf.acc.first);
        target.last = Math.max(target.last, leaf.acc.last);
      }
      target.estimated ||= leaf.acc.estimated;
      target.offers.add(leaf.offer);
      leaf.acc.providers.forEach((p) => target.providers.add(p));
    }
    s.ads.push({
      ad_name: leaf.ad,
      offer_name: leaf.offer,
      providers: [...leaf.acc.providers].sort(),
      ...finish(leaf.acc),
    });
  }

  const bySpend = <T extends { total_spend_usd: number; revenue_usd: number }>(a: T, b: T) =>
    b.total_spend_usd - a.total_spend_usd || b.revenue_usd - a.revenue_usd;

  const rows: CampaignRow[] = [...campaigns.entries()].map(([campaign_name, c]) => ({
    campaign_name,
    offers: [...c.acc.offers].sort(byText),
    providers: [...c.acc.providers].sort(),
    ...finish(c.acc),
    ad_sets: [...c.adSets.entries()]
      .map(([ad_set_name, s]) => ({
        ad_set_name,
        offers: [...s.acc.offers].sort(byText),
        ...finish(s.acc),
        ads: s.ads.sort(bySpend),
      }))
      .sort(bySpend),
  }));
  // the partner-only line goes last
  rows.sort((a, b) => Number(a.campaign_name === NO_CAMPAIGN) - Number(b.campaign_name === NO_CAMPAIGN) || bySpend(a, b));

  const adSets = rows.flatMap((c) => c.ad_sets);
  const ads = adSets.flatMap((s) => s.ads);
  return {
    range: describeRange(query, bounds),
    filters: { ad: query.ad ?? null, offer: query.offer ?? null },
    campaigns: rows,
    meta: {
      campaigns: rows.length,
      ad_sets: adSets.length,
      ads: ads.length,
      estimated_ads: ads.filter((a) => a.estimated).length,
    },
  };
}
