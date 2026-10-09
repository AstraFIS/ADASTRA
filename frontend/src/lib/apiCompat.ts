/**
 * Guards against a frontend / backend version mismatch (e.g. the frontend redeployed on
 * Vercel before the backend): any field the page needs but the API did not send gets a
 * safe default, so a page never crashes on `undefined`, and `outdated` lets it say why
 * some parts are empty.
 */
import type { BingDashboard, BingStatistics } from '@/types/bing';
import type { PortfolioOverview } from '@/types/platforms';

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {});
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function normalizeBingDashboard(raw: unknown): { data: BingDashboard; outdated: boolean } {
  const r = obj(raw);
  const range = obj(r.range);
  const filters = obj(r.filters);
  const options = obj(r.options);
  const s = obj(r.statistics);
  const geo = obj(r.geo);
  const funnel = obj(r.funnel);
  const meta = obj(r.meta);

  // fields that only the current backend sends
  const outdated = !('geo' in r) || !('clicks' in r) || !Array.isArray(funnel.by_ad_group) || !Array.isArray(options.campaigns);

  const statistics: BingStatistics = {
    total_revenue: num(s.total_revenue),
    total_amount_spend: num(s.total_amount_spend),
    net_profit: num(s.net_profit),
    roas_pct: numOrNull(s.roas_pct),
    landing_page_views: num(s.landing_page_views),
    link_clicks: num(s.link_clicks),
    impressions: num(s.impressions),
    purchases: num(s.purchases),
    cpc: numOrNull(s.cpc),
    ctr: numOrNull(s.ctr),
    cac: numOrNull(s.cac),
    spend_estimated: s.spend_estimated === true,
  };

  const data: BingDashboard = {
    range: {
      key: (str(range.key, 'all_time') as BingDashboard['range']['key']),
      label: str(range.label, 'All Time'),
      from: strOrNull(range.from),
      to: strOrNull(range.to),
    },
    filters: { offer: strOrNull(filters.offer), campaign: strOrNull(filters.campaign) },
    options: {
      date_ranges: arr(options.date_ranges),
      offers: arr<string>(options.offers),
      campaigns: arr<string>(options.campaigns),
    },
    statistics,
    daily: arr<Loose>(r.daily).map((d) => ({
      date: str(d.date),
      revenue_usd: numOrNull(d.revenue_usd),
      spend_usd: numOrNull(d.spend_usd),
      gross_profit_usd: numOrNull(d.gross_profit_usd),
      clicks: num(d.clicks),
      landing_page_views: num(d.landing_page_views),
      purchases: num(d.purchases),
    })),
    geo: { by_region: arr(geo.by_region), by_device: arr(geo.by_device) },
    clicks: arr(r.clicks),
    funnel: {
      by_date: arr(funnel.by_date),
      by_offer: arr(funnel.by_offer),
      by_ad_group: arr(funnel.by_ad_group),
    },
    meta: {
      ad_rows: num(meta.ad_rows),
      conversion_rows: num(meta.conversion_rows, num(meta.partner_rows)),
      ads_period: strOrNull(meta.ads_period),
      partner_period: strOrNull(meta.partner_period),
      ads_through: strOrNull(meta.ads_through),
      partner_through: strOrNull(meta.partner_through ?? meta.data_through),
      unattributed_events: num(meta.unattributed_events),
    },
  };
  return { data, outdated };
}

export function normalizeOverview(raw: unknown): { data: PortfolioOverview; outdated: boolean } {
  const r = obj(raw);
  const now = new Date().toISOString().slice(0, 7);
  const label = (m: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  const p = obj(r.period);
  const outdated = !('period' in r) || !Array.isArray(r.months);
  const month = /^\d{4}-\d{2}$/.test(str(p.month)) ? str(p.month) : now;
  const totals = obj(r.totals);

  return {
    outdated,
    data: {
      client: str(r.client),
      portfolio: str(r.portfolio),
      period: {
        month,
        label: str(p.label, label(month)),
        from: str(p.from, `${month}-01`),
        to: str(p.to),
        is_current: typeof p.is_current === 'boolean' ? p.is_current : month === now,
        current_month: str(p.current_month, now),
      },
      months: arr<Loose>(r.months).length
        ? arr<Loose>(r.months).map((m) => ({ value: str(m.value), label: str(m.label) }))
        : [{ value: month, label: label(month) }],
      totals: { revenue: num(totals.revenue), spend: num(totals.spend), netProfit: num(totals.netProfit) },
      platforms: arr<Loose>(r.platforms).map((pl) => {
        const m = pl.metrics ? obj(pl.metrics) : null;
        return {
          id: str(pl.id) as PortfolioOverview['platforms'][number]['id'],
          name: str(pl.name),
          connected: pl.connected === true,
          metrics: m
            ? {
                spend: num(m.spend),
                revenue: num(m.revenue),
                netProfit: num(m.netProfit),
                activeAds: num(m.activeAds),
                dataThrough: strOrNull(m.dataThrough),
              }
            : null,
        };
      }),
    },
  };
}
