export type DateRangeKey = 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days' | 'all_time';

export interface DateRangeOption {
  key: DateRangeKey;
  label: string;
}

export interface ProviderFeeSummary {
  name: string;
  feeRate: number;
  amountSpent: number;
  providerFee: number;
  totalWithFee: number;
}

export interface FacebookKpis {
  revenue: number;
  spendBeforeFees: number;
  providerFees: number;
  spend: number;
  netProfit: number;
  roas: number | null;
  landingPageViews: number;
  linkClicks: number;
  impressions: number;
  cpc: number | null;
  ctr: number | null;
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

export interface AdFunnel {
  firstPageView: number;
  qs: number;
  lead: number;
  addToCart: number;
  purchase: number;
}

export interface AdBreakdown {
  adName: string;
  offer: string;
  provider: string | null;
  active: boolean;
  revenue: number;
  spendBeforeFees: number;
  spend: number;
  impressions: number;
  linkClicks: number;
  ctr: number | null;
  cpc: number | null;
  cac: number | null;
  roas: number | null;
  funnel: AdFunnel;
}

export interface AudienceBucket {
  label: string;
  value: number;
}

export interface FacebookAudience {
  metric: 'linkClicks';
  age: AudienceBucket[];
  gender: AudienceBucket[];
}

export interface DailyPoint {
  date: string;
  revenue: number;
  spendBeforeFees: number;
  spend: number;
  grossProfit: number;
  netProfit: number;
  linkClicks: number;
  purchases: number;
  cac: number | null;
}

export interface FacebookDashboard {
  client: string;
  portfolio: string;
  sourceLabel: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  dataThrough: string;
  sourceNote: string;
  filters: FacebookDashboardFilters;
  kpis: FacebookKpis;
  providers: ProviderFeeSummary[];
  byAd: AdBreakdown[];
  audience: FacebookAudience;
  daily: DailyPoint[];
}

export type ComparisonSentiment = 'good' | 'bad' | 'neutral';

export interface MetricComparison {
  value: number;
  accountValue: number;
  diff: number;
  direction: 'above' | 'below' | 'inline';
  sentiment: ComparisonSentiment;
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
  confidence: number | null;
}

export interface CreativeTaxonomy {
  version: string;
  source: string;
  intention: TaxonomyField[];
  execution: TaxonomyField[];
}

export interface AdDetail {
  ad: AdBreakdown;
  taxonomy: CreativeTaxonomy | null;
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
  daily: DailyPoint[];
}
