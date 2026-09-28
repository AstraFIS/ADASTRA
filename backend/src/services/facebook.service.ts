import { DATE_RANGE_OPTIONS, isDateRangeKey, isoDay, resolveRange } from '../utils/dateRange.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import {
  type AdBreakdown,
  type AdDetail,
  type AdMetricRow,
  type AudienceBucket,
  type CreativeTaxonomy,
  type DailyPoint,
  type DateRangeKey,
  type FacebookAudience,
  type FacebookDashboard,
  type FacebookKpis,
  type MarketingRead,
  type MetricComparison,
  type ProviderFeeSummary,
  type TaxonomyField,
} from '../types/facebook.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Seed data. TODO: replace with rows imported from the Bluewin / xlsx source.
// ---------------------------------------------------------------------------

const META = {
  client: 'Direct Meds ED',
  portfolio: 'Media Performance',
  sourceLabel: 'Bluewin Data Source (Comparison V2)',
  title: 'Ad Performance Dashboard',
  subtitle: 'Comparison Copy #2',
  lastUpdated: '2026-09-25',
  dataThrough: '2026-09-24',
  sourceNote:
    'Test_ED_Orkhan_Project_3.xlsx — rebuilt from Test_FB_sheet (Aug 5–Sep 19) + Test_partner, spend grossed up by Providers Fee where a provider is attached',
};

export const SEED_PROVIDERS: { name: string; feeRate: number }[] = [
  { name: 'Ad_Term_White', feeRate: 0.0417 },
  { name: 'BlueGlow', feeRate: 0.0638 },
];

export const AGE_BUCKETS = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+', 'Unknown'] as const;
export const GENDER_BUCKETS = ['Male', 'Female', 'Unknown'] as const;

const OFFER_TRIAL = 'ED Trial Pack';
const OFFER_MONTHLY = 'ED Monthly Plan';

interface AdProfile {
  offer: string;
  provider: string | null;
  /** Paused / archived ads are still reported but can be hidden in the funnel table. */
  active: boolean;
  /** Share of link clicks per age bucket (same order as AGE_BUCKETS). */
  age: number[];
  /** Share of link clicks per gender bucket (same order as GENDER_BUCKETS). */
  gender: number[];
}

const OLDER_SKEW = [0, 0.02, 0.04, 0.11, 0.27, 0.56, 0];
const MID_SKEW = [0, 0.05, 0.1, 0.2, 0.33, 0.32, 0];
const MOSTLY_MALE = [0.87, 0.125, 0.005];
const MIXED = [0.7, 0.29, 0.01];

const ADS: Record<string, AdProfile> = {
  '3.1': { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MOSTLY_MALE },
  spydirect2: { offer: OFFER_MONTHLY, provider: 'BlueGlow', active: true, age: MID_SKEW, gender: MOSTLY_MALE },
  spydirect3: { offer: OFFER_MONTHLY, provider: 'BlueGlow', active: true, age: MID_SKEW, gender: MIXED },
  medvireds_v2: { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MIXED },
  '4.1': { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MOSTLY_MALE },
  medvi1: { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MOSTLY_MALE },
  medvi3: { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: MID_SKEW, gender: MOSTLY_MALE },
  medvi5: { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MIXED },
  medvi6: { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MOSTLY_MALE },
  spydirect4: { offer: OFFER_MONTHLY, provider: 'BlueGlow', active: true, age: MID_SKEW, gender: MOSTLY_MALE },
  '4.2': { offer: OFFER_TRIAL, provider: 'BlueGlow', active: true, age: OLDER_SKEW, gender: MOSTLY_MALE },
  medvi2: { offer: OFFER_TRIAL, provider: null, active: true, age: OLDER_SKEW, gender: MOSTLY_MALE },
  medvi4: { offer: OFFER_TRIAL, provider: null, active: false, age: OLDER_SKEW, gender: MIXED },
  spydirect1: { offer: OFFER_MONTHLY, provider: null, active: false, age: MID_SKEW, gender: MOSTLY_MALE },
  adterm_white_1: { offer: OFFER_MONTHLY, provider: 'Ad_Term_White', active: true, age: MID_SKEW, gender: MIXED },
};

// date, adName, spend (before fee), revenue, first page views, link clicks, impressions,
// then funnel stages: Q.S., lead, add to cart, purchase
type SeedRow = [string, string, number, number, number, number, number, number, number, number, number];

