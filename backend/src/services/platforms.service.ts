import type { PlatformMetrics, PlatformSummary, PortfolioOverview } from '../types/platforms.js';
import { getBingDashboard } from './bing.service.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

function metrics(input: Omit<PlatformMetrics, 'netProfit'>): PlatformMetrics {
  return { ...input, netProfit: round2(input.revenue - input.spend) };
}

/** Bing totals over everything loaded so far; the export is per offer, so offers stand in for the ad count. */
function bingMetrics(): PlatformMetrics {
  const { statistics, options } = getBingDashboard({ range: 'all_time' });
  return metrics({
    spend: statistics.total_amount_spend,
    revenue: statistics.total_revenue,
    activeAds: options.offers.length,
  });
}

// TODO: replace with live data once the Facebook / Google integrations exist.
// Until then this is the source of truth for the overview.
function platforms(): PlatformSummary[] {
  return [
    {
      id: 'facebook',
      name: 'Facebook',
      connected: true,
      metrics: metrics({ spend: 6137.92, revenue: 2250, activeAds: 75 }),
    },
    { id: 'google', name: 'Google', connected: false, metrics: null },
    { id: 'microsoft', name: 'Microsoft (Bing)', connected: true, metrics: bingMetrics() },
  ];
}

const CLIENT = 'Direct Meds ED';
const PORTFOLIO = 'Media Performance Portfolio';

export function getPortfolioOverview(): PortfolioOverview {
  const all = platforms();
  const connected = all.filter((p) => p.connected && p.metrics);
  const revenue = round2(connected.reduce((sum, p) => sum + (p.metrics?.revenue ?? 0), 0));
  const spend = round2(connected.reduce((sum, p) => sum + (p.metrics?.spend ?? 0), 0));

  return {
    client: CLIENT,
    portfolio: PORTFOLIO,
    totals: { revenue, spend, netProfit: round2(revenue - spend) },
    platforms: all,
  };
}
