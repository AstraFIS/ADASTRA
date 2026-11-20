import type { FacebookScope } from './access.service.js';
import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeOption } from '../types/facebook.js';
import { DATE_RANGE_OPTIONS, isoDay } from '../utils/dateRange.js';
import {
  latestReportDate,
  NO_ACCOUNT,
  reportAggregate,
  reportBaseMatch,
  type FbStatisticsQuery,
  type ReportFilter,
} from './fbStatistics.service.js';

export interface FbOptionsResult {
  dateRanges: DateRangeOption[];
  ads: string[]; // every ad_name ever reported, as text, sorted
  offers: string[];
  providers: string[];
  /** Each provider with the ad accounts (account_name) that spent under it; NO_ACCOUNT = rows without one. */
  providerAccounts: { provider: string; accounts: string[] }[];
  dataThrough: string | null; // latest report_date in the collection
  rows: number;
}

/** Distinct values over the matching rows, always as strings. */
async function distinctText(field: string, match: ReportFilter): Promise<string[]> {
  const rows = await reportAggregate<{ _id: string | null }>([
    { $match: match },
    { $group: { _id: { $toString: `$${field}` } } },
  ]);
  return rows
    .map((r) => r._id)
    .filter((v): v is string => typeof v === 'string' && v !== '' && v !== 'null')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Provider → its account names, over the matching Facebook rows. */
async function accountsByProvider(match: ReportFilter): Promise<{ provider: string; accounts: string[] }[]> {
  const rows = await reportAggregate<{ _id: { p: unknown; a: unknown } }>([
    { $match: { ...match, provider_name: { $nin: [null, ''] } } },
    { $group: { _id: { p: { $toString: '$provider_name' }, a: '$account_name' } } },
  ]);
  const byProvider = new Map<string, Set<string>>();
  for (const { _id } of rows) {
    const p = String(_id.p ?? '').trim();
    if (!p || p === 'null') continue;
    const a = typeof _id.a === 'string' && _id.a.trim() !== '' ? _id.a.trim() : NO_ACCOUNT;
    if (!byProvider.has(p)) byProvider.set(p, new Set());
    byProvider.get(p)!.add(a);
  }
  const sort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [...byProvider.entries()]
    .sort(([a], [b]) => sort(a, b))
    .map(([provider, set]) => ({
      provider,
      // named accounts first, rows without an account last
      accounts: [...set].sort((a, b) => (a === NO_ACCOUNT ? 1 : b === NO_ACCOUNT ? -1 : sort(a, b))),
    }));
}

/** Row count via the pipeline, which (unlike countDocuments) does not cast numeric ad names to text. */
async function countRows(match: ReportFilter): Promise<number> {
  const [row] = await reportAggregate<{ n: number }>([{ $match: match }, { $count: 'n' }]);
  return row?.n ?? 0;
}

/** `allowedAds` limits every list to the ads the caller may see (null = every ad). */
export async function getFbOptions(
  scope: FacebookScope & Pick<FbStatisticsQuery, 'category' | 'provider' | 'account' | 'providerAds'>,
): Promise<FbOptionsResult> {
  const { allowedAds } = scope;
  const match = reportBaseMatch(scope);
  // the provider list itself is not narrowed by the provider filter
  const { $and: _provider, ...noProvider } = match;
  const [ads, offers, providers, providerAccounts, latest, rows] = await Promise.all([
    distinctText('ad_name', match),
    distinctText('offer_name', match),
    distinctText('provider_name', noProvider),
    accountsByProvider(noProvider),
    latestReportDate({}),
    allowedAds ? countRows(match) : FacebookAdReport.estimatedDocumentCount(),
  ]);
  return {
    dateRanges: DATE_RANGE_OPTIONS,
    ads,
    offers,
    providers,
    providerAccounts,
    dataThrough: latest ? isoDay(latest) : null,
    rows,
  };
}