const SEED: SeedRow[] = [
  // August
  ['2026-08-12', 'adterm_white_1', 610.0, 540, 90, 150, 4800, 30, 9, 8, 2],
  ['2026-08-15', 'medvi2', 120.0, 95, 12, 22, 600, 4, 1, 1, 1],
  ['2026-08-20', '3.1', 700.0, 650, 105, 180, 5600, 35, 10, 9, 3],
  ['2026-08-26', 'adterm_white_1', 540.0, 610, 84, 141, 4300, 28, 8, 8, 3],
  // September
  ['2026-09-03', '3.1', 812.4, 610, 118, 214, 6400, 40, 11, 10, 3],
  ['2026-09-05', 'spydirect2', 200.0, 240, 32, 56, 1650, 9, 3, 3, 1],
  ['2026-09-06', 'medvi3', 81.0, 0, 14, 24, 720, 7, 2, 1, 0],
  ['2026-09-08', 'spydirect3', 180.0, 0, 25, 44, 1300, 7, 2, 2, 0],
  ['2026-09-09', 'medvi2', 68.57, 0, 11, 19, 560, 3, 1, 0, 0],
  ['2026-09-10', '3.1', 905.11, 720, 131, 232, 6830, 44, 12, 12, 3],
  ['2026-09-11', '4.1', 107.0, 225, 18, 30, 900, 3, 2, 2, 1],
  ['2026-09-12', 'spydirect2', 210.0, 245, 34, 59, 1740, 9, 3, 3, 1],
  ['2026-09-13', 'medvi5', 78.0, 0, 13, 22, 660, 3, 0, 0, 0],
  ['2026-09-14', 'medvireds_v2', 140.0, 0, 22, 38, 1120, 8, 3, 2, 0],
  ['2026-09-15', '4.2', 38.68, 0, 2, 4, 120, 1, 0, 0, 0],
  ['2026-09-16', 'medvi1', 93.0, 230, 16, 27, 800, 6, 2, 1, 1],
  ['2026-09-17', '3.1', 878.22, 560, 120, 225, 6610, 41, 11, 11, 2],
  ['2026-09-18', 'medvi4', 60.0, 0, 10, 18, 540, 2, 0, 0, 0],
  ['2026-09-19', 'spydirect2', 159.0, 190, 26, 45, 1310, 8, 2, 3, 1],
  ['2026-09-20', 'medvi6', 75.0, 230, 13, 22, 650, 5, 2, 2, 1],
  ['2026-09-21', 'spydirect3', 160.0, 0, 23, 40, 1180, 7, 2, 2, 0],
  ['2026-09-22', 'spydirect1', 70.0, 0, 12, 21, 620, 3, 0, 0, 0],
  ['2026-09-23', 'spydirect4', 72.0, 0, 12, 21, 620, 3, 0, 0, 0],
  ['2026-09-24', '3.1', 305.92, 360, 26, 37, 905, 8, 3, 3, 2],
];

export const SEED_ROWS: AdMetricRow[] = SEED.map(
  ([date, adName, spend, revenue, lpv, clicks, impressions, qs, lead, addToCart, purchase]) => {
    const profile = ADS[adName];
    if (!profile) throw new Error(`Seed row references unknown ad "${adName}"`);
    return {
      date,
      adName,
      offer: profile.offer,
      provider: profile.provider,
      spend,
      revenue,
      landingPageViews: lpv,
      linkClicks: clicks,
      impressions,
      qs,
      lead,
      addToCart,
      purchase,
    };
  },
);

export { DATE_RANGE_OPTIONS, isDateRangeKey };

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface FacebookDashboardQuery {
  dateRange: DateRangeKey;
  ad?: string | undefined;
  offer?: string | undefined;
}

const feeRateFor = (provider: string | null) =>
  SEED_PROVIDERS.find((p) => p.name === provider)?.feeRate ?? 0;

function summariseProviders(rows: AdMetricRow[]): ProviderFeeSummary[] {
  return SEED_PROVIDERS.map((p) => {
    const amountSpent = round2(
      rows.filter((r) => r.provider === p.name).reduce((sum, r) => sum + r.spend, 0),
    );
    const providerFee = round2(amountSpent * p.feeRate);
    return {
      name: p.name,
      feeRate: p.feeRate,
      amountSpent,
      providerFee,
      totalWithFee: round2(amountSpent + providerFee),
    };
  });
}

