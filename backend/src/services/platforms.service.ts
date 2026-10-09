/**
 * Front-page overview: live totals per platform for one calendar month.
 *
 *   Facebook – facebook_ad_reports via getFbStatistics (same numbers as the Facebook page:
 *              revenue, spend incl. provider fees), limited to the ads the user may see.
 *   Bing     – bing_ad_reports (spend) + bing_conversions (revenue).
 *   Google   – not connected yet.
 *
 * Without a `month` the current calendar month is used, so the page rolls over to the
 * new month by itself on the 1st.
 */
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion } from '../models/bingConversion.model.js';
import type { UserAccess, UserRole } from '../models/user.model.js';
import type { OverviewMonth, PlatformMetrics, PlatformSummary, PortfolioOverview } from '../types/platforms.js';
import { dayExpr } from '../utils/bingDate.js';
import { isoDay } from '../utils/dateRange.js';
import { facebookAdScope, hasPlatformAccess } from './access.service.js';
import { getFbStatistics, reportAggregate } from './fbStatistics.service.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

const CLIENT = 'Direct Meds ED';
const PORTFOLIO = 'Media Performance Portfolio';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

interface Period {
  month: string; // YYYY-MM
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (last day of the month)
}

function period(month: string): Period {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { month, from: `${month}-01`, to: isoDay(new Date(Date.UTC(y, m, 0))) };
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

function metrics(input: Omit<PlatformMetrics, 'netProfit'>): PlatformMetrics {
  return { ...input, spend: round2(input.spend), revenue: round2(input.revenue), netProfit: round2(input.revenue - input.spend) };
}

const dayRange = (p: Period) => ({ $gte: new Date(`${p.from}T00:00:00Z`), $lte: new Date(`${p.to}T00:00:00Z`) });

// ---------------------------------------------------------------------------
// Facebook
// ---------------------------------------------------------------------------
async function facebookMetrics(user: { role: UserRole; access: UserAccess }, p: Period): Promise<PlatformMetrics> {
  const allowedAds = await facebookAdScope(user);
  if (allowedAds && allowedAds.length === 0) {
    return metrics({ spend: 0, revenue: 0, activeAds: 0, dataThrough: null });
  }
  const [stats, [last]] = await Promise.all([
    getFbStatistics({ range: 'this_month', from: p.from, to: p.to, allowedAds }),
    reportAggregate<{ d: Date }>([
      { $match: { report_date: { $type: 'date', $gte: new Date(`${p.from}T00:00:00Z`), $lte: new Date(`${p.to}T23:59:59.999Z`) } } },
      { $group: { _id: null, d: { $max: '$report_date' } } },
    ]),
  ]);
  return metrics({
    spend: stats.statistics.total_amount_spend,
    revenue: stats.statistics.total_revenue,
    activeAds: stats.meta.ads,
    dataThrough: last?.d ? isoDay(last.d) : null,
  });
}

async function facebookMonths(): Promise<string[]> {
  const rows = await reportAggregate<{ _id: string }>([
    { $match: { report_date: { $type: 'date' } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$report_date', timezone: 'UTC' } } } },
  ]);
  return rows.map((r) => r._id).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Bing (day fields may be Dates or "DD/MM/YYYY" text — see dayExpr)
// ---------------------------------------------------------------------------
async function bingMetrics(p: Period): Promise<PlatformMetrics> {
  const range = dayRange(p);
  const [[ads], [conv]] = await Promise.all([
    BingAdReport.aggregate<{ spend: number; ads: string[]; last: Date | null }>([
      { $addFields: { _d: dayExpr('report_date') } },
      { $match: { _d: range } },
      {
        $group: {
          _id: null,
          spend: { $sum: '$spend_usd' },
          ads: { $addToSet: { $cond: [{ $gt: ['$impressions', 0] }, '$ad_key', '$$REMOVE'] } },
          last: { $max: '$_d' },
        },
      },
    ]),
    BingConversion.aggregate<{ revenue: number; last: Date | null }>([
      { $addFields: { _d: dayExpr('event_date') } },
      { $match: { _d: range } },
      { $group: { _id: null, revenue: { $sum: '$revenue_usd' }, last: { $max: '$_d' } } },
    ]),
  ]);
  const lasts = [ads?.last, conv?.last].filter((d): d is Date => d instanceof Date).map(isoDay).sort();
  return metrics({
    spend: ads?.spend ?? 0,
    revenue: conv?.revenue ?? 0,
    activeAds: ads?.ads.length ?? 0,
    dataThrough: lasts.pop() ?? null,
  });
}

async function bingMonths(): Promise<string[]> {
  const pipeline = (field: string) => [
    { $project: { _d: dayExpr(field) } },
    { $match: { _d: { $ne: null } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$_d', timezone: 'UTC' } } } },
  ];
  const [a, c] = await Promise.all([
    BingAdReport.aggregate<{ _id: string }>(pipeline('report_date')),
    BingConversion.aggregate<{ _id: string }>(pipeline('event_date')),
  ]);
  return [...a, ...c].map((r) => r._id).filter(Boolean);
}

// ---------------------------------------------------------------------------

/** Only the platforms on the caller's access list are listed and counted. */
export async function getPortfolioOverview(
  user: { role: UserRole; access: UserAccess },
  month?: string,
): Promise<PortfolioOverview> {
  const current = isoDay(new Date()).slice(0, 7);
  const selected = month && MONTH_RE.test(month) ? month : current;
  const p = period(selected);

  const canFacebook = hasPlatformAccess(user.access, 'facebook');
  const canBing = hasPlatformAccess(user.access, 'microsoft');

  const [fb, bing, fbMonths, bMonths] = await Promise.all([
    canFacebook ? facebookMetrics(user, p) : null,
    canBing ? bingMetrics(p) : null,
    canFacebook ? facebookMonths() : [],
    canBing ? bingMonths() : [],
  ]);

  const all: PlatformSummary[] = [
    { id: 'facebook', name: 'Facebook', connected: true, metrics: fb },
    { id: 'google', name: 'Google', connected: false, metrics: null },
    { id: 'microsoft', name: 'Microsoft (Bing)', connected: true, metrics: bing },
  ];
  const platforms = all.filter((pl) => hasPlatformAccess(user.access, pl.id));
  const live = platforms.filter((pl) => pl.connected && pl.metrics);
  const revenue = round2(live.reduce((s, pl) => s + (pl.metrics?.revenue ?? 0), 0));
  const spend = round2(live.reduce((s, pl) => s + (pl.metrics?.spend ?? 0), 0));

  const months: OverviewMonth[] = [...new Set([current, selected, ...fbMonths, ...bMonths])]
    .sort()
    .reverse()
    .map((m) => ({ value: m, label: monthLabel(m) }));

  return {
    client: CLIENT,
    portfolio: PORTFOLIO,
    period: { month: selected, label: monthLabel(selected), from: p.from, to: p.to, is_current: selected === current, current_month: current },
    months,
    totals: { revenue, spend, netProfit: round2(revenue - spend) },
    platforms,
  };
}
