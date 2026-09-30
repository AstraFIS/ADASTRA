import type {
  BingAdRow,
  BingDailyPoint,
  BingDashboard,
  BingDashboardQuery,
  BingFunnelRow,
  BingPartnerRow,
} from '../types/bing.js';
import type { DateRangeOption } from '../types/facebook.js';
import { DATE_RANGE_OPTIONS, resolveRange } from '../utils/dateRange.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

const QUAD_ED = 'Quad ED - Medvi Male Enhancement US Direct Link - 2';

function partnerRow(
  date: string,
  counts: Pick<BingPartnerRow, 'clicks' | 'startQuiz' | 'quizCompleted'>,
): BingPartnerRow {
  // no base views, add-to-carts or purchases in the export so far, hence no revenue either
  return { date, offer: QUAD_ED, base: 0, addToCart: 0, purchase: 0, revenue: 0, ...counts };
}

// Partner conversion export, one row per day × offer.
// TODO: replace with a collection + import once the partner export is loaded into the database.
const PARTNER_ROWS: BingPartnerRow[] = [
  partnerRow('2026-09-19', { clicks: 3, startQuiz: 2, quizCompleted: 0 }),
  partnerRow('2026-09-20', { clicks: 3, startQuiz: 1, quizCompleted: 0 }),
  partnerRow('2026-09-21', { clicks: 3, startQuiz: 1, quizCompleted: 0 }),
  partnerRow('2026-09-22', { clicks: 4, startQuiz: 2, quizCompleted: 0 }),
  partnerRow('2026-09-23', { clicks: 30, startQuiz: 6, quizCompleted: 1 }),
  partnerRow('2026-09-24', { clicks: 61, startQuiz: 9, quizCompleted: 2 }),
];

// Bing Ads spend / impression export, one row per day × offer. Nothing has been
// loaded yet: until it is, the KPI tiles read zero and the spend-based table
// columns (Amount Spent, CTR, CPC, CAC, ROAS) come back null = pending.
const AD_ROWS: BingAdRow[] = [];

const rowKey = (r: { date: string; offer: string }) => `${r.date}::${r.offer}`;
const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, r) => total + pick(r), 0);

/** "Sep 19–24, 2026", "Sep 28 – Oct 3, 2026" or "Dec 30, 2026 – Jan 2, 2027". */
function formatPeriod(fromIso: string, toIso: string): string {
  const part = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(`${iso}T00:00:00Z`));
  const monthDay = (iso: string) => part(iso, { month: 'short', day: 'numeric' });
  const year = (iso: string) => iso.slice(0, 4);

  if (fromIso === toIso) return `${monthDay(fromIso)}, ${year(fromIso)}`;
  if (year(fromIso) !== year(toIso)) {
    return `${monthDay(fromIso)}, ${year(fromIso)} – ${monthDay(toIso)}, ${year(toIso)}`;
  }
  if (fromIso.slice(0, 7) === toIso.slice(0, 7)) {
    return `${monthDay(fromIso)}–${part(toIso, { day: 'numeric' })}, ${year(toIso)}`;
  }
  return `${monthDay(fromIso)} – ${monthDay(toIso)}, ${year(toIso)}`;
}

/**
 * Totals for one table row. Spend-based metrics need a Bing Ads row for every
 * partner row in the group, otherwise a partly covered sum would understate spend.
 */
function funnelRow(
  date: string | null,
  offer: string,
  partner: BingPartnerRow[],
  ads: BingAdRow[],
): BingFunnelRow {
  const adKeys = new Set(ads.map(rowKey));
  const covered = partner.length > 0 && partner.every((p) => adKeys.has(rowKey(p)));

  const purchase = sum(partner, (p) => p.purchase);
  const revenue = round2(sum(partner, (p) => p.revenue));
  const spend = covered ? round2(sum(ads, (a) => a.spend)) : null;
  const impressions = sum(ads, (a) => a.impressions);
  const adClicks = sum(ads, (a) => a.clicks);

  return {
    date,
    offer_name: offer,
    clicks: sum(partner, (p) => p.clicks),
    base: sum(partner, (p) => p.base),
    start_quiz: sum(partner, (p) => p.startQuiz),
    quiz_completed: sum(partner, (p) => p.quizCompleted),
    add_to_cart: sum(partner, (p) => p.addToCart),
    purchase,
    revenue_usd: revenue,
    spend_usd: spend,
    ctr: spend === null || impressions === 0 ? null : round2((adClicks / impressions) * 100),
    cpc_usd: spend === null || adClicks === 0 ? null : round2(spend / adClicks),
    cac_usd: spend === null || purchase === 0 ? null : round2(spend / purchase),
    roas_pct: spend === null || spend === 0 ? null : round2(((revenue - spend) / spend) * 100),
  };
}