function computeKpis(rows: AdMetricRow[], providers: ProviderFeeSummary[]): FacebookKpis {
  const sum = (pick: (r: AdMetricRow) => number) => rows.reduce((acc, r) => acc + pick(r), 0);

  const revenue = round2(sum((r) => r.revenue));
  const spendBeforeFees = round2(sum((r) => r.spend));
  const providerFees = round2(providers.reduce((acc, p) => acc + p.providerFee, 0));
  const spend = round2(spendBeforeFees + providerFees);
  const netProfit = round2(revenue - spend);
  const landingPageViews = sum((r) => r.landingPageViews);
  const linkClicks = sum((r) => r.linkClicks);
  const impressions = sum((r) => r.impressions);

  return {
    revenue,
    spendBeforeFees,
    providerFees,
    spend,
    netProfit,
    roas: spend > 0 ? netProfit / spend : null,
    landingPageViews,
    linkClicks,
    impressions,
    cpc: linkClicks > 0 ? spendBeforeFees / linkClicks : null,
    ctr: impressions > 0 ? linkClicks / impressions : null,
    adCount: new Set(rows.map((r) => r.adName)).size,
  };
}

function summariseByAd(rows: AdMetricRow[]): AdBreakdown[] {
  const byName = new Map<string, AdBreakdown>();
  for (const r of rows) {
    const entry = byName.get(r.adName) ?? {
      adName: r.adName,
      offer: r.offer,
      provider: r.provider,
      active: ADS[r.adName]?.active ?? true,
      revenue: 0,
      spendBeforeFees: 0,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      ctr: null,
      cpc: null,
      cac: null,
      roas: null,
      funnel: { firstPageView: 0, qs: 0, lead: 0, addToCart: 0, purchase: 0 },
    };
    entry.revenue += r.revenue;
    entry.spendBeforeFees += r.spend;
    entry.impressions += r.impressions;
    entry.linkClicks += r.linkClicks;
    entry.funnel.firstPageView += r.landingPageViews;
    entry.funnel.qs += r.qs;
    entry.funnel.lead += r.lead;
    entry.funnel.addToCart += r.addToCart;
    entry.funnel.purchase += r.purchase;
    byName.set(r.adName, entry);
  }
  return [...byName.values()]
    .map((a) => {
      const revenue = round2(a.revenue);
      const spendBeforeFees = round2(a.spendBeforeFees);
      const spend = round2(spendBeforeFees * (1 + feeRateFor(a.provider)));
      return {
        ...a,
        revenue,
        spendBeforeFees,
        spend,
        ctr: a.impressions > 0 ? a.linkClicks / a.impressions : null,
        cpc: a.linkClicks > 0 ? spendBeforeFees / a.linkClicks : null,
        cac: a.funnel.purchase > 0 ? spend / a.funnel.purchase : null,
        roas: spend > 0 ? (revenue - spend) / spend : null,
      };
    })
    .sort((a, b) => b.spend - a.spend || a.adName.localeCompare(b.adName));
}

/** Split an integer total across weights so the parts sum exactly to the total (largest remainder). */
function apportion(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || weightSum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / weightSum);
  const parts = exact.map(Math.floor);
  let remainder = total - parts.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i]! += 1;
    remainder -= 1;
  }
  return parts;
}

function summariseAudience(rows: AdMetricRow[]): FacebookAudience {
  const age = AGE_BUCKETS.map(() => 0);
  const gender = GENDER_BUCKETS.map(() => 0);

  for (const r of rows) {
    const profile = ADS[r.adName];
    if (!profile) continue;
    apportion(r.linkClicks, profile.age).forEach((n, i) => (age[i]! += n));
    apportion(r.linkClicks, profile.gender).forEach((n, i) => (gender[i]! += n));
  }

  const toBuckets = (labels: readonly string[], values: number[]): AudienceBucket[] =>
    labels.map((label, i) => ({ label, value: values[i] ?? 0 }));

  return {
    metric: 'linkClicks',
    age: toBuckets(AGE_BUCKETS, age),
    gender: toBuckets(GENDER_BUCKETS, gender),
  };
}

