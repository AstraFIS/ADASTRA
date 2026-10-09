export const DATE_RANGE_KEYS = [
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'all_time',
] as const;
export type DateRangeKey = (typeof DATE_RANGE_KEYS)[number];

export interface DateRangeOption {
  key: DateRangeKey;
  label: string;
}

/** One reporting row: an ad's metrics for a single day. */
export interface AdMetricRow {
  date: string; // YYYY-MM-DD
  adName: string;
  offer: string;
  provider: string | null;
  spend: number; // before provider fee
  revenue: number;
  landingPageViews: number; // shown as "First Page View" in the funnel table
  linkClicks: number;
  impressions: number;
  // funnel stages after the first page view (page visit)
  qs: number; // "Q.S." = quiz start
  lead: number; // "Q.C." = questionnaire completed (quiz end)
  addToCart: number;
  purchase: number; // verified conversion count (CV), used for CAC / ROAS
}

export interface ProviderFeeSummary {
  name: string;
  feeRate: number; // 0.0638 = 6.38 %
  amountSpent: number;
  providerFee: number;
  totalWithFee: number;
}

export interface FacebookKpis {
  revenue: number;
  spendBeforeFees: number;
  providerFees: number;
  spend: number; // grossed up: spendBeforeFees + providerFees
  netProfit: number;
  roas: number | null; // netProfit / spend
  landingPageViews: number;
  linkClicks: number;
  impressions: number;
  cpc: number | null; // spendBeforeFees / linkClicks
  ctr: number | null; // linkClicks / impressions
  adCount: number;
}

export interface FacebookDashboardFilters {
  dateRange: DateRangeKey;
  ad: string | null;
  offer: string | null;
  options: {
    dateRanges: DateRangeOption[];
    ads: string[];
    offers: string[];
  };
}

/** Per-ad totals for the by-ad chart and the funnel table. */
export interface AdBreakdown {
  adName: string;
  offer: string;
  provider: string | null;
  active: boolean;
  revenue: number;
  spendBeforeFees: number;
  spend: number; // grossed up with the provider fee
  impressions: number;
  linkClicks: number;
  ctr: number | null; // linkClicks / impressions
  cpc: number | null; // spendBeforeFees / linkClicks
  cac: number | null; // spend / purchases
  roas: number | null; // (revenue − spend) / spend
  funnel: AdFunnel;
}

export interface AudienceBucket {
  label: string;
  value: number;
}

export interface FacebookAudience {
  /** Which metric the buckets count. */
  metric: 'linkClicks';
  age: AudienceBucket[];
  gender: AudienceBucket[];
}

export interface AdFunnel {
  firstPageView: number;
  qs: number;
  lead: number;
  addToCart: number;
  purchase: number;
}

/** One day's totals across the filtered rows, for the daily trend charts and table. */
export interface DailyPoint {
  date: string; // YYYY-MM-DD
  revenue: number;
  spendBeforeFees: number;
  spend: number; // grossed up with provider fees
  grossProfit: number; // revenue − spendBeforeFees
  netProfit: number; // revenue − spend
  linkClicks: number;
  purchases: number;
  cac: number | null; // spend / purchases, null when there were no purchases
  roas: number | null; // (revenue − spend) / spend, null when nothing was spent
  funnel: AdFunnel;
}

export interface FacebookDashboard {
  client: string;
  portfolio: string;
  sourceLabel: string;
  title: string;
  subtitle: string;
  lastUpdated: string; // YYYY-MM-DD
  dataThrough: string; // YYYY-MM-DD
  sourceNote: string;
  filters: FacebookDashboardFilters;
  kpis: FacebookKpis;
  providers: ProviderFeeSummary[];
  byAd: AdBreakdown[]; // sorted by spend, descending
  audience: FacebookAudience;
  daily: DailyPoint[]; // ascending by date; only days that have rows
}

// ---------------------------------------------------------------------------
// Ad detail page
// ---------------------------------------------------------------------------

export type ComparisonSentiment = 'good' | 'bad' | 'neutral';

/** How one of the ad's metrics compares with the account-wide blended value. */
export interface MetricComparison {
  value: number;
  accountValue: number;
  /** (value − accountValue) ÷ accountValue */
  diff: number;
  direction: 'above' | 'below' | 'inline';
  sentiment: ComparisonSentiment;
  /** e.g. "64% below account avg" */
  label: string;
}

export type ReadStatus = 'scale' | 'monitor' | 'review' | 'low_sample' | 'no_data';

export interface MarketingRead {
  status: ReadStatus;
  statusLabel: string;
  bullets: string[];
  nextStep: string;
}

export interface TaxonomyField {
  key: string;
  label: string;
  value: string;
  /** 0–1, or null when the field is not classified with a confidence (e.g. Format). */
  confidence: number | null;
}

export interface CreativeTaxonomy {
  version: string;
  source: string;
  intention: TaxonomyField[]; // "Intention / Message"
  execution: TaxonomyField[]; // "Physical / Execution"
}

export interface AdDetail {
  ad: AdBreakdown;
  taxonomy: CreativeTaxonomy | null;
  /** This ad's link clicks split by age and gender for the range. */
  audience: FacebookAudience;
  dateRange: DateRangeKey;
  dateRangeLabel: string;
  dateRangeOptions: DateRangeOption[];
  dataThrough: string;
  account: { ctr: number | null; cpc: number | null; cac: number | null };
  comparisons: {
    ctr: MetricComparison | null;
    cpc: MetricComparison | null;
    cac: MetricComparison | null;
  };
  read: MarketingRead;
  /** One point per reporting day in the range (days where the account has rows), zeros when this ad did not run. */
  daily: DailyPoint[];
}
