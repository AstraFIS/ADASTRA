/**
 * Finance page: Facebook and Bing cost, revenue and profit by calendar month, Facebook provider
 * fees by month and profit by offer. Same numbers as the platform pages:
 *
 *   Facebook – facebook_ad_reports + facebook_conversions through reportAggregate (provider fee
 *              from facebook_providers), limited to the caller's Meta groups.
 *   Bing     – bing_ad_reports (spend) + bing_conversions (revenue, purchases, add to cart),
 *              limited to the caller's media buyers. Bing has no provider fees.
 */
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion } from '../models/bingConversion.model.js';
import { FacebookProvider } from '../models/facebookProvider.model.js';
import type { UserAccess, UserRole } from '../models/user.model.js';
import type { FinanceFigures, FinanceMonth, FinanceOfferRow, FinanceProviderRow, FinanceResult } from '../types/finance.js';
import { dayExpr } from '../utils/bingDate.js';
import { bingBuyerScope, rowBuyerMatch } from '../utils/bingBuyer.js';
import { isoDay } from '../utils/dateRange.js';
import { facebookScope, hasPlatformAccess } from './access.service.js';
import { campaignBuyerMap } from './bing.service.js';
import { FEE_USD, num, reportAggregate, reportBaseMatch, TOTAL_SPEND } from './fbStatistics.service.js';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_PROVIDER = 'No provider';

type User = { role: UserRole; access: UserAccess };
interface Sums {
  spend: number;
  fees: number;
  revenue: number;
  purchases: number;
  leads: number;
}
const zero = (): Sums => ({ spend: 0, fees: 0, revenue: 0, purchases: 0, leads: 0 });
const add = (a: Sums, b: Partial<Sums>) => {
  a.spend += b.spend ?? 0;
  a.fees += b.fees ?? 0;
  a.revenue += b.revenue ?? 0;
  a.purchases += b.purchases ?? 0;
  a.leads += b.leads ?? 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number, scale = 1) => (b > 0 ? round2((a / b) * scale) : null);

function figures(s: Sums): FinanceFigures {
  const cost = round2(s.spend + s.fees);
  const revenue = round2(s.revenue);
  const profit = round2(revenue - cost);
  const purchases = Math.round(s.purchases);
  return {
    spend: round2(s.spend),
    fees: round2(s.fees),
    cost,
    revenue,
    profit,
    roas_pct: ratio(profit, cost, 100),
    margin_pct: ratio(profit, revenue, 100),
    purchases,
    leads: Math.round(s.leads),
    cac: ratio(cost, purchases),
  };
}

const monthStart = (m: string) => new Date(`${m}-01T00:00:00Z`);
function monthEnd(m: string): Date {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999));
}
const label = (m: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(monthStart(m));
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = monthStart(from);
  while (out.length < 120) {
    const m = isoDay(d).slice(0, 7);
    if (m > to) break;
    out.push(m);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
const MONTH_OF = (field: string) => ({ $dateToString: { format: '%Y-%m', date: field, timezone: 'UTC' } });

// ---------------------------------------------------------------------------
// Facebook
// ---------------------------------------------------------------------------
async function facebookData(user: User, from: string, to: string) {
  const scope = await facebookScope(user);
  const match = {
    ...reportBaseMatch(scope),
    report_date: { $type: 'date', $gte: monthStart(from), $lte: monthEnd(to) },
  };
  const rows = await reportAggregate<{
    _id: { m: string; provider: string | null; offer: string | null };
    spend: number;
    fees: number;
    total: number;
    revenue: number;
    purchases: number;
    leads: number;
    fee_pct: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: { m: MONTH_OF('$report_date'), provider: '$provider_name', offer: { $toString: '$offer_name' } },
        spend: { $sum: num('spend_usd') },
        fees: { $sum: FEE_USD },
        total: { $sum: TOTAL_SPEND },
        revenue: { $sum: num('revenue_usd') },
        purchases: { $sum: num('purchase_events') },
        leads: { $sum: num('add_to_carts') },
        fee_pct: { $max: num('provider_fee_pct') },
      },
    },
  ]);
  return rows;
}

