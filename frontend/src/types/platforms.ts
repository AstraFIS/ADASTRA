export type PlatformId = 'facebook' | 'google' | 'microsoft';

export interface PlatformMetrics {
  spend: number;
  revenue: number;
  netProfit: number;
  activeAds: number;
  /** Latest day inside the selected month that has data (YYYY-MM-DD), null when the month is empty. */
  dataThrough: string | null;
}

export interface PlatformSummary {
  id: PlatformId;
  name: string;
  connected: boolean;
  metrics: PlatformMetrics | null;
}

export interface PortfolioTotals {
  revenue: number;
  spend: number;
  netProfit: number;
}

export interface OverviewMonth {
  value: string; // YYYY-MM
  label: string; // "October 2026"
}

export interface PortfolioOverview {
  client: string;
  portfolio: string;
  /** The month the totals cover; the current calendar month unless one was chosen. */
  period: { month: string; label: string; from: string; to: string; is_current: boolean; current_month: string };
  /** Months that have data on any platform the caller sees, newest first (always includes this month). */
  months: OverviewMonth[];
  totals: PortfolioTotals;
  platforms: PlatformSummary[];
}

export const PLATFORM_ICONS: Record<PlatformId, string> = {
  facebook: '📘',
  google: '🔍',
  microsoft: '🪟',
};
