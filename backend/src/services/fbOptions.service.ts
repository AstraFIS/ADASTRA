import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeOption } from '../types/facebook.js';
import { DATE_RANGE_OPTIONS, isoDay } from '../utils/dateRange.js';
import { latestReportDate, reportAggregate, reportBaseMatch, type ReportFilter } from './fbStatistics.service.js';

export interface FbOptionsResult {
  dateRanges: DateRangeOption[];
  ads: string[]; // every ad_name ever reported, as text, sorted
  offers: string[];
  providers: string[];
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

/** Row count via the pipeline, which (unlike countDocuments) does not cast numeric ad names to text. */
async function countRows(match: ReportFilter): Promise<number> {
  const [row] = await reportAggregate<{ n: number }>([{ $match: match }, { $count: 'n' }]);
  return row?.n ?? 0;
}

/** `allowedAds` limits every list to the ads the caller may see (null = every ad). */
export async function getFbOptions(allowedAds: string[] | null): Promise<FbOptionsResult> {
  const match = reportBaseMatch({ allowedAds });
  const [ads, offers, providers, latest, rows] = await Promise.all([
    distinctText('ad_name', match),
    distinctText('offer_name', match),
    distinctText('provider_name', match),
    latestReportDate({}),
    allowedAds ? countRows(match) : FacebookAdReport.estimatedDocumentCount(),
  ]);
  return {
    dateRanges: DATE_RANGE_OPTIONS,
    ads,
    offers,
    providers,
    dataThrough: latest ? isoDay(latest) : null,
    rows,
  };
}