const emptyDay = (date: string): DailyPoint => ({
  date,
  revenue: 0,
  spendBeforeFees: 0,
  spend: 0,
  grossProfit: 0,
  netProfit: 0,
  linkClicks: 0,
  purchases: 0,
  cac: null,
  roas: null,
  funnel: { firstPageView: 0, qs: 0, lead: 0, addToCart: 0, purchase: 0 },
});

/**
 * Aggregate rows per day. When `dates` is given, every listed day is present in
 * the output (as zeros if the rows have nothing for it).
 */
function summariseDaily(rows: AdMetricRow[], dates?: string[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const date of dates ?? []) byDate.set(date, emptyDay(date));
  for (const r of rows) {
    const entry = byDate.get(r.date) ?? emptyDay(r.date);
    entry.revenue += r.revenue;
    entry.spendBeforeFees += r.spend;
    entry.spend += r.spend * (1 + feeRateFor(r.provider));
    entry.linkClicks += r.linkClicks;
    entry.purchases += r.purchase;
    entry.funnel.firstPageView += r.landingPageViews;
    entry.funnel.qs += r.qs;
    entry.funnel.lead += r.lead;
    entry.funnel.addToCart += r.addToCart;
    entry.funnel.purchase += r.purchase;
    byDate.set(r.date, entry);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const revenue = round2(d.revenue);
      const spendBeforeFees = round2(d.spendBeforeFees);
      const spend = round2(d.spend);
      return {
        ...d,
        revenue,
        spendBeforeFees,
        spend,
        grossProfit: round2(revenue - spendBeforeFees),
        netProfit: round2(revenue - spend),
        cac: d.purchases > 0 ? round2(spend / d.purchases) : null,
        roas: spend > 0 ? (revenue - spend) / spend : null,
      };
    });
}

function filterRows(query: FacebookDashboardQuery): AdMetricRow[] {
  const range = resolveRange(query.dateRange, META.dataThrough);
  return SEED_ROWS.filter((r) => {
    if (range && (r.date < range.from || r.date > range.to)) return false;
    if (query.ad && r.adName !== query.ad) return false;
    if (query.offer && r.offer !== query.offer) return false;
    return true;
  });
}

export function getFacebookDashboard(query: FacebookDashboardQuery): FacebookDashboard {
  const rows = filterRows(query);

  const providers = summariseProviders(rows);

  return {
    ...META,
    filters: {
      dateRange: query.dateRange,
      ad: query.ad ?? null,
      offer: query.offer ?? null,
      options: {
        dateRanges: DATE_RANGE_OPTIONS,
        ads: Object.keys(ADS).sort((a, b) => a.localeCompare(b)),
        offers: [...new Set(Object.values(ADS).map((a) => a.offer))].sort(),
      },
    },
    kpis: computeKpis(rows, providers),
    providers,
    byAd: summariseByAd(rows),
    audience: summariseAudience(rows),
    daily: summariseDaily(rows),
  };
}

// ---------------------------------------------------------------------------
// Ad detail + marketing read
// ---------------------------------------------------------------------------

const LOW_SAMPLE_CLICKS = 10;
const INLINE_THRESHOLD = 0.02; // within ±2 % counts as "in line"
const SCALE_ROAS = 0.25; // net return ≥ 25 % of spend → scale
const REVIEW_ROAS = -0.25; // net return ≤ −25 % of spend → review

function compareMetric(
  value: number | null,
  accountValue: number | null,
  higherIsBetter: boolean,
): MetricComparison | null {
  if (value === null || accountValue === null || accountValue === 0) return null;
  const diff = (value - accountValue) / accountValue;
  const magnitude = Math.round(Math.abs(diff) * 100);
  if (Math.abs(diff) < INLINE_THRESHOLD) {
    return { value, accountValue, diff, direction: 'inline', sentiment: 'neutral', label: 'in line with account avg' };
  }
  const direction = diff > 0 ? 'above' : 'below';
  const sentiment = (diff > 0) === higherIsBetter ? 'good' : 'bad';
  return { value, accountValue, diff, direction, sentiment, label: `${magnitude}% ${direction} account avg` };
}

