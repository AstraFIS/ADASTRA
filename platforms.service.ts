import type { PlatformMetrics, PlatformSummary, PortfolioOverview } from '../types/platforms.js';
import type { UserAccess } from '../models/user.model.js';
import { hasPlatformAccess } from './access.service.js';
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion } from '../models/bingConversion.model.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

function metrics(input: Omit<PlatformMetrics, 'netProfit'>): PlatformMetrics {
  return { ...input, netProfit: round2(input.revenue - input.spend) };
}

/** Bing totals over everything loaded so far (bing_ad_reports spend, bing_conversions revenue). */
async function bingMetrics(): Promise<PlatformMetrics> {
  const [[spend], [revenue], ads] = await Promise.all([
    BingAdReport.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$spend_usd' } } }]),
    BingConversion.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$revenue_usd' } } }]),
    BingAdReport.distinct('ad_key'),
  ]);
  return metrics({
    spend: round2(spend?.total ?? 0),
    revenue: round2(revenue?.total ?? 0),
    activeAds: ads.length,
  });
}

// TODO: replace with live data once the Facebook / Google integrations exist.
// Until then this is the source of truth for the overview.
async function platforms(): Promise<PlatformSummary[]> {
  return [
    {
      id: 'facebook',
      name: 'Facebook',
      connected: true,
      metrics: metrics({ spend: 6137.92, revenue: 2250, activeAds: 75 }),
    },
    { id: 'google', name: 'Google', connected: false, metrics: null },
    { id: 'microsoft', name: 'Microsoft (Bing)', connected: true, metrics: await bingMetrics() },
  ];
}

const CLIENT = 'Direct Meds ED';
const PORTFOLIO = 'Media Performance Portfolio';

/** Only the platforms on the caller's access list are listed and counted. */
export async function getPortfolioOverview(access: UserAccess): Promise<PortfolioOverview> {
  const all = (await platforms()).filter((p) => hasPlatformAccess(access, p.id));
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