async function facebookMonthsAvailable(user: User): Promise<string[]> {
  const scope = await facebookScope(user);
  const rows = await reportAggregate<{ _id: string }>([
    { $match: { ...reportBaseMatch(scope), report_date: { $type: 'date' } } },
    { $group: { _id: MONTH_OF('$report_date') } },
  ]);
  return rows.map((r) => r._id).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Bing
// ---------------------------------------------------------------------------
async function bingScope(user: User) {
  const buyers = bingBuyerScope(user);
  return rowBuyerMatch(buyers, buyers ? await campaignBuyerMap() : new Map());
}

async function bingData(user: User, from: string, to: string) {
  const scope = await bingScope(user);
  const range = { $gte: monthStart(from), $lte: monthEnd(to) };
  const [spend, conv] = await Promise.all([
    BingAdReport.aggregate<{ _id: { m: string; offer: string | null }; spend: number }>([
      { $match: scope },
      { $addFields: { _d: dayExpr('report_date') } },
      { $match: { _d: range } },
      { $group: { _id: { m: MONTH_OF('$_d'), offer: '$offer_name' }, spend: { $sum: num('spend_usd') } } },
    ]),
    BingConversion.aggregate<{ _id: { m: string; offer: string | null }; revenue: number; purchases: number; leads: number }>([
      { $match: scope },
      { $addFields: { _d: dayExpr('event_date') } },
      { $match: { _d: range } },
      {
        $group: {
          _id: { m: MONTH_OF('$_d'), offer: '$offer_name' },
          revenue: { $sum: num('revenue_usd') },
          purchases: { $sum: { $cond: [{ $eq: ['$event_stage', 'purchase'] }, num('event_count'), 0] } },
          leads: { $sum: { $cond: [{ $eq: ['$event_stage', 'add_to_cart'] }, num('event_count'), 0] } },
        },
      },
    ]),
  ]);
  return { spend, conv };
}

async function bingMonthsAvailable(user: User): Promise<string[]> {
  const scope = await bingScope(user);
  const pipeline = (field: string) => [
    { $match: scope },
    { $project: { _d: dayExpr(field) } },
    { $match: { _d: { $ne: null } } },
    { $group: { _id: MONTH_OF('$_d') } },
  ];
  const [a, c] = await Promise.all([
    BingAdReport.aggregate<{ _id: string }>(pipeline('report_date')),
    BingConversion.aggregate<{ _id: string }>(pipeline('event_date')),
  ]);
  return [...a, ...c].map((r) => r._id).filter(Boolean);
}

// ---------------------------------------------------------------------------

export async function getFinance(user: User, fromIn?: string, toIn?: string): Promise<FinanceResult> {
  const canFb = hasPlatformAccess(user.access, 'facebook');
  const canBing = hasPlatformAccess(user.access, 'microsoft');

  const [fbMonths, bMonths] = await Promise.all([
    canFb ? facebookMonthsAvailable(user) : [],
    canBing ? bingMonthsAvailable(user) : [],
  ]);
  const all = [...new Set([...fbMonths, ...bMonths])].sort();
  const current = isoDay(new Date()).slice(0, 7);
  const available = { from: all[0] ?? null, to: all[all.length - 1] ?? null };

  // default: every month with data, up to the latest one
  let to = toIn && MONTH_RE.test(toIn) ? toIn : (available.to ?? current);
  let from = fromIn && MONTH_RE.test(fromIn) ? fromIn : (available.from ?? to);
  if (from > to) [from, to] = [to, from];
  const months = monthsBetween(from, to);

  const [fbRows, bing, providerTable] = await Promise.all([
    canFb ? facebookData(user, from, to) : [],
    canBing ? bingData(user, from, to) : { spend: [], conv: [] },
    canFb ? FacebookProvider.find({}, { provider_name: 1, fee_pct: 1, _id: 0 }).lean() : [],
  ]);

  const fb = new Map(months.map((m) => [m, zero()]));
  const bg = new Map(months.map((m) => [m, zero()]));
  const providers = new Map<string, FinanceProviderRow>();
  const offers = new Map<string, FinanceOfferRow>();
  const feeOf = new Map(providerTable.map((p) => [String(p.provider_name), Number(p.fee_pct)]));

  const offer = (name: string | null, platform: 'facebook' | 'bing') => {
    const offerName = name && name !== 'null' ? name : '(no offer)';
    const key = `${platform}|${offerName}`;
    let row = offers.get(key);
    if (!row) offers.set(key, (row = { offer_name: offerName, platform, months: {}, cost: 0, revenue: 0, profit: 0 }));
    return row;
  };
  const addOffer = (row: FinanceOfferRow, m: string, cost: number, revenue: number) => {
    const cell = (row.months[m] ??= { cost: 0, revenue: 0, profit: 0 });
    cell.cost += cost;
    cell.revenue += revenue;
    row.cost += cost;
    row.revenue += revenue;
  };

  for (const r of fbRows) {
    const m = r._id.m;
    const sums = fb.get(m);
    if (!sums) continue;
    add(sums, { spend: r.spend, fees: r.fees, revenue: r.revenue, purchases: r.purchases, leads: r.leads });
    addOffer(offer(r._id.offer, 'facebook'), m, r.total, r.revenue);
    if (r.spend > 0) {
      const name = r._id.provider ? String(r._id.provider) : NO_PROVIDER;
      let p = providers.get(name);
      if (!p) {
        providers.set(
          name,
          (p = {
            provider_name: name,
            fee_pct: name === NO_PROVIDER ? 0 : (feeOf.get(name) ?? (r.fee_pct || null)),
            no_provider: name === NO_PROVIDER,
            months: {},
            spend: 0,
            fee: 0,
          }),
        );
      }
      const cell = (p.months[m] ??= { spend: 0, fee: 0 });
      cell.spend += r.spend;
      cell.fee += r.fees;
      p.spend += r.spend;
      p.fee += r.fees;
    }
  }
  for (const r of bing.spend) {
    const sums = bg.get(r._id.m);
    if (!sums) continue;
    add(sums, { spend: r.spend });
    addOffer(offer(r._id.offer, 'bing'), r._id.m, r.spend, 0);
  }
  for (const r of bing.conv) {
    const sums = bg.get(r._id.m);
    if (!sums) continue;
    add(sums, { revenue: r.revenue, purchases: r.purchases, leads: r.leads });
    addOffer(offer(r._id.offer, 'bing'), r._id.m, 0, r.revenue);
  }

  const totalFb = zero();
  const totalBing = zero();
  const totalAll = zero();
  const monthRows: FinanceMonth[] = months.map((m) => {
    const f = fb.get(m)!;
    const b = bg.get(m)!;
    const t = zero();
    add(t, f);
    add(t, b);
    add(totalFb, f);
    add(totalBing, b);
    add(totalAll, t);
    return {
      month: m,
      label: label(m),
      facebook: canFb ? figures(f) : null,
      bing: canBing ? figures(b) : null,
      total: figures(t),
    };
  });

  const roundCells = <T extends Record<string, number>>(cells: Record<string, T>) =>
    Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, n]) => [a, round2(n)])) as T]));

  return {
    range: { from, to },
    available,
    platforms: { facebook: canFb, bing: canBing },
    months: monthRows,
    totals: {
      facebook: canFb ? figures(totalFb) : null,
      bing: canBing ? figures(totalBing) : null,
      total: figures(totalAll),
    },
    providers: [...providers.values()]
      .map((p) => ({ ...p, spend: round2(p.spend), fee: round2(p.fee), months: roundCells(p.months) }))
      .sort((a, b) => Number(a.no_provider) - Number(b.no_provider) || b.fee - a.fee || b.spend - a.spend),
    offers: [...offers.values()]
      .map((o) => {
        for (const c of Object.values(o.months)) c.profit = c.revenue - c.cost;
        return { ...o, cost: round2(o.cost), revenue: round2(o.revenue), profit: round2(o.revenue - o.cost), months: roundCells(o.months) };
      })
      .filter((o) => o.cost > 0 || o.revenue > 0)
      .sort((a, b) => b.revenue + b.cost - (a.revenue + a.cost)),
  };
}
