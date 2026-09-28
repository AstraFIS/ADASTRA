export type PlatformId = 'facebook' | 'google' | 'microsoft';

export interface PlatformMetrics {
  spend: number;
  revenue: number;
  netProfit: number;
  activeAds: number;
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

export interface PortfolioOverview {
  client: string;
  portfolio: string;
  totals: PortfolioTotals;
  platforms: PlatformSummary[];
}

export const PLATFORM_ICONS: Record<PlatformId, string> = {
  facebook: '📘',
  google: '🔍',
  microsoft: '🪟',
};
