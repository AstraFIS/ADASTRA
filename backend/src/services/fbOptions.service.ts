import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeOption } from '../types/facebook.js';
import { DATE_RANGE_OPTIONS, isoDay } from '../utils/dateRange.js';

export interface FbOptionsResult {
  dateRanges: DateRangeOption[];
  ads: string[]; // every ad_name ever reported, as text, sorted
  offers: string[];
  providers: string[];
  dataThrough: string | null; // latest report_date in the collection
  rows: number;
}

/** Distinct values over the whole collection, always as strings. */
async function distinctText(field: string): Promise<string[]> {
  const rows = await FacebookAdReport.aggregate<{ _id: string | null }>([
    { $group: { _id: { $toString: `$${field}` } } },
  ]);
  return rows
    .map((r) => r._id)
    .filter((v): v is string => typeof v === 'string' && v !== '' && v !== 'null')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function getFbOptions(): Promise<FbOptionsResult> {
  const [ads, offers, providers, latest, rows] = await Promise.all([
    distinctText('ad_name'),
    distinctText('offer_name'),
    distinctText('provider_name'),
    FacebookAdReport.findOne().sort({ report_date: -1 }).select('report_date'),
    FacebookAdReport.estimatedDocumentCount(),
  ]);
  return {
    dateRanges: DATE_RANGE_OPTIONS,
    ads,
    offers,
    providers,
    dataThrough: latest ? isoDay(latest.report_date) : null,
    rows,
  };
}