function buildRead(
  ad: AdBreakdown,
  comparisons: AdDetail['comparisons'],
): MarketingRead {
  const spendText = formatCurrency(ad.spend);

  if (ad.spend <= 0 && ad.linkClicks === 0) {
    return {
      status: 'no_data',
      statusLabel: 'No data',
      bullets: ['No spend or clicks were recorded for this ad in the selected period.'],
      nextStep: 'Pick a wider date range, or confirm the ad was live during this period.',
    };
  }

  const metricLine = (name: string, value: string, c: MetricComparison | null) =>
    c ? `${name} is ${value} (${c.label}).` : `${name} is ${value}.`;

  const bullets: string[] = [];

  if (ad.linkClicks < LOW_SAMPLE_CLICKS) {
    bullets.push(
      `${spendText} spent for ${ad.linkClicks} link click${ad.linkClicks === 1 ? '' : 's'} — too few to judge performance reliably.`,
    );
    if (ad.ctr !== null) bullets.push(metricLine('CTR', formatPercent(ad.ctr, 2), comparisons.ctr));
    if (ad.cpc !== null) bullets.push(metricLine('CPC', formatCurrency(ad.cpc), comparisons.cpc));
    return {
      status: 'low_sample',
      statusLabel: 'Low sample',
      bullets,
      nextStep:
        'Not enough clicks to act on. Let the ad gather at least 10 clicks, or widen the date range, before deciding whether to scale or cut.',
    };
  }

  const roas = ad.roas ?? 0;
  const roasText = formatPercent(roas, 1);
  const summary =
    roas >= SCALE_ROAS
      ? 'clearly profitable relative to spend'
      : roas >= 0
        ? 'currently profitable relative to spend'
        : roas > REVIEW_ROAS
          ? 'slightly unprofitable relative to spend'
          : 'losing money relative to spend';
  bullets.push(`${spendText} spent, net ROAS ${roasText} — ${summary}.`);

  if (ad.ctr !== null) bullets.push(metricLine('CTR', formatPercent(ad.ctr, 2), comparisons.ctr));
  if (ad.cpc !== null) bullets.push(metricLine('CPC', formatCurrency(ad.cpc), comparisons.cpc));
  bullets.push(
    ad.cac === null
      ? 'CAC is not available yet (no purchases in this period).'
      : metricLine('CAC', formatCurrency(ad.cac), comparisons.cac),
  );

  if (roas >= SCALE_ROAS) {
    return {
      status: 'scale',
      statusLabel: 'Scale',
      bullets,
      nextStep:
        'Profitable with headroom. Increase budget in 20–30% steps and watch CAC and CTR for decay as spend rises.',
    };
  }
  if (roas > REVIEW_ROAS) {
    return {
      status: 'monitor',
      statusLabel: 'Monitor',
      bullets,
      nextStep:
        'Roughly breakeven. Hold spend steady rather than scaling, and test creative or targeting variations before committing more budget.',
    };
  }
  return {
    status: 'review',
    statusLabel: 'Review',
    bullets,
    nextStep:
      'Unprofitable at current efficiency. Cut or pause spend unless the funnel drop-off can be fixed, and redirect budget to ads with a positive net return.',
  };
}

// ---------------------------------------------------------------------------
// Creative taxonomy seed. TODO: replace with the classifier output per creative.
// ---------------------------------------------------------------------------

const TAXONOMY_VERSION = 'V1';
const TAXONOMY_SOURCE = 'Classified from creative content directly, per spec Rule 5';

type FieldSpec = [key: string, label: string, value: string, confidence: number | null];

const field = ([key, label, value, confidence]: FieldSpec): TaxonomyField => ({
  key,
  label,
  value,
  confidence,
});

interface TaxonomyTemplate {
  intention: FieldSpec[];
  execution: FieldSpec[];
}

const SPYDIRECT_TAXONOMY: TaxonomyTemplate = {
  intention: [
    ['angle', 'Angle', 'Relationship', 0.8],
    ['hook', 'Hook', 'She Knows What He Needs', 0.92],
    ['hookType', 'Hook Type', 'Curiosity', 0.82],
    ['claim', 'Claim', 'Works in 15 min, lasts 36 hrs, 3-in-1 formula', 0.88],
    ['stylePrimary', 'Style (Primary)', 'Direct', 0.82],
    ['styleSecondary', 'Style (Secondary)', 'Informative', 0.7],
    ['targetGender', 'Target Gender', 'Male', 0.7],
    ['targetAge', 'Target Age', 'Older_55_Plus', 0.8],
    ['offerType', 'Offer Type', 'No_Offer', 0.78],
    ['offerText', 'Offer Text', 'Flat $79 price stated, no % discount shown', 0.82],
  ],
  execution: [
    ['format', 'Format', 'Static', null],
    ['header', 'Header', 'She Knows What He Needs', 0.92],
    ['bodyCopy', 'Body Copy', 'Works in 15 min, Lasts 36 hrs, 3-in-1 formula, Discreet, Online, Ships to your door', 0.88],
    ['ctaText', 'CTA Text', 'Check My Price', 0.9],
    ['ctaType', 'CTA Type', 'Claim_Offer', 0.85],
    ['mainVisual', 'Main Visual', 'Single_Person', 0.9],
    ['personGender', 'Person Gender', 'Female', 0.95],
    ['personAge', 'Person Age', 'Older_55_Plus', 0.82],
  ],
};