export function getBingDashboard(query: BingDashboardQuery): BingDashboard {
  const dates = PARTNER_ROWS.map((r) => r.date).sort();
  const first = dates[0] ?? null;
  const last = dates[dates.length - 1] ?? null;
  const period = first && last ? formatPeriod(first, last) : null;

  // ranges are anchored on the latest day that has partner data, as on the Facebook pages
  const bounds = last ? resolveRange(query.range, last) : null;
  const offer = query.offer ?? null;
  const selected = (r: { date: string; offer: string }) =>
    (!bounds || (r.date >= bounds.from && r.date <= bounds.to)) && (!offer || r.offer === offer);

  const partner = PARTNER_ROWS.filter(selected);
  const ads = AD_ROWS.filter(selected);

  // "All Time" is the whole partner export, so it is labelled with the export's own period
  const dateRanges: DateRangeOption[] = [
    { key: 'all_time', label: period ? `${period} (partner data)` : 'All Time' },
    ...DATE_RANGE_OPTIONS.filter((o) => o.key !== 'all_time'),
  ];

  const revenue = round2(sum(partner, (p) => p.revenue));
  const spend = round2(sum(ads, (a) => a.spend));
  const netProfit = round2(revenue - spend);
  const linkClicks = sum(ads, (a) => a.clicks);
  const impressions = sum(ads, (a) => a.impressions);

  const byDate = partner
    .map((p) => funnelRow(p.date, p.offer, [p], ads.filter((a) => rowKey(a) === rowKey(p))))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.offer_name.localeCompare(b.offer_name));

  const byOffer = [...new Set(partner.map((p) => p.offer))].sort().map((name) =>
    funnelRow(
      null,
      name,
      partner.filter((p) => p.offer === name),
      ads.filter((a) => a.offer === name),
    ),
  );

  const adKeys = new Set(ads.map(rowKey));
  const daily: BingDailyPoint[] = [...new Set(partner.map((p) => p.date))].sort().map((date) => {
    const dayPartner = partner.filter((p) => p.date === date);
    const dayRevenue = round2(sum(dayPartner, (p) => p.revenue));
    const daySpend = dayPartner.every((p) => adKeys.has(rowKey(p)))
      ? round2(sum(ads.filter((a) => a.date === date), (a) => a.spend))
      : null;
    return {
      date,
      revenue_usd: dayRevenue,
      clicks: sum(dayPartner, (p) => p.clicks),
      spend_usd: daySpend,
      gross_profit_usd: daySpend === null ? null : round2(dayRevenue - daySpend),
    };
  });

  return {
    range: {
      key: query.range,
      label: dateRanges.find((o) => o.key === query.range)?.label ?? query.range,
      from: bounds?.from ?? null,
      to: bounds?.to ?? null,
    },
    filters: { offer },
    options: { date_ranges: dateRanges, offers: [...new Set(PARTNER_ROWS.map((r) => r.offer))].sort() },
    statistics: {
      total_revenue: revenue,
      total_amount_spend: spend,
      net_profit: netProfit,
      roas_pct: spend > 0 ? round2((netProfit / spend) * 100) : null,
      landing_page_views: sum(partner, (p) => p.base),
      link_clicks: linkClicks,
      cpc: linkClicks > 0 ? round2(spend / linkClicks) : null,
      ctr: impressions > 0 ? round2((linkClicks / impressions) * 100) : null,
    },
    daily,
    // age / gender splits only exist in the Bing Ads export
    audience_by_age: [],
    audience_by_gender: [],
    funnel: { by_date: byDate, by_offer: byOffer },
    meta: { partner_rows: partner.length, ad_rows: ads.length, partner_period: period, data_through: last },
  };
}
