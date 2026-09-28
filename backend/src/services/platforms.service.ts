import type { PlatformMetrics, PlatformSummary, PortfolioOverview } from '../types/platforms.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

function metrics(input: Omit<PlatformMetrics, 'netProfit'>): PlatformMetrics {
  return { ...input, netProfit: round2(input.revenue - input.spend) };
}

// TODO: replace with live data once the Facebook / Google / Microsoft
// integrations exist. Until then this is the source of truth for the overview.
const PLATFORMS: PlatformSummary[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    connected: true,
    metrics: metrics({ spend: 6137.92, revenue: 2250, activeAds: 75 }),
  },
  { id: 'google', name: 'Google', connected: false, metrics: null },
  { id: 'microsoft', name: 'Microsoft (Bing)', connected: false, metrics: null },
];

const CLIENT = 'Direct Meds ED';
const PORTFOLIO = 'Media Performance Portfolio';

export function getPortfolioOverview(): PortfolioOverview {
  const connected = PLATFORMS.filter((p) => p.connected && p.metrics);
  const revenue = round2(connected.reduce((sum, p) => sum + (p.metrics?.revenue ?? 0), 0));
  const spend = round2(connected.reduce((sum, p) => sum + (p.metrics?.spend ?? 0), 0));

  return {
    client: CLIENT,
    portfolio: PORTFOLIO,
    totals: { revenue, spend, netProfit: round2(revenue - spend) },
    platforms: PLATFORMS,
  };
}