const MEDVI_TAXONOMY: TaxonomyTemplate = {
  intention: [
    ['angle', 'Angle', 'Medical_Authority', 0.84],
    ['hook', 'Hook', 'Doctor-Trusted Formula, Delivered Discreetly', 0.9],
    ['hookType', 'Hook Type', 'Authority', 0.86],
    ['claim', 'Claim', 'Same active ingredients, up to 80% less than brand', 0.83],
    ['stylePrimary', 'Style (Primary)', 'Informative', 0.8],
    ['styleSecondary', 'Style (Secondary)', 'Reassuring', 0.66],
    ['targetGender', 'Target Gender', 'Male', 0.76],
    ['targetAge', 'Target Age', 'Middle_45_54', 0.72],
    ['offerType', 'Offer Type', 'Percent_Discount', 0.81],
    ['offerText', 'Offer Text', 'Up to 80% off vs. brand-name', 0.79],
  ],
  execution: [
    ['format', 'Format', 'Video', null],
    ['header', 'Header', 'Doctor-Trusted Formula', 0.9],
    ['bodyCopy', 'Body Copy', 'US-licensed providers, Free online visit, Discreet packaging, Cancel anytime', 0.85],
    ['ctaText', 'CTA Text', 'Start Online Visit', 0.91],
    ['ctaType', 'CTA Type', 'Start_Process', 0.84],
    ['mainVisual', 'Main Visual', 'Product_And_Person', 0.78],
    ['personGender', 'Person Gender', 'Male', 0.88],
    ['personAge', 'Person Age', 'Middle_45_54', 0.74],
  ],
};

const NUMBERED_TAXONOMY: TaxonomyTemplate = {
  intention: [
    ['angle', 'Angle', 'Performance', 0.86],
    ['hook', 'Hook', 'Ready When You Are', 0.88],
    ['hookType', 'Hook Type', 'Benefit', 0.84],
    ['claim', 'Claim', 'Fast-acting, lasts up to 36 hrs', 0.87],
    ['stylePrimary', 'Style (Primary)', 'Direct', 0.85],
    ['styleSecondary', 'Style (Secondary)', 'Bold', 0.68],
    ['targetGender', 'Target Gender', 'Male', 0.82],
    ['targetAge', 'Target Age', 'Older_55_Plus', 0.77],
    ['offerType', 'Offer Type', 'Trial_Price', 0.8],
    ['offerText', 'Offer Text', 'Trial pack from $39', 0.83],
  ],
  execution: [
    ['format', 'Format', 'Static', null],
    ['header', 'Header', 'Ready When You Are', 0.88],
    ['bodyCopy', 'Body Copy', 'Fast-acting, Long-lasting, Discreet delivery, No waiting rooms', 0.86],
    ['ctaText', 'CTA Text', 'Get Started', 0.9],
    ['ctaType', 'CTA Type', 'Start_Process', 0.83],
    ['mainVisual', 'Main Visual', 'Couple', 0.87],
    ['personGender', 'Person Gender', 'Mixed', 0.9],
    ['personAge', 'Person Age', 'Older_55_Plus', 0.8],
  ],
};

const ADTERM_TAXONOMY: TaxonomyTemplate = {
  intention: [
    ['angle', 'Angle', 'Price', 0.83],
    ['hook', 'Hook', 'Stop Overpaying at the Pharmacy', 0.89],
    ['hookType', 'Hook Type', 'Problem', 0.81],
    ['claim', 'Claim', 'Monthly plan, ships free', 0.8],
    ['stylePrimary', 'Style (Primary)', 'Informative', 0.79],
    ['styleSecondary', 'Style (Secondary)', 'Direct', 0.69],
    ['targetGender', 'Target Gender', 'Male', 0.74],
    ['targetAge', 'Target Age', 'Middle_45_54', 0.71],
    ['offerType', 'Offer Type', 'Subscription', 0.82],
    ['offerText', 'Offer Text', 'Monthly plan, cancel anytime', 0.8],
  ],
  execution: [
    ['format', 'Format', 'Carousel', null],
    ['header', 'Header', 'Stop Overpaying', 0.89],
    ['bodyCopy', 'Body Copy', 'Compare prices, Free shipping, Licensed pharmacy, Discreet packaging', 0.84],
    ['ctaText', 'CTA Text', 'Compare Prices', 0.9],
    ['ctaType', 'CTA Type', 'Compare', 0.82],
    ['mainVisual', 'Main Visual', 'Product_Only', 0.86],
    ['personGender', 'Person Gender', 'None', 0.93],
    ['personAge', 'Person Age', 'None', 0.93],
  ],
};

const AD_TAXONOMY: Record<string, TaxonomyTemplate> = {
  '3.1': NUMBERED_TAXONOMY,
  '4.1': NUMBERED_TAXONOMY,
  '4.2': NUMBERED_TAXONOMY,
  spydirect1: SPYDIRECT_TAXONOMY,
  spydirect2: SPYDIRECT_TAXONOMY,
  spydirect3: SPYDIRECT_TAXONOMY,
  spydirect4: SPYDIRECT_TAXONOMY,
  medvi1: MEDVI_TAXONOMY,
  medvi2: MEDVI_TAXONOMY,
  medvi3: MEDVI_TAXONOMY,
  medvi4: MEDVI_TAXONOMY,
  medvi5: MEDVI_TAXONOMY,
  medvi6: MEDVI_TAXONOMY,
  medvireds_v2: MEDVI_TAXONOMY,
  adterm_white_1: ADTERM_TAXONOMY,
};

function getTaxonomy(adName: string): CreativeTaxonomy | null {
  const template = AD_TAXONOMY[adName];
  if (!template) return null;
  return {
    version: TAXONOMY_VERSION,
    source: TAXONOMY_SOURCE,
    intention: template.intention.map(field),
    execution: template.execution.map(field),
  };
}

export function getFacebookAdDetail(adName: string, dateRange: DateRangeKey): AdDetail | null {
  if (!ADS[adName]) return null;

  const rows = filterRows({ dateRange });
  const byAd = summariseByAd(rows);
  const ad =
    byAd.find((a) => a.adName === adName) ??
    // known ad with no rows in this range: return an empty summary so the page still renders
    summariseByAd(
      SEED_ROWS.filter((r) => r.adName === adName).map((r) => ({
        ...r,
        spend: 0,
        revenue: 0,
        landingPageViews: 0,
        linkClicks: 0,
        impressions: 0,
        qs: 0,
        lead: 0,
        addToCart: 0,
        purchase: 0,
      })),
    )[0]!;

  // account-wide blended values for the same period
  const providers = summariseProviders(rows);
  const kpis = computeKpis(rows, providers);
  const purchases = rows.reduce((sum, r) => sum + r.purchase, 0);
  const account = {
    ctr: kpis.ctr,
    cpc: kpis.cpc,
    cac: purchases > 0 ? kpis.spend / purchases : null,
  };

  const comparisons = {
    ctr: compareMetric(ad.ctr, account.ctr, true),
    cpc: compareMetric(ad.cpc, account.cpc, false),
    cac: compareMetric(ad.cac, account.cac, false),
  };

  // every day the account reported on in this range, so gaps are visible per ad
  const reportingDays = [...new Set(rows.map((r) => r.date))].sort();
  const adRows = rows.filter((r) => r.adName === adName);

  return {
    ad,
    taxonomy: getTaxonomy(adName),
    audience: summariseAudience(adRows),
    dateRange,
    dateRangeLabel: DATE_RANGE_OPTIONS.find((o) => o.key === dateRange)?.label ?? dateRange,
    dateRangeOptions: DATE_RANGE_OPTIONS,
    dataThrough: META.dataThrough,
    account,
    comparisons,
    read: buildRead(ad, comparisons),
    daily: summariseDaily(adRows, reportingDays),
  };
}
